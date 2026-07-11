"""SQLAlchemy-backed workflow template store.

Phase 1: templates only (workflows + stages + columns + variables).
Phase 2 will add run/cell stores.
"""
import json
import uuid
from datetime import datetime
from sqlalchemy import and_, or_

from app.database import (
    SessionLocal,
    DealRow,
    WorkflowRow,
    WorkflowStageRow,
    WorkflowColumnRow,
    WorkflowVariableRow,
)
from app.models.workflow import (
    Workflow,
    WorkflowCreate,
    WorkflowUpdate,
    WorkflowStage,
    WorkflowColumn,
    WorkflowVariable,
    WorkflowStageInput,
    WorkflowColumnInput,
    WorkflowVariableInput,
)


def _new_id() -> str:
    return uuid.uuid4().hex


def _row_to_workflow(row: WorkflowRow) -> Workflow:
    return Workflow(
        id=row.id,
        deal_id=row.deal_id,
        entity_type=row.entity_type or "deal",
        name=row.name,
        description=row.description or "",
        type=row.type,
        row_source=row.row_source or "one_doc_per_row",
        output_format=row.output_format or "word",
        is_builtin=bool(row.is_builtin),
        cloned_from=row.cloned_from,
        created_by=row.created_by,
        created_at=row.created_at or datetime.utcnow(),
        updated_at=row.updated_at or datetime.utcnow(),
        stages=[
            WorkflowStage(
                id=s.id,
                order_index=s.order_index,
                label=s.label,
                prompt_md=s.prompt_md or "",
                checkpoint=bool(s.checkpoint),
            )
            for s in row.stages
        ],
        columns=[
            WorkflowColumn(
                id=c.id,
                order_index=c.order_index,
                label=c.label,
                prompt=c.prompt or "",
                format=c.format or "text",
                tags=c.tags,
                is_derived=bool(c.is_derived),
                formula=c.formula,
            )
            for c in row.columns
        ],
        variables=[
            WorkflowVariable(id=v.id, key=v.key, default_value=v.default_value)
            for v in row.variables
        ],
    )


def list_workflows(deal_id: str) -> list[Workflow]:
    """Return all workflows visible to this deal: built-ins (deal_id IS NULL)
    plus deal-scoped custom workflows."""
    db = SessionLocal()
    try:
        deal = db.query(DealRow).filter(DealRow.deal_id == deal_id).first()
        entity_type = (deal.entity_type if deal else None) or "deal"
        rows = (
            db.query(WorkflowRow)
            .filter(
                or_(
                    and_(
                        WorkflowRow.deal_id.is_(None),
                        WorkflowRow.entity_type == entity_type,
                    ),
                    WorkflowRow.deal_id == deal_id,
                )
            )
            .all()
        )
        return [_row_to_workflow(r) for r in rows]
    finally:
        db.close()


def get_workflow(workflow_id: str) -> Workflow | None:
    db = SessionLocal()
    try:
        row = db.query(WorkflowRow).filter(WorkflowRow.id == workflow_id).first()
        if not row:
            return None
        return _row_to_workflow(row)
    finally:
        db.close()


def create_workflow(
    deal_id: str | None,
    data: WorkflowCreate,
    created_by: int | None = None,
    is_builtin: bool = False,
    cloned_from: str | None = None,
    workflow_id: str | None = None,
) -> Workflow:
    db = SessionLocal()
    try:
        wf_id = workflow_id or _new_id()
        row = WorkflowRow(
            id=wf_id,
            deal_id=deal_id,
            entity_type=data.entity_type,
            name=data.name,
            description=data.description,
            type=data.type,
            row_source=data.row_source,
            output_format=data.output_format,
            is_builtin=is_builtin,
            cloned_from=cloned_from,
            created_by=created_by,
        )
        db.add(row)
        db.flush()  # assign PK before children
        _replace_children(db, wf_id, data.stages, data.columns, data.variables)
        db.commit()
        db.refresh(row)
        return _row_to_workflow(row)
    finally:
        db.close()


def update_column(
    workflow_id: str,
    column_id: str,
    *,
    label: str | None = None,
    prompt: str | None = None,
    format: str | None = None,
    tags: list[str] | None = None,
) -> WorkflowColumn | None:
    """Update a single column in place. Unlike `update_workflow`, this does
    NOT delete-and-recreate the column row, so existing cells in past runs
    keep their FK to it."""
    db = SessionLocal()
    try:
        row = (
            db.query(WorkflowColumnRow)
            .filter(
                WorkflowColumnRow.id == column_id,
                WorkflowColumnRow.workflow_id == workflow_id,
            )
            .first()
        )
        if not row:
            return None
        if label is not None:
            row.label = label
        if prompt is not None:
            row.prompt = prompt
        if format is not None:
            row.format = format
        if tags is not None:
            row.tags_json = json.dumps(tags) if tags else "null"
        db.commit()
        db.refresh(row)
        return WorkflowColumn(
            id=row.id,
            order_index=row.order_index,
            label=row.label,
            prompt=row.prompt or "",
            format=row.format or "text",
            tags=row.tags,
            is_derived=bool(row.is_derived),
            formula=row.formula,
        )
    finally:
        db.close()


def update_workflow(workflow_id: str, data: WorkflowUpdate) -> Workflow | None:
    db = SessionLocal()
    try:
        row = db.query(WorkflowRow).filter(WorkflowRow.id == workflow_id).first()
        if not row:
            return None
        if data.name is not None:
            row.name = data.name
        if data.description is not None:
            row.description = data.description
        if data.row_source is not None:
            row.row_source = data.row_source
        if data.output_format is not None:
            row.output_format = data.output_format
        # If stages/columns/variables provided, replace fully.
        if data.stages is not None or data.columns is not None or data.variables is not None:
            _replace_children(
                db,
                workflow_id,
                data.stages if data.stages is not None else None,
                data.columns if data.columns is not None else None,
                data.variables if data.variables is not None else None,
            )
        db.commit()
        db.refresh(row)
        return _row_to_workflow(row)
    finally:
        db.close()


def delete_workflow(workflow_id: str) -> bool:
    db = SessionLocal()
    try:
        row = db.query(WorkflowRow).filter(WorkflowRow.id == workflow_id).first()
        if not row:
            return False
        if row.is_builtin:
            # Built-ins are read-only; refuse delete.
            raise ValueError("Built-in workflows cannot be deleted")
        db.delete(row)
        db.commit()
        return True
    finally:
        db.close()


def clone_workflow(
    source_workflow_id: str,
    target_deal_id: str,
    created_by: int | None = None,
    new_name: str | None = None,
) -> Workflow | None:
    """Clone an existing workflow (typically a built-in) into a deal-scoped copy."""
    source = get_workflow(source_workflow_id)
    if not source:
        return None
    payload = WorkflowCreate(
        name=new_name or f"{source.name} (Copy)",
        entity_type=source.entity_type,
        description=source.description,
        type=source.type,
        row_source=source.row_source,
        output_format=source.output_format,
        stages=[
            WorkflowStageInput(
                order_index=s.order_index,
                label=s.label,
                prompt_md=s.prompt_md,
                checkpoint=s.checkpoint,
            )
            for s in source.stages
        ],
        columns=[
            WorkflowColumnInput(
                order_index=c.order_index,
                label=c.label,
                prompt=c.prompt,
                format=c.format,
                tags=c.tags,
                is_derived=c.is_derived,
                formula=c.formula,
            )
            for c in source.columns
        ],
        variables=[
            WorkflowVariableInput(key=v.key, default_value=v.default_value)
            for v in source.variables
        ],
    )
    return create_workflow(
        deal_id=target_deal_id,
        data=payload,
        created_by=created_by,
        is_builtin=False,
        cloned_from=source_workflow_id,
    )


def _replace_children(
    db,
    workflow_id: str,
    stages: list[WorkflowStageInput] | None,
    columns: list[WorkflowColumnInput] | None,
    variables: list[WorkflowVariableInput] | None,
):
    """Replace stages/columns/variables for a workflow.

    None means "leave existing alone." Empty list means "delete all."
    """
    if stages is not None:
        db.query(WorkflowStageRow).filter(WorkflowStageRow.workflow_id == workflow_id).delete()
        for s in stages:
            db.add(
                WorkflowStageRow(
                    id=s.id or _new_id(),
                    workflow_id=workflow_id,
                    order_index=s.order_index,
                    label=s.label,
                    prompt_md=s.prompt_md,
                    checkpoint=s.checkpoint,
                )
            )
    if columns is not None:
        db.query(WorkflowColumnRow).filter(WorkflowColumnRow.workflow_id == workflow_id).delete()
        for c in columns:
            db.add(
                WorkflowColumnRow(
                    id=c.id or _new_id(),
                    workflow_id=workflow_id,
                    order_index=c.order_index,
                    label=c.label,
                    prompt=c.prompt,
                    format=c.format,
                    tags_json=json.dumps(c.tags) if c.tags is not None else "null",
                    is_derived=c.is_derived,
                    formula=c.formula,
                )
            )
    if variables is not None:
        db.query(WorkflowVariableRow).filter(WorkflowVariableRow.workflow_id == workflow_id).delete()
        for v in variables:
            db.add(
                WorkflowVariableRow(
                    id=v.id or _new_id(),
                    workflow_id=workflow_id,
                    key=v.key,
                    default_value=v.default_value,
                )
            )
