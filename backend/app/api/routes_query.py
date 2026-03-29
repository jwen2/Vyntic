"""Single-deal query routes."""
from fastapi import APIRouter, Depends, HTTPException

from app.models.query import QueryRequest, QueryResponse
from app.services import deal_store
from app.agents.single_deal_qa import answer_deal_question
from app.database import UserRow
from app.auth import get_current_user, require_deal_access

router = APIRouter(prefix="/deals/{deal_id}/query", tags=["query"])


@router.post("", response_model=QueryResponse)
async def query_deal(deal_id: str, request: QueryRequest, current_user: UserRow = Depends(get_current_user)):
    """Ask a question about a specific deal's documents."""
    require_deal_access(current_user, deal_id)
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")

    try:
        return await answer_deal_question(deal_id, request.question)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")
