"""Pydantic schemas for workflow runs (Phase 2 tabular + Phase 3 assistant)."""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.query import Citation


# Phase 3 adds "checkpoint" — assistant runs sit here while waiting on human approval.
RunStatus = Literal["pending", "running", "checkpoint", "complete", "cancelled", "error"]
CellStatus = Literal["queued", "running", "complete", "error"]
StageOutputStatus = Literal["queued", "running", "checkpoint", "complete", "error"]


class TabularCell(BaseModel):
    id: str
    run_id: str
    row_key: str  # doc_id today
    column_id: str
    status: CellStatus
    answer: str = ""
    answer_formatted: Any = None  # parsed value per column format (number, bool, list, etc.)
    citations: list[Citation | None] = Field(default_factory=list)
    quality: dict[str, Any] | None = None
    model: str = ""
    fallback: bool = False
    duration_ms: int = 0
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class AssistantStageOutput(BaseModel):
    id: str
    run_id: str
    stage_id: str | None  # null if the underlying stage was deleted post-run
    order_index: int
    label: str
    prompt_md: str = ""
    checkpoint: bool = False
    status: StageOutputStatus
    output_md: str = ""
    edited_md: str | None = None
    citations: list[Citation | None] = Field(default_factory=list)
    model: str = ""
    fallback: bool = False
    duration_ms: int = 0
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    approved_at: datetime | None = None


class WorkflowRun(BaseModel):
    id: str
    workflow_id: str
    deal_id: str
    run_number: int
    status: RunStatus
    document_ids: list[str] = Field(default_factory=list)
    started_by: int | None = None
    started_at: datetime
    completed_at: datetime | None = None
    cells: list[TabularCell] = Field(default_factory=list)
    stage_outputs: list[AssistantStageOutput] = Field(default_factory=list)


class WorkflowRunCreate(BaseModel):
    """Body for `POST /deals/{deal_id}/workflows/{workflow_id}/runs`.

    For assistant runs, `document_ids` may be empty if the workflow doesn't
    need document grounding (rare); the executor will still run but each
    stage gets no retrieved context.

    For tabular multi-doc synthesis workflows, `synthesis_questions` supplies
    the row labels. Each question becomes one row and every extraction column
    is run against the selected documents.
    """
    document_ids: list[str] = Field(default_factory=list)
    synthesis_questions: list[str] = Field(default_factory=list)


class StageApprovePayload(BaseModel):
    """Body for `POST /runs/{run_id}/stages/{stage_output_id}/approve`."""
    edited_md: str | None = None


class TabularCellEvent(BaseModel):
    """Event payload broadcast over SSE for cell status updates."""
    type: Literal["cell"] = "cell"
    cell: TabularCell


class StageOutputEvent(BaseModel):
    """Event payload broadcast over SSE for assistant stage status updates."""
    type: Literal["stage"] = "stage"
    stage: AssistantStageOutput


class RunStatusEvent(BaseModel):
    """Event payload broadcast over SSE for run-level status updates."""
    type: Literal["run"] = "run"
    run_id: str
    status: RunStatus


class RunStreamEnvelope(BaseModel):
    """Tagged union for SSE events. Use `.model_dump()` to serialize."""
    type: Literal["cell", "stage", "run"]
    cell: TabularCell | None = None
    stage: AssistantStageOutput | None = None
    run_id: str | None = None
    status: RunStatus | None = None
