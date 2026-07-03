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


def test_deal_delete_cascades_to_workflows_runs_cells():
    _seed_deal_with_workflow_and_run()

    assert deal_store.delete_deal("fk_deal") is True

    db = SessionLocal()
    try:
        assert db.query(WorkflowRow).filter_by(id="wf1").first() is None
        assert db.query(WorkflowRunRow).filter_by(id="run1").first() is None
        assert db.query(TabularCellRow).filter_by(id="cell1").first() is None
    finally:
        db.close()
