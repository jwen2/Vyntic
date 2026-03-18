"""
Single-deal RAG chain: retrieve context from one deal's collection, generate answer with citations.
"""
import re

from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage

from app.config import settings
from app.models.query import QueryResponse
from app.services.vector_store import query_deal
from app.utils.citations import build_context_string, extract_citations

_THINK_RE = re.compile(r"<think>[\s\S]*?</think>", re.IGNORECASE)
from app.agents.prompts import SINGLE_DEAL_SYSTEM


async def answer_deal_question(deal_id: str, question: str) -> QueryResponse:
    """
    RAG pipeline for a single deal:
    1. Retrieve relevant chunks from the deal's collection
    2. Build augmented prompt with context
    3. Generate answer with DeepSeek via Ollama
    4. Extract and validate citations
    """
    # Step 1: Retrieve
    retrieved = await query_deal(deal_id, question)

    if not retrieved:
        return QueryResponse(
            deal_id=deal_id,
            question=question,
            answer="No relevant documents found for this deal. Please ensure documents have been uploaded and ingested.",
            citations=[],
        )

    # Step 2: Build context
    context_str = build_context_string(retrieved)
    system_prompt = SINGLE_DEAL_SYSTEM.format(context=context_str)

    # Step 3: Generate with Ollama
    llm = ChatOllama(
        model=settings.ollama_model,
        base_url=settings.ollama_base_url,
        num_predict=settings.max_tokens,
    )

    response = await llm.ainvoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=question),
    ])

    answer = _THINK_RE.sub("", response.content).strip()

    # Step 4: Extract citations
    citations = extract_citations(answer, retrieved)

    return QueryResponse(
        deal_id=deal_id,
        question=question,
        answer=answer,
        citations=citations,
    )
