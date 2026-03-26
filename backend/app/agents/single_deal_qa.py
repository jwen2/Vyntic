"""
Single-deal RAG chain: retrieve context from one deal's collection, generate answer with citations.
"""
from langchain_core.messages import SystemMessage, HumanMessage

from app.config import settings
from app.models.query import QueryResponse
from app.services.vector_store import query_deal, query_document
from app.utils.citations import build_context_string, extract_citations
from app.agents.prompts import SINGLE_DEAL_SYSTEM
from app.agents.llm import invoke_with_fallback


async def answer_deal_question(deal_id: str, question: str) -> QueryResponse:
    """
    RAG pipeline for a single deal:
    1. Retrieve relevant chunks from the deal's collection
    2. Build augmented prompt with context
    3. Generate answer with Gemini (with fallback)
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

    # Step 3: Generate with fallback
    answer = await invoke_with_fallback([
        SystemMessage(content=system_prompt),
        HumanMessage(content=question),
    ])

    # Step 4: Extract citations and strip hallucinated source refs
    cleaned_answer, citations = extract_citations(answer, retrieved, deal_id=deal_id)

    return QueryResponse(
        deal_id=deal_id,
        question=question,
        answer=cleaned_answer,
        citations=citations,
    )


async def answer_document_question(deal_id: str, doc_id: str, question: str) -> QueryResponse:
    """
    RAG pipeline for a single document within a deal:
    1. Retrieve relevant chunks filtered to the specific doc_id
    2. Build augmented prompt with context
    3. Generate answer with Gemini (with fallback)
    4. Extract and validate citations
    """
    # Step 1: Retrieve (isolated to single document)
    retrieved = await query_document(deal_id, doc_id, question)

    if not retrieved:
        return QueryResponse(
            deal_id=deal_id,
            question=question,
            answer="No relevant content found in this document.",
            citations=[],
        )

    # Step 2: Build context
    context_str = build_context_string(retrieved)
    system_prompt = SINGLE_DEAL_SYSTEM.format(context=context_str)

    # Step 3: Generate with fallback
    answer = await invoke_with_fallback([
        SystemMessage(content=system_prompt),
        HumanMessage(content=question),
    ])

    # Step 4: Extract citations and strip hallucinated source refs
    cleaned_answer, citations = extract_citations(answer, retrieved, deal_id=deal_id)

    return QueryResponse(
        deal_id=deal_id,
        question=question,
        answer=cleaned_answer,
        citations=citations,
    )
