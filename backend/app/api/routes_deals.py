"""Deal CRUD routes."""
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.models.deal import Deal, DealCreate, DealUpdate, DEAL_STAGES, SECTOR_TAGS
from app.models.document import DocumentMetadata
from app.services import deal_store

UPLOADS_DIR = "/app/data/uploads"

router = APIRouter(prefix="/deals", tags=["deals"])


@router.post("", response_model=Deal)
def create_deal(data: DealCreate):
    try:
        return deal_store.create_deal(data)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("", response_model=list[Deal])
def list_deals():
    return deal_store.list_deals()


@router.get("/metadata/stages")
def get_stages():
    """Return valid pipeline stages."""
    return DEAL_STAGES


@router.get("/metadata/tags")
def get_tags():
    """Return suggested sector tags."""
    return SECTOR_TAGS


@router.get("/{deal_id}", response_model=Deal)
def get_deal(deal_id: str):
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    return deal


@router.patch("/{deal_id}", response_model=Deal)
def update_deal(deal_id: str, data: DealUpdate):
    deal = deal_store.update_deal(deal_id, data)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    return deal


@router.get("/{deal_id}/documents", response_model=list[DocumentMetadata])
def list_deal_documents(deal_id: str):
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    return deal_store.list_documents(deal_id)


@router.delete("/{deal_id}")
async def delete_deal(deal_id: str):
    from app.services.vector_store import delete_deal_vectors

    if not deal_store.delete_deal(deal_id):
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")

    try:
        await delete_deal_vectors(deal_id)
    except Exception:
        pass  # Best-effort cleanup of vectors

    return {"status": "deleted", "deal_id": deal_id}


@router.get("/{deal_id}/documents/{filename}/view")
async def view_document(deal_id: str, filename: str):
    """Serve an original uploaded document file for inline viewing."""
    file_path = os.path.join(UPLOADS_DIR, deal_id, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Document file not found")

    lower = filename.lower()
    if lower.endswith(".pdf"):
        media_type = "application/pdf"
    elif lower.endswith(".xlsx"):
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif lower.endswith(".xls"):
        media_type = "application/vnd.ms-excel"
    elif lower.endswith(".docx"):
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif lower.endswith(".txt"):
        media_type = "text/plain"
    elif lower.endswith(".csv"):
        media_type = "text/csv"
    else:
        media_type = "application/octet-stream"

    return FileResponse(file_path, media_type=media_type, filename=filename)
