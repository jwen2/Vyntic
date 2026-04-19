"""
Diligence Agent — single-deal autonomous investigation loop.

Design: the planner outputs a plain-text THOUGHT followed by a single-line
ACTION JSON. A lightweight loop parses the action, executes the tool, appends
the observation to the planner's message history, and iterates until finish
is called or the iteration cap is hit. At termination, a separate memo writer
call streams a clean IC memo using DILIGENCE_MEMO_SYSTEM.

This is the "LangGraph ToolNode or equivalent" called out in the build spec —
kept flat because the turn structure is linear (planner -> tool -> planner)
and we need per-token streaming of the final memo.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from typing import AsyncIterator

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.agents.llm import (
    get_last_meta,
    invoke_with_fallback,
    stream_with_fallback,
)
from app.agents.prompts import DILIGENCE_MEMO_SYSTEM, DILIGENCE_PLANNER_SYSTEM
from app.agents.tools import AgentState, make_tools
from app.services import deal_store


ITERATION_CAP = 12
WRAP_UP_AT = 10


# ── planner output parsing ────────────────────────────────────────────────

_ACTION_HEADER_RE = re.compile(r"^\s*ACTION\s*:\s*", re.MULTILINE)
_THOUGHT_HEADER_RE = re.compile(r"^\s*THOUGHT\s*:\s*", re.MULTILINE)


def _parse_planner_output(raw: str) -> tuple[str, dict | None, str | None]:
    """Return (thought_text, action_dict_or_None, parse_error_or_None)."""
    action_match = _ACTION_HEADER_RE.search(raw)
    if action_match:
        thought_part = raw[: action_match.start()]
        action_part = raw[action_match.end():]
    else:
        thought_part = raw
        action_part = ""

    thought_part = _THOUGHT_HEADER_RE.sub("", thought_part, count=1).strip()

    action_dict: dict | None = None
    err: str | None = None
    if action_part:
        # The model sometimes wraps in ``` fences or trails with prose.
        cleaned = action_part.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```", 2)[1]
            if cleaned.lower().startswith("json"):
                cleaned = cleaned[4:]
            if "```" in cleaned:
                cleaned = cleaned.split("```", 1)[0]
            cleaned = cleaned.strip()

        # Extract the first top-level JSON object.
        depth = 0
        start = -1
        json_str = ""
        for i, ch in enumerate(cleaned):
            if ch == "{":
                if depth == 0:
                    start = i
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0 and start >= 0:
                    json_str = cleaned[start : i + 1]
                    break
        if json_str:
            try:
                action_dict = json.loads(json_str)
            except json.JSONDecodeError as e:
                err = f"invalid JSON in ACTION: {e.msg}"
        else:
            err = "no JSON object found in ACTION block"
    else:
        err = "missing ACTION block"

    return thought_part, action_dict, err


# ── memo streaming ────────────────────────────────────────────────────────

def _build_evidence_digest(evidence: list[dict], max_items: int = 30) -> str:
    """Deduplicate evidence by (source_file, page) and render a compact digest."""
    seen: dict[tuple[str, int], dict] = {}
    for e in evidence:
        key = (e.get("source_file", ""), int(e.get("page", 0) or 0))
        if key not in seen:
            seen[key] = e
    items = list(seen.values())[:max_items]
    lines = []
    for e in items:
        sf = e.get("source_file", "?")
        pg = e.get("page", "?")
        chunk = (e.get("chunk") or "").strip().replace("\n", " ")
        if len(chunk) > 500:
            chunk = chunk[:499] + "…"
        lines.append(f"- ({sf} p.{pg}) {chunk}")
    return "\n".join(lines) if lines else "(no evidence collected)"


async def _stream_memo(
    deal_id: str,
    deal_name: str,
    state: AgentState,
) -> AsyncIterator[dict]:
    """Stream the final memo using DILIGENCE_MEMO_SYSTEM."""
    findings_json = json.dumps(state.findings, ensure_ascii=False, indent=2)
    evidence_digest = _build_evidence_digest(state.evidence)
    system_prompt = DILIGENCE_MEMO_SYSTEM.format(
        deal_name=deal_name,
        deal_id=deal_id,
        findings_json=findings_json,
        evidence_digest=evidence_digest,
    )
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(
            content=(
                "Write the investment-committee memo now, following the STRUCTURE "
                "exactly. Use only the findings and evidence above."
            )
        ),
    ]
    memo_buffer = ""
    try:
        async for chunk in stream_with_fallback(messages):
            token = chunk.content
            if not token:
                continue
            memo_buffer += token
            yield {"type": "memo_token", "token": token}
    except Exception as e:  # pragma: no cover - defensive
        yield {"type": "error", "error": f"memo generation failed: {e}"}
    state.memo = memo_buffer


# ── main loop ─────────────────────────────────────────────────────────────

async def run_investigation(
    deal_id: str,
    goal: str | None = None,
    investigation_id: str | None = None,
) -> AsyncIterator[dict]:
    """
    Yield SSE-event dicts for a single-deal investigation.

    Event types emitted:
      status | thought | tool_call | tool_result | finding | memo_token | done | error
    """
    deal = deal_store.get_deal(deal_id)
    if not deal:
        yield {"type": "error", "error": f"deal '{deal_id}' not found"}
        return

    goal_text = (goal or "").strip()
    goal_or_default = goal_text if goal_text else "(no specific goal — run general DD)"
    state = AgentState(deal_id=deal_id, deal_name=deal.name, goal=goal_or_default)
    tools = make_tools(state)

    t0 = time.monotonic()
    yield {
        "type": "status",
        "status": "started",
        "deal_id": deal_id,
        "investigation_id": investigation_id,
    }

    docs = deal_store.list_documents(deal_id)
    doc_list_lines = [
        f"- {d.doc_id}: {d.filename} ({d.page_count} pages)" for d in docs
    ] or ["(no documents uploaded)"]

    system_prompt = DILIGENCE_PLANNER_SYSTEM.format(
        goal_or_default=goal_or_default,
        deal_id=deal_id,
        deal_name=deal.name,
        doc_list="\n".join(doc_list_lines),
        iteration_cap=ITERATION_CAP,
        wrap_up_at=WRAP_UP_AT,
    )
    messages = [SystemMessage(content=system_prompt)]

    # Seed with an initial user nudge so the model starts acting.
    messages.append(
        HumanMessage(
            content="Begin the investigation. Follow the THOUGHT/ACTION format strictly."
        )
    )

    tool_call_counter = 0
    last_model = "unknown"
    last_fallback = False

    while state.iterations < ITERATION_CAP and not state.done:
        state.iterations += 1

        try:
            raw_output = await invoke_with_fallback(messages)
        except Exception as e:
            yield {"type": "error", "error": f"planner failed: {e}"}
            break

        meta = get_last_meta()
        if meta:
            last_model = meta.model_used or last_model
            last_fallback = last_fallback or bool(meta.fallback)

        # Append raw output to history so the model sees its own action +
        # the observation in the next turn.
        messages.append(AIMessage(content=raw_output))

        thought, action, parse_err = _parse_planner_output(raw_output)

        if thought:
            yield {"type": "thought", "token": thought}

        if parse_err or not action:
            # Nudge model back into format and continue.
            hint = (
                "FORMAT ERROR — your last turn did not produce a valid ACTION. "
                "Output exactly: THOUGHT: <reasoning>\\nACTION: {\"tool\": \"...\", \"args\": {...}}"
            )
            messages.append(HumanMessage(content=hint))
            continue

        tool_name = str(action.get("tool") or "").strip()
        tool_args = action.get("args") or {}
        if not isinstance(tool_args, dict):
            tool_args = {}

        if tool_name not in tools:
            hint = (
                f"Unknown tool '{tool_name}'. Valid tools: "
                f"{', '.join(tools.keys())}. Try again using the correct format."
            )
            messages.append(HumanMessage(content=hint))
            continue

        tool_call_counter += 1
        tc_id = f"tc_{tool_call_counter}"
        yield {
            "type": "tool_call",
            "id": tc_id,
            "tool": tool_name,
            "args": tool_args,
        }

        try:
            result = await tools[tool_name](**tool_args)
        except TypeError as e:
            # Likely bad argument shape from the model.
            hint = f"Tool '{tool_name}' rejected arguments: {e}. Check args and retry."
            messages.append(HumanMessage(content=hint))
            yield {
                "type": "tool_result",
                "id": tc_id,
                "summary": f"error: {e}",
            }
            continue
        except Exception as e:
            yield {
                "type": "tool_result",
                "id": tc_id,
                "summary": f"error: {e}",
            }
            hint = f"Tool '{tool_name}' raised: {e}. Choose another approach."
            messages.append(HumanMessage(content=hint))
            continue

        yield {
            "type": "tool_result",
            "id": tc_id,
            "summary": result.summary,
        }
        if result.emit_event:
            yield result.emit_event

        # Feed the full payload back to the planner as an observation.
        observation = json.dumps({"tool": tool_name, "result": result.payload}, ensure_ascii=False)
        if len(observation) > 6000:
            observation = observation[:6000] + " …[truncated]"
        messages.append(HumanMessage(content=f"OBSERVATION: {observation}"))

        if state.done:
            break

        if state.iterations == WRAP_UP_AT:
            messages.append(
                HumanMessage(
                    content=(
                        "You have used most of your iteration budget. Wrap up any "
                        "last critical finding and call finish on the next turn."
                    )
                )
            )

    # ── finalize: stream the memo ──
    yield {"type": "status", "status": "writing_memo"}
    async for ev in _stream_memo(deal_id, deal.name, state):
        yield ev

    duration_ms = int((time.monotonic() - t0) * 1000)
    memo_meta = get_last_meta()
    if memo_meta:
        last_model = memo_meta.model_used or last_model
        last_fallback = last_fallback or bool(memo_meta.fallback)

    yield {
        "type": "done",
        "memo": state.memo,
        "findings": state.findings,
        "evidence": state.evidence,
        "duration_ms": duration_ms,
        "model": last_model,
        "fallback": last_fallback,
    }


# Suppress "coroutine not awaited" on early GC in rare client-abort paths.
def _noop() -> asyncio.Future:  # pragma: no cover
    loop = asyncio.get_event_loop()
    return loop.create_future()
