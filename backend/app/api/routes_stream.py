"""
Streaming matrix comparison endpoint using Server-Sent Events (SSE).
Sends token-by-token LLM output for each deal cell as it generates,
then streams a cross-deal synthesis row once all deals complete per query.
"""
import asyncio
import json
import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.config import settings
from app.models.matrix import MatrixRequest
from app.services import deal_store
from app.services.vector_store import query_deal
from app.utils.citations import build_context_string, extract_citations
from app.agents.prompts import SINGLE_DEAL_SYSTEM, COMPARISON_SYSTEM

from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage

_THINK_RE = re.compile(r"<think>[\s\S]*?</think>", re.IGNORECASE)

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
        inside_think = False
        async for chunk in llm.astream([
            SystemMessage(content=system_prompt),
            HumanMessage(content=question),
        ]):
            token = chunk.content
            if not token:
                continue
            full_answer += token

            # Buffer <think>…</think> blocks — don't send them to the client
            if "<think>" in full_answer and "</think>" not in full_answer:
                inside_think = True
                continue
            if inside_think and "</think>" in full_answer:
                # Think block just closed — strip it and continue
                full_answer = _THINK_RE.sub("", full_answer).strip()
                inside_think = False
                continue
            if inside_think:
                continue

            yield {
                "type": "token",
                "deal_id": deal_id,
                "query": question,
                "token": token,
            }

        full_answer = _THINK_RE.sub("", full_answer).strip()
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


async def _stream_synthesis_answer(query: str, deal_answers: dict):
    """
    Generator that yields SSE events for the cross-deal synthesis.
    Runs after all individual deal answers complete for a given query.
    Uses the COMPARISON_SYSTEM prompt to produce a comparative analysis.
    """
    try:
        # Format deal analyses the same way comparison_graph does
        analyses_parts = []
        for deal_id, answer_data in deal_answers.items():
            answer_text = answer_data.get("answer", "No data available")
            citations = answer_data.get("citations", [])
            cite_str = ", ".join(
                f"{c.get('source_file', 'unknown')} p.{c.get('page', '?')}"
                for c in citations
            )
            analyses_parts.append(
                f"**{deal_id}**: {answer_text}\n  Sources: {cite_str}"
            )

        deal_analyses_str = "\n\n".join(analyses_parts)
        system_prompt = COMPARISON_SYSTEM.format(deal_analyses=deal_analyses_str)

        llm = ChatOllama(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
            num_predict=settings.max_tokens,
        )

        full_answer = ""
        inside_think = False
        async for chunk in llm.astream([
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Compare the following across all deals: {query}"),
        ]):
            token = chunk.content
            if not token:
                continue
            full_answer += token

            if "<think>" in full_answer and "</think>" not in full_answer:
                inside_think = True
                continue
            if inside_think and "</think>" in full_answer:
                full_answer = _THINK_RE.sub("", full_answer).strip()
                inside_think = False
                continue
            if inside_think:
                continue

            yield {
                "type": "token",
                "deal_id": SYNTHESIS_DEAL_ID,
                "query": query,
                "token": token,
            }

        full_answer = _THINK_RE.sub("", full_answer).strip()
        yield {
            "type": "done",
            "deal_id": SYNTHESIS_DEAL_ID,
            "query": query,
            "answer": full_answer,
            "citations": [],
        }

    except Exception as e:
        yield {
            "type": "error",
            "deal_id": SYNTHESIS_DEAL_ID,
            "query": query,
            "error": str(e),
        }


@router.post("/compare/stream")
async def matrix_compare_stream(request: MatrixRequest):
    """
    SSE endpoint: streams token-by-token LLM output for each deal×query cell.
    Deals are processed in parallel (bounded by semaphore), tokens interleave.
    After all deals complete for a query, a synthesis row streams comparative analysis.
    """
    for deal_id in request.deal_ids:
        if not deal_store.get_deal(deal_id):
            raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    if not request.queries:
        raise HTTPException(status_code=400, detail="At least one query is required")

    num_deals = len(request.deal_ids)

    async def event_generator():
        semaphore = asyncio.Semaphore(settings.max_concurrent_llm_calls)
        queue: asyncio.Queue = asyncio.Queue()

        # Per-query tracking for synthesis trigger
        query_state = {}
        for query in request.queries:
            query_state[query] = {
                "remaining": num_deals,
                "answers": {},  # deal_id -> {answer, citations}
            }

        synthesis_tasks = []

        async def stream_one(deal_id: str, query: str, out_queue: asyncio.Queue):
            async with semaphore:
                async for event in _stream_deal_answer(deal_id, query):
                    await out_queue.put(event)

                    # Track completed answers for synthesis
                    if event["type"] == "done":
                        qs = query_state[query]
                        qs["answers"][deal_id] = {
                            "answer": event["answer"],
                            "citations": event["citations"],
                        }
                        qs["remaining"] -= 1
                        if qs["remaining"] <= 0 and num_deals > 1:
                            t = asyncio.create_task(
                                stream_synthesis(query, qs["answers"], out_queue)
                            )
                            synthesis_tasks.append(t)
                    elif event["type"] == "error":
                        qs = query_state[query]
                        qs["remaining"] -= 1
                        # Still synthesize with available answers
                        if qs["remaining"] <= 0 and qs["answers"] and num_deals > 1:
                            t = asyncio.create_task(
                                stream_synthesis(query, qs["answers"], out_queue)
                            )
                            synthesis_tasks.append(t)

        async def stream_synthesis(query: str, deal_answers: dict, out_queue: asyncio.Queue):
            async with semaphore:
                async for event in _stream_synthesis_answer(query, deal_answers):
                    await out_queue.put(event)

        deal_tasks = []
        for query in request.queries:
            for deal_id in request.deal_ids:
                deal_tasks.append(asyncio.create_task(
                    stream_one(deal_id, query, queue)
                ))

        async def wait_all():
            await asyncio.gather(*deal_tasks)
            # All deal tasks done means all synthesis tasks have been created
            if synthesis_tasks:
                await asyncio.gather(*synthesis_tasks)
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
