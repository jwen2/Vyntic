"""LP monitoring routes — capital-call/distribution queue and side-letter
compliance tracking, plus portfolio-wide roll-ups.

Access model: fund-scoped reads require deal access; mutations require admin
(matches positions/documents). Portfolio endpoints authenticate then filter to
the caller's visible funds (admins see all) — never leak a fund the caller
cannot access."""
from fastapi import APIRouter, Depends, HTTPException, Request

from app.auth import get_current_user, require_admin, require_deal_access, verify_deal_access
from app.database import UserRow
from app.models.monitoring import (
    CallNotice,
    CallNoticeCreate,
    CallNoticeDraft,
    CallNoticeUpdate,
    CheckConfirm,
    Obligation,
    ObligationDraft,
    ObligationsCreate,
    PortfolioCallNotice,
    PortfolioObligation,
    SideLetterCheck,
    VerifyRequest,
)
from app.models.manager import Position
from app.services import (
    audit_store,
    call_notice_store,
    deal_store,
    manager_store,
    monitoring_extractor,
    side_letter_store,
)

router = APIRouter(tags=["monitoring"])
portfolio_router = APIRouter(prefix="/portfolio", tags=["monitoring"])


def _fund_or_404(deal_id: str):
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")
    return deal


# ── Capital-call / distribution notices (per fund) ──

@router.post("/deals/{deal_id}/call-notices/extract", response_model=CallNoticeDraft)
async def extract_call_notice(
    deal_id: str,
    body: dict,
    current_user: UserRow = Depends(get_current_user),
):
    require_deal_access(current_user, deal_id)
    _fund_or_404(deal_id)
    doc_id = (body or {}).get("doc_id")
    if not doc_id:
        raise HTTPException(status_code=422, detail="doc_id is required")
    return await monitoring_extractor.extract_call_notice(deal_id, doc_id)


@router.post("/deals/{deal_id}/call-notices", response_model=CallNotice)
def create_call_notice(
    deal_id: str,
    data: CallNoticeCreate,
    http_request: Request,
    current_user: UserRow = Depends(get_current_user),
):
    require_admin(current_user)
    _fund_or_404(deal_id)
    notice = call_notice_store.create(deal_id, data)
    audit_store.record(
        current_user, "callnotice.confirm", resource_type="call_notice",
        resource_id=notice.id, deal_id=deal_id, request=http_request, kind=notice.kind,
    )
    return notice


@router.get("/deals/{deal_id}/call-notices", response_model=list[CallNotice])
def list_call_notices(deal_id: str, current_user: UserRow = Depends(get_current_user)):
    require_deal_access(current_user, deal_id)
    _fund_or_404(deal_id)
    return call_notice_store.list_for_deal(deal_id)


@router.patch("/deals/{deal_id}/call-notices/{notice_id}", response_model=CallNotice)
def update_call_notice(
    deal_id: str,
    notice_id: str,
    data: CallNoticeUpdate,
    http_request: Request,
    current_user: UserRow = Depends(get_current_user),
):
    require_admin(current_user)
    _fund_or_404(deal_id)
    notice = call_notice_store.update(deal_id, notice_id, data)
    if not notice:
        raise HTTPException(status_code=404, detail="Notice not found")
    audit_store.record(
        current_user, "callnotice.update", resource_type="call_notice",
        resource_id=notice_id, deal_id=deal_id, request=http_request,
    )
    return notice


# ── Side letters (per fund) ──

@router.post("/deals/{deal_id}/side-letters/extract", response_model=list[ObligationDraft])
async def extract_side_letter(
    deal_id: str,
    body: dict,
    current_user: UserRow = Depends(get_current_user),
):
    require_deal_access(current_user, deal_id)
    _fund_or_404(deal_id)
    doc_id = (body or {}).get("doc_id")
    if not doc_id:
        raise HTTPException(status_code=422, detail="doc_id is required")
    return await monitoring_extractor.extract_obligations(deal_id, doc_id)


@router.post("/deals/{deal_id}/side-letters/obligations", response_model=list[Obligation])
def create_obligations(
    deal_id: str,
    data: ObligationsCreate,
    http_request: Request,
    current_user: UserRow = Depends(get_current_user),
):
    require_admin(current_user)
    _fund_or_404(deal_id)
    obligations = side_letter_store.create_obligations(deal_id, data.doc_id, data.obligations)
    audit_store.record(
        current_user, "sideletter.obligations.create", resource_type="side_letter",
        resource_id=deal_id, deal_id=deal_id, request=http_request, count=len(obligations),
    )
    return obligations


@router.get("/deals/{deal_id}/side-letters/obligations", response_model=list[Obligation])
def list_obligations(deal_id: str, current_user: UserRow = Depends(get_current_user)):
    require_deal_access(current_user, deal_id)
    _fund_or_404(deal_id)
    return side_letter_store.list_for_deal(deal_id)


@router.post("/deals/{deal_id}/side-letters/verify", response_model=list[SideLetterCheck])
async def verify_side_letters(
    deal_id: str,
    data: VerifyRequest,
    http_request: Request,
    current_user: UserRow = Depends(get_current_user),
):
    require_admin(current_user)
    _fund_or_404(deal_id)
    obligations = side_letter_store.list_active_obligations_raw(deal_id)
    proposals: list[SideLetterCheck] = []
    for ob in obligations:
        outcome = await monitoring_extractor.verify_obligation(
            deal_id, data.period, ob["text"], ob["verify_hint"]
        )
        check = side_letter_store.upsert_check(
            obligation_id=ob["id"],
            period=data.period,
            verdict=outcome["verdict"],
            rationale=outcome["rationale"],
            citations=outcome["citations"],
            llm_verdict=outcome["verdict"],
            confirmed_by=None,  # proposal — analyst confirms separately
        )
        proposals.append(check)
    audit_store.record(
        current_user, "sideletter.verify", resource_type="side_letter",
        resource_id=deal_id, deal_id=deal_id, request=http_request, period=data.period,
    )
    return proposals


@router.patch("/deals/{deal_id}/side-letters/checks/{check_id}", response_model=SideLetterCheck)
def confirm_check(
    deal_id: str,
    check_id: str,
    data: CheckConfirm,
    http_request: Request,
    current_user: UserRow = Depends(get_current_user),
):
    require_admin(current_user)
    _fund_or_404(deal_id)
    # Guard: the check must belong to this fund.
    if side_letter_store.get_check_deal(check_id) != deal_id:
        raise HTTPException(status_code=404, detail="Check not found")
    check = side_letter_store.confirm_check(check_id, data.verdict, data.rationale, current_user.id)
    if not check:
        raise HTTPException(status_code=404, detail="Check not found")
    audit_store.record(
        current_user, "sideletter.check.confirm", resource_type="side_letter_check",
        resource_id=check_id, deal_id=deal_id, request=http_request, verdict=check.verdict,
    )
    return check


# ── Portfolio-wide (filtered to the caller's visible funds) ──

def _visible(user: UserRow, deal_id: str) -> bool:
    if user.is_admin:
        return True
    try:
        verify_deal_access(user, deal_id)
        return True
    except HTTPException:
        return False


@portfolio_router.get("/call-notices", response_model=list[PortfolioCallNotice])
def portfolio_call_notices(current_user: UserRow = Depends(get_current_user)):
    deals = {d.deal_id: d for d in deal_store.list_deals()}
    out: list[PortfolioCallNotice] = []
    for notice, deal_id in call_notice_store.list_all_pending():
        if not _visible(current_user, deal_id):
            continue
        deal = deals.get(deal_id)
        out.append(PortfolioCallNotice(
            **notice.model_dump(),
            fund_name=deal.name if deal else deal_id,
            manager_id=deal.manager_id if deal else None,
            manager_name=deal.manager_name if deal else None,
        ))
    return out


@portfolio_router.get("/positions", response_model=list[dict])
def portfolio_positions(current_user: UserRow = Depends(get_current_user)):
    out: list[dict] = []
    for deal in deal_store.list_deals():
        if deal.entity_type != "fund" or not _visible(current_user, deal.deal_id):
            continue
        position = manager_store.get_position(deal.deal_id) or Position(deal_id=deal.deal_id)
        commitment = position.commitment_amount
        called = position.called_amount
        unfunded = (commitment - called) if (commitment is not None and called is not None) else None
        out.append({
            "deal_id": deal.deal_id,
            "fund_name": deal.name,
            "manager_id": deal.manager_id,
            "manager_name": deal.manager_name,
            "commitment_amount": commitment,
            "called_amount": called,
            "distributed_amount": position.distributed_amount,
            "nav": position.nav,
            "unfunded": unfunded,
            "currency": position.currency,
            "as_of": position.as_of,
        })
    return out


@portfolio_router.get("/compliance", response_model=list[PortfolioObligation])
def portfolio_compliance(current_user: UserRow = Depends(get_current_user)):
    deals = {d.deal_id: d for d in deal_store.list_deals()}
    out: list[PortfolioObligation] = []
    for obligation, deal_id in side_letter_store.list_flagged():
        if not _visible(current_user, deal_id):
            continue
        deal = deals.get(deal_id)
        out.append(PortfolioObligation(
            **obligation.model_dump(),
            fund_name=deal.name if deal else deal_id,
            manager_id=deal.manager_id if deal else None,
            manager_name=deal.manager_name if deal else None,
        ))
    return out
