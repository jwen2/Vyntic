"""Pydantic schemas for the LP monitoring wedge: capital-call / distribution
notices and side-letter obligation tracking."""
from pydantic import BaseModel

from app.models.query import Citation


CALL_KINDS = ["call", "distribution"]
CALL_STATUSES = ["pending", "confirmed", "paid", "dismissed"]
OBLIGATION_CATEGORIES = [
    "fee", "mfn", "coinvest", "reporting", "transfer", "excuse", "regulatory", "other",
]
VERDICTS = ["compliant", "breach", "unclear"]


# ── Capital-call / distribution notices ──

class CallNoticeDraft(BaseModel):
    """Extracted-but-not-persisted notice. Returned by /extract; the analyst
    edits and posts it back to persist."""
    kind: str = "call"
    amount: float | None = None
    currency: str = "USD"
    due_date: str | None = None
    period: str | None = None
    purpose: str = ""
    outstanding_before: float | None = None
    doc_id: str | None = None
    citations: list[Citation | None] = []


class CallNotice(BaseModel):
    id: str
    deal_id: str
    doc_id: str | None = None
    kind: str
    amount: float | None = None
    currency: str = "USD"
    due_date: str | None = None
    period: str | None = None
    purpose: str = ""
    status: str = "pending"
    outstanding_before: float | None = None
    citations: list[Citation | None] = []


class CallNoticeCreate(BaseModel):
    doc_id: str | None = None
    kind: str = "call"
    amount: float | None = None
    currency: str = "USD"
    due_date: str | None = None
    period: str | None = None
    purpose: str = ""
    outstanding_before: float | None = None
    citations: list[Citation | None] = []


class CallNoticeUpdate(BaseModel):
    """Partial update — status transitions and figure corrections."""
    kind: str | None = None
    amount: float | None = None
    currency: str | None = None
    due_date: str | None = None
    period: str | None = None
    purpose: str | None = None
    status: str | None = None


class PortfolioCallNotice(CallNotice):
    """A notice annotated with fund + manager labels for the portfolio board."""
    fund_name: str = ""
    manager_id: str | None = None
    manager_name: str | None = None


# ── Side-letter obligations + checks ──

class ObligationDraft(BaseModel):
    category: str = "other"
    text: str = ""
    section_ref: str = ""
    cadence: str = "ongoing"
    verify_hint: str = ""
    citations: list[Citation | None] = []


class SideLetterCheck(BaseModel):
    id: str
    obligation_id: str
    period: str
    verdict: str
    llm_verdict: str | None = None
    rationale: str = ""
    citations: list[Citation | None] = []
    confirmed: bool = False


class Obligation(BaseModel):
    id: str
    deal_id: str
    doc_id: str | None = None
    category: str
    text: str
    section_ref: str = ""
    cadence: str = "ongoing"
    verify_hint: str = ""
    citations: list[Citation | None] = []
    status: str = "active"
    latest_check: SideLetterCheck | None = None


class ObligationsCreate(BaseModel):
    """Persist a reviewed set of obligation drafts (analyst may have pruned)."""
    doc_id: str | None = None
    obligations: list[ObligationDraft] = []


class VerifyRequest(BaseModel):
    period: str


class CheckConfirm(BaseModel):
    """Confirm or override a proposed check."""
    verdict: str | None = None  # None = accept the proposed verdict as-is
    rationale: str | None = None


class PortfolioObligation(Obligation):
    fund_name: str = ""
    manager_id: str | None = None
    manager_name: str | None = None
