"""Store for capital-call / distribution notices.

The queue of confirmed notices is the source of truth for a fund's called /
distributed totals: `recompute_position_totals` sums confirmed rows and writes
them onto the PositionRow (never blind-increment — re-processing a notice can't
double-count)."""
import json
import uuid

from app.database import SessionLocal, CallNoticeRow, PositionRow
from app.models.monitoring import CallNotice, CallNoticeCreate, CallNoticeUpdate
from app.models.query import Citation


def _new_id() -> str:
    return uuid.uuid4().hex


def create(deal_id: str, data: CallNoticeCreate) -> CallNotice:
    db = SessionLocal()
    try:
        row = CallNoticeRow(
            id=_new_id(),
            deal_id=deal_id,
            doc_id=data.doc_id,
            kind=data.kind,
            amount=data.amount,
            currency=data.currency or "USD",
            due_date=data.due_date,
            period=data.period,
            purpose=data.purpose or "",
            status="confirmed",  # posting a reviewed draft confirms it
            outstanding_before=data.outstanding_before,
            citations_json=json.dumps([c.model_dump() if c else None for c in data.citations]),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        result = _row_to_model(row)
    finally:
        db.close()
    recompute_position_totals(deal_id)
    return result


def list_for_deal(deal_id: str) -> list[CallNotice]:
    db = SessionLocal()
    try:
        rows = (
            db.query(CallNoticeRow)
            .filter(CallNoticeRow.deal_id == deal_id)
            .order_by(CallNoticeRow.due_date.is_(None), CallNoticeRow.due_date)
            .all()
        )
        return [_row_to_model(r) for r in rows]
    finally:
        db.close()


def update(deal_id: str, notice_id: str, data: CallNoticeUpdate) -> CallNotice | None:
    db = SessionLocal()
    try:
        row = (
            db.query(CallNoticeRow)
            .filter(CallNoticeRow.id == notice_id, CallNoticeRow.deal_id == deal_id)
            .first()
        )
        if not row:
            return None
        for f in ("kind", "amount", "currency", "due_date", "period", "purpose", "status"):
            value = getattr(data, f)
            if value is not None:
                setattr(row, f, value)
        db.commit()
        db.refresh(row)
        result = _row_to_model(row)
    finally:
        db.close()
    recompute_position_totals(deal_id)
    return result


def recompute_position_totals(deal_id: str) -> None:
    """Recompute called/distributed on the PositionRow from confirmed notices.

    Idempotent and self-healing: called = sum of confirmed/paid call amounts,
    distributed = sum of confirmed/paid distribution amounts. Only touches a
    position that already exists (positions are created via the position API).
    """
    db = SessionLocal()
    try:
        position = db.query(PositionRow).filter(PositionRow.deal_id == deal_id).first()
        if not position:
            return
        rows = (
            db.query(CallNoticeRow)
            .filter(
                CallNoticeRow.deal_id == deal_id,
                CallNoticeRow.status.in_(("confirmed", "paid")),
            )
            .all()
        )
        called = sum(r.amount or 0 for r in rows if r.kind == "call")
        distributed = sum(r.amount or 0 for r in rows if r.kind == "distribution")
        position.called_amount = called or None
        position.distributed_amount = distributed or None
        db.commit()
    finally:
        db.close()


def list_all_pending() -> list[tuple[CallNotice, str]]:
    """Every pending/confirmed (unpaid) notice across all funds, as
    (notice, deal_id). Access filtering happens in the route."""
    db = SessionLocal()
    try:
        rows = (
            db.query(CallNoticeRow)
            .filter(CallNoticeRow.status.in_(("pending", "confirmed")))
            .order_by(CallNoticeRow.due_date.is_(None), CallNoticeRow.due_date)
            .all()
        )
        return [(_row_to_model(r), r.deal_id) for r in rows]
    finally:
        db.close()


def _row_to_model(row: CallNoticeRow) -> CallNotice:
    raw = json.loads(row.citations_json) if row.citations_json else []
    citations = [Citation(**c) if c else None for c in raw]
    return CallNotice(
        id=row.id,
        deal_id=row.deal_id,
        doc_id=row.doc_id,
        kind=row.kind,
        amount=row.amount,
        currency=row.currency or "USD",
        due_date=row.due_date,
        period=row.period,
        purpose=row.purpose or "",
        status=row.status or "pending",
        outstanding_before=row.outstanding_before,
        citations=citations,
    )
