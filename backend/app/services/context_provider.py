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
from app.database import current_session, DealRow, DocumentRow

logger = logging.getLogger(__name__)

_FC_TOKEN_WARN_THRESHOLD = 800_000  # ~800K tokens; Gemini Flash limit is 1M
_FC_HARD_CHAR_BUDGET = 3_200_000  # ~800K tokens at ~4 chars/token

# Set by load_deal_context on every call: True when the last corpus was
# truncated to fit the budget. Stopgap until Plan 5's context cascade.
last_context_truncated = False


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


def _manager_shared_doc_rows(db, deal_id: str) -> list[DocumentRow]:
    """Manager-scoped documents from sibling funds of the same manager.

    This is the ONE deliberate relaxation of per-entity context isolation:
    a document uploaded to fund A with scope="manager" is visible in the
    context of every fund that belongs to the same manager. Documents never
    cross manager boundaries, and entity-scoped sibling documents are never
    included.
    """
    deal_row = db.query(DealRow).filter(DealRow.deal_id == deal_id).first()
    if not deal_row or not deal_row.manager_id:
        return []
    return (
        db.query(DocumentRow)
        .join(DealRow, DocumentRow.deal_id == DealRow.deal_id)
        .filter(
            DealRow.manager_id == deal_row.manager_id,
            DocumentRow.scope == "manager",
            DocumentRow.deal_id != deal_id,
        )
        .all()
    )


def _find_doc_row_for_entity(db, deal_id: str, doc_id: str) -> DocumentRow | None:
    """Resolve a doc_id addressable from this entity: its own documents first,
    then manager-shared documents from sibling funds."""
    row = db.query(DocumentRow).filter(
        DocumentRow.doc_id == doc_id,
        DocumentRow.deal_id == deal_id,
    ).first()
    if row:
        return row
    for shared in _manager_shared_doc_rows(db, deal_id):
        if shared.doc_id == doc_id:
            return shared
    return None


async def load_doc_context(deal_id: str, doc_id: str, question: str) -> list[dict]:
    """Load context for a single-document question.

    Full-context path: reads full_text_md from DB, returns all pages as chunk dicts.
    Resolves manager-shared documents so doc-scoped questions work on them too.
    RAG fallback: delegates to vector_store.query_document when full_context_mode=False.
    """
    if not settings.full_context_mode:
        from app.services.vector_store import query_document
        return await query_document(deal_id, doc_id, question)

    db, owned = current_session()
    try:
        row = _find_doc_row_for_entity(db, deal_id, doc_id)
    finally:
        if owned:
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

    db, owned = current_session()
    try:
        rows = db.query(DocumentRow).filter(DocumentRow.deal_id == deal_id).all()
        # Funds additionally see the manager's shared documents (DDQs, Form
        # ADV, reference notes uploaded to sibling funds with scope="manager").
        rows = rows + _manager_shared_doc_rows(db, deal_id)
    finally:
        if owned:
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

    global last_context_truncated
    last_context_truncated = False
    if total_chars > _FC_HARD_CHAR_BUDGET:
        # Truncate at a chunk boundary in document/page order — never send
        # an over-limit corpus to Gemini (mirrors _select_synthesis_chunks).
        kept: list[dict] = []
        kept_chars = 0
        for chunk in chunks:
            if kept and kept_chars + len(chunk["content"]) > _FC_HARD_CHAR_BUDGET:
                break
            kept.append(chunk)
            kept_chars += len(chunk["content"])
        dropped = chunks[len(kept):]
        dropped_docs = sorted({c["source_file"] for c in dropped})
        last_context_truncated = True
        logger.warning(
            "Deal %s context truncated at %d of %d chunks (~%dK of ~%dK chars); "
            "dropped content from: %s",
            deal_id,
            len(kept),
            len(chunks),
            kept_chars // 1000,
            total_chars // 1000,
            ", ".join(dropped_docs),
        )
        return kept

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

    db, owned = current_session()
    try:
        row = _find_doc_row_for_entity(db, deal_id, doc_id)
    finally:
        if owned:
            db.close()

    if row and row.full_text_md:
        return _full_text_to_chunks(row.full_text_md, row.filename, row.doc_id)
    return []
