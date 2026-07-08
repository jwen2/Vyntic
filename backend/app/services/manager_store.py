"""SQLite-backed manager (GP firm) and position store.

Managers sit above fund workspaces (DealRow with entity_type="fund").
Deleting a manager detaches its funds (manager_id SET NULL) rather than
deleting them — fund workspaces own the documents and run history.
"""
import json

from app.models.manager import Manager, ManagerCreate, ManagerUpdate, Position, PositionUpsert
from app.database import current_session, ManagerRow, DealRow, PositionRow


def create_manager(data: ManagerCreate) -> Manager:
    db, owned = current_session()
    try:
        existing = db.query(ManagerRow).filter(ManagerRow.manager_id == data.manager_id).first()
        if existing:
            raise ValueError(f"Manager '{data.manager_id}' already exists")
        row = ManagerRow(
            manager_id=data.manager_id,
            name=data.name,
            description=data.description,
            tags_json=json.dumps(data.tags),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return _row_to_manager(row, fund_count=0)
    finally:
        if owned:
            db.close()


def get_manager(manager_id: str) -> Manager | None:
    db, owned = current_session()
    try:
        row = db.query(ManagerRow).filter(ManagerRow.manager_id == manager_id).first()
        if not row:
            return None
        fund_count = db.query(DealRow).filter(DealRow.manager_id == manager_id).count()
        return _row_to_manager(row, fund_count=fund_count)
    finally:
        if owned:
            db.close()


def list_managers() -> list[Manager]:
    db, owned = current_session()
    try:
        rows = db.query(ManagerRow).order_by(ManagerRow.name).all()
        # Count funds per manager in one pass.
        fund_counts: dict[str, int] = {}
        for (mid,) in db.query(DealRow.manager_id).filter(DealRow.manager_id.isnot(None)).all():
            fund_counts[mid] = fund_counts.get(mid, 0) + 1
        return [_row_to_manager(r, fund_count=fund_counts.get(r.manager_id, 0)) for r in rows]
    finally:
        if owned:
            db.close()


def update_manager(manager_id: str, data: ManagerUpdate) -> Manager | None:
    db, owned = current_session()
    try:
        row = db.query(ManagerRow).filter(ManagerRow.manager_id == manager_id).first()
        if not row:
            return None
        if data.name is not None:
            row.name = data.name
        if data.description is not None:
            row.description = data.description
        if data.tags is not None:
            row.tags_json = json.dumps(data.tags)
        db.commit()
        db.refresh(row)
        fund_count = db.query(DealRow).filter(DealRow.manager_id == manager_id).count()
        return _row_to_manager(row, fund_count=fund_count)
    finally:
        if owned:
            db.close()


def delete_manager(manager_id: str) -> bool:
    """Delete a manager. Its funds are detached (manager_id set NULL), not deleted."""
    db, owned = current_session()
    try:
        row = db.query(ManagerRow).filter(ManagerRow.manager_id == manager_id).first()
        if not row:
            return False
        # The FK is ondelete="SET NULL", but databases migrated via the additive
        # ALTER shim lack the constraint — detach explicitly for both cases.
        db.query(DealRow).filter(DealRow.manager_id == manager_id).update({"manager_id": None})
        db.delete(row)
        db.commit()
        return True
    finally:
        if owned:
            db.close()


def list_fund_ids(manager_id: str) -> list[str]:
    db, owned = current_session()
    try:
        rows = db.query(DealRow.deal_id).filter(DealRow.manager_id == manager_id).all()
        return [r[0] for r in rows]
    finally:
        if owned:
            db.close()


# ── Positions ──

def get_position(deal_id: str) -> Position | None:
    db, owned = current_session()
    try:
        row = db.query(PositionRow).filter(PositionRow.deal_id == deal_id).first()
        if not row:
            return None
        return _row_to_position(row)
    finally:
        if owned:
            db.close()


def upsert_position(deal_id: str, data: PositionUpsert) -> Position:
    db, owned = current_session()
    try:
        row = db.query(PositionRow).filter(PositionRow.deal_id == deal_id).first()
        if not row:
            row = PositionRow(deal_id=deal_id)
            db.add(row)
        for field in (
            "commitment_amount", "currency", "called_amount",
            "distributed_amount", "nav", "as_of", "status",
        ):
            value = getattr(data, field)
            if value is not None:
                setattr(row, field, value)
        db.commit()
        db.refresh(row)
        return _row_to_position(row)
    finally:
        if owned:
            db.close()


def _row_to_manager(row: ManagerRow, fund_count: int) -> Manager:
    return Manager(
        manager_id=row.manager_id,
        name=row.name,
        description=row.description or "",
        tags=json.loads(row.tags_json) if row.tags_json else [],
        fund_count=fund_count,
    )


def _row_to_position(row: PositionRow) -> Position:
    return Position(
        deal_id=row.deal_id,
        commitment_amount=row.commitment_amount,
        currency=row.currency or "USD",
        called_amount=row.called_amount,
        distributed_amount=row.distributed_amount,
        nav=row.nav,
        as_of=row.as_of,
        status=row.status or "active",
    )
