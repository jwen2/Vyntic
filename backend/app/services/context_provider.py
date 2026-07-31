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
from app.database import SessionLocal, DealRow, DocumentRow
from app.services.context_budget import chars_to_tokens

logger = logging.getLogger(__name__)

_FC_TOKEN_WARN_THRESHOLD = 800_000  # ~800K tokens; Gemini Flash limit is 1M
_SYSTEM_PROMPT_CHARS = 2000  # conservative allowance for the rendered system prompt


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
    """Compatibility helper retained for callers that need an empty value."""
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

    db = SessionLocal()
    try:
        row = _find_doc_row_for_entity(db, deal_id, doc_id)
    finally:
        db.close()

    if not row:
        return []
    if not row.full_text_md:
        logger.warning("full_text_md is null for doc %s — using legacy RAG fallback", doc_id)
        from app.services.vector_store import query_document
        return await query_document(row.deal_id, row.doc_id, question)
    return _full_text_to_chunks(row.full_text_md, row.filename, row.doc_id)


def _load_deal_doc_rows(deal_id: str) -> list[DocumentRow]:
    """All document rows visible to this deal: its own, plus manager-shared."""
    db = SessionLocal()
    try:
        rows = db.query(DocumentRow).filter(DocumentRow.deal_id == deal_id).all()
        # Funds additionally see the manager's shared documents (DDQs, Form
        # ADV, reference notes uploaded to sibling funds with scope="manager").
        rows = rows + _manager_shared_doc_rows(db, deal_id)
    finally:
        db.close()
    return rows


async def load_deal_selection(deal_id: str, question: str) -> "ContextSelection":
    """Deal-level context as a ContextSelection, with coverage information."""
    from app.services.context_allocator import (
        ContextSelection, DocCandidate, allocate, probe_scores,
    )
    from app.services.context_budget import budget_tokens, resolved_strategy

    strategy = resolved_strategy()

    if strategy == "retrieval":
        from app.services.vector_store import query_deal
        return ContextSelection(
            chunks=await query_deal(deal_id, question), strategy="retrieval",
        )

    rows = _load_deal_doc_rows(deal_id)
    if not rows:
        return ContextSelection()

    # Documents still missing full_text_md (background parsing not yet caught
    # up, or a parse failure) fall back to the legacy per-deal RAG query,
    # batched by owning deal_id so sibling manager-shared docs from the same
    # owner deal share one query_deal call instead of one each.
    legacy_doc_ids_by_deal: dict[str, set[str]] = {}
    for row in rows:
        if not row.full_text_md:
            logger.warning(
                "full_text_md is null for doc %s in deal %s — using legacy RAG fallback",
                row.doc_id, deal_id,
            )
            legacy_doc_ids_by_deal.setdefault(row.deal_id, set()).add(row.doc_id)

    legacy_chunks_by_doc: dict[str, list[dict]] = {}
    if legacy_doc_ids_by_deal:
        from app.services.vector_store import query_deal
        for owner_deal_id, doc_ids in legacy_doc_ids_by_deal.items():
            legacy_chunks = await query_deal(owner_deal_id, question)
            for chunk in legacy_chunks:
                if chunk.get("doc_id") in doc_ids:
                    legacy_chunks_by_doc.setdefault(chunk["doc_id"], []).append(chunk)

    candidates: list[DocCandidate] = []
    for row in rows:
        if row.full_text_md:
            whole = _full_text_to_chunks(row.full_text_md, row.filename, row.doc_id)
            size_chars = len(row.full_text_md or "")
        else:
            whole = legacy_chunks_by_doc.get(row.doc_id, [])
            size_chars = sum(len(c.get("content", "")) for c in whole)
        if not whole:
            continue
        candidates.append(DocCandidate(
            doc_id=row.doc_id,
            filename=row.filename,
            category=row.doc_category or "other",
            size_chars=size_chars,
            whole_chunks=whole,
            page_chunks=whole,   # placeholder; refreshed below for demoted docs
        ))

    budget = budget_tokens(prompt_overhead_chars=len(question) + _SYSTEM_PROMPT_CHARS)
    total = sum(c.size_chars for c in candidates)
    scores = None
    if strategy != "full_text" and chars_to_tokens(total) > budget:
        scores = await probe_scores(deal_id, question, doc_count=len(candidates))

    selection = allocate(candidates, budget=budget, scores=scores)
    if selection.partial_docs:
        from app.services.vector_store import query_document

        # Owning deal_id per doc, not the asking deal_id: manager-shared
        # documents live in the sibling deal's Chroma collection, and
        # querying the wrong collection must never widen into it — it can
        # only return nothing, which the fallback below handles.
        owning_deal_by_doc = {row.doc_id: row.deal_id for row in rows}
        refreshed: list[DocCandidate] = []
        for cand in candidates:
            if cand.doc_id in selection.partial_docs:
                owner_deal_id = owning_deal_by_doc.get(cand.doc_id, deal_id)
                try:
                    pages = await query_document(owner_deal_id, cand.doc_id, question)
                except Exception:
                    logger.warning(
                        "Page retrieval failed for %s — keeping whole document",
                        cand.doc_id,
                    )
                    pages = cand.whole_chunks
                cand = DocCandidate(
                    doc_id=cand.doc_id, filename=cand.filename,
                    category=cand.category, size_chars=cand.size_chars,
                    whole_chunks=cand.whole_chunks,
                    page_chunks=pages or cand.whole_chunks,
                )
            refreshed.append(cand)
        selection = allocate(refreshed, budget=budget, scores=scores)

    return selection


async def load_deal_context(deal_id: str, question: str) -> list[dict]:
    """Load context for a deal-level question across all documents.

    Backwards-compatible chunk list. See load_deal_selection for coverage.
    """
    return (await load_deal_selection(deal_id, question)).chunks


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
        row = _find_doc_row_for_entity(db, deal_id, doc_id)
    finally:
        db.close()

    if row and row.full_text_md:
        return _full_text_to_chunks(row.full_text_md, row.filename, row.doc_id)
    if row:
        from app.services.vector_store import get_document_chunks
        return get_document_chunks(row.deal_id, row.doc_id)
    return []
