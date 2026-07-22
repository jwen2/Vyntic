"""Store for side-letter obligations and their per-period compliance checks."""
import json
import uuid
from datetime import datetime

from app.database import SessionLocal, SideLetterObligationRow, SideLetterCheckRow
from app.models.monitoring import (
    Obligation,
    ObligationDraft,
    SideLetterCheck,
)
from app.models.query import Citation


def _new_id() -> str:
    return uuid.uuid4().hex


def _dump_citations(citations) -> str:
    return json.dumps([c.model_dump() if c else None for c in citations])


def _load_citations(raw_json: str) -> list:
    raw = json.loads(raw_json) if raw_json else []
    return [Citation(**c) if c else None for c in raw]


def create_obligations(deal_id: str, doc_id: str | None, drafts: list[ObligationDraft]) -> list[Obligation]:
    db = SessionLocal()
    try:
        created_ids = []
        for d in drafts:
            row = SideLetterObligationRow(
                id=_new_id(),
                deal_id=deal_id,
                doc_id=doc_id,
                category=d.category or "other",
                text=d.text or "",
                section_ref=d.section_ref or "",
                cadence=d.cadence or "ongoing",
                verify_hint=d.verify_hint or "",
                citations_json=_dump_citations(d.citations),
            )
            db.add(row)
            created_ids.append(row.id)
        db.commit()
    finally:
        db.close()
    return [o for o in list_for_deal(deal_id) if o.id in created_ids]


def list_for_deal(deal_id: str) -> list[Obligation]:
    db = SessionLocal()
    try:
        rows = (
            db.query(SideLetterObligationRow)
            .filter(SideLetterObligationRow.deal_id == deal_id)
            .order_by(SideLetterObligationRow.category, SideLetterObligationRow.created_at)
            .all()
        )
        return [_obligation_to_model(db, r) for r in rows]
    finally:
        db.close()


def get_obligation_deal(obligation_id: str) -> str | None:
    db = SessionLocal()
    try:
        row = (
            db.query(SideLetterObligationRow.deal_id)
            .filter(SideLetterObligationRow.id == obligation_id)
            .first()
        )
        return row[0] if row else None
    finally:
        db.close()


def list_active_obligations_raw(deal_id: str) -> list[dict]:
    """Lightweight dicts for the verifier (avoids the per-obligation check join)."""
    db = SessionLocal()
    try:
        rows = (
            db.query(SideLetterObligationRow)
            .filter(
                SideLetterObligationRow.deal_id == deal_id,
                SideLetterObligationRow.status == "active",
            )
            .all()
        )
        return [{"id": r.id, "text": r.text, "verify_hint": r.verify_hint, "category": r.category} for r in rows]
    finally:
        db.close()


def upsert_check(
    obligation_id: str,
    period: str,
    verdict: str,
    rationale: str,
    citations: list,
    llm_verdict: str | None,
    confirmed_by: int | None,
) -> SideLetterCheck:
    """Create or replace the single check for (obligation, period). A proposal
    has confirmed_by/at NULL; confirming sets them."""
    db = SessionLocal()
    try:
        row = (
            db.query(SideLetterCheckRow)
            .filter(
                SideLetterCheckRow.obligation_id == obligation_id,
                SideLetterCheckRow.period == period,
            )
            .first()
        )
        if not row:
            row = SideLetterCheckRow(id=_new_id(), obligation_id=obligation_id, period=period)
            db.add(row)
        row.verdict = verdict
        row.llm_verdict = llm_verdict
        row.rationale = rationale or ""
        row.citations_json = _dump_citations(citations)
        if confirmed_by is not None:
            row.confirmed_by = confirmed_by
            row.confirmed_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
        return _check_to_model(row)
    finally:
        db.close()


def confirm_check(check_id: str, verdict: str | None, rationale: str | None, user_id: int) -> SideLetterCheck | None:
    """Analyst confirms (verdict None = accept proposal) or overrides a check.
    The model's original proposal is preserved in llm_verdict."""
    db = SessionLocal()
    try:
        row = db.query(SideLetterCheckRow).filter(SideLetterCheckRow.id == check_id).first()
        if not row:
            return None
        if row.llm_verdict is None:
            row.llm_verdict = row.verdict  # snapshot the proposal before any override
        if verdict is not None:
            row.verdict = verdict
        if rationale is not None:
            row.rationale = rationale
        row.confirmed_by = user_id
        row.confirmed_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
        return _check_to_model(row)
    finally:
        db.close()


def get_check_deal(check_id: str) -> str | None:
    db = SessionLocal()
    try:
        row = (
            db.query(SideLetterObligationRow.deal_id)
            .join(SideLetterCheckRow, SideLetterCheckRow.obligation_id == SideLetterObligationRow.id)
            .filter(SideLetterCheckRow.id == check_id)
            .first()
        )
        return row[0] if row else None
    finally:
        db.close()


def list_flagged() -> list[tuple[Obligation, str]]:
    """Obligations whose latest check is breach/unclear, as (obligation, deal_id).
    Access filtering happens in the route."""
    db = SessionLocal()
    try:
        rows = db.query(SideLetterObligationRow).filter(
            SideLetterObligationRow.status == "active"
        ).all()
        out: list[tuple[Obligation, str]] = []
        for r in rows:
            model = _obligation_to_model(db, r)
            if model.latest_check and model.latest_check.verdict in ("breach", "unclear"):
                out.append((model, r.deal_id))
        return out
    finally:
        db.close()


def _latest_check_row(db, obligation_id: str) -> SideLetterCheckRow | None:
    return (
        db.query(SideLetterCheckRow)
        .filter(SideLetterCheckRow.obligation_id == obligation_id)
        .order_by(SideLetterCheckRow.created_at.desc())
        .first()
    )


def _obligation_to_model(db, row: SideLetterObligationRow) -> Obligation:
    latest = _latest_check_row(db, row.id)
    return Obligation(
        id=row.id,
        deal_id=row.deal_id,
        doc_id=row.doc_id,
        category=row.category,
        text=row.text,
        section_ref=row.section_ref or "",
        cadence=row.cadence or "ongoing",
        verify_hint=row.verify_hint or "",
        citations=_load_citations(row.citations_json),
        status=row.status or "active",
        latest_check=_check_to_model(latest) if latest else None,
    )


def _check_to_model(row: SideLetterCheckRow) -> SideLetterCheck:
    return SideLetterCheck(
        id=row.id,
        obligation_id=row.obligation_id,
        period=row.period,
        verdict=row.verdict,
        llm_verdict=row.llm_verdict,
        rationale=row.rationale or "",
        citations=_load_citations(row.citations_json),
        confirmed=row.confirmed_at is not None,
    )
