"""Cost accounting reads.

Read-only, so require_deal_access (not require_admin) per the RBAC
convention in routes_deals.py.
"""
from fastapi import APIRouter, Depends

from app.auth import get_current_user, require_deal_access
from app.database import UserRow
from app.models.metrics import CostSummary
from app.services import llm_metrics

router = APIRouter(tags=["metrics"])


@router.get("/deals/{deal_id}/cost", response_model=CostSummary)
def get_deal_cost(
    deal_id: str,
    run_id: str | None = None,
    current_user: UserRow = Depends(get_current_user),
) -> CostSummary:
    """Token spend for a deal, optionally narrowed to a single run."""
    require_deal_access(current_user, deal_id)
    return llm_metrics.summarize(deal_id, run_id=run_id)
