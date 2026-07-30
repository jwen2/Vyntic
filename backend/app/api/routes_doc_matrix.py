"""
Document matrix streaming endpoint — runs a single query against multiple
documents within a deal, with per-document isolation.
Streams token-by-token LLM output for each document via SSE.
"""
import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services import deal_store
from app.services.context_provider import load_doc_context, get_doc_page_chunks
from app.services.extraction_engine import stream_extraction
from app.database import UserRow
from app.auth import get_current_user, require_deal_access
from app.agents.llm import llm_call_context

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
        with llm_call_context(surface="doc_matrix", deal_id=deal_id, doc_id=doc_id):
            retrieved = await load_doc_context(deal_id, doc_id, query)

            if not retrieved:
                yield {
                    "doc_id": doc_id,
                    "answer": "No relevant content found in this document.",
                    "citations": [],
                    "done": True,
                }
                return

            # Pull every chunk for the cited document so citation snippets can be
            # enriched with same-page context — Docling sometimes captures table
            # headers in one chunk and the row values as text in another, and
            # top-k retrieval may not include both. (See citations._select_snippet.)
            full_doc_chunks = get_doc_page_chunks(deal_id, doc_id)

            async for kind, payload in stream_extraction(
                retrieved,
                query,
                deal_id=deal_id,
                page_context_chunks=full_doc_chunks,
            ):
                if kind == "token":
                    yield {
                        "doc_id": doc_id,
                        "token": payload,
                        "done": False,
                    }
                else:
                    yield {
                        "doc_id": doc_id,
                        "answer": payload.answer,
                        "citations": [c.model_dump() if c else None for c in payload.citations],
                        "done": True,
                        "model": payload.model or "unknown",
                        "fallback": payload.fallback,
                        "duration_ms": payload.duration_ms,
                    }

    except Exception as e:
        yield {
            "doc_id": doc_id,
            "error": str(e),
            "done": True,
        }


@router.post("/stream")
async def doc_matrix_stream(deal_id: str, request: DocMatrixRequest, current_user: UserRow = Depends(get_current_user)):
    """
    SSE endpoint: streams token-by-token LLM output for each document in the
    doc matrix. Documents are processed with bounded concurrency (semaphore of 2).
    """
    require_deal_access(current_user, deal_id)
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
