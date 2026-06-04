"""Context provider: unified retrieval abstraction for full-context and RAG query paths.

When full_context_mode=True, reads full_text_md from the documents table and returns
all pages as chunk dicts in the same shape the RAG path returned. Downstream citation
logic (build_context_string, extract_citations, CONTEXT_TEMPLATE) is unchanged.

When full_context_mode=False, delegates to the original vector_store functions via
deferred imports so the RAG path is never touched.
"""
import logging
import re

from app.config import settings
from app.database import SessionLocal, DocumentRow

logger = logging.getLogger(__name__)

_FC_TOKEN_WARN_THRESHOLD = 800_000  # ~800K tokens; Gemini Flash limit is 1M


def _full_text_to_chunks(full_text_md: str, filename: str, doc_id: str) -> list[dict]:
    """Split full_text_md on '## Page N' headers into per-page chunk dicts."""
    if not full_text_md or not full_text_md.strip():
        return []

    # Split before each ## Page N header, keeping the header in the segment
    segments = re.split(r"(?=## Page \d+)", full_text_md)
    chunks = []
    for seg in segments:
        seg = seg.strip()
        if not seg:
            continue
        page_match = re.match(r"## Page (\d+)", seg)
        page_num = int(page_match.group(1)) if page_match else 0
        content = re.sub(r"^## Page \d+\n?", "", seg).strip()
        if not content:
            continue
        chunks.append({
            "content": content,
            "source_file": filename,
            "page": page_num,
            "doc_id": doc_id,
            "score": 1.0,
            "section_type": "text",
        })
    return chunks


def _pages_to_chunks_from_null() -> list[dict]:
    """Placeholder for null full_text_md. ChromaDB fallback removed for MVP."""
    return []


async def load_doc_context(deal_id: str, doc_id: str, question: str) -> list[dict]:
    """Load context for a single-document question.

    Full-context path: reads full_text_md from DB, returns all pages as chunk dicts.
    RAG fallback: delegates to vector_store.query_document when full_context_mode=False.
    """
    if not settings.full_context_mode:
        from app.services.vector_store import query_document
        return await query_document(deal_id, doc_id, question)

    db = SessionLocal()
    try:
        row = db.query(DocumentRow).filter(
            DocumentRow.doc_id == doc_id,
            DocumentRow.deal_id == deal_id,
        ).first()
    finally:
        db.close()

    if not row:
        return []
    if not row.full_text_md:
        logger.warning("full_text_md is null for doc %s — no context available", doc_id)
        return _pages_to_chunks_from_null()
    return _full_text_to_chunks(row.full_text_md, row.filename, row.doc_id)


async def load_deal_context(deal_id: str, question: str) -> list[dict]:
    """Load context for a deal-level question across all documents.

    Full-context path: concatenates full_text_md from all docs in the deal.
    RAG fallback: delegates to vector_store.query_deal when full_context_mode=False.
    """
    if not settings.full_context_mode:
        from app.services.vector_store import query_deal
        return await query_deal(deal_id, question)

    db = SessionLocal()
    try:
        rows = db.query(DocumentRow).filter(DocumentRow.deal_id == deal_id).all()
    finally:
        db.close()

    if not rows:
        return []

    chunks = []
    total_chars = 0
    for row in rows:
        if row.full_text_md:
            doc_chunks = _full_text_to_chunks(row.full_text_md, row.filename, row.doc_id)
        else:
            logger.warning("full_text_md is null for doc %s in deal %s", row.doc_id, deal_id)
            doc_chunks = _pages_to_chunks_from_null()
        chunks.extend(doc_chunks)
        total_chars += sum(len(c["content"]) for c in doc_chunks)

    estimated_tokens = total_chars / 4
    if estimated_tokens > _FC_TOKEN_WARN_THRESHOLD:
        logger.warning(
            "Deal %s context is ~%dK tokens — approaching Gemini Flash 1M limit",
            deal_id,
            int(estimated_tokens / 1000),
        )
    return chunks


def get_doc_page_chunks(deal_id: str, doc_id: str) -> list[dict]:
    """Return all page chunks for citation snippet enrichment.

    In full-context mode, reconstructs from full_text_md (all pages already available).
    In RAG mode, reads from ChromaDB via get_document_chunks.
    """
    if not settings.full_context_mode:
        from app.services.vector_store import get_document_chunks
        return get_document_chunks(deal_id, doc_id)

    db = SessionLocal()
    try:
        row = db.query(DocumentRow).filter(
            DocumentRow.doc_id == doc_id,
            DocumentRow.deal_id == deal_id,
        ).first()
    finally:
        db.close()

    if row and row.full_text_md:
        return _full_text_to_chunks(row.full_text_md, row.filename, row.doc_id)
    return []
