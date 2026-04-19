"""
Follow-up Q&A streamer for a completed diligence investigation.

The agent does NOT re-run tools. It answers from:
  - the memo
  - the findings list
  - a compact evidence digest
  - prior Q&A turns in the thread

Emits SSE events: status | token | done | error
"""
from __future__ import annotations

import json
import time
from typing import AsyncIterator

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.agents.diligence_agent import _build_evidence_digest
from app.agents.llm import get_last_meta, stream_with_fallback
from app.agents.prompts import FOLLOWUP_QA_SYSTEM


async def run_followup(
    *,
    deal_name: str,
    deal_id: str,
    goal: str,
    memo: str,
    findings: list[dict],
    evidence: list[dict],
    prior_turns: list[dict],
    question: str,
) -> AsyncIterator[dict]:
    """Stream a follow-up answer grounded in the investigation record."""
    t0 = time.monotonic()
    findings_json = json.dumps(findings or [], ensure_ascii=False, indent=2)
    evidence_digest = _build_evidence_digest(evidence or [])

    system_prompt = FOLLOWUP_QA_SYSTEM.format(
        deal_name=deal_name,
        deal_id=deal_id,
        goal=(goal or "(no specific goal — general DD)"),
        memo=(memo or "(memo not available)"),
        findings_json=findings_json,
        evidence_digest=evidence_digest,
    )

    messages: list = [SystemMessage(content=system_prompt)]
    for turn in prior_turns or []:
        role = (turn.get("role") or "").lower()
        content = turn.get("content") or ""
        if not content:
            continue
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))

    messages.append(HumanMessage(content=question))

    yield {"type": "status", "status": "answering"}

    answer_buffer = ""
    try:
        async for chunk in stream_with_fallback(messages):
            token = chunk.content
            if not token:
                continue
            answer_buffer += token
            yield {"type": "token", "token": token}
    except Exception as e:  # pragma: no cover - defensive
        yield {"type": "error", "error": f"follow-up generation failed: {e}"}
        return

    meta = get_last_meta()
    duration_ms = int((time.monotonic() - t0) * 1000)
    yield {
        "type": "done",
        "content": answer_buffer,
        "duration_ms": duration_ms,
        "model": meta.model_used if meta else "",
        "fallback": bool(meta.fallback) if meta else False,
    }
