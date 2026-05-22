"""Pydantic schemas for the Workflows feature.

Mirrors the SQLAlchemy rows in `app.database` (WorkflowRow, WorkflowStageRow,
WorkflowColumnRow, WorkflowVariableRow). Phase 1: templates only — execution
schemas (runs, cells, stage outputs) land in Phase 2/3.
"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


WorkflowType = Literal["assistant", "tabular"]
RowSource = Literal["one_doc_per_row", "multi_doc_synthesis"]
OutputFormat = Literal["word", "markdown", "excel"]
ColumnFormat = Literal[
    # New typed-cell answer shapes.
    "metric",
    "bool",
    "enum",
    "prose",
    "list",
    "kv",
    # Free-form markdown — no JSON or brevity constraint. Use for columns
    # whose prompts ask for rich markdown (Yahoo-Finance tables, multi-section
    # narrative with custom headings). Differs from "text" which forces
    # "shortest analyst-usable value: a phrase or one short sentence maximum".
    "markdown",
    # Legacy formats kept for backwards compatibility during migration.
    "text",
    "bulleted_list",
    "number",
    "percentage",
    "monetary_amount",
    "currency",
    "yes_no",
    "date",
    "tag",
]


class WorkflowStage(BaseModel):
    id: str
    order_index: int
    label: str
    prompt_md: str = ""
    checkpoint: bool = False


class WorkflowStageInput(BaseModel):
    """Used for create/update — id is optional (server assigns if missing)."""
    id: str | None = None
    order_index: int
    label: str
    prompt_md: str = ""
    checkpoint: bool = False


class WorkflowColumn(BaseModel):
    id: str
    order_index: int
    label: str
    prompt: str = ""
    format: ColumnFormat = "text"
    tags: list[str] | None = None
    is_derived: bool = False
    formula: str | None = None


class WorkflowColumnInput(BaseModel):
    id: str | None = None
    order_index: int
    label: str
    prompt: str = ""
    format: ColumnFormat = "text"
    tags: list[str] | None = None
    is_derived: bool = False
    formula: str | None = None


class WorkflowVariable(BaseModel):
    id: str
    key: str
    default_value: str | None = None


class WorkflowVariableInput(BaseModel):
    id: str | None = None
    key: str
    default_value: str | None = None


class Workflow(BaseModel):
    id: str
    deal_id: str | None
    name: str
    description: str = ""
    type: WorkflowType
    row_source: RowSource = "one_doc_per_row"
    output_format: OutputFormat = "word"
    is_builtin: bool = False
    cloned_from: str | None = None
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime
    stages: list[WorkflowStage] = Field(default_factory=list)
    columns: list[WorkflowColumn] = Field(default_factory=list)
    variables: list[WorkflowVariable] = Field(default_factory=list)


class WorkflowCreate(BaseModel):
    name: str
    description: str = ""
    type: WorkflowType
    row_source: RowSource = "one_doc_per_row"
    output_format: OutputFormat = "word"
    stages: list[WorkflowStageInput] = Field(default_factory=list)
    columns: list[WorkflowColumnInput] = Field(default_factory=list)
    variables: list[WorkflowVariableInput] = Field(default_factory=list)


class WorkflowUpdate(BaseModel):
    """Partial update — only provided fields change. Stages/columns/variables,
    if provided, fully replace the existing set (simpler than diff-merge for v1)."""
    name: str | None = None
    description: str | None = None
    row_source: RowSource | None = None
    output_format: OutputFormat | None = None
    stages: list[WorkflowStageInput] | None = None
    columns: list[WorkflowColumnInput] | None = None
    variables: list[WorkflowVariableInput] | None = None
