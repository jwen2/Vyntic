"""
Streaming matrix comparison endpoint using Server-Sent Events (SSE).
Sends token-by-token LLM output for each deal cell as it generates.
"""
import asyncio
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.config import settings
from app.models.matrix import MatrixRequest
from app.services import deal_store
from app.services.vector_store import query_deal
from app.utils.citations import build_context_string, extract_citations
from app.agents.prompts import SINGLE_DEAL_SYSTEM

from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage

router = APIRouter(prefix="/matrix", tags=["matrix"])


async def _stream_deal_answer(deal_id: str, question: str):
    """
    Generator that yields SSE events for a single deal's answer.
    Events:
      - {"type":"token","deal_id":..., "query":..., "token":...}
      - {"type":"done","deal_id":..., "query":..., "answer":..., "citations":[...]}
      - {"type":"error","deal_id":..., "query":..., "error":...}
    """
    try:
        retrieved = await query_deal(deal_id, question)

        if not retrieved:
            yield {
                "type": "done",
                "deal_id": deal_id,
                "query": question,
                "answer": "No relevant documents found for this deal.",
                "citations": [],
            }
            return

        context_str = build_context_string(retrieved)
        system_prompt = SINGLE_DEAL_SYSTEM.format(context=context_str)

        llm = ChatOllama(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
            num_predict=settings.max_tokens,
        )

        full_answer = ""
        async for chunk in llm.astream([
            SystemMessage(content=system_prompt),
            HumanMessage(content=question),
        ]):
            token = chunk.content
            if token:
                full_answer += token
                yield {
                    "type": "token",
                    "deal_id": deal_id,
                    "query": question,
                    "token": token,
                }

        citations = extract_citations(full_answer, retrieved)
        yield {
            "type": "done",
            "deal_id": deal_id,
            "query": question,
            "answer": full_answer,
            "citations": [c.model_dump() for c in citations],
        }

    except Exception as e:
        yield {
            "type": "error",
            "deal_id": deal_id,
            "query": question,
            "error": str(e),
        }


@router.post("/compare/stream")
async def matrix_compare_stream(request: MatrixRequest):
    """
    SSE endpoint: streams token-by-token LLM output for each deal×query cell.
    Deals are processed in parallel (bounded by semaphore), tokens interleave.
    """
    for deal_id in request.deal_ids:
        if not deal_store.get_deal(deal_id):
            raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    if not request.queries:
        raise HTTPException(status_code=400, detail="At least one query is required")

    async def event_generator():
        semaphore = asyncio.Semaphore(settings.max_concurrent_llm_calls)

        async def stream_one(deal_id: str, query: str, out_queue: asyncio.Queue):
            async with semaphore:
                async for event in _stream_deal_answer(deal_id, query):
                    await out_queue.put(event)

        queue: asyncio.Queue = asyncio.Queue()

        tasks = []
        for query in request.queries:
            for deal_id in request.deal_ids:
                tasks.append(asyncio.create_task(
                    stream_one(deal_id, query, queue)
                ))

        # Sentinel: when all tasks done, push None to stop
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
