"""Cancel semantics tests (F5).

Before these fixes: cancel marked queued cells errored but the executor's
in-memory gather kept executing them (mark_cell_running unconditionally
flipped them back to running), and run finalization overwrote the run's
`cancelled` status with `complete`.
"""
import json

import pytest

from app.database import (
    DealRow,
    SessionLocal,
    TabularCellRow,
    WorkflowColumnRow,
    WorkflowRow,
    WorkflowRunRow,
)
from app.services import workflow_run_executor, workflow_run_store


def _seed_run(run_id="cx_run", cell_status="queued") -> str:
    """Create deal/workflow/run with one cell; returns the cell id."""
    cell_id = f"{run_id}_cell"
    db = SessionLocal()
    try:
        if db.query(DealRow).filter_by(deal_id="cx_deal").first() is None:
            db.add(DealRow(deal_id="cx_deal", name="Cancel Deal"))
            db.add(
                WorkflowRow(
                    id="cx_wf", deal_id="cx_deal", name="WF", type="tabular"
                )
            )
            db.flush()
            db.add(
                WorkflowColumnRow(
                    id="cx_col", workflow_id="cx_wf", order_index=1, label="Revenue"
                )
            )
        db.add(
            WorkflowRunRow(
                id=run_id,
                workflow_id="cx_wf",
                deal_id="cx_deal",
                run_number=1,
                status="running",
                document_ids_json=json.dumps(["doc1"]),
            )
        )
        db.flush()
        db.add(
            TabularCellRow(
                id=cell_id,
                run_id=run_id,
                row_key="doc1",
                column_id="cx_col",
                status=cell_status,
            )
        )
        db.commit()
        return cell_id
    finally:
        db.close()


class TestAtomicClaim:
    def test_claim_succeeds_on_queued_cell(self):
        cell_id = _seed_run("claim1")
        claimed = workflow_run_store.mark_cell_running(cell_id)
        assert claimed is not None
        assert claimed.status == "running"

    def test_claim_fails_on_non_queued_cell(self):
        cell_id = _seed_run("claim2", cell_status="error")
        assert workflow_run_store.mark_cell_running(cell_id) is None

    def test_second_claim_fails(self):
        cell_id = _seed_run("claim3")
        assert workflow_run_store.mark_cell_running(cell_id) is not None
        assert workflow_run_store.mark_cell_running(cell_id) is None


class TestCancelledWorkIsNeverExecuted:
    async def test_execute_cell_skips_cancelled_cell(self, monkeypatch):
        cell_id = _seed_run("skip1")
        workflow_run_store.cancel_queued_cells("skip1")

        async def _must_not_be_called(*args, **kwargs):
            raise AssertionError("LLM called for a cancelled cell")
            yield  # pragma: no cover — makes this an async generator

        monkeypatch.setattr(
            workflow_run_executor, "stream_with_fallback", _must_not_be_called
        )

        await workflow_run_executor.execute_cell(cell_id, "skip1", "cx_deal")

        cell = workflow_run_store.get_cell(cell_id)
        assert cell.status == "error"
        assert cell.error_message == "Cancelled"


class TestCancelledStatusPreserved:
    async def test_finalize_does_not_resurrect_cancelled_run(self):
        _seed_run("keep1", cell_status="complete")
        workflow_run_store.set_run_status("keep1", "cancelled")

        await workflow_run_executor._finalize_run_status("keep1", None)

        assert workflow_run_store.get_run("keep1").status == "cancelled"

    async def test_finalize_sets_terminal_status_normally(self):
        _seed_run("fin1", cell_status="complete")
        workflow_run_store.set_run_status("fin1", "running")

        await workflow_run_executor._finalize_run_status("fin1", None)

        assert workflow_run_store.get_run("fin1").status == "complete"
