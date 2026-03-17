"""Document ingestion routes."""
from fastapi import APIRouter, HTTPException, UploadFile, File

from app.models.document import DocumentMetadata
from app.services.parser import parse_document
from app.services.chunker import chunk_sections
from app.services.vector_store import upsert_chunks
from app.services import deal_store

router = APIRouter(prefix="/deals/{deal_id}/documents", tags=["ingestion"])


@router.post("", response_model=DocumentMetadata)
async def ingest_document(deal_id: str, file: UploadFile = File(...)):
    """Upload and ingest a document into a deal's namespace."""
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")

    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    # Read file
    file_bytes = await file.read()

    # Parse
    try:
        doc_metadata, sections = await parse_document(file_bytes, file.filename, deal_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parsing failed: {str(e)}")

    # Chunk
    chunks = chunk_sections(sections, deal_id, doc_metadata.doc_id)
    doc_metadata.chunk_count = len(chunks)

    # Embed and upsert
    try:
        await upsert_chunks(deal_id, chunks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vector storage failed: {str(e)}")

    # Update deal doc count and store document metadata
    deal_store.increment_doc_count(deal_id)
    deal_store.add_document(deal_id, doc_metadata)

    return doc_metadata
