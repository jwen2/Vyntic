"""Startup reconciler tests (F4).

Executor tasks are in-process; a backend restart kills them and leaves runs
stuck in pending/running forever. The reconciler marks that stranded work
errored on startup. Checkpoint runs are legitimately paused (they resume via
the approve endpoint) and must be untouched.
"""
import json

from app.database import (
    AssistantStageOutputRow,
    DealRow,
    SessionLocal,
    TabularCellRow,
    WorkflowColumnRow,
    WorkflowRow,
    WorkflowRunRow,
)
from app.services.workflow_run_store import get_run, reconcile_interrupted_runs


def _seed(run_id: str, run_status: str, cell_statuses: list[str]):
    db = SessionLocal()
    try:
        if db.query(DealRow).filter_by(deal_id="rec_deal").first() is None:
            db.add(DealRow(deal_id="rec_deal", name="Reconciler Deal"))
            db.add(
                WorkflowRow(
                    id="rec_wf", deal_id="rec_deal", name="WF", type="tabular"
                )
            )
            db.flush()
            db.add(
                WorkflowColumnRow(
                    id="rec_col", workflow_id="rec_wf", order_index=1, label="C"
                )
            )
        db.add(
            WorkflowRunRow(
                id=run_id,
                workflow_id="rec_wf",
                deal_id="rec_deal",
                run_number=1,
                status=run_status,
                document_ids_json=json.dumps([]),
            )
        )
        db.flush()
        for i, status in enumerate(cell_statuses):
            db.add(
                TabularCellRow(
                    id=f"{run_id}_cell{i}",
                    run_id=run_id,
                    row_key="doc1",
                    column_id="rec_col",
                    status=status,
                )
            )
        db.commit()
    finally:
        db.close()


def test_reconciler_errors_stranded_runs_and_cells():
    _seed("stranded", "running", ["running", "queued", "complete"])

    count = reconcile_interrupted_runs()

    assert count == 1
    run = get_run("stranded")
    assert run.status == "error"
    by_id = {c.id: c for c in run.cells}
    assert by_id["stranded_cell0"].status == "error"
    assert by_id["stranded_cell0"].error_message == "Interrupted by server restart"
    assert by_id["stranded_cell1"].status == "error"
    assert by_id["stranded_cell2"].status == "complete"  # untouched


def test_reconciler_skips_checkpoint_and_terminal_runs():
    _seed("paused", "checkpoint", [])
    _seed("done", "complete", ["complete"])

    db = SessionLocal()
    try:
        db.add(
            AssistantStageOutputRow(
                id="paused_stage",
                run_id="paused",
                order_index=1,
                label="Stage 1",
                status="checkpoint",
            )
        )
        db.commit()
    finally:
        db.close()

    count = reconcile_interrupted_runs()

    assert count == 0
    assert get_run("paused").status == "checkpoint"
    assert get_run("done").status == "complete"
