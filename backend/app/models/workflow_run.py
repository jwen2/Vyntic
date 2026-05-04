"""Pydantic schemas for workflow runs and tabular cells (Phase 2)."""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.query import Citation


RunStatus = Literal["pending", "running", "complete", "cancelled", "error"]
CellStatus = Literal["queued", "running", "complete", "error"]


class TabularCell(BaseModel):
    id: str
    run_id: str
    row_key: str  # doc_id today
    column_id: str
    status: CellStatus
    answer: str = ""
    answer_formatted: Any = None  # parsed value per column format (number, bool, list, etc.)
    citations: list[Citation | None] = Field(default_factory=list)
    model: str = ""
    fallback: bool = False
    duration_ms: int = 0
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


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


class WorkflowRunCreate(BaseModel):
    """Body for `POST /deals/{deal_id}/workflows/{workflow_id}/runs`."""
    document_ids: list[str]


class TabularCellEvent(BaseModel):
    """Event payload broadcast over SSE for cell status updates."""
    type: Literal["cell"] = "cell"
    cell: TabularCell


class RunStatusEvent(BaseModel):
    """Event payload broadcast over SSE for run-level status updates."""
    type: Literal["run"] = "run"
    run_id: str
    status: RunStatus


class RunStreamEnvelope(BaseModel):
    """Tagged union for SSE events. Use `.model_dump()` to serialize."""
    type: Literal["cell", "run"]
    cell: TabularCell | None = None
    run_id: str | None = None
    status: RunStatus | None = None
