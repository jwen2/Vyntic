"""
Pydantic models for the Diligence Agent (Investigate) feature.
"""
from typing import Any, Literal
from pydantic import BaseModel, Field


class Citation(BaseModel):
    source_file: str
    page: int
    snippet: str


class Finding(BaseModel):
    category: str = Field(max_length=120)
    claim: str = Field(max_length=600)
    severity: Literal["info", "watch", "red_flag"]
    citations: list[Citation] = Field(default_factory=list)


class InvestigationRequest(BaseModel):
    goal: str | None = None


class InvestigationResult(BaseModel):
    memo: str
    findings: list[Finding]
    duration_ms: int
    model: str
    fallback: bool


# ── persistence + followups ──


class FollowupTurn(BaseModel):
    id: int | None = None
    role: Literal["user", "assistant"]
    content: str
    model: str = ""
    fallback: bool = False
    duration_ms: int = 0
    created_at: str | None = None


class InvestigationSummary(BaseModel):
    id: str
    deal_id: str
    goal: str
    status: str
    finding_count: int
    followup_count: int
    model: str
    fallback: bool
    duration_ms: int
    created_at: str | None = None
    updated_at: str | None = None


class InvestigationRecord(BaseModel):
    id: str
    deal_id: str
    user_id: int | None = None
    goal: str
    status: str
    memo: str
    findings: list[dict[str, Any]] = Field(default_factory=list)
    transcript: list[dict[str, Any]] = Field(default_factory=list)
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    model: str
    fallback: bool
    duration_ms: int
    created_at: str | None = None
    updated_at: str | None = None
    followups: list[FollowupTurn] = Field(default_factory=list)


class FollowupRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
