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
import re
from collections import defaultdict
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.llm import LLMConfigurationError, ensure_llm_configured, get_last_meta, stream_with_fallback
from app.agents.prompts import SINGLE_DEAL_SYSTEM
from app.config import settings
from app.services import workflow_run_store, workflow_store
from app.services.context_provider import get_doc_page_chunks, load_doc_context
from app.services.workflow_format import format_prompt_suffix, parse_answer
from app.utils.citations import build_context_string, extract_citations

logger = logging.getLogger(__name__)

_CELL_SEMAPHORE_SIZE = 4
_TABULAR_SYNTHESIS_MAX_CHUNKS = 32
# ~800K tokens at ~4 chars/token. Keep in sync with
# context_provider._FC_TOKEN_WARN_THRESHOLD.
_SYNTHESIS_CHAR_BUDGET = 3_200_000
_RUN_TASKS: set[asyncio.Task] = set()  # keep strong refs so background tasks aren't GC'd

_TABULAR_OUTPUT_DIRECTIVE = (
    "\n\nGrounding rules: Use only the numbered source blocks in the provided "
    "context. Answer the exact extraction prompt for this cell. If the sources "
    "do not directly support the value, return an empty string. Do not infer, "
    "estimate, or use outside knowledge. Every non-empty answer must include "
    "at least one valid [Source N] marker."
)


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


async def _finalize_run_status(run_id: str, worst: str | None) -> None:
    """Set the terminal run status, but never resurrect a cancelled run.

    Cancel marks the run `cancelled` while in-flight cells drain; without
    this guard the last finishing cell would overwrite it with `complete`.
    """
    run = workflow_run_store.get_run(run_id)
    if run is not None and run.status == "cancelled":
        return
    final_status = worst or "complete"
    workflow_run_store.set_run_status(run_id, final_status)
    await run_event_bus.publish(
        run_id, {"type": "run", "run_id": run_id, "status": final_status}
    )


def kick_off_run(run_id: str, deal_id: str) -> None:
    """Schedule `execute_run` on the running event loop. Safe to call from
    inside a request handler — returns immediately."""
    task = asyncio.create_task(execute_run(run_id, deal_id))
    _RUN_TASKS.add(task)
    task.add_done_callback(_RUN_TASKS.discard)


def kick_off_cell_retry(cell_id: str, run_id: str, deal_id: str) -> None:
    """Schedule a single cell retry. Used when an analyst rerun a cell or a
    column from the run UI without restarting the whole run."""

    async def _runner() -> None:
        # Flip run status back to 'running' so the UI badge updates.
        run = workflow_run_store.get_run(run_id)
        if run is not None and run.status in ("complete", "cancelled", "error"):
            workflow_run_store.set_run_status(run_id, "running")
            await run_event_bus.publish(
                run_id, {"type": "run", "run_id": run_id, "status": "running"}
            )
        try:
            await execute_cell(cell_id, run_id, deal_id)
        except Exception as exc:
            logger.exception("Unhandled error retrying cell: cell=%s", cell_id)
            cell = workflow_run_store.error_cell(cell_id, f"Unhandled: {exc}")
            if cell is not None:
                await run_event_bus.publish(
                    run_id, {"type": "cell", "cell": cell.model_dump(mode="json")}
                )
        # If everything settled, finalize run status.
        all_done, worst = workflow_run_store.all_cells_terminal(run_id)
        if all_done:
            await _finalize_run_status(run_id, worst)

    task = asyncio.create_task(_runner())
    _RUN_TASKS.add(task)
    task.add_done_callback(_RUN_TASKS.discard)


def kick_off_column_retry(cell_ids: list[str], run_id: str, deal_id: str) -> None:
    """Schedule retries for every cell in a column with bounded concurrency."""

    async def _runner() -> None:
        run = workflow_run_store.get_run(run_id)
        if run is not None and run.status in ("complete", "cancelled", "error"):
            workflow_run_store.set_run_status(run_id, "running")
            await run_event_bus.publish(
                run_id, {"type": "run", "run_id": run_id, "status": "running"}
            )
        semaphore = asyncio.Semaphore(_CELL_SEMAPHORE_SIZE)

        async def run_one(cell_id: str) -> None:
            async with semaphore:
                try:
                    await execute_cell(cell_id, run_id, deal_id)
                except Exception as exc:
                    logger.exception(
                        "Unhandled error retrying cell: cell=%s", cell_id
                    )
                    cell = workflow_run_store.error_cell(cell_id, f"Unhandled: {exc}")
                    if cell is not None:
                        await run_event_bus.publish(
                            run_id,
                            {"type": "cell", "cell": cell.model_dump(mode="json")},
                        )

        await asyncio.gather(*(run_one(cid) for cid in cell_ids))
        all_done, worst = workflow_run_store.all_cells_terminal(run_id)
        if all_done:
            await _finalize_run_status(run_id, worst)

    task = asyncio.create_task(_runner())
    _RUN_TASKS.add(task)
    task.add_done_callback(_RUN_TASKS.discard)


_ACTIVE_ASSISTANT_RUNS: set[str] = set()


def kick_off_assistant_run(run_id: str, deal_id: str) -> None:
    """Schedule `execute_assistant_run`. Idempotent — calling it on a run
    that's still running is a no-op (the running task picks up the same
    queued stages); calling it on a paused run resumes from the next
    queued stage."""
    if run_id in _ACTIVE_ASSISTANT_RUNS:
        return  # loop already active; it will pick up newly-queued stages
    _ACTIVE_ASSISTANT_RUNS.add(run_id)

    async def _runner() -> None:
        try:
            await execute_assistant_run(run_id, deal_id)
        finally:
            _ACTIVE_ASSISTANT_RUNS.discard(run_id)

    task = asyncio.create_task(_runner())
    _RUN_TASKS.add(task)
    task.add_done_callback(_RUN_TASKS.discard)


async def execute_run(run_id: str, deal_id: str) -> None:
    """Execute every queued cell in the run with bounded concurrency, then
    finalize the run status. Errors in a single cell don't kill the run."""
    current = workflow_run_store.get_run(run_id)
    if current is None or current.status == "cancelled":
        return
    workflow_run_store.set_run_status(run_id, "running")
    await run_event_bus.publish(run_id, {"type": "run", "run_id": run_id, "status": "running"})

    cells = workflow_run_store.list_queued_cells(run_id)
    extraction_cells = []
    derived_cells = []
    for cell in cells:
        column = workflow_run_store.load_column(cell.column_id)
        if column and column["is_derived"]:
            derived_cells.append(cell)
        else:
            extraction_cells.append(cell)

    if not extraction_cells and not derived_cells:
        # Empty run — finalize immediately.
        _, worst = workflow_run_store.all_cells_terminal(run_id)
        await _finalize_run_status(run_id, worst)
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

    await asyncio.gather(*(run_one(c.id) for c in extraction_cells))

    # Derived/formula columns depend on already-extracted values in the same
    # row, so evaluate them after extraction cells settle.
    for cell in derived_cells:
        updated = await execute_formula_cell(cell.id, run_id)
        if updated is not None:
            await run_event_bus.publish(
                run_id, {"type": "cell", "cell": updated.model_dump(mode="json")}
            )

    _, worst = workflow_run_store.all_cells_terminal(run_id)
    await _finalize_run_status(run_id, worst)


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
        updated = await execute_formula_cell(cell_id, run_id)
        if updated is not None:
            await run_event_bus.publish(
                run_id, {"type": "cell", "cell": updated.model_dump(mode="json")}
            )
        return

    running = workflow_run_store.mark_cell_running(cell_id)
    if running is None:
        return  # cancelled or already claimed — never execute
    await run_event_bus.publish(
        run_id, {"type": "cell", "cell": running.model_dump(mode="json")}
    )

    try:
        ensure_llm_configured()
    except LLMConfigurationError as exc:
        workflow_run_store.error_cell(cell_id, str(exc))
        updated = workflow_run_store.get_cell(cell_id)
        if updated is not None:
            await run_event_bus.publish(
                run_id, {"type": "cell", "cell": updated.model_dump(mode="json")}
            )
        return

    column_prompt = column["prompt"] or column["label"]
    suffix = format_prompt_suffix(column["format"], column["tags"])
    run = workflow_run_store.get_run(run_id)
    workflow = workflow_store.get_workflow(run.workflow_id) if run else None
    is_synthesis = workflow is not None and workflow.row_source == "multi_doc_synthesis"
    row_question = cell.row_key if is_synthesis else ""
    retrieval_query = _tabular_retrieval_query(
        column["label"],
        column_prompt,
        row_question=row_question,
    )
    if is_synthesis:
        user_message = (
            f"Row question: {row_question}\n\nExtraction column: {column['label']}\n\n"
            f"User extraction prompt:\n{column_prompt}{suffix}"
            f"{_TABULAR_OUTPUT_DIRECTIVE}"
        )
    else:
        user_message = (
            f"Extraction column: {column['label']}\n\n"
            f"User extraction prompt:\n{column_prompt}{suffix}"
            f"{_TABULAR_OUTPUT_DIRECTIVE}"
        )

    try:
        if is_synthesis:
            retrieved = []
            for doc_id in run.document_ids if run else []:
                try:
                    chunks = await load_doc_context(
                        deal_id,
                        doc_id,
                        retrieval_query,
                    )
                except Exception:
                    logger.exception("query_document failed: doc=%s", doc_id)
                    chunks = []
                retrieved.extend(chunks)
            retrieved = _select_synthesis_chunks(retrieved)
        else:
            doc_id = cell.row_key  # one_doc_per_row: row_key == doc_id
            retrieved = await load_doc_context(
                deal_id,
                doc_id,
                retrieval_query,
            )
        if not retrieved:
            answer = ""
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

            if is_synthesis:
                full_doc_chunks = []
                for doc_id in run.document_ids if run else []:
                    try:
                        full_doc_chunks.extend(get_doc_page_chunks(deal_id, doc_id))
                    except Exception:
                        logger.exception("get_document_chunks failed: doc=%s", doc_id)
            else:
                full_doc_chunks = get_doc_page_chunks(deal_id, cell.row_key)
            cleaned_answer, citations = extract_citations(
                full_answer,
                retrieved,
                deal_id=deal_id,
                page_context_chunks=full_doc_chunks or None,
            )
            cleaned_answer = cleaned_answer.strip()
            if cleaned_answer and not _has_valid_citation(citations):
                logger.info(
                    "Blanking uncited workflow cell answer: cell=%s column=%s",
                    cell_id,
                    column["label"],
                )
                cleaned_answer = ""
                citations = []
                formatted = None
            else:
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
        logger.exception("LLM cell extraction failed: cell=%s", cell_id)
        workflow_run_store.error_cell(cell_id, f"{type(exc).__name__}: {exc}")

    updated = workflow_run_store.get_cell(cell_id)
    if updated is not None:
        await run_event_bus.publish(
            run_id, {"type": "cell", "cell": updated.model_dump(mode="json")}
        )


def _select_synthesis_chunks(retrieved: list[dict]) -> list[dict]:
    """Pick the context set for a multi_doc_synthesis cell.

    RAG mode: top-K by relevance score (scores are meaningful).
    Full-context mode: scores are uniformly 1.0, so sorting is meaningless —
    keep document/page order and truncate at a page boundary once the char
    budget is exhausted, logging what was dropped.
    """
    if not settings.full_context_mode:
        return sorted(
            retrieved,
            key=lambda chunk: chunk.get("score", 0),
            reverse=True,
        )[:_TABULAR_SYNTHESIS_MAX_CHUNKS]
    out: list[dict] = []
    total = 0
    for chunk in retrieved:
        total += len(chunk.get("content", ""))
        if out and total > _SYNTHESIS_CHAR_BUDGET:
            logger.warning(
                "Synthesis context truncated at %d of %d chunks (~%dK chars)",
                len(out),
                len(retrieved),
                total // 1000,
            )
            break
        out.append(chunk)
    return out


_RETRIEVAL_PROMPT_CHAR_CAP = 280


def _tabular_retrieval_query(
    column_label: str,
    column_prompt: str,
    row_question: str = "",
) -> str:
    """Build a retrieval query from analyst label + prompt.

    The full column prompt is often long (multi-paragraph format directives,
    field templates, Yahoo-Finance table specs, etc.) — embedding that whole
    blob dilutes the semantic signal and can return zero chunks, leaving the
    cell silently empty. We use the first sentence of the prompt (capped at
    ~280 chars) so the retriever sees the intent without the prose tail.
    """
    parts: list[str] = []
    row_question = (row_question or "").strip()
    column_label = (column_label or "").strip()
    column_prompt = (column_prompt or "").strip()
    if row_question:
        parts.append(f"Row question: {row_question}")
    if column_label:
        parts.append(f"Column label: {column_label}")
    if column_prompt and column_prompt.lower() != column_label.lower():
        # First sentence keeps the intent; long format directives that follow
        # add noise without adding semantic signal to vector search.
        first_sentence = column_prompt.split(". ", 1)[0]
        if len(first_sentence) > _RETRIEVAL_PROMPT_CHAR_CAP:
            first_sentence = first_sentence[:_RETRIEVAL_PROMPT_CHAR_CAP].rstrip() + "…"
        parts.append(f"Extraction prompt: {first_sentence}")
    return "\n".join(parts) or column_prompt or column_label


def _has_valid_citation(citations: list) -> bool:
    return any(citation is not None for citation in citations)


async def execute_formula_cell(cell_id: str, run_id: str):
    """Evaluate a derived cell against completed extraction cells in its row."""
    cell = workflow_run_store.get_cell(cell_id)
    if cell is None:
        return None
    column = workflow_run_store.load_column(cell.column_id)
    if not column:
        return workflow_run_store.error_cell(cell_id, "Column not found")

    running = workflow_run_store.mark_cell_running(cell_id)
    if running is None:
        return None  # cancelled or already claimed — never execute
    await run_event_bus.publish(
        run_id, {"type": "cell", "cell": running.model_dump(mode="json")}
    )

    try:
        run = workflow_run_store.get_run(run_id)
        if run is None:
            return workflow_run_store.error_cell(cell_id, "Run not found")
        columns = workflow_run_store.load_columns_for_workflow(run.workflow_id)
        cells = workflow_run_store.list_cells_for_run(run_id)
        values: dict[str, Any] = {}
        for other in cells:
            if other.row_key != cell.row_key or other.id == cell.id:
                continue
            other_col = next((c for c in columns if c["id"] == other.column_id), None)
            if not other_col:
                continue
            values[other_col["label"]] = _cell_value(other)
        answer = _eval_formula(column["formula"], values)
        formatted = parse_answer(answer, column["format"], column["tags"])
        return workflow_run_store.complete_cell(
            cell_id,
            answer=answer,
            answer_formatted=formatted,
            citations=[],
            model="formula",
            fallback=False,
            duration_ms=0,
        )
    except Exception as exc:
        logger.exception("Formula evaluation failed: cell=%s", cell_id)
        return workflow_run_store.error_cell(cell_id, f"{type(exc).__name__}: {exc}")


def _cell_value(cell) -> Any:
    if cell.answer_formatted is not None:
        if isinstance(cell.answer_formatted, dict) and "raw" in cell.answer_formatted:
            return cell.answer_formatted.get("raw")
        return cell.answer_formatted
    return cell.answer


def _eval_formula(formula: str, values: dict[str, Any]) -> str:
    expr = (formula or "").strip()
    if expr.startswith("="):
        expr = expr[1:].strip()
    if not expr:
        return ""
    # `**` passes the arithmetic char whitelist but lets `9**9**9` compute an
    # astronomically large int synchronously on the event loop; oversized
    # expressions get the same treatment.
    if "**" in expr or len(expr) > 200:
        return ""
    if expr.upper().startswith("IF(") and expr.endswith(")"):
        parts = _split_args(expr[3:-1])
        if len(parts) >= 3:
            return str(_eval_formula(parts[1], values) if _eval_condition(parts[0], values) else _eval_formula(parts[2], values)).strip("\"'")
    if (expr.startswith('"') and expr.endswith('"')) or (expr.startswith("'") and expr.endswith("'")):
        return expr[1:-1]
    arithmetic = _eval_arithmetic(expr, values)
    if arithmetic is not None:
        return str(int(arithmetic)) if float(arithmetic).is_integer() else f"{arithmetic:.4g}"
    return str(_resolve_value(expr, values) or "")


def _split_args(raw: str) -> list[str]:
    args: list[str] = []
    depth = 0
    quote = ""
    start = 0
    for i, ch in enumerate(raw):
        if quote:
            if ch == quote:
                quote = ""
            continue
        if ch in ("'", '"'):
            quote = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "," and depth == 0:
            args.append(raw[start:i].strip())
            start = i + 1
    args.append(raw[start:].strip())
    return args


def _eval_condition(expr: str, values: dict[str, Any]) -> bool:
    expr = expr.strip()
    for sep, fn in ((" OR ", any), (" AND ", all)):
        if sep in expr.upper():
            parts = re.split(sep, expr, flags=re.IGNORECASE)
            return fn(_eval_condition(part, values) for part in parts)
    match = re.match(r"(.+?)\s*(>=|<=|=|==|!=|>|<)\s*(.+)", expr)
    if not match:
        return bool(_resolve_value(expr, values))
    left = _resolve_value(match.group(1), values)
    right = _resolve_value(match.group(3), values)
    op = match.group(2)
    left_num = _to_number(left)
    right_num = _to_number(right)
    if left_num is not None and right_num is not None:
        left_cmp: Any = left_num
        right_cmp: Any = right_num
    else:
        left_cmp = str(left or "").lower()
        right_cmp = str(right or "").lower()
    if op in ("=", "=="):
        return left_cmp == right_cmp
    if op == "!=":
        return left_cmp != right_cmp
    if op == ">":
        return left_cmp > right_cmp
    if op == "<":
        return left_cmp < right_cmp
    if op == ">=":
        return left_cmp >= right_cmp
    if op == "<=":
        return left_cmp <= right_cmp
    return False


def _resolve_value(token: str, values: dict[str, Any]) -> Any:
    raw = token.strip().strip("[]").strip()
    if (raw.startswith('"') and raw.endswith('"')) or (raw.startswith("'") and raw.endswith("'")):
        return raw[1:-1]
    for key, value in values.items():
        if key.lower() == raw.lower():
            return value
    num = _to_number(raw)
    return num if num is not None else raw


def _eval_arithmetic(expr: str, values: dict[str, Any]) -> float | None:
    replaced = expr
    for key, value in sorted(values.items(), key=lambda kv: len(kv[0]), reverse=True):
        num = _to_number(value)
        if num is None:
            continue
        replaced = re.sub(rf"\[{re.escape(key)}\]", str(num), replaced, flags=re.IGNORECASE)
    if re.search(r"[A-Za-z\[\]]", replaced) or not re.fullmatch(r"[\d\s+\-*/().]+", replaced):
        return None
    # `**` passes the char whitelist but lets `9**9**9` compute an
    # astronomically large int synchronously on the event loop.
    if "**" in replaced or len(replaced) > 200:
        return None
    try:
        return float(eval(replaced, {"__builtins__": {}}, {}))
    except Exception:
        return None


def _to_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, dict):
        if isinstance(value.get("amount"), (int, float)):
            return float(value["amount"])
        value = value.get("raw", "")
    text = str(value or "")
    match = re.search(r"-?\d[\d,]*(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0).replace(",", ""))
    except ValueError:
        return None


# ── Assistant runs (Phase 3) ──


_PRIOR_STAGE_HEADER = (
    "Prior approved stage outputs are available below. Use them as authoritative "
    "facts for this stage. If a prior output conflicts with the source documents, "
    "trust the prior output (the analyst has approved it)."
)

_ASSISTANT_OUTPUT_DIRECTIVE = (
    "Output discipline: default to analyst-ready extracted findings, not long-form "
    "narrative. Use compact bullets, short tables, or labeled values. Each finding "
    "should carry a valid [Source N] marker from the numbered document context. "
    "Do not cite filenames, page numbers, or quotes unless they correspond to a "
    "provided [Source N] marker. If this stage explicitly asks you to compose a "
    "memo, keep the memo concise and preserve citations; otherwise avoid memo "
    "prose and do not add generic background."
)

_ASSISTANT_DOC_TOP_K = 14


async def execute_assistant_run(run_id: str, deal_id: str) -> None:
    """Run queued stages serially until the run reaches a checkpoint or
    terminal state. Re-entrant: callable again after `approve_stage` to
    resume."""
    run = workflow_run_store.get_run(run_id)
    if run is None or run.status == "cancelled":
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
    await _finalize_run_status(run_id, worst)


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
    if running is None:
        return  # cancelled or already claimed — never execute
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
        + "\n\n"
        + _ASSISTANT_OUTPUT_DIRECTIVE
        + "\n\nWrite the markdown output for this stage. Use [Source N] markers "
        "when grounding claims in the document context above."
    )

    try:
        all_chunks: list = []
        for doc_id in document_ids:
            try:
                chunks = await load_doc_context(
                    deal_id,
                    doc_id,
                    stage.prompt_md or stage.label,
                )
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

        # For citations we use the union of retrieved chunks for source-number
        # mapping, plus full same-page context from selected docs to enrich
        # snippets without changing the mapping.
        page_context_chunks: list = []
        for doc_id in document_ids:
            try:
                page_context_chunks.extend(get_doc_page_chunks(deal_id, doc_id))
            except Exception:
                logger.exception("get_document_chunks failed: doc=%s", doc_id)
        cleaned_answer, citations = extract_citations(
            full_answer,
            all_chunks,
            deal_id=deal_id,
            page_context_chunks=page_context_chunks or None,
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
