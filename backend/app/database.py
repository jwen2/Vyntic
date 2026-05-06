"""
SQLAlchemy database setup.
Uses SQLite for local/PoC — swap connection string to PostgreSQL for production.
"""
import json
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Integer, Text, Boolean, DateTime, ForeignKey, event, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, Session

from app.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},  # SQLite-specific; remove for Postgres
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class DealRow(Base):
    __tablename__ = "deals"

    deal_id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    document_count = Column(Integer, default=0)
    stage = Column(String, default="Screening")
    tags_json = Column(Text, default="[]")  # JSON-encoded list; use Postgres ARRAY later

    documents = relationship("DocumentRow", back_populates="deal", cascade="all, delete-orphan")

    @property
    def tags(self) -> list[str]:
        return json.loads(self.tags_json) if self.tags_json else []

    @tags.setter
    def tags(self, value: list[str]):
        self.tags_json = json.dumps(value)


class DocumentRow(Base):
    __tablename__ = "documents"

    doc_id = Column(String, primary_key=True, index=True)
    deal_id = Column(String, ForeignKey("deals.deal_id", ondelete="CASCADE"), nullable=False)
    filename = Column(String, nullable=False)
    page_count = Column(Integer, default=0)
    chunk_count = Column(Integer, default=0)
    full_text_md = Column(Text, nullable=True)

    deal = relationship("DealRow", back_populates="documents")


# ── Authentication models ──

class UserRow(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, default="")
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    deal_access = relationship("DealAccessRow", back_populates="user", cascade="all, delete-orphan")


class DealAccessRow(Base):
    __tablename__ = "deal_access"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    deal_id = Column(String, ForeignKey("deals.deal_id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, default="analyst")  # "analyst", "lead", "admin"

    user = relationship("UserRow", back_populates="deal_access")


# ── Diligence Agent (Investigate) persistence ──

class InvestigationRow(Base):
    __tablename__ = "investigations"

    id = Column(String, primary_key=True, index=True)  # uuid4 hex
    deal_id = Column(String, ForeignKey("deals.deal_id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    goal = Column(Text, default="")
    status = Column(String, default="running")  # running | complete | stopped | error
    memo = Column(Text, default="")
    findings_json = Column(Text, default="[]")
    transcript_json = Column(Text, default="[]")
    evidence_json = Column(Text, default="[]")
    model = Column(String, default="")
    fallback = Column(Boolean, default=False)
    duration_ms = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    followups = relationship(
        "InvestigationFollowupRow",
        back_populates="investigation",
        cascade="all, delete-orphan",
        order_by="InvestigationFollowupRow.created_at",
    )


class InvestigationFollowupRow(Base):
    __tablename__ = "investigation_followups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    investigation_id = Column(
        String,
        ForeignKey("investigations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String, nullable=False)  # "user" | "assistant"
    content = Column(Text, default="")
    model = Column(String, default="")
    fallback = Column(Boolean, default=False)
    duration_ms = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    investigation = relationship("InvestigationRow", back_populates="followups")


# ── Workflows feature (Phase 1: templates only; runs added in Phase 2) ──

class WorkflowRow(Base):
    __tablename__ = "workflows"

    id = Column(String, primary_key=True, index=True)  # uuid4 hex
    # NULL deal_id = built-in template, visible across all deals.
    deal_id = Column(String, ForeignKey("deals.deal_id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    type = Column(String, nullable=False)  # "assistant" | "tabular"
    row_source = Column(String, default="one_doc_per_row")  # "one_doc_per_row" | "multi_doc_synthesis"
    output_format = Column(String, default="word")  # "word" | "markdown" | "excel"
    is_builtin = Column(Boolean, default=False, index=True)
    cloned_from = Column(String, ForeignKey("workflows.id", ondelete="SET NULL"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    stages = relationship(
        "WorkflowStageRow",
        back_populates="workflow",
        cascade="all, delete-orphan",
        order_by="WorkflowStageRow.order_index",
    )
    columns = relationship(
        "WorkflowColumnRow",
        back_populates="workflow",
        cascade="all, delete-orphan",
        order_by="WorkflowColumnRow.order_index",
    )
    variables = relationship(
        "WorkflowVariableRow",
        back_populates="workflow",
        cascade="all, delete-orphan",
    )


class WorkflowStageRow(Base):
    __tablename__ = "workflow_stages"

    id = Column(String, primary_key=True, index=True)
    workflow_id = Column(String, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True)
    order_index = Column(Integer, nullable=False)  # 1-indexed
    label = Column(String, nullable=False)
    prompt_md = Column(Text, default="")
    checkpoint = Column(Boolean, default=False)

    workflow = relationship("WorkflowRow", back_populates="stages")


class WorkflowColumnRow(Base):
    __tablename__ = "workflow_columns"

    id = Column(String, primary_key=True, index=True)
    workflow_id = Column(String, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True)
    order_index = Column(Integer, nullable=False)
    label = Column(String, nullable=False)
    prompt = Column(Text, default="")
    format = Column(String, default="text")  # ColumnFormat enum, mirrors frontend matrixColumnConfig
    tags_json = Column(Text, default="null")  # JSON-encoded list[str] | null (for tag format)
    is_derived = Column(Boolean, default=False)
    formula = Column(Text, nullable=True)

    workflow = relationship("WorkflowRow", back_populates="columns")

    @property
    def tags(self) -> list[str] | None:
        try:
            value = json.loads(self.tags_json) if self.tags_json else None
        except (TypeError, ValueError):
            return None
        return value if isinstance(value, list) else None

    @tags.setter
    def tags(self, value: list[str] | None):
        self.tags_json = json.dumps(value)


class WorkflowVariableRow(Base):
    __tablename__ = "workflow_variables"

    id = Column(String, primary_key=True, index=True)
    workflow_id = Column(String, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True)
    key = Column(String, nullable=False)
    default_value = Column(Text, nullable=True)

    workflow = relationship("WorkflowRow", back_populates="variables")


# ── Workflow runs (Phase 2: tabular execution) ──

class WorkflowRunRow(Base):
    __tablename__ = "workflow_runs"

    id = Column(String, primary_key=True, index=True)  # uuid4 hex
    workflow_id = Column(String, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True)
    deal_id = Column(String, ForeignKey("deals.deal_id", ondelete="CASCADE"), nullable=False, index=True)
    run_number = Column(Integer, nullable=False)  # auto-assigned per workflow at create time
    status = Column(String, default="pending", index=True)  # pending|running|checkpoint|complete|cancelled|error
    document_ids_json = Column(Text, default="[]")  # JSON list of doc_ids selected for this run
    started_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    cells = relationship(
        "TabularCellRow",
        back_populates="run",
        cascade="all, delete-orphan",
    )
    stage_outputs = relationship(
        "AssistantStageOutputRow",
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="AssistantStageOutputRow.order_index",
    )


class TabularCellRow(Base):
    __tablename__ = "tabular_cells"

    id = Column(String, primary_key=True, index=True)
    run_id = Column(String, ForeignKey("workflow_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    # `row_key` is doc_id today (one_doc_per_row); future: synthesis_question_id.
    row_key = Column(String, nullable=False, index=True)
    column_id = Column(String, ForeignKey("workflow_columns.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String, default="queued", index=True)  # queued|running|complete|error
    answer = Column(Text, default="")
    answer_formatted_json = Column(Text, default="null")  # parsed value per column format, JSON
    citations_json = Column(Text, default="[]")  # list of Citation dicts
    model = Column(String, default="")
    fallback = Column(Boolean, default=False)
    duration_ms = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    run = relationship("WorkflowRunRow", back_populates="cells")


# ── Assistant stage outputs (Phase 3: assistant execution + checkpoints) ──

class AssistantStageOutputRow(Base):
    __tablename__ = "assistant_stage_outputs"

    id = Column(String, primary_key=True, index=True)
    run_id = Column(String, ForeignKey("workflow_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    # stage_id is a snapshot pointer; if the workflow's stages are edited mid-run
    # we still want to keep the run intact, hence SET NULL not CASCADE.
    stage_id = Column(String, ForeignKey("workflow_stages.id", ondelete="SET NULL"), nullable=True, index=True)
    order_index = Column(Integer, nullable=False)  # snapshot from stage at run-start
    label = Column(String, nullable=False)  # snapshot
    prompt_md = Column(Text, default="")  # snapshot of the prompt that ran
    checkpoint = Column(Boolean, default=False)  # snapshot
    status = Column(String, default="queued", index=True)  # queued|running|checkpoint|complete|error
    output_md = Column(Text, default="")  # raw LLM output (cleaned of citation markers)
    edited_md = Column(Text, nullable=True)  # analyst-edited version supplied at approve time
    citations_json = Column(Text, default="[]")
    model = Column(String, default="")
    fallback = Column(Boolean, default=False)
    duration_ms = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    approved_at = Column(DateTime, nullable=True)

    run = relationship("WorkflowRunRow", back_populates="stage_outputs")


def init_db():
    """Create all tables if they don't exist."""
    Base.metadata.create_all(bind=engine)
    _ensure_document_cache_columns()


def _ensure_document_cache_columns():
    """Add cache columns for existing SQLite databases.

    SQLAlchemy's create_all creates missing tables but does not alter existing
    ones. Vyntic does not have migrations yet, so keep this one additive schema
    compatibility shim close to init_db().
    """
    inspector = inspect(engine)
    if "documents" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("documents")}
    if "full_text_md" in existing:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE documents ADD COLUMN full_text_md TEXT"))


def get_db() -> Session:
    """Get a database session. Caller must close it."""
    return SessionLocal()
