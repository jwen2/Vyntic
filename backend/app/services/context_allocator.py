"""Per-document context allocation.

Decides, per question, how much of each document to send: whole while the
budget lasts, retrieved pages when it does not, excluded (and named) below a
relevance floor. Below budget it does nothing at all — every document goes in
whole and no probe is issued, which is byte-for-byte today's behavior. As a
last resort — notably when the probe is unavailable and nothing could be
excluded by score — a final deterministic size cap trims the selection to
budget at a chunk boundary, so an over-budget corpus is never sent whole.

Pure function: budget and probe scores are parameters, so the over-budget path
is testable without a corpus large enough to reach the real budget.
"""
import logging
from dataclasses import dataclass, field

from app.config import settings
from app.services.context_budget import chars_to_tokens

logger = logging.getLogger(__name__)

# Documents whose absence would invalidate an answer. They may be demoted to
# retrieved pages, but are never excluded on a weak probe score.
CATEGORY_FLOOR = frozenset({"lpa", "side_letter", "form_adv"})

# Deliberately conservative: the citation eval is saturated at 1.000 and cannot
# distinguish a good floor from a bad one, so this is set low and left alone.
RELEVANCE_FLOOR = 0.15

# Sentinel for documents the probe never returned. Absence is not evidence of
# irrelevance — query_deal returns at most top_k chunks, so on a large corpus
# most documents simply do not appear.
UNSCORED = -1.0

PROBE_CHUNKS_PER_DOC = 5


@dataclass(frozen=True)
class DocCandidate:
    doc_id: str
    filename: str
    category: str
    size_chars: int
    whole_chunks: list[dict]
    page_chunks: list[dict]


@dataclass(frozen=True)
class ContextSelection:
    chunks: list[dict] = field(default_factory=list)
    whole_docs: list[str] = field(default_factory=list)
    partial_docs: list[str] = field(default_factory=list)
    excluded_docs: list[str] = field(default_factory=list)
    strategy: str = "full_text"


def allocate(
    docs: list[DocCandidate],
    budget: int,
    scores: dict[str, float] | None,
) -> ContextSelection:
    """Allocate `docs` against a token `budget` using probe `scores`.

    `scores=None` means the probe failed or was not run; nothing is excluded
    by relevance score. The final size cap can still exclude or demote a
    document if the real content overflows budget even after ranking.
    """
    if not docs:
        return ContextSelection()

    total_tokens = chars_to_tokens(sum(d.size_chars for d in docs))
    if total_tokens <= budget:
        # Step 1 guarantee: below the wall nothing new happens.
        return ContextSelection(
            chunks=[c for d in docs for c in d.whole_chunks],
            whole_docs=[d.doc_id for d in docs],
            strategy="full_text",
        )

    probe_failed = scores is None
    scores = scores or {}
    ranked = sorted(
        docs,
        key=lambda d: scores.get(d.doc_id, UNSCORED),
        reverse=True,
    )

    chunks: list[dict] = []
    whole: list[str] = []
    partial: list[str] = []
    excluded: list[str] = []
    remaining = budget

    for rank, doc in enumerate(ranked):
        score = scores.get(doc.doc_id, UNSCORED)
        size = chars_to_tokens(doc.size_chars)

        may_exclude = (
            not probe_failed
            and score != UNSCORED          # absent from probe -> never excluded
            and score < RELEVANCE_FLOOR
            and doc.category not in CATEGORY_FLOOR
        )
        if may_exclude:
            excluded.append(doc.doc_id)
            continue

        # Rank 1 always enters whole: one huge document must never consume the
        # budget by sorting first, and the top-ranked document is the one the
        # question is most likely about.
        if rank == 0 or remaining >= size:
            chunks.extend(doc.whole_chunks)
            whole.append(doc.doc_id)
            remaining -= size
        else:
            chunks.extend(doc.page_chunks)
            partial.append(doc.doc_id)
            remaining -= chars_to_tokens(
                sum(len(c.get("content", "")) for c in doc.page_chunks)
            )

    # Last-resort deterministic cap. The loop above budgets against each
    # doc's *declared* size_chars, which can undercount actual content
    # (whole vs. page chunks, markdown overhead) — and when the probe is
    # unavailable (scores=None) nothing above can be excluded at all. If the
    # real, joined content still overflows budget, trim at a chunk boundary
    # in the order already chosen (most relevant first), always keeping at
    # least the first chunk even if it alone exceeds budget. This is the
    # same guarantee the old hard char-budget truncation gave: an
    # over-budget corpus is never sent to Gemini un-triaged.
    sent_chars = sum(len(c.get("content", "")) for c in chunks)
    if chunks and chars_to_tokens(sent_chars) > budget:
        kept: list[dict] = []
        kept_chars = 0
        for chunk in chunks:
            content_len = len(chunk.get("content", ""))
            if kept and chars_to_tokens(kept_chars + content_len) > budget:
                break
            kept.append(chunk)
            kept_chars += content_len

        dropped = chunks[len(kept):]
        if dropped:
            contributed: dict[str, int] = {}
            for c in chunks:
                contributed[c["doc_id"]] = contributed.get(c["doc_id"], 0) + 1
            kept_counts: dict[str, int] = {}
            for c in kept:
                kept_counts[c["doc_id"]] = kept_counts.get(c["doc_id"], 0) + 1

            # A document that lost all its chunks to the cap is no longer
            # sent at all; one that lost only some is no longer sent whole.
            for doc_id in list(whole):
                have = kept_counts.get(doc_id, 0)
                if have == 0:
                    whole.remove(doc_id)
                    excluded.append(doc_id)
                elif have < contributed[doc_id]:
                    whole.remove(doc_id)
                    partial.append(doc_id)
            for doc_id in list(partial):
                if kept_counts.get(doc_id, 0) == 0:
                    partial.remove(doc_id)
                    excluded.append(doc_id)

            dropped_doc_ids = sorted({c["doc_id"] for c in dropped})
            logger.warning(
                "Context size cap dropped %d of %d chunks (~%d of ~%d budget "
                "tokens); documents affected: %s",
                len(dropped), len(chunks), chars_to_tokens(kept_chars), budget,
                ", ".join(dropped_doc_ids),
            )
            chunks = kept

    if excluded:
        logger.warning(
            "Context allocation excluded %d of %d documents: %s",
            len(excluded), len(docs), ", ".join(sorted(excluded)),
        )

    return ContextSelection(
        chunks=chunks,
        whole_docs=whole,
        partial_docs=partial,
        excluded_docs=excluded,
        strategy="allocated",
    )


async def _query_deal(deal_id: str, query_text: str, top_k: int | None = None):
    """Indirection so tests can substitute the vector store."""
    from app.services.vector_store import query_deal
    return await query_deal(deal_id, query_text, top_k=top_k)


async def probe_scores(
    deal_id: str, question: str, doc_count: int
) -> dict[str, float] | None:
    """Best-chunk similarity per doc_id. Returns None if the probe fails.

    top_k is raised with the document count: query_deal defaults to 20 chunks,
    several of which typically come from the same document, so on a large
    corpus most documents would never appear at all.
    """
    top_k = max(settings.top_k, PROBE_CHUNKS_PER_DOC * doc_count)
    try:
        rows = await _query_deal(deal_id, question, top_k=top_k)
    except Exception as exc:
        logger.warning(
            "Relevance probe failed for deal %s (%s) — allocating without "
            "ranking; nothing will be excluded", deal_id, exc,
        )
        return None

    best: dict[str, float] = {}
    for row in rows:
        doc_id = row.get("doc_id") or ""
        if not doc_id:
            continue
        score = float(row.get("score", 0.0))
        if score > best.get(doc_id, float("-inf")):
            best[doc_id] = score
    return best
