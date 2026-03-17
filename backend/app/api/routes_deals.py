"""Deal CRUD routes."""
from fastapi import APIRouter, HTTPException

from app.models.deal import Deal, DealCreate, DealUpdate, DEAL_STAGES, SECTOR_TAGS
from app.models.document import DocumentMetadata
from app.services import deal_store

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
