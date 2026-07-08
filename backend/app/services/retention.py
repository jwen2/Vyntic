"""
Retention purge (Plan 4 C1, S8).

Soft-deleted rows older than settings.retention_purge_days are hard-
removed here — and only here. Vector and file cleanup happens at purge
time, not at delete time, so a soft-deleted deal is fully recoverable
until the window closes. Deals under legal hold are never purged.

Runs as a startup sweep (like the run/ingest reconcilers); a scheduler
can call purge_expired() on an interval when one exists (Plan 5).
"""
import logging
import os
import shutil
from datetime import datetime, timedelta

from app.config import settings
from app.database import SessionLocal, DealRow, DocumentRow
from app.services.vector_store import delete_deal_vectors, delete_doc_vectors

logger = logging.getLogger(__name__)


async def purge_expired(now: datetime | None = None) -> int:
    """Hard-delete expired soft-deleted deals and documents. Returns the
    number of rows purged. Always uses its own session — the purge runs
    from startup/schedulers, never inside a request."""
    now = now or datetime.utcnow()
    cutoff = now - timedelta(days=settings.retention_purge_days)
    purged = 0

    db = SessionLocal()
    try:
        expired_deals = db.query(DealRow).filter(
            DealRow.deleted_at.isnot(None),
            DealRow.deleted_at < cutoff,
            DealRow.legal_hold.is_(False),
        ).all()
        for deal in expired_deals:
            deal_id = deal.deal_id
            try:
                await delete_deal_vectors(deal_id)
            except Exception:
                logger.exception(f"Vector cleanup failed for purged deal {deal_id}")
            upload_dir = os.path.join(settings.uploads_dir, deal_id)
            if os.path.isdir(upload_dir):
                shutil.rmtree(upload_dir, ignore_errors=True)
            db.delete(deal)  # documents cascade via FK
            purged += 1
        db.commit()

        # Documents soft-deleted individually, on deals that still live.
        expired_docs = (
            db.query(DocumentRow)
            .join(DealRow, DocumentRow.deal_id == DealRow.deal_id)
            .filter(
                DocumentRow.deleted_at.isnot(None),
                DocumentRow.deleted_at < cutoff,
                DealRow.legal_hold.is_(False),
            )
            .all()
        )
        for doc in expired_docs:
            try:
                await delete_doc_vectors(doc.deal_id, doc.doc_id)
            except Exception:
                logger.exception(f"Vector cleanup failed for purged doc {doc.doc_id}")
            still_referenced = db.query(DocumentRow).filter(
                DocumentRow.deal_id == doc.deal_id,
                DocumentRow.filename == doc.filename,
                DocumentRow.doc_id != doc.doc_id,
                DocumentRow.deleted_at.is_(None),
            ).first() is not None
            if not still_referenced:
                file_path = os.path.join(settings.uploads_dir, doc.deal_id, doc.filename)
                if os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                    except OSError:
                        logger.exception(f"File cleanup failed for purged doc {doc.doc_id}")
            db.delete(doc)
            purged += 1
        db.commit()
    finally:
        db.close()

    if purged:
        logger.info(f"Retention purge removed {purged} expired row(s)")
    return purged
