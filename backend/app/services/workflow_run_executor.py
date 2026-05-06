"""Async executor for workflow runs (Phase 2: tabular, Phase 3: assistant).

Tabular runs (`execute_run`): every queued cell runs concurrently up to
`_CELL_SEMAPHORE_SIZE`, then the run is finalized.

Assistant runs (`execute_assistant_run`): stages run serially. After each
stage with `checkpoint=true`, the run pauses (status `checkpoint`) until
the analyst calls the approve endpoint, which re-kicks the executor.

Both modes share the in-memory `RunEventBus` that fans out status events
(cell / stage / run) to SSE subscribers keyed by run_id.
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.llm import get_last_meta, stream_with_fallback
from app.agents.prompts import SINGLE_DEAL_SYSTEM
from app.services import workflow_run_store
from app.services.vector_store import get_document_chunks, query_document
from app.services.workflow_format import format_prompt_suffix, parse_answer
from app.utils.citations import build_context_string, extract_citations

logger = logging.getLogger(__name__)

_CELL_SEMAPHORE_SIZE = 4
_RUN_TASKS: set[asyncio.Task] = set()  # keep strong refs so background tasks aren't GC'd


# ── Event bus ──

class RunEventBus:
    """Per-process pub-sub for run events. Not durable — clients that miss
    events between disconnect/reconnect must re-fetch run state via REST."""

    def __init__(self) -> None:
        self._channels: dict[str, set[asyncio.Queue]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def subscribe(self, run_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        async with self._lock:
            self._channels[run_id].add(queue)
        return queue

    async def unsubscribe(self, run_id: str, queue: asyncio.Queue) -> None:
        async with self._lock:
            channel = self._channels.get(run_id)
            if channel and queue in channel:
                channel.remove(queue)
                if not channel:
                    self._channels.pop(run_id, None)

    async def publish(self, run_id: str, event: dict[str, Any]) -> None:
        async with self._lock:
            queues = list(self._channels.get(run_id, ()))
        for queue in queues:
            # Non-blocking enqueue; if a slow consumer is full this would
            # block, but our queues are unbounded so this is just a hot loop.
            await queue.put(event)


run_event_bus = RunEventBus()


# ── Executor entry points ──


def kick_off_run(run_id: str, deal_id: str) -> None:
    """Schedule `execute_run` on the running event loop. Safe to call from
    inside a request handler — returns immediately."""
    task = asyncio.create_task(execute_run(run_id, deal_id))
    _RUN_TASKS.add(task)
    task.add_done_callback(_RUN_TASKS.discard)


def kick_off_assistant_run(run_id: str, deal_id: str) -> None:
    """Schedule `execute_assistant_run`. Idempotent — calling it on a run
    that's still running is a no-op (the running task picks up the same
    queued stages); calling it on a paused run resumes from the next
    queued stage."""
    task = asyncio.create_task(execute_assistant_run(run_id, deal_id))
    _RUN_TASKS.add(task)
    task.add_done_callback(_RUN_TASKS.discard)


async def execute_run(run_id: str, deal_id: str) -> None:
    """Execute every queued cell in the run with bounded concurrency, then
    finalize the run status. Errors in a single cell don't kill the run."""
    workflow_run_store.set_run_status(run_id, "running")
    await run_event_bus.publish(run_id, {"type": "run", "run_id": run_id, "status": "running"})

    cells = workflow_run_store.list_queued_cells(run_id)
    if not cells:
        # Empty run — finalize immediately.
        workflow_run_store.set_run_status(run_id, "complete")
        await run_event_bus.publish(run_id, {"type": "run", "run_id": run_id, "status": "complete"})
        return

    semaphore = asyncio.Semaphore(_CELL_SEMAPHORE_SIZE)

    async def run_one(cell_id: str) -> None:
        async with semaphore:
            try:
                await execute_cell(cell_id, run_id, deal_id)
            except Exception as exc:  # last-ditch — execute_cell should handle its own
                logger.exception("Unhandled error in cell executor: cell=%s", cell_id)
                cell = workflow_run_store.error_cell(cell_id, f"Unhandled: {exc}")
                if cell is not None:
                    await run_event_bus.publish(
                        run_id, {"type": "cell", "cell": cell.model_dump(mode="json")}
                    )

    await asyncio.gather(*(run_one(c.id) for c in cells))

    _, worst = workflow_run_store.all_cells_terminal(run_id)
    final_status = worst or "complete"
    workflow_run_store.set_run_status(run_id, final_status)
    await run_event_bus.publish(
        run_id, {"type": "run", "run_id": run_id, "status": final_status}
    )


async def execute_cell(cell_id: str, run_id: str, deal_id: str) -> None:
    """Run a single cell: load column, retrieve doc chunks, call LLM, extract
    citations, persist, and broadcast events."""
    cell = workflow_run_store.get_cell(cell_id)
    if cell is None:
        return
    column = workflow_run_store.load_column(cell.column_id)
    if not column:
        workflow_run_store.error_cell(cell_id, "Column not found")
        updated = workflow_run_store.get_cell(cell_id)
        if updated is not None:
            await run_event_bus.publish(
                run_id, {"type": "cell", "cell": updated.model_dump(mode="json")}
            )
        return
    if column["is_derived"]:
        # Derived columns need a formula evaluator (Phase 4); skip in Phase 2.
        workflow_run_store.complete_cell(
            cell_id,
            answer="[Derived column — evaluation deferred to Phase 4]",
            answer_formatted=None,
            citations=[],
            model="",
            fallback=False,
            duration_ms=0,
        )
        updated = workflow_run_store.get_cell(cell_id)
        if updated is not None:
            await run_event_bus.publish(
                run_id, {"type": "cell", "cell": updated.model_dump(mode="json")}
            )
        return

    running = workflow_run_store.mark_cell_running(cell_id)
    if running is not None:
        await run_event_bus.publish(
            run_id, {"type": "cell", "cell": running.model_dump(mode="json")}
        )

    doc_id = cell.row_key  # one_doc_per_row: row_key == doc_id
    column_prompt = column["prompt"] or column["label"]
    suffix = format_prompt_suffix(column["format"], column["tags"])
    user_message = column_prompt + suffix

    try:
        retrieved = await query_document(deal_id, doc_id, column_prompt)
        if not retrieved:
            answer = "No relevant content found in this document."
            citations: list = []
            formatted: Any = None
            workflow_run_store.complete_cell(
                cell_id,
                answer=answer,
                answer_formatted=formatted,
                citations=citations,
                model="",
                fallback=False,
                duration_ms=0,
            )
        else:
            context_str = build_context_string(retrieved)
            system_prompt = SINGLE_DEAL_SYSTEM.format(context=context_str)
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_message),
            ]

            full_answer_parts: list[str] = []
            async for chunk in stream_with_fallback(messages):
                token = getattr(chunk, "content", "") or ""
                if token:
                    full_answer_parts.append(token)
            full_answer = "".join(full_answer_parts)

            full_doc_chunks = get_document_chunks(deal_id, doc_id)
            cleaned_answer, citations = extract_citations(
                full_answer,
                retrieved,
                deal_id=deal_id,
                page_context_chunks=full_doc_chunks,
            )
            formatted = parse_answer(cleaned_answer, column["format"], column["tags"])
            meta = get_last_meta()
            workflow_run_store.complete_cell(
                cell_id,
                answer=cleaned_answer,
                answer_formatted=formatted,
                citations=citations,
                model=meta.model_used if meta else "",
                fallback=meta.fallback if meta else False,
                duration_ms=meta.duration_ms if meta else 0,
            )
    except Exception as exc:
        logger.exception("LLM cell extraction failed: cell=%s doc=%s", cell_id, doc_id)
        workflow_run_store.error_cell(cell_id, f"{type(exc).__name__}: {exc}")

    updated = workflow_run_store.get_cell(cell_id)
    if updated is not None:
        await run_event_bus.publish(
            run_id, {"type": "cell", "cell": updated.model_dump(mode="json")}
        )


# ── Assistant runs (Phase 3) ──


_PRIOR_STAGE_HEADER = (
    "Prior approved stage outputs are available below. Use them as authoritative "
    "facts for this stage. If a prior output conflicts with the source documents, "
    "trust the prior output (the analyst has approved it)."
)


async def execute_assistant_run(run_id: str, deal_id: str) -> None:
    """Run queued stages serially until the run reaches a checkpoint or
    terminal state. Re-entrant: callable again after `approve_stage` to
    resume."""
    run = workflow_run_store.get_run(run_id)
    if run is None:
        return
    document_ids = list(run.document_ids)

    workflow_run_store.set_run_status(run_id, "running")
    await run_event_bus.publish(run_id, {"type": "run", "run_id": run_id, "status": "running"})

    while True:
        next_stage = workflow_run_store.next_queued_stage(run_id)
        if next_stage is None:
            break
        await execute_assistant_stage(next_stage.id, run_id, deal_id, document_ids)
        latest = workflow_run_store.get_stage_output(next_stage.id)
        if latest is None:
            # Stage vanished (shouldn't happen) — bail to avoid an infinite loop.
            workflow_run_store.error_stage(next_stage.id, "Stage output missing after execution")
            break
        if latest.status == "checkpoint":
            # Pause — analyst must approve before we proceed.
            workflow_run_store.set_run_status(run_id, "checkpoint")
            await run_event_bus.publish(
                run_id, {"type": "run", "run_id": run_id, "status": "checkpoint"}
            )
            return
        if latest.status == "error":
            # Halt the rest of the run on error.
            break

    _, worst = workflow_run_store.all_stages_terminal(run_id)
    final_status = worst or "complete"
    workflow_run_store.set_run_status(run_id, final_status)
    await run_event_bus.publish(
        run_id, {"type": "run", "run_id": run_id, "status": final_status}
    )


async def execute_assistant_stage(
    stage_output_id: str, run_id: str, deal_id: str, document_ids: list[str]
) -> None:
    """Run a single assistant stage: gather prior approved outputs, retrieve
    document context across all docs, call the LLM, extract citations,
    persist (transitioning to either `checkpoint` or `complete`)."""
    stage = workflow_run_store.get_stage_output(stage_output_id)
    if stage is None:
        return

    running = workflow_run_store.mark_stage_running(stage_output_id)
    if running is not None:
        await run_event_bus.publish(
            run_id, {"type": "stage", "stage": running.model_dump(mode="json")}
        )

    prior = [
        s for s in workflow_run_store.list_terminal_stages(run_id)
        if s.id != stage_output_id and s.order_index < stage.order_index
    ]
    prior_section = ""
    if prior:
        chunks_md = []
        for s in prior:
            content = s.edited_md if s.edited_md is not None else s.output_md
            chunks_md.append(f"### Stage {s.order_index}: {s.label}\n\n{content}")
        prior_section = (
            f"\n\n---\n\n{_PRIOR_STAGE_HEADER}\n\n" + "\n\n".join(chunks_md) + "\n\n---\n\n"
        )

    user_message = (
        f"Stage instructions ({stage.label}):\n\n{stage.prompt_md}\n"
        + prior_section
        + "\n\nWrite the markdown output for this stage. Use [Source N] markers "
        "when grounding claims in the document context above."
    )

    try:
        all_chunks: list = []
        for doc_id in document_ids:
            try:
                chunks = await query_document(deal_id, doc_id, stage.prompt_md or stage.label)
            except Exception:
                logger.exception("query_document failed: doc=%s", doc_id)
                chunks = []
            if chunks:
                all_chunks.extend(chunks)

        if all_chunks:
            context_str = build_context_string(all_chunks)
        else:
            context_str = "(no document context retrieved)"

        system_prompt = SINGLE_DEAL_SYSTEM.format(context=context_str)
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_message),
        ]

        full_answer_parts: list[str] = []
        async for chunk in stream_with_fallback(messages):
            token = getattr(chunk, "content", "") or ""
            if token:
                full_answer_parts.append(token)
        full_answer = "".join(full_answer_parts)

        # For citations we use the union of retrieved chunks. We don't
        # have per-doc full text (multi-doc), so page_context_chunks is
        # omitted — extract_citations falls back to retrieved-chunk pages.
        cleaned_answer, citations = extract_citations(
            full_answer,
            all_chunks,
            deal_id=deal_id,
            page_context_chunks=None,
        )
        meta = get_last_meta()
        workflow_run_store.complete_stage(
            stage_output_id,
            output_md=cleaned_answer,
            citations=citations,
            model=meta.model_used if meta else "",
            fallback=meta.fallback if meta else False,
            duration_ms=meta.duration_ms if meta else 0,
            needs_checkpoint=stage.checkpoint,
        )
    except Exception as exc:
        logger.exception("Assistant stage execution failed: stage=%s", stage_output_id)
        workflow_run_store.error_stage(
            stage_output_id, f"{type(exc).__name__}: {exc}"
        )

    updated = workflow_run_store.get_stage_output(stage_output_id)
    if updated is not None:
        await run_event_bus.publish(
            run_id, {"type": "stage", "stage": updated.model_dump(mode="json")}
        )
