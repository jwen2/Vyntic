"""Bounded in-process ingest worker pool (R5).

Workers claim queued IngestJobRows atomically and run the parse/embed
pipeline, at most settings.ingest_workers at a time. State lives entirely
in the DB (jobs table + claim pattern), so this pool can lift into a
separate worker process later (Plan 5) without touching the job schema.
"""
import asyncio
import logging
import uuid
from pathlib import Path

from app.config import settings
from app.services import ingest_store

logger = logging.getLogger(__name__)

_IDLE_POLL_SECONDS = 1.0

_worker_tasks: list[asyncio.Task] = []


def enqueue_file(
    deal_id: str,
    file_path: str,
    filename: str,
    job_id: str | None = None,
    parent_id: str | None = None,
    percent: float = 0,
    detail: str = "",
    doc_category: str = "other",
    period: str | None = None,
    scope: str = "entity",
) -> str:
    """Create a queued job for a file already saved to disk.

    This single write is what makes the job claimable — never write
    status="queued" to it again afterwards, or a second worker could
    claim a job that is already being processed.
    """
    job_id = job_id or uuid.uuid4().hex
    ingest_store.set_progress(
        job_id,
        deal_id=deal_id,
        status="queued",
        stage="Queued for parsing",
        percent=percent,
        filename=filename,
        detail=detail,
        file_path=file_path,
        parent_id=parent_id,
        doc_category=doc_category,
        period=period,
        scope=scope,
    )
    return job_id


async def _run_pipeline(job: dict):
    """Parse/chunk/embed one file, writing progress to the job's row."""
    # Deferred import: routes_ingest imports this module for enqueueing.
    from app.api.routes_ingest import _ingest_saved_path

    return await _ingest_saved_path(
        job["deal_id"],
        Path(job["file_path"]),
        job["filename"],
        upload_id=job["id"],
        doc_category=job["doc_category"],
        period=job["period"],
        scope=job["scope"],
    )


async def _process_claimed_job(job: dict) -> None:
    try:
        meta = await _run_pipeline(job)
        chunk_count = getattr(meta, "chunk_count", 0)
        ingest_store.set_progress(
            job["id"],
            deal_id=job["deal_id"],
            status="complete",
            stage="Complete",
            percent=100,
            filename=job["filename"],
            detail=f"Embedded {chunk_count} chunks",
        )
    except Exception as e:
        detail = str(getattr(e, "detail", None) or e)
        logger.exception("Ingest job %s failed: %s", job["id"], detail)
        ingest_store.set_progress(
            job["id"],
            deal_id=job["deal_id"],
            status="error",
            stage="Ingestion failed",
            percent=100,
            filename=job["filename"],
            detail=detail,
        )
    if job.get("parent_id"):
        _update_parent(job["parent_id"], job["deal_id"])


def _update_parent(parent_id: str, deal_id: str) -> None:
    """Roll children's states up into the aggregate row the client polls."""
    children = ingest_store.get_children(parent_id)
    if not children:
        return
    # child_total is written before the children are enqueued; falling back
    # to len(children) would let a fast worker finish child 1 before child 2
    # exists and mark the whole batch complete.
    total = ingest_store.get_child_total(parent_id) or len(children)
    terminal = [c for c in children if c["status"] in ("complete", "error")]
    failed = [c for c in children if c["status"] == "error"]
    if len(terminal) == total:
        if failed:
            names = ", ".join(c["filename"] or c["id"] for c in failed)
            ingest_store.set_progress(
                parent_id,
                deal_id=deal_id,
                status="error",
                stage="Ingestion finished with errors",
                percent=100,
                detail=f"{len(failed)} of {total} document(s) failed: {names}",
            )
        else:
            ingest_store.set_progress(
                parent_id,
                deal_id=deal_id,
                status="complete",
                stage="Complete",
                percent=100,
                detail=f"{total} document(s) ingested",
            )
    else:
        ingest_store.set_progress(
            parent_id,
            deal_id=deal_id,
            status="parsing",
            stage="Background ingestion running",
            percent=10 + 85 * len(terminal) / total,
            detail=f"{len(terminal)} of {total} document(s) ingested",
        )


async def _worker_loop(stop_when_idle: bool = False) -> None:
    while True:
        job = ingest_store.claim_next_job()
        if job is None:
            if stop_when_idle:
                return
            await asyncio.sleep(_IDLE_POLL_SECONDS)
            continue
        await _process_claimed_job(job)


async def drain_queue() -> None:
    """Process everything queued with a bounded pool, then return (tests)."""
    count = max(1, settings.ingest_workers)
    await asyncio.gather(*(_worker_loop(stop_when_idle=True) for _ in range(count)))


def ensure_started() -> None:
    """Start the resident worker pool on the running event loop (idempotent)."""
    global _worker_tasks
    _worker_tasks = [t for t in _worker_tasks if not t.done()]
    missing = max(1, settings.ingest_workers) - len(_worker_tasks)
    for _ in range(missing):
        _worker_tasks.append(asyncio.create_task(_worker_loop()))
    if missing > 0:
        logger.info("Started %d ingest worker(s)", missing)
