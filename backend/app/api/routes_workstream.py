"""
Workstream streaming endpoint — runs multiple DD questions against a single deal.
Streams token-by-token LLM output for each question via SSE.
"""
import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import settings
from app.services import deal_store
from app.services.vector_store import query_deal
from app.database import UserRow
from app.auth import get_current_user, require_deal_access
from app.utils.citations import build_context_string, extract_citations
from app.agents.prompts import get_workstream_prompt

from langchain_core.messages import SystemMessage, HumanMessage
from app.agents.llm import stream_with_fallback, get_last_meta

router = APIRouter(prefix="/deals/{deal_id}/workstream", tags=["workstream"])


class WorkstreamRequest(BaseModel):
    workstream: str  # "financial" | "commercial" | "operational" | "legal"
    questions: list[str]


class SingleQuestionRequest(BaseModel):
    question: str
    workstream: str = ""  # optional workstream context


async def _stream_workstream_answer(deal_id: str, question: str, workstream: str):
    """
    Generator that yields SSE event dicts for a single question within a workstream.
    Uses workstream-specialized prompts when available.
    """
    try:
        retrieved = await query_deal(deal_id, question)

        if not retrieved:
            yield {
                "type": "done",
                "deal_id": deal_id,
                "question": question,
                "answer": "No relevant documents found for this deal.",
                "citations": [],
            }
            return

        context_str = build_context_string(retrieved)
        system_prompt = get_workstream_prompt(workstream, context_str)

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

        cleaned_answer, citations = extract_citations(full_answer, retrieved, deal_id=deal_id)
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
async def workstream_stream(deal_id: str, request: WorkstreamRequest, current_user: UserRow = Depends(get_current_user)):
    """
    SSE endpoint: streams all questions in a workstream against a single deal.
    Questions are processed with bounded concurrency, tokens interleave.
    """
    require_deal_access(current_user, deal_id)
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    if not request.questions:
        raise HTTPException(status_code=400, detail="At least one question is required")

    async def event_generator():
        semaphore = asyncio.Semaphore(settings.max_concurrent_llm_calls)
        queue: asyncio.Queue = asyncio.Queue()

        async def stream_one(question: str):
            async with semaphore:
                async for event in _stream_workstream_answer(deal_id, question, request.workstream):
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


@router.post("/query/stream")
async def single_question_stream(deal_id: str, request: SingleQuestionRequest, current_user: UserRow = Depends(get_current_user)):
    """
    SSE endpoint: streams a single question against a deal with optional workstream context.
    """
    require_deal_access(current_user, deal_id)
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")

    async def event_generator():
        async for event in _stream_workstream_answer(deal_id, request.question, request.workstream):
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
