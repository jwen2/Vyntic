"""SQLAlchemy-backed store for workflow runs and tabular cells (Phase 2).

Each public function manages its own session — callers do not pass DBs in.
"""
import json
import uuid
from datetime import datetime

from sqlalchemy import func

from app.database import (
    AssistantStageOutputRow,
    SessionLocal,
    TabularCellRow,
    WorkflowColumnRow,
    WorkflowRunRow,
    WorkflowStageRow,
)
from app.models.query import Citation
from app.models.workflow_run import (
    AssistantStageOutput,
    CellStatus,
    RunStatus,
    StageOutputStatus,
    TabularCell,
    WorkflowRun,
)


def _new_id() -> str:
    return uuid.uuid4().hex


def _row_to_cell(row: TabularCellRow) -> TabularCell:
    try:
        citations_raw = json.loads(row.citations_json) if row.citations_json else []
    except json.JSONDecodeError:
        citations_raw = []
    citations: list[Citation | None] = []
    for entry in citations_raw:
        if entry is None:
            citations.append(None)
        else:
            try:
                citations.append(Citation(**entry))
            except Exception:
                citations.append(None)
    try:
        formatted = json.loads(row.answer_formatted_json) if row.answer_formatted_json else None
    except json.JSONDecodeError:
        formatted = None
    return TabularCell(
        id=row.id,
        run_id=row.run_id,
        row_key=row.row_key,
        column_id=row.column_id,
        status=row.status,
        answer=row.answer or "",
        answer_formatted=formatted,
        citations=citations,
        model=row.model or "",
        fallback=bool(row.fallback),
        duration_ms=row.duration_ms or 0,
        error_message=row.error_message,
        started_at=row.started_at,
        completed_at=row.completed_at,
    )


def _row_to_stage_output(row: AssistantStageOutputRow) -> AssistantStageOutput:
    try:
        citations_raw = json.loads(row.citations_json) if row.citations_json else []
    except json.JSONDecodeError:
        citations_raw = []
    citations: list[Citation | None] = []
    for entry in citations_raw:
        if entry is None:
            citations.append(None)
        else:
            try:
                citations.append(Citation(**entry))
            except Exception:
                citations.append(None)
    return AssistantStageOutput(
        id=row.id,
        run_id=row.run_id,
        stage_id=row.stage_id,
        order_index=row.order_index,
        label=row.label,
        prompt_md=row.prompt_md or "",
        checkpoint=bool(row.checkpoint),
        status=row.status,
        output_md=row.output_md or "",
        edited_md=row.edited_md,
        citations=citations,
        model=row.model or "",
        fallback=bool(row.fallback),
        duration_ms=row.duration_ms or 0,
        error_message=row.error_message,
        started_at=row.started_at,
        completed_at=row.completed_at,
        approved_at=row.approved_at,
    )


def _row_to_run(row: WorkflowRunRow) -> WorkflowRun:
    try:
        doc_ids = json.loads(row.document_ids_json) if row.document_ids_json else []
    except json.JSONDecodeError:
        doc_ids = []
    if not isinstance(doc_ids, list):
        doc_ids = []
    return WorkflowRun(
        id=row.id,
        workflow_id=row.workflow_id,
        deal_id=row.deal_id,
        run_number=row.run_number or 0,
        status=row.status,
        document_ids=doc_ids,
        started_by=row.started_by,
        started_at=row.started_at or datetime.utcnow(),
        completed_at=row.completed_at,
        cells=[_row_to_cell(c) for c in row.cells],
        stage_outputs=[_row_to_stage_output(s) for s in row.stage_outputs],
    )


def create_run(
    *,
    workflow_id: str,
    deal_id: str,
    document_ids: list[str],
    column_ids: list[str],
    started_by: int | None = None,
) -> WorkflowRun:
    """Insert a new run + queued cells (one per (doc, column) pair).

    `column_ids` should be the non-derived column IDs from the workflow template.
    """
    db = SessionLocal()
    try:
        # run_number = max + 1, scoped per workflow
        max_n = (
            db.query(func.max(WorkflowRunRow.run_number))
            .filter(WorkflowRunRow.workflow_id == workflow_id)
            .scalar()
        )
        run_number = (max_n or 0) + 1
        run_id = _new_id()
        run = WorkflowRunRow(
            id=run_id,
            workflow_id=workflow_id,
            deal_id=deal_id,
            run_number=run_number,
            status="pending",
            document_ids_json=json.dumps(document_ids),
            started_by=started_by,
        )
        db.add(run)
        db.flush()
        # Generate one queued cell per (doc, column).
        for doc_id in document_ids:
            for column_id in column_ids:
                db.add(
                    TabularCellRow(
                        id=_new_id(),
                        run_id=run_id,
                        row_key=doc_id,
                        column_id=column_id,
                        status="queued",
                    )
                )
        db.commit()
        db.refresh(run)
        return _row_to_run(run)
    finally:
        db.close()


def get_run(run_id: str) -> WorkflowRun | None:
    db = SessionLocal()
    try:
        row = db.query(WorkflowRunRow).filter(WorkflowRunRow.id == run_id).first()
        if not row:
            return None
        return _row_to_run(row)
    finally:
        db.close()


def list_runs_for_workflow(workflow_id: str, deal_id: str) -> list[WorkflowRun]:
    """Return runs for this workflow scoped to deal, newest first.

    Cells are not loaded (use `get_run` for full detail).
    """
    db = SessionLocal()
    try:
        rows = (
            db.query(WorkflowRunRow)
            .filter(WorkflowRunRow.workflow_id == workflow_id, WorkflowRunRow.deal_id == deal_id)
            .order_by(WorkflowRunRow.run_number.desc())
            .all()
        )
        out: list[WorkflowRun] = []
        for row in rows:
            try:
                doc_ids = json.loads(row.document_ids_json) if row.document_ids_json else []
            except json.JSONDecodeError:
                doc_ids = []
            out.append(
                WorkflowRun(
                    id=row.id,
                    workflow_id=row.workflow_id,
                    deal_id=row.deal_id,
                    run_number=row.run_number or 0,
                    status=row.status,
                    document_ids=doc_ids if isinstance(doc_ids, list) else [],
                    started_by=row.started_by,
                    started_at=row.started_at or datetime.utcnow(),
                    completed_at=row.completed_at,
                    cells=[],  # don't eagerly load
                    stage_outputs=[],  # don't eagerly load
                )
            )
        return out
    finally:
        db.close()


def set_run_status(run_id: str, status: RunStatus) -> None:
    db = SessionLocal()
    try:
        row = db.query(WorkflowRunRow).filter(WorkflowRunRow.id == run_id).first()
        if not row:
            return
        row.status = status
        if status in ("complete", "cancelled", "error"):
            row.completed_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()


def cancel_queued_cells(run_id: str) -> int:
    """Mark all queued cells for this run as cancelled. In-flight cells are
    untouched. Returns count of cells affected."""
    db = SessionLocal()
    try:
        affected = (
            db.query(TabularCellRow)
            .filter(TabularCellRow.run_id == run_id, TabularCellRow.status == "queued")
            .update({"status": "error", "error_message": "Cancelled before execution"})
        )
        db.commit()
        return int(affected)
    finally:
        db.close()


def list_queued_cells(run_id: str) -> list[TabularCell]:
    db = SessionLocal()
    try:
        rows = (
            db.query(TabularCellRow)
            .filter(TabularCellRow.run_id == run_id, TabularCellRow.status == "queued")
            .all()
        )
        return [_row_to_cell(r) for r in rows]
    finally:
        db.close()


def get_cell(cell_id: str) -> TabularCell | None:
    db = SessionLocal()
    try:
        row = db.query(TabularCellRow).filter(TabularCellRow.id == cell_id).first()
        if not row:
            return None
        return _row_to_cell(row)
    finally:
        db.close()


def mark_cell_running(cell_id: str) -> TabularCell | None:
    db = SessionLocal()
    try:
        row = db.query(TabularCellRow).filter(TabularCellRow.id == cell_id).first()
        if not row:
            return None
        row.status = "running"
        row.started_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
        return _row_to_cell(row)
    finally:
        db.close()


def complete_cell(
    cell_id: str,
    *,
    answer: str,
    answer_formatted: object,
    citations: list[Citation | None],
    model: str = "",
    fallback: bool = False,
    duration_ms: int = 0,
) -> TabularCell | None:
    db = SessionLocal()
    try:
        row = db.query(TabularCellRow).filter(TabularCellRow.id == cell_id).first()
        if not row:
            return None
        row.status = "complete"
        row.answer = answer
        row.answer_formatted_json = json.dumps(answer_formatted)
        row.citations_json = json.dumps(
            [c.model_dump() if c is not None else None for c in citations]
        )
        row.model = model
        row.fallback = fallback
        row.duration_ms = duration_ms
        row.completed_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
        return _row_to_cell(row)
    finally:
        db.close()


def error_cell(cell_id: str, error_message: str) -> TabularCell | None:
    db = SessionLocal()
    try:
        row = db.query(TabularCellRow).filter(TabularCellRow.id == cell_id).first()
        if not row:
            return None
        row.status = "error"
        row.error_message = error_message[:2000]  # cap to avoid runaway storage
        row.completed_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
        return _row_to_cell(row)
    finally:
        db.close()


def all_cells_terminal(run_id: str) -> tuple[bool, CellStatus | None]:
    """Return (all_terminal, worst_status). worst_status is 'error' if any cell
    errored, else 'complete' if all complete, else None when not all terminal."""
    db = SessionLocal()
    try:
        rows = db.query(TabularCellRow.status).filter(TabularCellRow.run_id == run_id).all()
        if not rows:
            return True, "complete"
        statuses = [r[0] for r in rows]
        if any(s in ("queued", "running") for s in statuses):
            return False, None
        if any(s == "error" for s in statuses):
            return True, "error"
        return True, "complete"
    finally:
        db.close()


def load_column(column_id: str):
    """Convenience helper: fetch a column row + parse its tags."""
    db = SessionLocal()
    try:
        row = db.query(WorkflowColumnRow).filter(WorkflowColumnRow.id == column_id).first()
        if not row:
            return None
        return {
            "id": row.id,
            "label": row.label,
            "prompt": row.prompt or "",
            "format": row.format or "text",
            "tags": row.tags,
            "is_derived": bool(row.is_derived),
        }
    finally:
        db.close()


# ── Phase 3: assistant runs + stage outputs ──


def create_assistant_run(
    *,
    workflow_id: str,
    deal_id: str,
    document_ids: list[str],
    started_by: int | None = None,
) -> WorkflowRun | None:
    """Insert a run + queued stage_outputs (one per workflow stage).

    Stage data (label / prompt_md / checkpoint) is snapshotted onto each
    stage_output so the run remains coherent even if the workflow template
    is edited later.
    """
    db = SessionLocal()
    try:
        stages = (
            db.query(WorkflowStageRow)
            .filter(WorkflowStageRow.workflow_id == workflow_id)
            .order_by(WorkflowStageRow.order_index.asc())
            .all()
        )
        if not stages:
            return None
        max_n = (
            db.query(func.max(WorkflowRunRow.run_number))
            .filter(WorkflowRunRow.workflow_id == workflow_id)
            .scalar()
        )
        run_number = (max_n or 0) + 1
        run_id = _new_id()
        run = WorkflowRunRow(
            id=run_id,
            workflow_id=workflow_id,
            deal_id=deal_id,
            run_number=run_number,
            status="pending",
            document_ids_json=json.dumps(document_ids),
            started_by=started_by,
        )
        db.add(run)
        db.flush()
        for stage in stages:
            db.add(
                AssistantStageOutputRow(
                    id=_new_id(),
                    run_id=run_id,
                    stage_id=stage.id,
                    order_index=stage.order_index,
                    label=stage.label,
                    prompt_md=stage.prompt_md or "",
                    checkpoint=bool(stage.checkpoint),
                    status="queued",
                )
            )
        db.commit()
        db.refresh(run)
        return _row_to_run(run)
    finally:
        db.close()


def get_stage_output(stage_output_id: str) -> AssistantStageOutput | None:
    db = SessionLocal()
    try:
        row = (
            db.query(AssistantStageOutputRow)
            .filter(AssistantStageOutputRow.id == stage_output_id)
            .first()
        )
        if not row:
            return None
        return _row_to_stage_output(row)
    finally:
        db.close()


def next_queued_stage(run_id: str) -> AssistantStageOutput | None:
    """Return the next queued stage_output for the run in order, or None."""
    db = SessionLocal()
    try:
        row = (
            db.query(AssistantStageOutputRow)
            .filter(
                AssistantStageOutputRow.run_id == run_id,
                AssistantStageOutputRow.status == "queued",
            )
            .order_by(AssistantStageOutputRow.order_index.asc())
            .first()
        )
        if not row:
            return None
        return _row_to_stage_output(row)
    finally:
        db.close()


def list_terminal_stages(run_id: str) -> list[AssistantStageOutput]:
    """All complete stage outputs for the run, in order. Used to build
    prior-stage context for downstream stages."""
    db = SessionLocal()
    try:
        rows = (
            db.query(AssistantStageOutputRow)
            .filter(
                AssistantStageOutputRow.run_id == run_id,
                AssistantStageOutputRow.status == "complete",
            )
            .order_by(AssistantStageOutputRow.order_index.asc())
            .all()
        )
        return [_row_to_stage_output(r) for r in rows]
    finally:
        db.close()


def mark_stage_running(stage_output_id: str) -> AssistantStageOutput | None:
    db = SessionLocal()
    try:
        row = (
            db.query(AssistantStageOutputRow)
            .filter(AssistantStageOutputRow.id == stage_output_id)
            .first()
        )
        if not row:
            return None
        row.status = "running"
        row.started_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
        return _row_to_stage_output(row)
    finally:
        db.close()


def complete_stage(
    stage_output_id: str,
    *,
    output_md: str,
    citations: list[Citation | None],
    model: str = "",
    fallback: bool = False,
    duration_ms: int = 0,
    needs_checkpoint: bool,
) -> AssistantStageOutput | None:
    """Mark a stage's LLM call done. If `needs_checkpoint`, status becomes
    `checkpoint` (waiting on `approve_stage`); otherwise it becomes
    `complete` and the executor proceeds to the next stage."""
    db = SessionLocal()
    try:
        row = (
            db.query(AssistantStageOutputRow)
            .filter(AssistantStageOutputRow.id == stage_output_id)
            .first()
        )
        if not row:
            return None
        row.output_md = output_md
        row.citations_json = json.dumps(
            [c.model_dump() if c is not None else None for c in citations]
        )
        row.model = model
        row.fallback = fallback
        row.duration_ms = duration_ms
        if needs_checkpoint:
            row.status = "checkpoint"
        else:
            row.status = "complete"
            row.completed_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
        return _row_to_stage_output(row)
    finally:
        db.close()


def approve_stage(
    stage_output_id: str, edited_md: str | None
) -> AssistantStageOutput | None:
    """Promote a stage from `checkpoint` to `complete`, optionally storing
    the analyst's edited markdown. Idempotent: approving a non-checkpoint
    stage is a no-op."""
    db = SessionLocal()
    try:
        row = (
            db.query(AssistantStageOutputRow)
            .filter(AssistantStageOutputRow.id == stage_output_id)
            .first()
        )
        if not row:
            return None
        if row.status != "checkpoint":
            return _row_to_stage_output(row)
        if edited_md is not None:
            row.edited_md = edited_md
        row.status = "complete"
        now = datetime.utcnow()
        row.approved_at = now
        row.completed_at = now
        db.commit()
        db.refresh(row)
        return _row_to_stage_output(row)
    finally:
        db.close()


def error_stage(
    stage_output_id: str, error_message: str
) -> AssistantStageOutput | None:
    db = SessionLocal()
    try:
        row = (
            db.query(AssistantStageOutputRow)
            .filter(AssistantStageOutputRow.id == stage_output_id)
            .first()
        )
        if not row:
            return None
        row.status = "error"
        row.error_message = error_message[:2000]
        row.completed_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
        return _row_to_stage_output(row)
    finally:
        db.close()


def cancel_queued_stages(run_id: str) -> int:
    db = SessionLocal()
    try:
        affected = (
            db.query(AssistantStageOutputRow)
            .filter(
                AssistantStageOutputRow.run_id == run_id,
                AssistantStageOutputRow.status == "queued",
            )
            .update({"status": "error", "error_message": "Cancelled before execution"})
        )
        db.commit()
        return int(affected)
    finally:
        db.close()


def all_stages_terminal(run_id: str) -> tuple[bool, StageOutputStatus | None]:
    """(all_terminal, worst_status). 'checkpoint' counts as non-terminal since
    the executor will resume after approve. 'error' is the worst terminal."""
    db = SessionLocal()
    try:
        rows = (
            db.query(AssistantStageOutputRow.status)
            .filter(AssistantStageOutputRow.run_id == run_id)
            .all()
        )
        if not rows:
            return True, "complete"
        statuses = [r[0] for r in rows]
        if any(s in ("queued", "running", "checkpoint") for s in statuses):
            return False, None
        if any(s == "error" for s in statuses):
            return True, "error"
        return True, "complete"
    finally:
        db.close()
