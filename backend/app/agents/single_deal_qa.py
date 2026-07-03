"""
Single-deal QA: load context (full-text or RAG via context_provider),
answer through the extraction engine.
"""
from app.models.query import QueryResponse
from app.services.context_provider import load_deal_context, load_doc_context
from app.services.extraction_engine import run_extraction


async def answer_deal_question(deal_id: str, question: str) -> QueryResponse:
    """Answer a question against all documents in a deal."""
    retrieved = await load_deal_context(deal_id, question)

    if not retrieved:
        return QueryResponse(
            deal_id=deal_id,
            question=question,
            answer="No relevant documents found for this deal. Please ensure documents have been uploaded and ingested.",
            citations=[],
        )

    result = await run_extraction(retrieved, question, deal_id=deal_id)

    return QueryResponse(
        deal_id=deal_id,
        question=question,
        answer=result.answer,
        citations=result.citations,
    )


async def answer_document_question(deal_id: str, doc_id: str, question: str) -> QueryResponse:
    """Answer a question against a single document within a deal."""
    retrieved = await load_doc_context(deal_id, doc_id, question)

    if not retrieved:
        return QueryResponse(
            deal_id=deal_id,
            question=question,
            answer="No relevant content found in this document.",
            citations=[],
        )

    result = await run_extraction(retrieved, question, deal_id=deal_id)

    return QueryResponse(
        deal_id=deal_id,
        question=question,
        answer=result.answer,
        citations=result.citations,
    )
