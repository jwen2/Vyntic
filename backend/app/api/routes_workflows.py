"""Workflow template CRUD routes (Phase 1).

Run/cell endpoints will land in Phase 2 (separate router).
"""
from fastapi import APIRouter, Depends, HTTPException

from pydantic import BaseModel

from app.auth import get_current_user, require_deal_access
from app.database import UserRow
from app.models.workflow import (
    ColumnFormat,
    Workflow,
    WorkflowColumn,
    WorkflowCreate,
    WorkflowUpdate,
)
from app.services import workflow_store


class WorkflowColumnPatch(BaseModel):
    label: str | None = None
    prompt: str | None = None
    format: ColumnFormat | None = None
    tags: list[str] | None = None

router = APIRouter(tags=["workflows"])


@router.get("/deals/{deal_id}/workflows", response_model=list[Workflow])
def list_deal_workflows(deal_id: str, current_user: UserRow = Depends(get_current_user)):
    """List workflows visible to this deal: built-ins + deal-scoped customs."""
    require_deal_access(current_user, deal_id)
    return workflow_store.list_workflows(deal_id)


@router.post("/deals/{deal_id}/workflows", response_model=Workflow)
def create_deal_workflow(
    deal_id: str,
    data: WorkflowCreate,
    current_user: UserRow = Depends(get_current_user),
):
    """Create a deal-scoped custom workflow."""
    require_deal_access(current_user, deal_id)
    return workflow_store.create_workflow(
        deal_id=deal_id,
        data=data,
        created_by=current_user.id,
        is_builtin=False,
    )


@router.get("/deals/{deal_id}/workflows/{workflow_id}", response_model=Workflow)
def get_deal_workflow(
    deal_id: str,
    workflow_id: str,
    current_user: UserRow = Depends(get_current_user),
):
    require_deal_access(current_user, deal_id)
    workflow = workflow_store.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    # A workflow is visible if it's a built-in (deal_id None) or owned by this deal.
    if workflow.deal_id is not None and workflow.deal_id != deal_id:
        raise HTTPException(status_code=404, detail="Workflow not found in this deal")
    return workflow


@router.put("/deals/{deal_id}/workflows/{workflow_id}", response_model=Workflow)
def update_deal_workflow(
    deal_id: str,
    workflow_id: str,
    data: WorkflowUpdate,
    current_user: UserRow = Depends(get_current_user),
):
    require_deal_access(current_user, deal_id)
    existing = workflow_store.get_workflow(workflow_id)
    if not existing or existing.deal_id != deal_id:
        raise HTTPException(status_code=404, detail="Workflow not found in this deal")
    if existing.is_builtin:
        raise HTTPException(status_code=403, detail="Built-in workflows are read-only; clone first")
    updated = workflow_store.update_workflow(workflow_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return updated


@router.delete("/deals/{deal_id}/workflows/{workflow_id}")
def delete_deal_workflow(
    deal_id: str,
    workflow_id: str,
    current_user: UserRow = Depends(get_current_user),
):
    require_deal_access(current_user, deal_id)
    existing = workflow_store.get_workflow(workflow_id)
    if not existing or existing.deal_id != deal_id:
        raise HTTPException(status_code=404, detail="Workflow not found in this deal")
    if existing.is_builtin:
        raise HTTPException(status_code=403, detail="Built-in workflows cannot be deleted")
    try:
        workflow_store.delete_workflow(workflow_id)
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    return {"ok": True}


@router.patch(
    "/deals/{deal_id}/workflows/{workflow_id}/columns/{column_id}",
    response_model=WorkflowColumn,
)
def patch_workflow_column(
    deal_id: str,
    workflow_id: str,
    column_id: str,
    data: WorkflowColumnPatch,
    current_user: UserRow = Depends(get_current_user),
):
    """Update a single column's label / prompt / format / tags in place.
    Used by the run UI to edit a column without rebuilding the whole workflow
    template (which would cascade-delete prior cells)."""
    require_deal_access(current_user, deal_id)
    existing = workflow_store.get_workflow(workflow_id)
    if not existing or existing.deal_id != deal_id:
        raise HTTPException(status_code=404, detail="Workflow not found in this deal")
    if existing.is_builtin:
        raise HTTPException(
            status_code=403,
            detail="Built-in workflows are read-only; clone first",
        )
    updated = workflow_store.update_column(
        workflow_id,
        column_id,
        label=data.label,
        prompt=data.prompt,
        format=data.format,
        tags=data.tags,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Column not found in this workflow")
    return updated


@router.post("/deals/{deal_id}/workflows/{workflow_id}/clone", response_model=Workflow)
def clone_deal_workflow(
    deal_id: str,
    workflow_id: str,
    current_user: UserRow = Depends(get_current_user),
):
    """Clone a built-in (or any visible) workflow into a deal-scoped custom copy."""
    require_deal_access(current_user, deal_id)
    source = workflow_store.get_workflow(workflow_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source workflow not found")
    if source.deal_id is not None and source.deal_id != deal_id:
        raise HTTPException(status_code=404, detail="Source workflow not visible to this deal")
    cloned = workflow_store.clone_workflow(
        source_workflow_id=workflow_id,
        target_deal_id=deal_id,
        created_by=current_user.id,
    )
    if not cloned:
        raise HTTPException(status_code=500, detail="Failed to clone workflow")
    return cloned
