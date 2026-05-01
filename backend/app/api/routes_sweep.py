"""
Proactive deal sweep endpoint — scans ALL document chunks in a deal
to find hidden risks, buried clauses, and items the deal team might miss.

Single-call architecture: all scan areas are answered in ONE batched LLM call
using Gemini's structured output. The streaming JSON parser fires a per-area
"done" SSE event as each answer object closes, so the frontend gets
progressive results without paying to re-send the corpus per question.
"""
import asyncio
import json
import time

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel

from app.agents.prompts import PROACTIVE_SWEEP_BATCH_SYSTEM
from app.auth import get_current_user, require_deal_access
from app.config import settings
from app.database import UserRow
from app.services import deal_store
from app.services.vector_store import get_all_chunks
from app.utils.citations import build_context_string, extract_citations
from app.utils.streaming_json import AnswersArrayStreamer

router = APIRouter(prefix="/deals/{deal_id}/sweep", tags=["sweep"])


SWEEP_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "answers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "answer": {"type": "string"},
                },
                "required": ["id", "answer"],
            },
        }
    },
    "required": ["answers"],
}


class SweepRequest(BaseModel):
    questions: list[str]


def _get_sweep_llm(model_name: str) -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=settings.gemini_api_key,
        max_output_tokens=65000,
        model_kwargs={
            "generation_config": {
                "response_mime_type": "application/json",
                "response_schema": SWEEP_RESPONSE_SCHEMA,
            }
        },
    )


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


@router.post("/stream")
async def sweep_stream(
    deal_id: str,
    request: SweepRequest,
    current_user: UserRow = Depends(get_current_user),
):
    """
    SSE endpoint: runs proactive sweep scan on ALL document chunks in a deal.
    Issues a single batched LLM call covering every scan area; emits a "done"
    SSE event per scan area as each answer finishes streaming.
    """
    require_deal_access(current_user, deal_id)
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    if not request.questions:
        raise HTTPException(status_code=400, detail="At least one scan area is required")

    questions = list(request.questions)
    qmap = {f"q{i}": q for i, q in enumerate(questions)}

    async def event_generator():
        all_chunks = await get_all_chunks(deal_id)

        yield _sse({
            "type": "sweep_meta",
            "deal_id": deal_id,
            "total_chunks": len(all_chunks),
            "total_questions": len(questions),
        })

        if not all_chunks:
            for q in questions:
                yield _sse({
                    "type": "done",
                    "deal_id": deal_id,
                    "question": q,
                    "answer": "No documents found for this deal. Upload documents to run a proactive scan.",
                    "citations": [],
                })
            return

        context_str = build_context_string(all_chunks)
        system_prompt = PROACTIVE_SWEEP_BATCH_SYSTEM.format(context=context_str)
        user_payload = json.dumps({
            "scan_areas": [{"id": qid, "text": q} for qid, q in qmap.items()]
        })

        emitted: set[str] = set()
        queue: asyncio.Queue = asyncio.Queue()
        t0 = time.monotonic()

        def emit_answer(obj: dict):
            qid = obj.get("id")
            if not isinstance(qid, str) or qid in emitted or qid not in qmap:
                return
            raw = obj.get("answer", "")
            if not isinstance(raw, str):
                return
            emitted.add(qid)
            cleaned, citations = extract_citations(raw, all_chunks, deal_id=deal_id)
            queue.put_nowait({
                "type": "done",
                "deal_id": deal_id,
                "question": qmap[qid],
                "answer": cleaned,
                "citations": [c.model_dump() if c else None for c in citations],
                "duration_ms": int((time.monotonic() - t0) * 1000),
            })

        streamer = AnswersArrayStreamer(emit_answer)

        async def run_llm():
            buf = ""
            model_used = settings.gemini_model
            fallback = False
            try:
                try:
                    llm = _get_sweep_llm(settings.gemini_model)
                    async for chunk in llm.astream([
                        SystemMessage(content=system_prompt),
                        HumanMessage(content=user_payload),
                    ]):
                        if chunk.content:
                            buf += chunk.content
                            streamer.feed(chunk.content)
                except Exception as primary_err:
                    if not settings.gemini_fallback_model:
                        raise
                    # Fallback: re-run from scratch with the backup model
                    fallback = True
                    model_used = settings.gemini_fallback_model
                    buf = ""
                    streamer_fb = AnswersArrayStreamer(emit_answer)
                    llm = _get_sweep_llm(settings.gemini_fallback_model)
                    async for chunk in llm.astream([
                        SystemMessage(content=system_prompt),
                        HumanMessage(content=user_payload),
                    ]):
                        if chunk.content:
                            buf += chunk.content
                            streamer_fb.feed(chunk.content)

                # End-of-stream backstop: if streaming parser missed any
                # answers (e.g. malformed mid-stream), reparse the whole buffer.
                _backstop_parse(buf, emit_answer)

                # Any scan areas the model omitted entirely become errors
                for qid, q in qmap.items():
                    if qid not in emitted:
                        queue.put_nowait({
                            "type": "error",
                            "deal_id": deal_id,
                            "question": q,
                            "error": "Model did not return an answer for this scan area",
                        })

                # Final summary event so the frontend can surface model/timing
                queue.put_nowait({
                    "type": "sweep_done",
                    "deal_id": deal_id,
                    "model": model_used,
                    "fallback": fallback,
                    "duration_ms": int((time.monotonic() - t0) * 1000),
                })
            except Exception as e:
                # Whole call failed — emit error per unfinished question
                for qid, q in qmap.items():
                    if qid not in emitted:
                        queue.put_nowait({
                            "type": "error",
                            "deal_id": deal_id,
                            "question": q,
                            "error": str(e),
                        })
            finally:
                queue.put_nowait(None)

        asyncio.create_task(run_llm())

        while True:
            event = await queue.get()
            if event is None:
                break
            yield _sse(event)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _backstop_parse(buf: str, emit_answer) -> None:
    """End-of-stream safety net: strip ```json fences and re-parse the full
    buffer in case the streaming parser missed an answer object."""
    s = buf.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s
        if s.endswith("```"):
            s = s.rsplit("```", 1)[0]
    try:
        parsed = json.loads(s)
    except json.JSONDecodeError:
        return
    answers = parsed.get("answers") if isinstance(parsed, dict) else None
    if not isinstance(answers, list):
        return
    for obj in answers:
        if isinstance(obj, dict):
            emit_answer(obj)
