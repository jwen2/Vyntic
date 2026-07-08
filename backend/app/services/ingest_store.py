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
    parent_id: str | None = None,
    child_total: int | None = None,
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
        if parent_id is not None:
            row.parent_id = parent_id
        if child_total is not None:
            row.child_total = child_total
        db.commit()
    finally:
        db.close()


def get_child_total(job_id: str) -> int | None:
    db = SessionLocal()
    try:
        row = db.get(IngestJobRow, job_id)
        return row.child_total if row else None
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


def claim_next_job() -> dict | None:
    """Atomically claim the oldest queued job (queued → parsing).

    Only rows with a saved file are claimable — a queued row without a
    file_path is either a transient inline-upload state or a batch
    aggregate, never worker input. Returns the claimed job's fields, or
    None when the queue is empty.
    """
    while True:
        db = SessionLocal()
        try:
            row = (
                db.query(IngestJobRow)
                .filter(
                    IngestJobRow.status == "queued",
                    IngestJobRow.file_path.isnot(None),
                )
                .order_by(IngestJobRow.created_at)
                .first()
            )
            if row is None:
                return None
            job = {
                "id": row.id,
                "deal_id": row.deal_id,
                "filename": row.filename,
                "file_path": row.file_path,
                "parent_id": row.parent_id,
            }
            claimed = (
                db.query(IngestJobRow)
                .filter(IngestJobRow.id == row.id, IngestJobRow.status == "queued")
                .update({"status": "parsing", "stage": "Claimed by worker"})
            )
            db.commit()
            if claimed:
                return job
            # Another worker claimed it between SELECT and UPDATE; retry.
        finally:
            db.close()


def get_children(parent_id: str) -> list[dict]:
    db = SessionLocal()
    try:
        rows = (
            db.query(IngestJobRow)
            .filter(IngestJobRow.parent_id == parent_id)
            .all()
        )
        return [
            {"id": r.id, "filename": r.filename, "status": r.status}
            for r in rows
        ]
    finally:
        db.close()


def count_inflight(deal_id: str) -> int:
    db = SessionLocal()
    try:
        return (
            db.query(IngestJobRow)
            .filter(
                IngestJobRow.deal_id == deal_id,
                IngestJobRow.status.in_(_IN_FLIGHT_STATUSES),
                IngestJobRow.parent_id.isnot(None) | IngestJobRow.file_path.isnot(None),
            )
            .count()
        )
    finally:
        db.close()


def reconcile_interrupted_ingests() -> int:
    """Mark jobs stranded by a restart as errored. Returns count reconciled.

    Anything mid-parse/mid-embed died with the process and is errored.
    A queued job whose file is already saved is fully resumable — the
    worker pool picks it up — so it is left alone. A queued row without a
    file_path was interrupted mid-upload and is errored.
    """
    db = SessionLocal()
    try:
        count = (
            db.query(IngestJobRow)
            .filter(
                IngestJobRow.status.in_(("parsing", "embedding"))
                | (
                    (IngestJobRow.status == "queued")
                    & (IngestJobRow.file_path.is_(None))
                    & (IngestJobRow.parent_id.is_(None))
                )
            )
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
