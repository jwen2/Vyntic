"""
Multi-deal comparison using LangGraph.
Architecture: Manager -> Fan-out Workers (one per deal) -> Synthesis Agent.
Enforces zero context leak by ensuring each worker only queries its own collection.
"""
import asyncio
import operator
import re
from typing import Annotated, TypedDict

from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, END

from app.config import settings
from app.models.query import QueryResponse, Citation
from app.models.matrix import CellData
from app.agents.single_deal_qa import answer_deal_question
from app.agents.prompts import COMPARISON_SYSTEM


class ComparisonState(TypedDict):
    """State flowing through the comparison graph."""
    query: str
    deal_ids: list[str]
    # Accumulated results from workers: dict of deal_id -> QueryResponse dict
    deal_answers: Annotated[dict, operator.or_]
    synthesis: str


async def _worker_node(state: ComparisonState) -> dict:
    """
    Fan-out worker: queries a single deal's collection.
    Each worker invocation handles ALL deals using asyncio for parallel execution.
    ISOLATION: Each call to answer_deal_question queries only one collection.
    """
    query = state["query"]
    deal_ids = state["deal_ids"]

    # Run all deal queries in parallel with concurrency limit
    semaphore = asyncio.Semaphore(settings.max_concurrent_llm_calls)

    async def query_with_limit(deal_id: str) -> tuple[str, QueryResponse]:
        async with semaphore:
            result = await answer_deal_question(deal_id, query)
            return deal_id, result

    tasks = [query_with_limit(did) for did in deal_ids]
    results = await asyncio.gather(*tasks)

    deal_answers = {}
    for deal_id, response in results:
        deal_answers[deal_id] = response.model_dump()

    return {"deal_answers": deal_answers}


async def _synthesis_node(state: ComparisonState) -> dict:
    """
    Synthesize a comparative analysis from all deal answers.
    Receives structured results, never raw document chunks from other deals.
    """
    query = state["query"]
    deal_answers = state["deal_answers"]

    # Format deal analyses for the comparison prompt
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

    response = await llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=f"Compare the following across all deals: {query}"),
    ])

    _think_re = re.compile(r"<think>[\s\S]*?</think>", re.IGNORECASE)
    return {"synthesis": _think_re.sub("", response.content).strip()}


def build_comparison_graph() -> StateGraph:
    """Construct the LangGraph comparison workflow."""
    graph = StateGraph(ComparisonState)

    graph.add_node("worker", _worker_node)
    graph.add_node("synthesizer", _synthesis_node)

    graph.set_entry_point("worker")
    graph.add_edge("worker", "synthesizer")
    graph.add_edge("synthesizer", END)

    return graph.compile()


async def compare_deals(deal_ids: list[str], query: str) -> dict[str, CellData]:
    """
    Run the comparison graph for a single query across multiple deals.
    Returns: dict mapping deal_id -> CellData.
    """
    graph = build_comparison_graph()

    initial_state = {
        "query": query,
        "deal_ids": deal_ids,
        "deal_answers": {},
        "synthesis": "",
    }

    result = await graph.ainvoke(initial_state)

    # Build CellData for each deal
    cells = {}
    deal_answers = result.get("deal_answers", {})

    for deal_id in deal_ids:
        answer_data = deal_answers.get(deal_id, {})
        citations = [
            Citation(**c) for c in answer_data.get("citations", [])
        ]
        cells[deal_id] = CellData(
            answer=answer_data.get("answer", "No data available"),
            citations=citations,
            status="complete",
        )

    return cells
