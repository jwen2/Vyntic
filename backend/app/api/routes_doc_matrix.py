"""
Document matrix streaming endpoint — runs a single query against multiple
documents within a deal, with per-document isolation.
Streams token-by-token LLM output for each document via SSE.
"""
import asyncio
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services import deal_store
from app.services.vector_store import query_document
from app.utils.citations import build_context_string, extract_citations
from app.agents.prompts import SINGLE_DEAL_SYSTEM

from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.llm import stream_with_fallback, get_last_meta

router = APIRouter(prefix="/deals/{deal_id}/doc-matrix", tags=["doc-matrix"])


class DocMatrixRequest(BaseModel):
    doc_ids: list[str]
    query: str


async def _stream_doc_answer(deal_id: str, doc_id: str, query: str):
    """
    Generator that yields SSE event dicts for a single document's answer.
    Retrieval is isolated to the specified doc_id via query_document().
    """
    try:
        retrieved = await query_document(deal_id, doc_id, query)

        if not retrieved:
            yield {
                "doc_id": doc_id,
                "answer": "No relevant content found in this document.",
                "citations": [],
                "done": True,
            }
            return

        context_str = build_context_string(retrieved)
        system_prompt = SINGLE_DEAL_SYSTEM.format(context=context_str)

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=query),
        ]

        full_answer = ""
        async for chunk in stream_with_fallback(messages):
            token = chunk.content
            if token:
                full_answer += token
                yield {
                    "doc_id": doc_id,
                    "token": token,
                    "done": False,
                }

        cleaned_answer, citations = extract_citations(full_answer, retrieved, deal_id=deal_id)
        meta = get_last_meta()
        yield {
            "doc_id": doc_id,
            "answer": cleaned_answer,
            "citations": [c.model_dump() if c else None for c in citations],
            "done": True,
            "model": meta.model_used if meta else "unknown",
            "fallback": meta.fallback if meta else False,
            "duration_ms": meta.duration_ms if meta else 0,
        }

    except Exception as e:
        yield {
            "doc_id": doc_id,
            "error": str(e),
            "done": True,
        }


@router.post("/stream")
async def doc_matrix_stream(deal_id: str, request: DocMatrixRequest):
    """
    SSE endpoint: streams token-by-token LLM output for each document in the
    doc matrix. Documents are processed with bounded concurrency (semaphore of 2).
    """
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    if not request.doc_ids:
        raise HTTPException(status_code=400, detail="At least one doc_id is required")

    async def event_generator():
        semaphore = asyncio.Semaphore(2)
        queue: asyncio.Queue = asyncio.Queue()

        async def stream_one(doc_id: str):
            async with semaphore:
                async for event in _stream_doc_answer(deal_id, doc_id, request.query):
                    await queue.put(event)

        tasks = [
            asyncio.create_task(stream_one(doc_id))
            for doc_id in request.doc_ids
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
