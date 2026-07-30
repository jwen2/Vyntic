"""
Streaming matrix comparison endpoint using Server-Sent Events (SSE).
Sends token-by-token LLM output for each deal cell as it generates.
"""
import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.config import settings
from app.models.matrix import MatrixRequest
from app.services import deal_store
from app.services.context_provider import load_deal_context
from app.services.extraction_engine import stream_extraction
from app.database import UserRow
from app.auth import get_current_user, require_deal_access
from app.agents.prompts import COMPARISON_SYSTEM

from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.llm import stream_with_fallback, get_last_meta, llm_call_context

router = APIRouter(prefix="/matrix", tags=["matrix"])

SYNTHESIS_DEAL_ID = "__synthesis__"


async def _stream_deal_answer(deal_id: str, question: str):
    """
    Generator that yields SSE events for a single deal's answer.
    Events:
      - {"type":"token","deal_id":..., "query":..., "token":...}
      - {"type":"done","deal_id":..., "query":..., "answer":..., "citations":[...]}
      - {"type":"error","deal_id":..., "query":..., "error":...}
    """
    try:
        with llm_call_context(surface="chat_stream", deal_id=deal_id):
            retrieved = await load_deal_context(deal_id, question)

            if not retrieved:
                yield {
                    "type": "done",
                    "deal_id": deal_id,
                    "query": question,
                    "answer": "No relevant documents found for this deal.",
                    "citations": [],
                }
                return

            async for kind, payload in stream_extraction(retrieved, question, deal_id=deal_id):
                if kind == "token":
                    yield {
                        "type": "token",
                        "deal_id": deal_id,
                        "query": question,
                        "token": payload,
                    }
                else:
                    yield {
                        "type": "done",
                        "deal_id": deal_id,
                        "query": question,
                        "answer": payload.answer,
                        "citations": [c.model_dump() if c else None for c in payload.citations],
                        "model": payload.model or "unknown",
                        "fallback": payload.fallback,
                        "duration_ms": payload.duration_ms,
                    }

    except Exception as e:
        yield {
            "type": "error",
            "deal_id": deal_id,
            "query": question,
            "error": str(e),
        }


async def _stream_synthesis(query: str, deal_ids: list[str], answers: dict[str, str]):
    """Stream a synthesis response comparing all deal answers for a query."""
    try:
        analyses_parts = []
        for deal_id in deal_ids:
            answer = answers.get(deal_id, "No data available")
            analyses_parts.append(f"**{deal_id}**: {answer}")

        deal_analyses_str = "\n\n".join(analyses_parts)
        system_prompt = COMPARISON_SYSTEM.format(deal_analyses=deal_analyses_str)

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Compare the following across all deals: {query}"),
        ]

        full_answer = ""
        async for chunk in stream_with_fallback(messages):
            token = chunk.content
            if token:
                full_answer += token
                yield f"data: {json.dumps({'type': 'token', 'deal_id': SYNTHESIS_DEAL_ID, 'query': query, 'token': token})}\n\n"

        meta = get_last_meta()
        yield f"data: {json.dumps({'type': 'done', 'deal_id': SYNTHESIS_DEAL_ID, 'query': query, 'answer': full_answer, 'citations': [], 'model': meta.model_used if meta else 'unknown', 'fallback': meta.fallback if meta else False, 'duration_ms': meta.duration_ms if meta else 0})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'deal_id': SYNTHESIS_DEAL_ID, 'query': query, 'error': str(e)})}\n\n"


@router.post("/compare/stream")
async def matrix_compare_stream(request: MatrixRequest, current_user: UserRow = Depends(get_current_user)):
    """
    SSE endpoint: streams token-by-token LLM output for each deal×query cell.
    Deals are processed in parallel (bounded by semaphore), tokens interleave.
    """
    for deal_id in request.deal_ids:
        require_deal_access(current_user, deal_id)
        if not deal_store.get_deal(deal_id):
            raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    if not request.queries:
        raise HTTPException(status_code=400, detail="At least one query is required")

    async def event_generator():
        semaphore = asyncio.Semaphore(settings.max_concurrent_llm_calls)
        # Collect completed answers per query for synthesis
        completed_answers: dict[str, dict[str, str]] = {}  # query -> {deal_id -> answer}

        async def stream_one(deal_id: str, query: str, out_queue: asyncio.Queue):
            async with semaphore:
                async for event in _stream_deal_answer(deal_id, query):
                    # Capture completed answers for synthesis
                    if event["type"] == "done":
                        completed_answers.setdefault(query, {})[deal_id] = event.get("answer", "")
                    await out_queue.put(event)

        queue: asyncio.Queue = asyncio.Queue()

        tasks = []
        for query in request.queries:
            for deal_id in request.deal_ids:
                tasks.append(asyncio.create_task(
                    stream_one(deal_id, query, queue)
                ))

        # Sentinel: when all tasks done, push None to stop deal streaming
        async def wait_all():
            await asyncio.gather(*tasks)
            await queue.put(None)

        asyncio.create_task(wait_all())

        while True:
            event = await queue.get()
            if event is None:
                break
            yield f"data: {json.dumps(event)}\n\n"

        # Stream synthesis for each query if multiple deals
        if len(request.deal_ids) > 1:
            for query in request.queries:
                async for line in _stream_synthesis(query, request.deal_ids, completed_answers.get(query, {})):
                    yield line

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
