"""Single-deal query routes."""
from fastapi import APIRouter, HTTPException

from app.models.query import QueryRequest, QueryResponse
from app.services import deal_store
from app.agents.single_deal_qa import answer_deal_question

router = APIRouter(prefix="/deals/{deal_id}/query", tags=["query"])


@router.post("", response_model=QueryResponse)
async def query_deal(deal_id: str, request: QueryRequest):
    """Ask a question about a specific deal's documents."""
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")

    try:
        return await answer_deal_question(deal_id, request.question)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")
