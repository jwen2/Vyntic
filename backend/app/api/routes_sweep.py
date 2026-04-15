"""
Proactive deal sweep endpoint — scans ALL document chunks in a deal
to find hidden risks, buried clauses, and items the deal team might miss.
Unlike workstream queries (embedding-based retrieval), the sweep passes
the full document context to the LLM so nothing is missed.
Streams findings via SSE.
"""
import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import settings
from app.services import deal_store
from app.services.vector_store import get_all_chunks
from app.database import UserRow
from app.auth import get_current_user, require_deal_access
from app.utils.citations import build_context_string, extract_citations
from app.agents.prompts import PROACTIVE_SWEEP_SYSTEM

from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.llm import stream_with_fallback, get_last_meta

router = APIRouter(prefix="/deals/{deal_id}/sweep", tags=["sweep"])


class SweepRequest(BaseModel):
    questions: list[str]


async def _stream_sweep_answer(deal_id: str, question: str, all_chunks: list[dict]):
    """
    Generator that yields SSE event dicts for a single sweep scan area.
    Uses ALL chunks from the deal (not embedding-based retrieval).
    """
    try:
        if not all_chunks:
            yield {
                "type": "done",
                "deal_id": deal_id,
                "question": question,
                "answer": "No documents found for this deal. Upload documents to run a proactive scan.",
                "citations": [],
            }
            return

        context_str = build_context_string(all_chunks)
        system_prompt = PROACTIVE_SWEEP_SYSTEM.format(context=context_str)

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=question),
        ]

        full_answer = ""
        async for chunk in stream_with_fallback(messages):
            token = chunk.content
            if token:
                full_answer += token
                yield {
                    "type": "token",
                    "deal_id": deal_id,
                    "question": question,
                    "token": token,
                }

        cleaned_answer, citations = extract_citations(full_answer, all_chunks, deal_id=deal_id)
        meta = get_last_meta()
        yield {
            "type": "done",
            "deal_id": deal_id,
            "question": question,
            "answer": cleaned_answer,
            "citations": [c.model_dump() if c else None for c in citations],
            "model": meta.model_used if meta else "unknown",
            "fallback": meta.fallback if meta else False,
            "duration_ms": meta.duration_ms if meta else 0,
        }

    except Exception as e:
        yield {
            "type": "error",
            "deal_id": deal_id,
            "question": question,
            "error": str(e),
        }


@router.post("/stream")
async def sweep_stream(deal_id: str, request: SweepRequest, current_user: UserRow = Depends(get_current_user)):
    """
    SSE endpoint: runs proactive sweep scan on ALL document chunks in a deal.
    Unlike workstream queries which use embedding-based retrieval, the sweep
    passes the full document context to find hidden risks and buried issues.
    """
    require_deal_access(current_user, deal_id)
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    if not request.questions:
        raise HTTPException(status_code=400, detail="At least one scan area is required")

    async def event_generator():
        # Get ALL chunks up front (shared across all sweep questions)
        all_chunks = await get_all_chunks(deal_id)

        # Send metadata about the scan
        yield f"data: {json.dumps({'type': 'sweep_meta', 'deal_id': deal_id, 'total_chunks': len(all_chunks), 'total_questions': len(request.questions)})}\n\n"

        semaphore = asyncio.Semaphore(settings.max_concurrent_llm_calls)
        queue: asyncio.Queue = asyncio.Queue()

        async def stream_one(question: str):
            async with semaphore:
                async for event in _stream_sweep_answer(deal_id, question, all_chunks):
                    await queue.put(event)

        tasks = [
            asyncio.create_task(stream_one(q))
            for q in request.questions
        ]

        async def wait_all():
            await asyncio.gather(*tasks)
            await queue.put(None)

        asyncio.create_task(wait_all())

        while True:
            event = await queue.get()
            if event is None:
                break
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
