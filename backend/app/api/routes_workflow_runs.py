"""Workflow run + cell + stage endpoints (Phase 2 tabular + Phase 3 assistant).

Run lifecycle:
  1. POST /deals/{deal_id}/workflows/{workflow_id}/runs — create run + queued
     cells (tabular) or queued stage outputs (assistant), kick off the
     appropriate background executor, return the run.
  2. GET /runs/{run_id}/stream — SSE channel of cell / stage / run events.
  3. GET /runs/{run_id} — full run snapshot (REST).
  4. POST /runs/{run_id}/cancel — cancel queued work (in-flight finishes).
  5. POST /runs/{run_id}/stages/{stage_output_id}/approve — promote a
     checkpoint stage to complete (optionally storing analyst edits) and
     resume execution.

Auth: all endpoints require deal access. The streaming endpoint accepts a
short-lived token via `?token=` query param so EventSource clients (which can't
set Authorization headers) still authenticate cleanly.
"""
import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.auth import get_current_user, get_current_user_or_query_token, require_deal_access
from app.database import UserRow
from app.models.workflow_run import (
    AssistantStageOutput,
    StageApprovePayload,
    WorkflowRun,
    WorkflowRunCreate,
)
from app.services import workflow_run_store, workflow_store
from app.services.workflow_run_executor import (
    kick_off_assistant_run,
    kick_off_run,
    run_event_bus,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["workflow-runs"])


@router.post(
    "/deals/{deal_id}/workflows/{workflow_id}/runs",
    response_model=WorkflowRun,
)
async def create_run(
    deal_id: str,
    workflow_id: str,
    payload: WorkflowRunCreate,
    current_user: UserRow = Depends(get_current_user),
):
    require_deal_access(current_user, deal_id)
    workflow = workflow_store.get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if workflow.deal_id is not None and workflow.deal_id != deal_id:
        raise HTTPException(status_code=404, detail="Workflow not visible to this deal")
    if not payload.document_ids:
        raise HTTPException(status_code=400, detail="At least one document_id is required")

    if workflow.type == "tabular":
        column_ids = [c.id for c in workflow.columns]
        if not column_ids:
            raise HTTPException(status_code=400, detail="Workflow has no columns to extract")
        run = workflow_run_store.create_run(
            workflow_id=workflow_id,
            deal_id=deal_id,
            document_ids=payload.document_ids,
            column_ids=column_ids,
            started_by=current_user.id,
        )
        kick_off_run(run.id, deal_id)
        return run

    # Assistant
    if not workflow.stages:
        raise HTTPException(status_code=400, detail="Workflow has no stages to run")
    run = workflow_run_store.create_assistant_run(
        workflow_id=workflow_id,
        deal_id=deal_id,
        document_ids=payload.document_ids,
        started_by=current_user.id,
    )
    if run is None:
        raise HTTPException(status_code=400, detail="Failed to create assistant run")
    kick_off_assistant_run(run.id, deal_id)
    return run


@router.get(
    "/deals/{deal_id}/workflows/{workflow_id}/runs",
    response_model=list[WorkflowRun],
)
def list_runs(
    deal_id: str,
    workflow_id: str,
    current_user: UserRow = Depends(get_current_user),
):
    require_deal_access(current_user, deal_id)
    return workflow_run_store.list_runs_for_workflow(workflow_id, deal_id)


@router.get("/runs/{run_id}", response_model=WorkflowRun)
def get_run(run_id: str, current_user: UserRow = Depends(get_current_user)):
    run = workflow_run_store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    require_deal_access(current_user, run.deal_id)
    return run


@router.post("/runs/{run_id}/cancel", response_model=WorkflowRun)
def cancel_run(run_id: str, current_user: UserRow = Depends(get_current_user)):
    run = workflow_run_store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    require_deal_access(current_user, run.deal_id)
    # Cancel both kinds of queued work — one will be a no-op for the other mode.
    workflow_run_store.cancel_queued_cells(run_id)
    workflow_run_store.cancel_queued_stages(run_id)
    workflow_run_store.set_run_status(run_id, "cancelled")
    refreshed = workflow_run_store.get_run(run_id)
    if refreshed is None:
        raise HTTPException(status_code=404, detail="Run vanished")
    return refreshed


@router.post(
    "/runs/{run_id}/stages/{stage_output_id}/approve",
    response_model=AssistantStageOutput,
)
async def approve_stage(
    run_id: str,
    stage_output_id: str,
    payload: StageApprovePayload,
    current_user: UserRow = Depends(get_current_user),
):
    """Approve a checkpoint stage and resume the run. Optionally stores
    the analyst's edited markdown."""
    run = workflow_run_store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    require_deal_access(current_user, run.deal_id)
    stage = workflow_run_store.get_stage_output(stage_output_id)
    if not stage or stage.run_id != run_id:
        raise HTTPException(status_code=404, detail="Stage output not found")
    if stage.status != "checkpoint":
        raise HTTPException(
            status_code=400,
            detail=f"Stage is in status '{stage.status}', not 'checkpoint'",
        )
    approved = workflow_run_store.approve_stage(stage_output_id, payload.edited_md)
    if approved is None:
        raise HTTPException(status_code=404, detail="Stage output vanished")
    # Notify SSE subscribers of the stage transition before kicking the executor.
    await run_event_bus.publish(
        run_id, {"type": "stage", "stage": approved.model_dump(mode="json")}
    )
    kick_off_assistant_run(run_id, run.deal_id)
    return approved


@router.get("/runs/{run_id}/stream")
async def stream_run(
    run_id: str,
    current_user: UserRow = Depends(get_current_user_or_query_token),
):
    """SSE stream of run + cell events. Emits an initial snapshot, then
    realtime updates as the executor publishes them. Clients should
    cross-reference with `GET /runs/{run_id}` after disconnect to catch
    anything missed during reconnects."""
    run = workflow_run_store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    require_deal_access(current_user, run.deal_id)

    queue = await run_event_bus.subscribe(run_id)

    async def event_generator():
        # Initial snapshot — emits a single 'snapshot' event with the full run
        # so the client can populate UI immediately on connect.
        try:
            initial = workflow_run_store.get_run(run_id)
            if initial is not None:
                yield f"data: {json.dumps({'type': 'snapshot', 'run': initial.model_dump(mode='json')})}\n\n"

            # Heartbeat + drain
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=20.0)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
                    continue
                yield f"data: {json.dumps(event)}\n\n"
                # Stop streaming once the run reaches a terminal status — no
                # more events will come, and EventSource will reconnect on
                # close anyway.
                if event.get("type") == "run" and event.get("status") in (
                    "complete",
                    "cancelled",
                    "error",
                ):
                    break
        finally:
            await run_event_bus.unsubscribe(run_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
