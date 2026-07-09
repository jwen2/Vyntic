"""Document ingestion routes — supports single and multi-file upload."""
import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Query
from pydantic import BaseModel

from app.config import settings
from app.models.deal import DOC_CATEGORIES, DOC_SCOPES
from app.models.document import DocumentMetadata
from app.services.parser import parse_document_path
from app.services.chunker import chunk_sections
from app.services.vector_store import upsert_chunks
from app.services import audit_store
from app.services import deal_store
from app.services import ingest_store
from app.services import ingest_worker
from app.database import UserRow
from app.auth import get_current_user, require_admin, require_deal_access

router = APIRouter(prefix="/deals/{deal_id}/documents", tags=["ingestion"])


def _set_progress(
    upload_id: str | None,
    *,
    deal_id: str,
    status: str,
    stage: str,
    percent: float,
    filename: str | None = None,
    detail: str = "",
    file_path: str | None = None,
    doc_id: str | None = None,
    child_total: int | None = None,
) -> None:
    ingest_store.set_progress(
        upload_id,
        deal_id=deal_id,
        status=status,
        stage=stage,
        percent=percent,
        filename=filename,
        detail=detail,
        file_path=file_path,
        doc_id=doc_id,
        child_total=child_total,
    )


def _progress_mapper(
    upload_id: str | None,
    *,
    deal_id: str,
    status: str,
    stage: str,
    start_percent: float,
    end_percent: float,
    filename: str,
):
    def _update(fraction: float, detail: str) -> None:
        percent = start_percent + (end_percent - start_percent) * fraction
        _set_progress(
            upload_id,
            deal_id=deal_id,
            status=status,
            stage=stage,
            percent=percent,
            filename=filename,
            detail=detail,
        )

    return _update


async def _save_upload_to_disk(deal_id: str, file: UploadFile) -> Path:
    """Stream the upload to disk, enforcing the max size as it arrives."""
    max_bytes = settings.max_upload_mb * 1024 * 1024
    deal_dir = os.path.join(settings.uploads_dir, deal_id)
    os.makedirs(deal_dir, exist_ok=True)
    dest_path = Path(deal_dir) / file.filename
    written = 0
    with dest_path.open("wb") as f:
        while chunk := await file.read(1024 * 1024):
            written += len(chunk)
            if written > max_bytes:
                f.close()
                dest_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=(
                        f"'{file.filename}' exceeds the {settings.max_upload_mb}MB "
                        "upload limit"
                    ),
                )
            f.write(chunk)
    return dest_path


def _check_inflight_cap(deal_id: str, adding: int) -> None:
    cap = settings.ingest_max_inflight_per_deal
    inflight = ingest_store.count_inflight(deal_id)
    if inflight + adding > cap:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Too many documents in flight for this deal "
                f"({inflight} active, cap {cap}). Retry once current "
                "ingestion finishes."
            ),
        )


def _count_pdf_pages(file_path: Path) -> int | None:
    if file_path.suffix.lower() != ".pdf":
        return None
    try:
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(str(file_path))
        try:
            return len(pdf)
        finally:
            close = getattr(pdf, "close", None)
            if close:
                close()
    except Exception:
        return None


def _should_ingest_in_background(file_path: Path) -> bool:
    page_count = _count_pdf_pages(file_path)
    return bool(page_count and page_count >= settings.ingest_background_min_pages)


def _validate_classification(doc_category: str, scope: str) -> None:
    if doc_category not in DOC_CATEGORIES:
        raise HTTPException(
            status_code=422,
            detail=f"doc_category must be one of {DOC_CATEGORIES}",
        )
    if scope not in DOC_SCOPES:
        raise HTTPException(status_code=422, detail=f"scope must be one of {DOC_SCOPES}")


async def _ingest_saved_path(
    deal_id: str,
    file_path: Path,
    filename: str,
    upload_id: str | None = None,
    start_percent: float = 0,
    end_percent: float = 100,
    doc_category: str = "other",
    period: str | None = None,
    scope: str = "entity",
) -> DocumentMetadata:
    span = end_percent - start_percent
    try:
        _set_progress(
            upload_id,
            deal_id=deal_id,
            status="parsing",
            stage="Parsing document",
            percent=start_percent + span * 0.15,
            filename=filename,
            file_path=str(file_path),
        )
        doc_metadata, sections = await parse_document_path(
            file_path,
            filename,
            deal_id,
            progress_callback=_progress_mapper(
                upload_id,
                deal_id=deal_id,
                status="parsing",
                stage="Parsing document",
                start_percent=start_percent + span * 0.15,
                end_percent=start_percent + span * 0.72,
                filename=filename,
            ),
        )
    except ValueError as e:
        _set_progress(
            upload_id,
            deal_id=deal_id,
            status="error",
            stage="Parsing failed",
            percent=start_percent + span * 0.15,
            filename=filename,
            detail=str(e),
        )
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _set_progress(
            upload_id,
            deal_id=deal_id,
            status="error",
            stage="Parsing failed",
            percent=start_percent + span * 0.15,
            filename=filename,
            detail=str(e),
        )
        raise HTTPException(status_code=500, detail=f"Parsing failed: {str(e)}")

    if not settings.full_context_mode:
        _set_progress(
            upload_id,
            deal_id=deal_id,
            status="embedding",
            stage="Chunking document",
            percent=start_percent + span * 0.76,
            filename=filename,
        )
        chunks = chunk_sections(sections, deal_id, doc_metadata.doc_id)
        doc_metadata.chunk_count = len(chunks)

        try:
            _set_progress(
                upload_id,
                deal_id=deal_id,
                status="embedding",
                stage="Embedding chunks",
                percent=start_percent + span * 0.82,
                filename=filename,
                detail=f"Preparing {len(chunks)} chunks",
            )
            await upsert_chunks(
                deal_id,
                chunks,
                progress_callback=_progress_mapper(
                    upload_id,
                    deal_id=deal_id,
                    status="embedding",
                    stage="Embedding chunks",
                    start_percent=start_percent + span * 0.82,
                    end_percent=start_percent + span * 0.98,
                    filename=filename,
                ),
            )
        except Exception as e:
            _set_progress(
                upload_id,
                deal_id=deal_id,
                status="error",
                stage="Embedding failed",
                percent=start_percent + span * 0.82,
                filename=filename,
                detail=str(e),
            )
            raise HTTPException(status_code=500, detail=f"Vector storage failed: {str(e)}")
    else:
        doc_metadata.chunk_count = 0

    doc_metadata.doc_category = doc_category
    doc_metadata.period = period
    doc_metadata.scope = scope
    deal_store.add_document(deal_id, doc_metadata)
    _set_progress(
        upload_id,
        deal_id=deal_id,
        status="embedding",
        stage="Finalizing",
        percent=end_percent,
        filename=filename,
        doc_id=doc_metadata.doc_id,
    )

    return doc_metadata


async def _ingest_one(
    deal_id: str,
    file: UploadFile,
    upload_id: str | None = None,
    start_percent: float = 0,
    end_percent: float = 100,
    doc_category: str = "other",
    period: str | None = None,
    scope: str = "entity",
) -> tuple[DocumentMetadata, bool]:
    """Shared logic: parse, chunk, embed, store one file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    span = end_percent - start_percent
    filename = file.filename
    _set_progress(
        upload_id,
        deal_id=deal_id,
        status="queued",
        stage="Saving upload",
        percent=start_percent + span * 0.12,
        filename=filename,
    )

    dest_path = await _save_upload_to_disk(deal_id, file)
    page_count = _count_pdf_pages(dest_path) or 0

    if _should_ingest_in_background(dest_path):
        job_id = ingest_worker.enqueue_file(
            deal_id,
            str(dest_path),
            filename,
            job_id=upload_id,
            percent=start_percent + span * 0.15,
            detail=(
                f"{page_count} pages detected. Parsing will continue in the background."
            ),
            doc_category=doc_category,
            period=period,
            scope=scope,
        )
        ingest_worker.ensure_started()
        return (
            DocumentMetadata(
                doc_id=job_id,
                deal_id=deal_id,
                filename=filename,
                page_count=page_count,
                chunk_count=0,
                doc_category=doc_category,
                period=period,
                scope=scope,
            ),
            True,
        )

    return (
        await _ingest_saved_path(
            deal_id,
            dest_path,
            filename=filename,
            upload_id=upload_id,
            start_percent=start_percent,
            end_percent=end_percent,
            doc_category=doc_category,
            period=period,
            scope=scope,
        ),
        False,
    )


@router.post("", response_model=DocumentMetadata)
async def ingest_document(
    deal_id: str,
    http_request: Request,
    file: UploadFile = File(...),
    upload_id: str | None = Query(None),
    doc_category: str = Query("other"),
    period: str | None = Query(None),
    scope: str = Query("entity"),
    current_user: UserRow = Depends(get_current_user),
):
    """Upload and ingest a single document into a deal's namespace."""
    require_admin(current_user)
    require_deal_access(current_user, deal_id)
    _validate_classification(doc_category, scope)
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    _check_inflight_cap(deal_id, adding=1)
    audit_store.record(
        current_user, "document.upload", resource_type="document",
        resource_id=file.filename or "", deal_id=deal_id, request=http_request,
    )
    try:
        meta, backgrounded = await _ingest_one(
            deal_id,
            file,
            upload_id=upload_id,
            doc_category=doc_category,
            period=period,
            scope=scope,
        )
        if not backgrounded:
            _set_progress(
                upload_id,
                deal_id=deal_id,
                status="complete",
                stage="Complete",
                percent=100,
                filename=file.filename,
                detail=f"Embedded {meta.chunk_count} chunks",
                doc_id=meta.doc_id,
            )
        return meta
    except Exception:
        if upload_id:
            job = ingest_store.get_job(upload_id)
            if job is None or job["status"] not in ("complete", "error"):
                _set_progress(
                    upload_id,
                    deal_id=deal_id,
                    status="error",
                    stage="Upload failed",
                    percent=0,
                )
        raise


@router.get("/progress/{upload_id}")
async def get_ingest_progress(
    deal_id: str,
    upload_id: str,
    current_user: UserRow = Depends(get_current_user),
):
    require_deal_access(current_user, deal_id)
    progress = ingest_store.get_job(upload_id)
    if not progress:
        raise HTTPException(status_code=404, detail="Progress not found")
    return progress


@router.delete("/{doc_id}")
async def delete_document(
    deal_id: str,
    doc_id: str,
    http_request: Request,
    current_user: UserRow = Depends(get_current_user),
):
    """Delete a document and its vectors from a deal."""
    require_admin(current_user)
    require_deal_access(current_user, deal_id)
    audit_store.record(
        current_user, "document.delete", resource_type="document",
        resource_id=doc_id, deal_id=deal_id, request=http_request,
    )
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")

    # Soft delete (C1): the file and vectors stay until the retention
    # purge; legal hold blocks deletion entirely.
    try:
        removed = deal_store.delete_document(deal_id, doc_id)
    except deal_store.LegalHoldError:
        raise HTTPException(
            status_code=423, detail=f"Deal '{deal_id}' is under legal hold"
        )
    if not removed:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    return {"deleted": True, "doc_id": doc_id}


class DocumentMetadataUpdate(BaseModel):
    doc_category: str | None = None
    period: str | None = None
    scope: str | None = None


@router.patch("/{doc_id}/metadata", response_model=DocumentMetadata)
async def update_document_metadata(
    deal_id: str,
    doc_id: str,
    data: DocumentMetadataUpdate,
    current_user: UserRow = Depends(get_current_user),
):
    """Reclassify a document (category / period / scope)."""
    require_admin(current_user)
    require_deal_access(current_user, deal_id)
    if data.doc_category is not None and data.doc_category not in DOC_CATEGORIES:
        raise HTTPException(
            status_code=422,
            detail=f"doc_category must be one of {DOC_CATEGORIES}",
        )
    if data.scope is not None and data.scope not in DOC_SCOPES:
        raise HTTPException(status_code=422, detail=f"scope must be one of {DOC_SCOPES}")
    updated = deal_store.update_document_metadata(
        deal_id,
        doc_id,
        doc_category=data.doc_category,
        period=data.period,
        scope=data.scope,
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")
    return updated


@router.post("/batch", response_model=list[DocumentMetadata])
async def ingest_batch(
    deal_id: str,
    http_request: Request,
    files: list[UploadFile] = File(...),
    upload_id: str | None = Query(None),
    doc_category: str = Query("other"),
    period: str | None = Query(None),
    scope: str = Query("entity"),
    current_user: UserRow = Depends(get_current_user),
):
    """Upload multiple documents: save each to disk, enqueue one ingest job
    per file, and return immediately with placeholder metadata whose doc_id
    is the job id. The bounded worker pool parses them; the upload_id row
    aggregates the children for the frontend's progress polling.

    Classification query params apply to every file in the batch."""
    require_admin(current_user)
    require_deal_access(current_user, deal_id)
    _validate_classification(doc_category, scope)
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")

    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required")

    _check_inflight_cap(deal_id, adding=len(files))
    audit_store.record(
        current_user, "document.upload", resource_type="document",
        resource_id=f"batch:{len(files)}", deal_id=deal_id, request=http_request,
        filenames=[f.filename for f in files],
    )

    saved: list[tuple[Path, str, int]] = []
    errors = []
    for f in files:
        if not f.filename:
            errors.append("(unnamed file): filename is required")
            continue
        try:
            dest_path = await _save_upload_to_disk(deal_id, f)
        except HTTPException as e:
            errors.append(f"{f.filename}: {e.detail}")
            continue
        saved.append((dest_path, f.filename, _count_pdf_pages(dest_path) or 0))

    if errors and not saved:
        _set_progress(
            upload_id,
            deal_id=deal_id,
            status="error",
            stage="Upload failed",
            percent=100,
            detail="; ".join(errors),
        )
        raise HTTPException(status_code=400, detail="; ".join(errors))

    # Write the aggregate row (with the expected child count) before the
    # children exist, so a fast worker can't observe a half-enqueued batch
    # as finished — and so this write can never clobber a terminal state.
    detail = f"{len(saved)} document(s) queued for ingestion."
    if errors:
        detail += " Failed to save: " + "; ".join(errors)
    _set_progress(
        upload_id,
        deal_id=deal_id,
        status="parsing",
        stage="Background ingestion running",
        percent=10,
        detail=detail,
        child_total=len(saved),
    )

    results = []
    for dest_path, filename, page_count in saved:
        job_id = ingest_worker.enqueue_file(
            deal_id,
            str(dest_path),
            filename,
            parent_id=upload_id,
            doc_category=doc_category,
            period=period,
            scope=scope,
        )
        results.append(
            DocumentMetadata(
                doc_id=job_id,
                deal_id=deal_id,
                filename=filename,
                page_count=page_count,
                chunk_count=0,
                doc_category=doc_category,
                period=period,
                scope=scope,
            )
        )

    ingest_worker.ensure_started()
    return results
