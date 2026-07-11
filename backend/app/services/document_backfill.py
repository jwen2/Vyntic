"""Repair full-context text for documents ingested before the migration."""

import logging
from dataclasses import dataclass, field
from pathlib import Path

from app.config import settings
from app.services import deal_store
from app.services.parser import parse_document_path
from app.services.vector_store import get_document_chunks

logger = logging.getLogger(__name__)


@dataclass
class BackfillResult:
    repaired: list[str] = field(default_factory=list)
    missing_files: list[str] = field(default_factory=list)
    failed: dict[str, str] = field(default_factory=dict)


def _legacy_chunks_to_full_text(chunks: list[dict]) -> str:
    """Reconstruct page-marked Markdown from all preserved legacy chunks."""
    by_page: dict[int, list[str]] = {}
    for chunk in sorted(
        chunks,
        key=lambda item: (int(item.get("page") or 0), int(item.get("chunk_index") or 0)),
    ):
        content = str(chunk.get("content") or "").strip()
        if content:
            by_page.setdefault(int(chunk.get("page") or 0), []).append(content)
    parts: list[str] = []
    for page, contents in sorted(by_page.items()):
        parts.append(f"## Page {page}\n\n" + "\n\n".join(contents))
    return "\n\n".join(parts)


async def backfill_missing_full_text(
    deal_id: str | None = None,
    filenames: set[str] | None = None,
) -> BackfillResult:
    """Reparse preserved uploads while retaining doc IDs and metadata.

    This is safe to rerun: only NULL/blank full_text rows are considered, and
    successful rows disappear from the next candidate query.
    """
    result = BackfillResult()
    candidates = deal_store.list_documents_missing_full_text(deal_id)
    if filenames is not None:
        candidates = [doc for doc in candidates if doc.filename in filenames]

    for doc in candidates:
        file_path = Path(settings.uploads_dir) / doc.deal_id / doc.filename
        key = f"{doc.deal_id}/{doc.filename}"
        try:
            legacy_chunks = get_document_chunks(doc.deal_id, doc.doc_id)
        except Exception:
            logger.exception("Could not read legacy vectors for %s; falling back to reparse", key)
            legacy_chunks = []
        reconstructed = _legacy_chunks_to_full_text(legacy_chunks)
        if reconstructed:
            page_count = max(
                doc.page_count,
                max((int(chunk.get("page") or 0) for chunk in legacy_chunks), default=0),
            )
            if deal_store.save_document_full_text(
                doc.doc_id,
                reconstructed,
                doc.parse_tier,
                page_count,
            ):
                result.repaired.append(key)
                logger.info("Backfilled full text from legacy vectors for %s", key)
                continue
        if not file_path.is_file():
            result.missing_files.append(key)
            logger.warning("Cannot backfill %s: original upload is missing", key)
            continue
        try:
            parsed, _ = await parse_document_path(file_path, doc.filename, doc.deal_id)
            if not parsed.full_text_md or not parsed.full_text_md.strip():
                raise ValueError("parser returned no full text")
            if not deal_store.save_document_full_text(
                doc.doc_id,
                parsed.full_text_md,
                parsed.parse_tier,
                parsed.page_count,
            ):
                raise ValueError("document row disappeared during backfill")
            result.repaired.append(key)
            logger.info("Backfilled full text for %s", key)
        except Exception as exc:
            result.failed[key] = f"{type(exc).__name__}: {exc}"
            logger.exception("Failed to backfill %s", key)

    return result
