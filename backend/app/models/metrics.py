"""Cost-accounting models."""
from pydantic import BaseModel, Field


class CostSummary(BaseModel):
    """Aggregated token spend for a deal, optionally narrowed to one run."""
    deal_id: str
    run_id: str | None = None
    call_count: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cached_tokens: int = 0
    # TOKENS (prompt + completion) per surface — not call counts. The point of
    # this instrumentation is the per-surface token multiplier, and surfaces
    # have wildly asymmetric prompt sizes, so a call count is a poor proxy for
    # spend. Counts live in calls_by_surface.
    by_surface: dict[str, int] = Field(default_factory=dict)
    calls_by_surface: dict[str, int] = Field(default_factory=dict)
    # Calls per outcome ("ok" / "error" / "aborted"). call_count counts
    # attempts, so prompt_tokens / call_count is biased low unless you divide
    # by the "ok" count instead.
    calls_by_outcome: dict[str, int] = Field(default_factory=dict)
