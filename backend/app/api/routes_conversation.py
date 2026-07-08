"""Conversation history routes."""
from fastapi import APIRouter, HTTPException, Depends, Query

from app.auth import get_current_user, require_deal_access
from app.database import UserRow
from app.models.conversation import ConversationEntry, ConversationCreate
from app.models.page import Page, page_of
from app.services import conversation_store
from app.services import deal_store

router = APIRouter(prefix="/deals/{deal_id}/conversations", tags=["conversations"])


@router.post("", response_model=ConversationEntry)
def create_conversation(
    deal_id: str,
    data: ConversationCreate,
    current_user: UserRow = Depends(get_current_user),
):
    require_deal_access(current_user, deal_id)
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    # Override deal_id from path
    data = ConversationCreate(
        deal_id=deal_id,
        question=data.question,
        answer=data.answer,
        citations=data.citations,
        workstream=data.workstream,
    )
    return conversation_store.save_entry(data)


@router.get("", response_model=Page[ConversationEntry])
def list_conversations(
    deal_id: str,
    workstream: str | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: UserRow = Depends(get_current_user),
):
    require_deal_access(current_user, deal_id)
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    items = conversation_store.list_entries(
        deal_id, workstream=workstream, limit=limit, offset=offset
    )
    total = conversation_store.count_entries(deal_id, workstream=workstream)
    return page_of(items, total, offset)


@router.delete("")
def clear_conversations(
    deal_id: str,
    current_user: UserRow = Depends(get_current_user),
):
    require_deal_access(current_user, deal_id)
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    conversation_store.delete_entries(deal_id)
    return {"status": "cleared", "deal_id": deal_id}
