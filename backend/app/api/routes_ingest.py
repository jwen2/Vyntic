"""Document ingestion routes — supports single and multi-file upload."""
import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from app.config import settings
from app.models.document import DocumentMetadata
from app.services.parser import parse_document
from app.services.chunker import chunk_sections
from app.services.vector_store import upsert_chunks, delete_doc_vectors
from app.services import deal_store
from app.database import UserRow
from app.auth import get_current_user, require_deal_access

router = APIRouter(prefix="/deals/{deal_id}/documents", tags=["ingestion"])


async def _ingest_one(deal_id: str, file: UploadFile) -> DocumentMetadata:
    """Shared logic: parse, chunk, embed, store one file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    file_bytes = await file.read()

    # Persist original file for document viewer
    deal_dir = os.path.join(settings.uploads_dir, deal_id)
    os.makedirs(deal_dir, exist_ok=True)
    dest_path = os.path.join(deal_dir, file.filename)
    with open(dest_path, "wb") as f:
        f.write(file_bytes)

    try:
        doc_metadata, sections = await parse_document(file_bytes, file.filename, deal_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parsing failed: {str(e)}")

    chunks = chunk_sections(sections, deal_id, doc_metadata.doc_id)
    doc_metadata.chunk_count = len(chunks)

    try:
        await upsert_chunks(deal_id, chunks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vector storage failed: {str(e)}")

    deal_store.increment_doc_count(deal_id)
    deal_store.add_document(deal_id, doc_metadata)

    return doc_metadata


@router.post("", response_model=DocumentMetadata)
async def ingest_document(deal_id: str, file: UploadFile = File(...), current_user: UserRow = Depends(get_current_user)):
    """Upload and ingest a single document into a deal's namespace."""
    require_deal_access(current_user, deal_id)
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    return await _ingest_one(deal_id, file)


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
        if os.path.exists(file_path):
            os.remove(file_path)

    return {"deleted": True, "doc_id": doc_id, "chunks_removed": chunks_deleted}


@router.post("/batch", response_model=list[DocumentMetadata])
async def ingest_batch(deal_id: str, files: list[UploadFile] = File(...), current_user: UserRow = Depends(get_current_user)):
    """Upload and ingest multiple documents at once into a deal's namespace."""
    require_deal_access(current_user, deal_id)
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")

    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required")

    results = []
    errors = []
    for f in files:
        try:
            meta = await _ingest_one(deal_id, f)
            results.append(meta)
        except HTTPException as e:
            errors.append(f"{f.filename}: {e.detail}")
        except Exception as e:
            errors.append(f"{f.filename}: {str(e)}")

    if errors and not results:
        raise HTTPException(status_code=400, detail="; ".join(errors))

    return results
