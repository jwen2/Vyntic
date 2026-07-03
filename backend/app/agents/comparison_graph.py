"""
Multi-deal comparison: parallel per-deal QA fan-out, then one synthesis call.

Isolation guarantee unchanged: each answer_deal_question call loads only its
own deal's context; the synthesizer sees structured per-deal answers, never
raw chunks from other deals.

(Previously a two-node LangGraph; the graph added a dependency without adding
behavior — the fan-out was already a plain asyncio.gather inside one node.)
"""
import asyncio

from app.config import settings
from app.models.query import QueryResponse, Citation
from app.models.matrix import CellData
from app.agents.single_deal_qa import answer_deal_question


async def _gather_deal_answers(deal_ids: list[str], query: str) -> dict[str, dict]:
    """Query every deal in parallel (bounded), one isolated call per deal."""
    semaphore = asyncio.Semaphore(settings.max_concurrent_llm_calls)

    async def query_with_limit(deal_id: str) -> tuple[str, QueryResponse]:
        async with semaphore:
            result = await answer_deal_question(deal_id, query)
            return deal_id, result

    results = await asyncio.gather(*(query_with_limit(did) for did in deal_ids))
    return {deal_id: response.model_dump() for deal_id, response in results}


async def compare_deals(deal_ids: list[str], query: str) -> dict[str, CellData]:
    """
    Run the comparison for a single query across multiple deals.
    Returns: dict mapping deal_id -> CellData.

    The old graph also ran a synthesis LLM call here and discarded the
    result (only cells are returned); the streaming endpoint does its own
    synthesis. That call is intentionally gone.
    """
    deal_answers = await _gather_deal_answers(deal_ids, query)

    cells: dict[str, CellData] = {}
    for deal_id in deal_ids:
        answer_data = deal_answers.get(deal_id, {})
        citations = [
            Citation(**c) for c in answer_data.get("citations", []) if c is not None
        ]
        cells[deal_id] = CellData(
            answer=answer_data.get("answer", "No data available"),
            citations=citations,
            status="complete",
        )

    return cells
