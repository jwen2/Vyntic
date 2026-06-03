"""Document ingestion routes — supports single and multi-file upload."""
import asyncio
import os
import time
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query

from app.config import settings
from app.models.document import DocumentMetadata
from app.services.parser import parse_document_path
from app.services.chunker import chunk_sections
from app.services.vector_store import upsert_chunks, delete_doc_vectors
from app.services import deal_store
from app.database import UserRow
from app.auth import get_current_user, require_deal_access

router = APIRouter(prefix="/deals/{deal_id}/documents", tags=["ingestion"])

_ingest_progress: dict[str, dict] = {}
_PROGRESS_TTL_SECONDS = 600


def _cleanup_progress() -> None:
    cutoff = time.time() - _PROGRESS_TTL_SECONDS
    stale = [
        upload_id
        for upload_id, progress in _ingest_progress.items()
        if progress.get("updated_at", 0) < cutoff
    ]
    for upload_id in stale:
        _ingest_progress.pop(upload_id, None)


def _set_progress(
    upload_id: str | None,
    *,
    status: str,
    stage: str,
    percent: float,
    filename: str | None = None,
    detail: str = "",
) -> None:
    if not upload_id:
        return
    _cleanup_progress()
    _ingest_progress[upload_id] = {
        "upload_id": upload_id,
        "status": status,
        "stage": stage,
        "percent": max(0, min(100, round(percent))),
        "filename": filename,
        "detail": detail,
        "updated_at": time.time(),
    }


def _progress_mapper(
    upload_id: str | None,
    *,
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
            status=status,
            stage=stage,
            percent=percent,
            filename=filename,
            detail=detail,
        )

    return _update


async def _save_upload_to_disk(deal_id: str, file: UploadFile) -> Path:
    deal_dir = os.path.join(settings.uploads_dir, deal_id)
    os.makedirs(deal_dir, exist_ok=True)
    dest_path = Path(deal_dir) / file.filename
    with dest_path.open("wb") as f:
        while chunk := await file.read(1024 * 1024):
            f.write(chunk)
    return dest_path


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


async def _ingest_saved_path(
    deal_id: str,
    file_path: Path,
    filename: str,
    upload_id: str | None = None,
    start_percent: float = 0,
    end_percent: float = 100,
) -> DocumentMetadata:
    span = end_percent - start_percent
    try:
        _set_progress(
            upload_id,
            status="processing",
            stage="Parsing document",
            percent=start_percent + span * 0.15,
            filename=filename,
        )
        doc_metadata, sections = await parse_document_path(
            file_path,
            filename,
            deal_id,
            progress_callback=_progress_mapper(
                upload_id,
                status="processing",
                stage="Parsing document",
                start_percent=start_percent + span * 0.15,
                end_percent=start_percent + span * 0.72,
                filename=filename,
            ),
        )
    except ValueError as e:
        _set_progress(
            upload_id,
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
            status="processing",
            stage="Chunking document",
            percent=start_percent + span * 0.76,
            filename=filename,
        )
        chunks = chunk_sections(sections, deal_id, doc_metadata.doc_id)
        doc_metadata.chunk_count = len(chunks)

        try:
            _set_progress(
                upload_id,
                status="processing",
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
                    status="processing",
                    stage="Embedding chunks",
                    start_percent=start_percent + span * 0.82,
                    end_percent=start_percent + span * 0.98,
                    filename=filename,
                ),
            )
        except Exception as e:
            _set_progress(
                upload_id,
                status="error",
                stage="Embedding failed",
                percent=start_percent + span * 0.82,
                filename=filename,
                detail=str(e),
            )
            raise HTTPException(status_code=500, detail=f"Vector storage failed: {str(e)}")

    deal_store.add_document(deal_id, doc_metadata)
    _set_progress(
        upload_id,
        status="processing",
        stage="Finalizing",
        percent=end_percent,
        filename=filename,
    )

    return doc_metadata


def _schedule_background_ingest(
    deal_id: str,
    file_path: Path,
    filename: str,
    upload_id: str | None,
    start_percent: float,
    end_percent: float,
) -> None:
    async def _run() -> None:
        try:
            meta = await _ingest_saved_path(
                deal_id,
                file_path,
                filename,
                upload_id=upload_id,
                start_percent=start_percent,
                end_percent=end_percent,
            )
            _set_progress(
                upload_id,
                status="complete",
                stage="Complete",
                percent=end_percent,
                filename=filename,
                detail=f"Embedded {meta.chunk_count} chunks",
            )
        except HTTPException as e:
            _set_progress(
                upload_id,
                status="error",
                stage="Ingestion failed",
                percent=end_percent,
                filename=filename,
                detail=str(e.detail),
            )
        except Exception as e:
            _set_progress(
                upload_id,
                status="error",
                stage="Ingestion failed",
                percent=end_percent,
                filename=filename,
                detail=str(e),
            )

    asyncio.create_task(_run())


async def _ingest_one(
    deal_id: str,
    file: UploadFile,
    upload_id: str | None = None,
    start_percent: float = 0,
    end_percent: float = 100,
) -> tuple[DocumentMetadata, bool]:
    """Shared logic: parse, chunk, embed, store one file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    span = end_percent - start_percent
    filename = file.filename
    _set_progress(
        upload_id,
        status="processing",
        stage="Saving upload",
        percent=start_percent + span * 0.12,
        filename=filename,
    )

    dest_path = await _save_upload_to_disk(deal_id, file)
    page_count = _count_pdf_pages(dest_path) or 0

    if _should_ingest_in_background(dest_path):
        _set_progress(
            upload_id,
            status="processing",
            stage="Queued for parsing",
            percent=start_percent + span * 0.15,
            filename=filename,
            detail=(
                f"{page_count} pages detected. Parsing will continue in the background."
            ),
        )
        _schedule_background_ingest(
            deal_id,
            dest_path,
            filename,
            upload_id,
            start_percent,
            end_percent,
        )
        return (
            DocumentMetadata(
                doc_id=f"{deal_id}_pending",
                deal_id=deal_id,
                filename=filename,
                page_count=page_count,
                chunk_count=0,
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
        ),
        False,
    )


@router.post("", response_model=DocumentMetadata)
async def ingest_document(
    deal_id: str,
    file: UploadFile = File(...),
    upload_id: str | None = Query(None),
    current_user: UserRow = Depends(get_current_user),
):
    """Upload and ingest a single document into a deal's namespace."""
    require_deal_access(current_user, deal_id)
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    try:
        meta, backgrounded = await _ingest_one(deal_id, file, upload_id=upload_id)
        if not backgrounded:
            _set_progress(
                upload_id,
                status="complete",
                stage="Complete",
                percent=100,
                filename=file.filename,
                detail=f"Embedded {meta.chunk_count} chunks",
            )
        return meta
    except Exception:
        if upload_id and upload_id not in _ingest_progress:
            _set_progress(upload_id, status="error", stage="Upload failed", percent=0)
        raise


@router.get("/progress/{upload_id}")
async def get_ingest_progress(
    deal_id: str,
    upload_id: str,
    current_user: UserRow = Depends(get_current_user),
):
    require_deal_access(current_user, deal_id)
    progress = _ingest_progress.get(upload_id)
    if not progress:
        raise HTTPException(status_code=404, detail="Progress not found")
    return {k: v for k, v in progress.items() if k != "updated_at"}


@router.delete("/{doc_id}")
async def delete_document(deal_id: str, doc_id: str, current_user: UserRow = Depends(get_current_user)):
    """Delete a document and its vectors from a deal."""
    require_deal_access(current_user, deal_id)
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")

    # Look up filename before deleting metadata
    docs = deal_store.list_documents(deal_id)
    doc_meta = next((d for d in docs if d.doc_id == doc_id), None)

    removed = deal_store.delete_document(deal_id, doc_id)
    if not removed:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    chunks_deleted = await delete_doc_vectors(deal_id, doc_id)

    # Clean up original file from uploads
    if doc_meta:
        file_path = os.path.join(settings.uploads_dir, deal_id, doc_meta.filename)
        still_referenced = any(
            doc.filename == doc_meta.filename
            for doc in deal_store.list_documents(deal_id)
        )
        if os.path.exists(file_path) and not still_referenced:
            os.remove(file_path)

    return {"deleted": True, "doc_id": doc_id, "chunks_removed": chunks_deleted}


@router.post("/batch", response_model=list[DocumentMetadata])
async def ingest_batch(
    deal_id: str,
    files: list[UploadFile] = File(...),
    upload_id: str | None = Query(None),
    current_user: UserRow = Depends(get_current_user),
):
    """Upload and ingest multiple documents at once into a deal's namespace."""
    require_deal_access(current_user, deal_id)
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")

    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required")

    results = []
    errors = []
    backgrounded_count = 0
    total_files = len(files)
    for index, f in enumerate(files):
        file_start = (index / total_files) * 100
        file_end = ((index + 1) / total_files) * 100
        try:
            meta, backgrounded = await _ingest_one(
                deal_id,
                f,
                upload_id=upload_id,
                start_percent=file_start,
                end_percent=file_end,
            )
            results.append(meta)
            if backgrounded:
                backgrounded_count += 1
        except HTTPException as e:
            errors.append(f"{f.filename}: {e.detail}")
        except Exception as e:
            errors.append(f"{f.filename}: {str(e)}")

    if errors and not results:
        _set_progress(
            upload_id,
            status="error",
            stage="Upload failed",
            percent=100,
            detail="; ".join(errors),
        )
        raise HTTPException(status_code=400, detail="; ".join(errors))

    if backgrounded_count:
        _set_progress(
            upload_id,
            status="processing",
            stage="Background ingestion running",
            percent=95,
            detail=f"{backgrounded_count} large file(s) are still parsing.",
        )
    else:
        _set_progress(
            upload_id,
            status="complete",
            stage="Complete",
            percent=100,
            detail=f"Embedded {sum(meta.chunk_count for meta in results)} chunks",
        )
    return results
