"""Foreign-key enforcement tests (F3).

SQLite ignores ON DELETE CASCADE unless PRAGMA foreign_keys=ON is set per
connection. Without it, deleting a deal orphans deal-scoped workflows, runs,
cells, and access rows.
"""
import json

from app.database import (
    DealRow,
    SessionLocal,
    TabularCellRow,
    WorkflowColumnRow,
    WorkflowRow,
    WorkflowRunRow,
    engine,
)
from app.services import deal_store
from sqlalchemy import text


def _seed_deal_with_workflow_and_run():
    db = SessionLocal()
    try:
        db.add(DealRow(deal_id="fk_deal", name="FK Deal"))
        db.add(
            WorkflowRow(
                id="wf1",
                deal_id="fk_deal",
                name="Deal-scoped WF",
                type="tabular",
            )
        )
        db.flush()
        db.add(
            WorkflowColumnRow(
                id="col1", workflow_id="wf1", order_index=1, label="Revenue"
            )
        )
        db.add(
            WorkflowRunRow(
                id="run1",
                workflow_id="wf1",
                deal_id="fk_deal",
                run_number=1,
                document_ids_json=json.dumps([]),
            )
        )
        db.flush()
        db.add(
            TabularCellRow(
                id="cell1", run_id="run1", row_key="doc1", column_id="col1"
            )
        )
        db.commit()
    finally:
        db.close()


def test_sqlite_foreign_keys_pragma_is_on():
    with engine.connect() as conn:
        assert conn.execute(text("PRAGMA foreign_keys")).scalar() == 1


def test_deal_delete_cascades_to_workflows_runs_cells(monkeypatch):
    """Since C1, deletion is soft — the FK cascade fires at retention purge,
    not at delete time. Both halves matter: children must survive the
    retention window, then vanish with the deal row."""
    import asyncio
    from datetime import datetime, timedelta

    from app.config import settings
    from app.services.retention import purge_expired

    async def _noop(*args, **kwargs):
        return 0

    monkeypatch.setattr("app.services.retention.delete_deal_vectors", _noop)

    _seed_deal_with_workflow_and_run()

    assert deal_store.delete_deal("fk_deal") is True

    db = SessionLocal()
    try:
        # Soft delete: everything still present for the retention window.
        assert db.query(WorkflowRow).filter_by(id="wf1").first() is not None
        # Age the deletion past the window, then purge.
        db.execute(
            text("UPDATE deals SET deleted_at = :ts WHERE deal_id = 'fk_deal'"),
            {"ts": datetime.utcnow() - timedelta(days=settings.retention_purge_days + 1)},
        )
        db.commit()
    finally:
        db.close()

    asyncio.run(purge_expired())

    db = SessionLocal()
    try:
        assert db.query(WorkflowRow).filter_by(id="wf1").first() is None
        assert db.query(WorkflowRunRow).filter_by(id="run1").first() is None
        assert db.query(TabularCellRow).filter_by(id="cell1").first() is None
    finally:
        db.close()
