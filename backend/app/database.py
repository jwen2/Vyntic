"""
SQLAlchemy database setup.
Uses SQLite for local/PoC — swap connection string to PostgreSQL for production.
"""
import json
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Integer, Float, Text, Boolean, DateTime, ForeignKey, event, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker, relationship, Session

from app.config import settings

engine = create_engine(
    settings.database_url,
    echo=False,
)

if engine.dialect.name == "sqlite":
    # SQLite ships with foreign-key enforcement OFF per connection; without
    # this pragma every ondelete="CASCADE" in the schema is silently inert.
    # WAL lets concurrent readers proceed during executor writes.
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class ManagerRow(Base):
    """A GP firm (fund manager). Funds — DealRow with entity_type="fund" —
    reference it via manager_id. Manager-scoped documents (DDQs, Form ADV,
    reference notes) are uploaded to a fund but shared across all funds of
    the same manager via DocumentRow.scope="manager"."""
    __tablename__ = "managers"

    manager_id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    tags_json = Column(Text, default="[]")
    created_at = Column(DateTime, default=datetime.utcnow)

    funds = relationship("DealRow", back_populates="manager")

    @property
    def tags(self) -> list[str]:
        return json.loads(self.tags_json) if self.tags_json else []

    @tags.setter
    def tags(self, value: list[str]):
        self.tags_json = json.dumps(value)


class DealRow(Base):
    """The workspace entity. Historically a buyout deal; with the LP object
    model it also represents a fund (entity_type="fund") that belongs to a
    manager. deal_id stays the universal key for documents, workflows, runs,
    access rows, and vector collections."""
    __tablename__ = "deals"

    deal_id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    document_count = Column(Integer, default=0)
    stage = Column(String, default="Screening")
    tags_json = Column(Text, default="[]")  # JSON-encoded list; use Postgres ARRAY later
    entity_type = Column(String, default="deal", index=True)  # "deal" | "fund"
    manager_id = Column(String, ForeignKey("managers.manager_id", ondelete="SET NULL"), nullable=True, index=True)
    vintage = Column(Integer, nullable=True)  # fund vintage year
    strategy = Column(String, default="")  # e.g. "Buyout", "Growth", "Secondaries"

    documents = relationship("DocumentRow", back_populates="deal", cascade="all, delete-orphan")
    manager = relationship("ManagerRow", back_populates="funds")
    position = relationship("PositionRow", back_populates="deal", uselist=False, cascade="all, delete-orphan")


class PositionRow(Base):
    """The LP's own commitment in a fund. One row per fund (single-LP tenant).
    Sparse by design — fields fill in as diligence converts to a commitment
    and, later, as monitoring extracts update them."""
    __tablename__ = "positions"

    deal_id = Column(String, ForeignKey("deals.deal_id", ondelete="CASCADE"), primary_key=True)
    commitment_amount = Column(Float, nullable=True)
    currency = Column(String, default="USD")
    # Opening balances = the called/distributed totals from BEFORE Vyntic began
    # processing notices for this fund. The queue of confirmed capital-call /
    # distribution notices adds on top (called = opening_called + Σ notices), so
    # a mid-life commitment ties out without back-loading years of history.
    opening_called = Column(Float, nullable=True)
    opening_distributed = Column(Float, nullable=True)
    called_amount = Column(Float, nullable=True)
    distributed_amount = Column(Float, nullable=True)
    nav = Column(Float, nullable=True)
    as_of = Column(String, nullable=True)  # e.g. "2026-Q1"
    status = Column(String, default="active")  # "active" | "exited" | "pending"
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    deal = relationship("DealRow", back_populates="position")


class CallNoticeRow(Base):
    """A processed capital-call or distribution notice for a fund. The queue of
    these rows is the source of truth for the fund's called/distributed totals
    (the position roll-up recomputes from confirmed rows, never blind-increments)."""
    __tablename__ = "call_notices"

    id = Column(String, primary_key=True, index=True)
    deal_id = Column(String, ForeignKey("deals.deal_id", ondelete="CASCADE"), nullable=False, index=True)
    doc_id = Column(String, ForeignKey("documents.doc_id", ondelete="SET NULL"), nullable=True)
    kind = Column(String, default="call")  # "call" | "distribution"
    amount = Column(Float, nullable=True)
    currency = Column(String, default="USD")
    due_date = Column(String, nullable=True)  # ISO "2026-08-14" (pay/record date for distributions)
    period = Column(String, nullable=True)  # "2026-Q3"
    purpose = Column(Text, default="")
    status = Column(String, default="pending", index=True)  # pending|confirmed|paid|dismissed
    outstanding_before = Column(Float, nullable=True)  # unfunded implied at notice time
    citations_json = Column(Text, default="[]")
    extracted_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SideLetterObligationRow(Base):
    """One obligation extracted from a fund's side letter. Verified each quarter
    against the reporting package via SideLetterCheckRow."""
    __tablename__ = "side_letter_obligations"

    id = Column(String, primary_key=True, index=True)
    deal_id = Column(String, ForeignKey("deals.deal_id", ondelete="CASCADE"), nullable=False, index=True)
    doc_id = Column(String, ForeignKey("documents.doc_id", ondelete="SET NULL"), nullable=True)
    category = Column(String, default="other")  # fee|mfn|coinvest|reporting|transfer|excuse|regulatory|other
    text = Column(Text, default="")
    section_ref = Column(String, default="")
    cadence = Column(String, default="ongoing")  # "ongoing" | "one_time"
    verify_hint = Column(Text, default="")  # "what to check each quarter"
    citations_json = Column(Text, default="[]")
    status = Column(String, default="active")  # "active" | "waived" | "archived"
    created_at = Column(DateTime, default=datetime.utcnow)

    checks = relationship("SideLetterCheckRow", back_populates="obligation", cascade="all, delete-orphan")


class SideLetterCheckRow(Base):
    """One verification of one obligation against one reporting period. Created
    as a proposal (confirmed_at NULL) by the LLM; an analyst confirms/overrides.
    The model's original proposal is retained in llm_verdict when overridden."""
    __tablename__ = "side_letter_checks"

    id = Column(String, primary_key=True, index=True)
    obligation_id = Column(String, ForeignKey("side_letter_obligations.id", ondelete="CASCADE"), nullable=False, index=True)
    period = Column(String, nullable=False)  # "2026-Q2"
    verdict = Column(String, default="unclear")  # compliant|breach|unclear
    llm_verdict = Column(String, nullable=True)  # model's original proposal
    rationale = Column(Text, default="")
    citations_json = Column(Text, default="[]")
    confirmed_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    confirmed_at = Column(DateTime, nullable=True)  # NULL = proposed, awaiting confirmation
    created_at = Column(DateTime, default=datetime.utcnow)

    obligation = relationship("SideLetterObligationRow", back_populates="checks")


class DocumentRow(Base):
    __tablename__ = "documents"

    doc_id = Column(String, primary_key=True, index=True)
    deal_id = Column(String, ForeignKey("deals.deal_id", ondelete="CASCADE"), nullable=False)
    filename = Column(String, nullable=False)
    page_count = Column(Integer, default=0)
    chunk_count = Column(Integer, default=0)
    full_text_md = Column(Text, nullable=True)
    parse_tier = Column(Integer, default=1)
    # LP document classification. doc_category powers template pre-selection
    # and the future monitoring inbox; period ("2026-Q1") tags recurring docs;
    # scope="manager" shares the doc across sibling funds of the same manager.
    doc_category = Column(String, default="other", index=True)
    period = Column(String, nullable=True)
    scope = Column(String, default="entity", index=True)  # "entity" | "manager"

    deal = relationship("DealRow", back_populates="documents")


class IngestJobRow(Base):
    __tablename__ = "ingest_jobs"

    id = Column(String, primary_key=True, index=True)  # upload_id from the client
    deal_id = Column(String, ForeignKey("deals.deal_id", ondelete="CASCADE"), nullable=False, index=True)
    # Batch uploads: one aggregate row per client upload_id (the row the
    # frontend polls) plus one claimable child row per file pointing at it.
    parent_id = Column(String, nullable=True, index=True)
    # Aggregate rows only: how many children the batch will have. Written
    # before the children are enqueued so a fast worker can't see a
    # partially-enqueued batch as finished.
    child_total = Column(Integer, nullable=True)
    filename = Column(String, nullable=True)  # batch uploads carry a summary label
    file_path = Column(String, nullable=True)
    status = Column(String, default="queued", index=True)  # queued|parsing|embedding|complete|error
    stage = Column(String, default="")
    percent = Column(Integer, default=0)
    detail = Column(Text, default="")
    doc_id = Column(String, nullable=True)
    # Classification the upload was submitted with; workers rebuild the
    # ingest call from this row, so it must survive the queue.
    doc_category = Column(String, default="other")
    period = Column(String, nullable=True)
    scope = Column(String, default="entity")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Audit log (Plan 2, S4) ──

class AuditLogRow(Base):
    """Append-only record of security-relevant actions. Deliberately no
    foreign keys: rows must survive deletion of the user or deal they
    reference, and user_email is denormalized so offboarded users stay
    identifiable. There is no update/delete path anywhere in the app."""
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=True, index=True)
    user_email = Column(String, default="")
    action = Column(String, nullable=False, index=True)  # e.g. "auth.login", "deal.delete"
    resource_type = Column(String, default="")  # "deal" | "document" | "run" | "user" | ...
    resource_id = Column(String, default="")
    deal_id = Column(String, nullable=True, index=True)
    ip = Column(String, default="")
    user_agent = Column(String, default="")
    metadata_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    @property
    def meta(self) -> dict:
        try:
            value = json.loads(self.metadata_json) if self.metadata_json else {}
        except (TypeError, ValueError):
            return {}
        return value if isinstance(value, dict) else {}


# ── Authentication models ──

class RevokedTokenRow(Base):
    """JWT blocklist (Plan 2, S5). A row means the token with this jti was
    revoked (logout / offboarding) before its natural expiry. Rows past
    expires_at are pruned opportunistically on each revocation."""
    __tablename__ = "revoked_tokens"

    jti = Column(String, primary_key=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, default=datetime.utcnow)


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


# ── Workflows feature (Phase 1: templates only; runs added in Phase 2) ──
#
# NOTE: the "investigations" and "investigation_followups" tables backed the
# retired multi-step Agent workspace. The ORM classes were removed when the
# feature was retired (PR #76, follow-up: this PR). Existing tables in older
# databases remain orphaned and harmless — drop them manually if you want:
#   DROP TABLE IF EXISTS investigation_followups;
#   DROP TABLE IF EXISTS investigations;

class WorkflowRow(Base):
    __tablename__ = "workflows"

    id = Column(String, primary_key=True, index=True)  # uuid4 hex
    # NULL deal_id = built-in template, visible across all deals.
    deal_id = Column(String, ForeignKey("deals.deal_id", ondelete="CASCADE"), nullable=True, index=True)
    entity_type = Column(String, default="deal", index=True)  # "deal" | "fund"
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


# ── Brief work-product (Plan F3.4, D2) ──
#
# Findings (analyst validate/reject + notes) and brief field overrides were
# client-side localStorage. They're analyst work-product, so they live here now:
# one JSON blob per deal, matching how the client reads/writes the whole
# collection. The blobs are opaque to the backend — the Finding shape stays
# frontend-owned. Both CASCADE-delete with the deal.

class DealFindingRow(Base):
    __tablename__ = "deal_findings"

    deal_id = Column(String, ForeignKey("deals.deal_id", ondelete="CASCADE"), primary_key=True)
    findings_json = Column(Text, default="[]")  # JSON list of Finding dicts (frontend-owned shape)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BriefOverrideRow(Base):
    __tablename__ = "brief_overrides"

    deal_id = Column(String, ForeignKey("deals.deal_id", ondelete="CASCADE"), primary_key=True)
    overrides_json = Column(Text, default="{}")  # JSON {panelKey: {label: value}}
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LLMCallRow(Base):
    """One row per LLM call, for token/cost accounting.

    Deliberately has no FK to deals: metrics are the cost record and must
    survive deal deletion. New table, so create_all handles it — no
    migration shim needed (invariant 3).
    """
    __tablename__ = "llm_calls"

    id = Column(String, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    surface = Column(String, nullable=False, index=True)
    deal_id = Column(String, nullable=True, index=True)
    run_id = Column(String, nullable=True, index=True)
    cell_id = Column(String, nullable=True)
    # Set only where exactly one document is unambiguously in scope. Stored
    # denormalized on purpose: the per-document token multiplier is the number
    # this instrumentation exists to measure, and deriving it via
    # cell_id -> cell.row_key stops working the moment a deal is deleted —
    # which is precisely the case this table has no FK in order to survive.
    doc_id = Column(String, nullable=True, index=True)
    model = Column(String, default="")
    fallback = Column(Boolean, default=False)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    cached_tokens = Column(Integer, default=0)
    duration_ms = Column(Integer, default=0)
    # "ok" | "error" | "aborted" — was this call actually billed? Recording
    # happens unconditionally in llm.py's finally block, so without this a
    # failed or abandoned call is indistinguishable from a completed one and
    # call_count silently over-counts. Deliberately NOT derived from
    # LLMCallMeta.error, which is also set on a successful fallback.
    outcome = Column(String, default="error", index=True)


def init_db():
    """Create all tables if they don't exist."""
    Base.metadata.create_all(bind=engine)
    _ensure_schema_migrations()


def _ensure_schema_migrations():
    """Apply additive column migrations for databases predating a schema change.

    SQLAlchemy create_all creates missing tables but does not ALTER existing ones.
    Each entry maps a table to the columns (and their ADD COLUMN DDL) added
    post-initial-deploy. Idempotent: only missing columns are added.
    """
    additive_columns: dict[str, list[tuple[str, str]]] = {
        "documents": [
            ("full_text_md", "TEXT"),
            ("parse_tier", "INTEGER DEFAULT 1"),
            ("doc_category", "TEXT DEFAULT 'other'"),
            ("period", "TEXT"),
            ("scope", "TEXT DEFAULT 'entity'"),
        ],
        "deals": [
            ("entity_type", "TEXT DEFAULT 'deal'"),
            ("manager_id", "TEXT"),
            ("vintage", "INTEGER"),
            ("strategy", "TEXT DEFAULT ''"),
        ],
        "ingest_jobs": [
            ("doc_category", "TEXT DEFAULT 'other'"),
            ("period", "TEXT"),
            ("scope", "TEXT DEFAULT 'entity'"),
        ],
        "workflows": [
            ("entity_type", "TEXT DEFAULT 'deal'"),
        ],
        "positions": [
            ("opening_called", "REAL"),
            ("opening_distributed", "REAL"),
        ],
        # llm_calls is a new table, so create_all covers a fresh DB. These
        # columns were added after the table shipped, so any DB that already
        # ran init_db against the first version needs the ALTER.
        "llm_calls": [
            ("outcome", "TEXT DEFAULT 'error'"),
            ("doc_id", "TEXT"),
        ],
    }
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, columns in additive_columns.items():
            if table not in table_names:
                continue
            existing = {column["name"] for column in inspector.get_columns(table)}
            for column_name, ddl_type in columns:
                if column_name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column_name} {ddl_type}"))


def get_db() -> Session:
    """Get a database session. Caller must close it."""
    return SessionLocal()
