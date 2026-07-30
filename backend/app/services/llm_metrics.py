"""Per-LLM-call token accounting.

Records one row per call so cost can be attributed per surface, deal, and
run. Recording never raises: a metrics failure must not fail a diligence
answer.
"""
import logging
import uuid

from sqlalchemy import func

from app.agents.llm import LLMCallContext, LLMCallMeta
from app.database import LLMCallRow, SessionLocal
from app.models.metrics import CostSummary

logger = logging.getLogger(__name__)


def record_call(meta: LLMCallMeta, ctx: LLMCallContext) -> None:
    """Persist one call's usage. Swallows and logs any failure."""
    try:
        db = SessionLocal()
        try:
            db.add(
                LLMCallRow(
                    id=str(uuid.uuid4()),
                    surface=ctx.surface,
                    deal_id=ctx.deal_id,
                    run_id=ctx.run_id,
                    cell_id=ctx.cell_id,
                    doc_id=ctx.doc_id,
                    model=meta.model_used,
                    fallback=meta.fallback,
                    prompt_tokens=meta.prompt_tokens,
                    completion_tokens=meta.completion_tokens,
                    cached_tokens=meta.cached_tokens,
                    duration_ms=meta.duration_ms,
                    outcome=meta.outcome,
                )
            )
            db.commit()
        finally:
            db.close()
    except Exception:
        logger.exception("Failed to record LLM call metrics (surface=%s)", ctx.surface)


def summarize(deal_id: str, run_id: str | None = None) -> CostSummary:
    """Aggregate token spend for a deal, optionally narrowed to one run."""
    db = SessionLocal()
    try:
        q = db.query(LLMCallRow).filter(LLMCallRow.deal_id == deal_id)
        if run_id is not None:
            q = q.filter(LLMCallRow.run_id == run_id)

        totals = q.with_entities(
            func.count(LLMCallRow.id),
            func.coalesce(func.sum(LLMCallRow.prompt_tokens), 0),
            func.coalesce(func.sum(LLMCallRow.completion_tokens), 0),
            func.coalesce(func.sum(LLMCallRow.cached_tokens), 0),
        ).one()

        # by_surface is TOKENS, not calls: the whole reason this table exists is
        # to replace the estimated per-surface token multiplier with a measured
        # one, and surfaces differ by orders of magnitude in prompt size.
        # Counts are kept separately so call_count == sum(calls_by_surface).
        by_surface = dict(
            q.with_entities(
                LLMCallRow.surface,
                func.coalesce(
                    func.sum(LLMCallRow.prompt_tokens + LLMCallRow.completion_tokens),
                    0,
                ),
            )
            .group_by(LLMCallRow.surface)
            .all()
        )

        calls_by_surface = dict(
            q.with_entities(LLMCallRow.surface, func.count(LLMCallRow.id))
            .group_by(LLMCallRow.surface)
            .all()
        )

        # coalesce because a row inserted before `outcome` existed (or by raw
        # SQL) can carry NULL, and a None dict key would fail CostSummary's
        # dict[str, int] validation.
        outcome_col = func.coalesce(LLMCallRow.outcome, "error")
        calls_by_outcome = dict(
            q.with_entities(outcome_col, func.count(LLMCallRow.id))
            .group_by(outcome_col)
            .all()
        )

        return CostSummary(
            deal_id=deal_id,
            run_id=run_id,
            call_count=totals[0],
            prompt_tokens=totals[1],
            completion_tokens=totals[2],
            cached_tokens=totals[3],
            by_surface=by_surface,
            calls_by_surface=calls_by_surface,
            calls_by_outcome=calls_by_outcome,
        )
    finally:
        db.close()
