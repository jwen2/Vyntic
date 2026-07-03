"""DB-backed ingest job store (R4).

Replaces the in-process _ingest_progress dict so ingest state survives
restarts, is visible to any worker, and can be reconciled at startup.
Job ids are the client-supplied upload_id; a batch upload shares one job
row, matching the old dict's semantics.
"""
import logging

from app.database import SessionLocal, IngestJobRow

logger = logging.getLogger(__name__)

_IN_FLIGHT_STATUSES = ("queued", "parsing", "embedding")


def set_progress(
    job_id: str | None,
    *,
    deal_id: str,
    status: str,
    stage: str,
    percent: float,
    filename: str | None = None,
    detail: str = "",
    file_path: str | None = None,
    doc_id: str | None = None,
) -> None:
    """Upsert a job row. No-op when job_id is None (progress not requested)."""
    if not job_id:
        return
    db = SessionLocal()
    try:
        row = db.get(IngestJobRow, job_id)
        if row is None:
            row = IngestJobRow(id=job_id, deal_id=deal_id)
            db.add(row)
        row.status = status
        row.stage = stage
        row.percent = max(0, min(100, round(percent)))
        row.detail = detail
        if filename is not None:
            row.filename = filename
        if file_path is not None:
            row.file_path = file_path
        if doc_id is not None:
            row.doc_id = doc_id
        db.commit()
    finally:
        db.close()


def get_job(job_id: str) -> dict | None:
    """Return the job in the shape the old progress endpoint served."""
    db = SessionLocal()
    try:
        row = db.get(IngestJobRow, job_id)
        if row is None:
            return None
        return {
            "upload_id": row.id,
            "status": row.status,
            "stage": row.stage,
            "percent": row.percent,
            "filename": row.filename,
            "detail": row.detail,
        }
    finally:
        db.close()


def reconcile_interrupted_ingests() -> int:
    """Mark jobs stranded by a restart as errored. Returns count reconciled.

    Ingestion runs in-process; anything still queued/parsing/embedding at
    startup was interrupted and will never progress. Mirrors
    workflow_run_store.reconcile_interrupted_runs.
    """
    db = SessionLocal()
    try:
        count = (
            db.query(IngestJobRow)
            .filter(IngestJobRow.status.in_(_IN_FLIGHT_STATUSES))
            .update(
                {
                    "status": "error",
                    "stage": "Ingestion interrupted",
                    "detail": "Interrupted by server restart. Re-upload the document.",
                },
                synchronize_session=False,
            )
        )
        db.commit()
        return count
    finally:
        db.close()
