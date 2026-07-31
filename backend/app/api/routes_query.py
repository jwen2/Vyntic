"""Single-deal query routes.

Hosts both the non-streaming `/query` endpoint and the SSE `/query/stream`
endpoint used by the Agent chat surface (DealAssistantPanel). The streaming
implementation was previously in routes_workstream.py; it moved here when
the Workstreams tab was retired in PR #80.
"""
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.agents.single_deal_qa import answer_deal_question
from app.auth import get_current_user, require_deal_access
from app.database import UserRow
from app.models.query import QueryRequest, QueryResponse
from app.services import deal_store
from app.services.context_provider import load_deal_selection
from app.services.extraction_engine import stream_extraction
from app.agents.llm import llm_call_context


router = APIRouter(prefix="/deals/{deal_id}/query", tags=["query"])


class SingleQuestionRequest(BaseModel):
    question: str


@router.post("", response_model=QueryResponse)
async def query_deal_route(deal_id: str, request: QueryRequest, current_user: UserRow = Depends(get_current_user)):
    """Ask a question about a specific deal's documents (non-streaming)."""
    require_deal_access(current_user, deal_id)
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")

    try:
        with llm_call_context(surface="chat_query", deal_id=deal_id):
            return await answer_deal_question(deal_id, request.question)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


async def _stream_answer(deal_id: str, question: str):
    """SSE event generator for a single question against a deal."""
    try:
        with llm_call_context(surface="chat_query", deal_id=deal_id):
            selection = await load_deal_selection(deal_id, question)
            retrieved = selection.chunks

            if not retrieved:
                yield {
                    "type": "done",
                    "deal_id": deal_id,
                    "question": question,
                    "answer": "No relevant documents found for this deal.",
                    "citations": [],
                    "excluded_docs": selection.excluded_docs,
                }
                return

            async for kind, payload in stream_extraction(retrieved, question, deal_id=deal_id):
                if kind == "token":
                    yield {
                        "type": "token",
                        "deal_id": deal_id,
                        "question": question,
                        "token": payload,
                    }
                else:
                    yield {
                        "type": "done",
                        "deal_id": deal_id,
                        "question": question,
                        "answer": payload.answer,
                        "citations": [c.model_dump() if c else None for c in payload.citations],
                        "model": payload.model or "unknown",
                        "fallback": payload.fallback,
                        "duration_ms": payload.duration_ms,
                        "excluded_docs": selection.excluded_docs,
                    }

    except Exception as e:
        yield {
            "type": "error",
            "deal_id": deal_id,
            "question": question,
            "error": str(e),
        }


@router.post("/stream")
async def query_stream(deal_id: str, request: SingleQuestionRequest, current_user: UserRow = Depends(get_current_user)):
    """SSE endpoint streaming a single question's answer for the Agent chat."""
    require_deal_access(current_user, deal_id)
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")

    async def event_generator():
        async for event in _stream_answer(deal_id, request.question):
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
