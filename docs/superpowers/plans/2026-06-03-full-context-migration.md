# Full-Context Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ChromaDB top-k retrieval with full-document reads from `full_text_md`, fix the 3-tier parsing cascade so that column is actually populated on ingest, and switch the deployment to Railway + Postgres.

**Architecture:** A new `context_provider.py` acts as the single retrieval abstraction for all 5 RAG call sites. A `full_context_mode` config flag routes calls through the full-text path (default) or falls back to the RAG path without any code changes. The RAG code (vector_store, embedder, chunker) stays in place but becomes unreachable at runtime.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy 2, Pydantic v2, PyMuPDF (`pymupdf`), Azure AI Form Recognizer (`azure-ai-formrecognizer`), psycopg2-binary, Railway

---

## File Map

**Phase 1 — Full-context query path**

| File | Action | Responsibility |
|---|---|---|
| `app/config.py` | Modify | Add `full_context_mode` flag |
| `app/services/context_provider.py` | Create | Central retrieval abstraction |
| `app/agents/single_deal_qa.py` | Modify | Swap RAG imports → context_provider |
| `app/api/routes_stream.py` | Modify | Swap RAG import → context_provider |
| `app/api/routes_doc_matrix.py` | Modify | Swap RAG imports → context_provider |
| `app/services/workflow_run_executor.py` | Modify | Swap RAG imports → context_provider |
| `tests/test_context_provider.py` | Create | Unit tests for context_provider |

**Phase 2 — Ingest pipeline**

| File | Action | Responsibility |
|---|---|---|
| `app/models/document.py` | Modify | Add `full_text_md` + `parse_tier` to `DocumentMetadata` |
| `app/database.py` | Modify | Add `parse_tier` column to `DocumentRow` + extend schema migration |
| `app/services/deal_store.py` | Modify | Write `full_text_md` + `parse_tier` in `add_document` |
| `app/services/parser.py` | Modify | `_pages_to_full_text_md`, PyMuPDF tier, Azure DI tier, cascade |
| `app/api/routes_ingest.py` | Modify | Skip embed step when `full_context_mode=True`, update progress labels |
| `tests/test_parser_cascade.py` | Create | Unit tests for the 3-tier cascade |
| `tests/test_ingest_full_context.py` | Create | Integration test for ingest skipping embed |

**Phase 3 — Railway deployment**

| File | Action | Responsibility |
|---|---|---|
| `app/database.py` | Modify | Remove SQLite `connect_args`, fix schema migration name |
| `requirements.txt` | Modify | Add `pymupdf`, `azure-ai-formrecognizer`, `psycopg2-binary` |
| `railway.toml` | Create | Railway build + deploy config |

---

## Phase 1 — Full-context query path

### Task 1: Config flag

**Files:**
- Modify: `backend/app/config.py`

- [ ] **Step 1: Add `full_context_mode` field to Settings**

Open `backend/app/config.py`. Add the new field after the `seed_sample_data` flag:

```python
    # Feature flags
    seed_sample_data: bool = True
    full_context_mode: bool = True
```

- [ ] **Step 2: Verify the app still starts**

```bash
cd backend
python -c "from app.config import settings; print(settings.full_context_mode)"
```

Expected output: `True`

- [ ] **Step 3: Commit**

```bash
git add backend/app/config.py
git commit -m "feat: add full_context_mode config flag"
```

---

### Task 2: `context_provider.py` — page splitting and page-chunk helpers

**Files:**
- Create: `backend/app/services/context_provider.py`
- Create: `backend/tests/test_context_provider.py`

- [ ] **Step 1: Write failing tests for `_full_text_to_chunks`**

Create `backend/tests/test_context_provider.py`:

```python
import pytest
from app.services.context_provider import _full_text_to_chunks, _pages_to_chunks_from_null


def test_full_text_to_chunks_splits_on_page_headers():
    full_text = "## Page 1\n\nRevenue was $10m.\n\n## Page 2\n\nCost of goods sold was $3m."
    chunks = _full_text_to_chunks(full_text, "report.pdf", "doc_abc")

    assert len(chunks) == 2
    assert chunks[0]["page"] == 1
    assert chunks[0]["content"] == "Revenue was $10m."
    assert chunks[0]["source_file"] == "report.pdf"
    assert chunks[0]["doc_id"] == "doc_abc"
    assert chunks[0]["score"] == 1.0
    assert chunks[0]["section_type"] == "text"

    assert chunks[1]["page"] == 2
    assert "Cost of goods sold" in chunks[1]["content"]


def test_full_text_to_chunks_skips_empty_pages():
    full_text = "## Page 1\n\n\n\n## Page 2\n\nSome content."
    chunks = _full_text_to_chunks(full_text, "report.pdf", "doc_abc")

    assert len(chunks) == 1
    assert chunks[0]["page"] == 2


def test_full_text_to_chunks_handles_single_page():
    full_text = "## Page 5\n\nIncome statement."
    chunks = _full_text_to_chunks(full_text, "fin.pdf", "doc_xyz")

    assert len(chunks) == 1
    assert chunks[0]["page"] == 5


def test_full_text_to_chunks_returns_empty_for_blank_input():
    assert _full_text_to_chunks("", "f.pdf", "d") == []
    assert _full_text_to_chunks("   ", "f.pdf", "d") == []


def test_pages_to_chunks_from_null_returns_empty():
    # When full_text_md is None and ChromaDB fallback is not available
    result = _pages_to_chunks_from_null()
    assert result == []
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
python -m pytest tests/test_context_provider.py -v 2>&1 | head -30
```

Expected: ImportError — `context_provider` doesn't exist yet.

- [ ] **Step 3: Create `context_provider.py` with the helpers**

Create `backend/app/services/context_provider.py`:

```python
"""Context provider: unified retrieval abstraction for full-context and RAG query paths.

When full_context_mode=True, reads full_text_md from the documents table and returns
all pages as chunk dicts in the same shape the RAG path returned. Downstream citation
logic (build_context_string, extract_citations, CONTEXT_TEMPLATE) is unchanged.

When full_context_mode=False, delegates to the original vector_store functions via
deferred imports so the RAG path is never touched.
"""
import logging
import re

from app.config import settings
from app.database import SessionLocal, DocumentRow

logger = logging.getLogger(__name__)

_FC_TOKEN_WARN_THRESHOLD = 800_000  # ~800K tokens; Gemini Flash limit is 1M


def _full_text_to_chunks(full_text_md: str, filename: str, doc_id: str) -> list[dict]:
    """Split full_text_md on '## Page N' headers into per-page chunk dicts."""
    if not full_text_md or not full_text_md.strip():
        return []

    # Split before each ## Page N header, keeping the header in the segment
    segments = re.split(r"(?=## Page \d+)", full_text_md)
    chunks = []
    for seg in segments:
        seg = seg.strip()
        if not seg:
            continue
        page_match = re.match(r"## Page (\d+)", seg)
        page_num = int(page_match.group(1)) if page_match else 0
        content = re.sub(r"^## Page \d+\n?", "", seg).strip()
        if not content:
            continue
        chunks.append({
            "content": content,
            "source_file": filename,
            "page": page_num,
            "doc_id": doc_id,
            "score": 1.0,
            "section_type": "text",
        })
    return chunks


def _pages_to_chunks_from_null() -> list[dict]:
    """Placeholder for null full_text_md. ChromaDB fallback removed for MVP."""
    return []
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
python -m pytest tests/test_context_provider.py::test_full_text_to_chunks_splits_on_page_headers tests/test_context_provider.py::test_full_text_to_chunks_skips_empty_pages tests/test_context_provider.py::test_full_text_to_chunks_handles_single_page tests/test_context_provider.py::test_full_text_to_chunks_returns_empty_for_blank_input tests/test_context_provider.py::test_pages_to_chunks_from_null_returns_empty -v
```

Expected: All 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/context_provider.py backend/tests/test_context_provider.py
git commit -m "feat: add context_provider page-splitting helpers"
```

---

### Task 3: `context_provider.py` — load_doc_context, load_deal_context, get_doc_page_chunks

**Files:**
- Modify: `backend/app/services/context_provider.py`
- Modify: `backend/tests/test_context_provider.py`

- [ ] **Step 1: Add tests for the public functions**

Append to `backend/tests/test_context_provider.py`:

```python
import asyncio
from unittest.mock import MagicMock, patch
from app.services.context_provider import load_doc_context, load_deal_context, get_doc_page_chunks


def _make_doc_row(doc_id, filename, full_text_md):
    row = MagicMock()
    row.doc_id = doc_id
    row.deal_id = "deal_1"
    row.filename = filename
    row.full_text_md = full_text_md
    return row


def test_load_doc_context_returns_chunks_from_full_text(monkeypatch):
    monkeypatch.setattr("app.services.context_provider.settings.full_context_mode", True)
    row = _make_doc_row("doc_1", "report.pdf", "## Page 1\n\nRevenue was $10m.")

    db_mock = MagicMock()
    db_mock.query.return_value.filter.return_value.first.return_value = row

    with patch("app.services.context_provider.SessionLocal", return_value=db_mock):
        result = asyncio.run(load_doc_context("deal_1", "doc_1", "What is revenue?"))

    assert len(result) == 1
    assert result[0]["page"] == 1
    assert "Revenue" in result[0]["content"]


def test_load_doc_context_returns_empty_when_doc_not_found(monkeypatch):
    monkeypatch.setattr("app.services.context_provider.settings.full_context_mode", True)
    db_mock = MagicMock()
    db_mock.query.return_value.filter.return_value.first.return_value = None

    with patch("app.services.context_provider.SessionLocal", return_value=db_mock):
        result = asyncio.run(load_doc_context("deal_1", "missing_doc", "question"))

    assert result == []


def test_load_doc_context_returns_empty_when_full_text_md_null(monkeypatch):
    monkeypatch.setattr("app.services.context_provider.settings.full_context_mode", True)
    row = _make_doc_row("doc_1", "report.pdf", None)
    db_mock = MagicMock()
    db_mock.query.return_value.filter.return_value.first.return_value = row

    with patch("app.services.context_provider.SessionLocal", return_value=db_mock):
        result = asyncio.run(load_doc_context("deal_1", "doc_1", "question"))

    assert result == []


def test_load_deal_context_concatenates_all_docs(monkeypatch):
    monkeypatch.setattr("app.services.context_provider.settings.full_context_mode", True)
    rows = [
        _make_doc_row("doc_1", "cim.pdf", "## Page 1\n\nRevenue was $10m."),
        _make_doc_row("doc_2", "mgmt.pdf", "## Page 1\n\nCEO has 10 years experience."),
    ]
    db_mock = MagicMock()
    db_mock.query.return_value.filter.return_value.all.return_value = rows

    with patch("app.services.context_provider.SessionLocal", return_value=db_mock):
        result = asyncio.run(load_deal_context("deal_1", "What is revenue?"))

    assert len(result) == 2
    source_files = {c["source_file"] for c in result}
    assert source_files == {"cim.pdf", "mgmt.pdf"}


def test_get_doc_page_chunks_returns_chunks_from_full_text(monkeypatch):
    monkeypatch.setattr("app.services.context_provider.settings.full_context_mode", True)
    row = _make_doc_row("doc_1", "report.pdf", "## Page 3\n\nSome content.")
    db_mock = MagicMock()
    db_mock.query.return_value.filter.return_value.first.return_value = row

    with patch("app.services.context_provider.SessionLocal", return_value=db_mock):
        chunks = get_doc_page_chunks("deal_1", "doc_1")

    assert len(chunks) == 1
    assert chunks[0]["page"] == 3
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd backend
python -m pytest tests/test_context_provider.py::test_load_doc_context_returns_chunks_from_full_text -v 2>&1 | head -15
```

Expected: ImportError — functions don't exist yet.

- [ ] **Step 3: Implement the public functions in `context_provider.py`**

Append to `backend/app/services/context_provider.py`:

```python

async def load_doc_context(deal_id: str, doc_id: str, question: str) -> list[dict]:
    """Load context for a single-document question.

    Full-context path: reads full_text_md from DB, returns all pages as chunk dicts.
    RAG fallback: delegates to vector_store.query_document when full_context_mode=False.
    """
    if not settings.full_context_mode:
        from app.services.vector_store import query_document
        return await query_document(deal_id, doc_id, question)

    db = SessionLocal()
    try:
        row = db.query(DocumentRow).filter(
            DocumentRow.doc_id == doc_id,
            DocumentRow.deal_id == deal_id,
        ).first()
    finally:
        db.close()

    if not row:
        return []
    if not row.full_text_md:
        logger.warning("full_text_md is null for doc %s — no context available", doc_id)
        return _pages_to_chunks_from_null()
    return _full_text_to_chunks(row.full_text_md, row.filename, row.doc_id)


async def load_deal_context(deal_id: str, question: str) -> list[dict]:
    """Load context for a deal-level question across all documents.

    Full-context path: concatenates full_text_md from all docs in the deal.
    RAG fallback: delegates to vector_store.query_deal when full_context_mode=False.
    """
    if not settings.full_context_mode:
        from app.services.vector_store import query_deal
        return await query_deal(deal_id, question)

    db = SessionLocal()
    try:
        rows = db.query(DocumentRow).filter(DocumentRow.deal_id == deal_id).all()
    finally:
        db.close()

    if not rows:
        return []

    chunks = []
    total_chars = 0
    for row in rows:
        if row.full_text_md:
            doc_chunks = _full_text_to_chunks(row.full_text_md, row.filename, row.doc_id)
        else:
            logger.warning("full_text_md is null for doc %s in deal %s", row.doc_id, deal_id)
            doc_chunks = _pages_to_chunks_from_null()
        chunks.extend(doc_chunks)
        total_chars += sum(len(c["content"]) for c in doc_chunks)

    estimated_tokens = total_chars / 4
    if estimated_tokens > _FC_TOKEN_WARN_THRESHOLD:
        logger.warning(
            "Deal %s context is ~%dK tokens — approaching Gemini Flash 1M limit",
            deal_id,
            int(estimated_tokens / 1000),
        )
    return chunks


def get_doc_page_chunks(deal_id: str, doc_id: str) -> list[dict]:
    """Return all page chunks for citation snippet enrichment.

    In full-context mode, reconstructs from full_text_md (all pages already available).
    In RAG mode, reads from ChromaDB via get_document_chunks.
    """
    if not settings.full_context_mode:
        from app.services.vector_store import get_document_chunks
        return get_document_chunks(deal_id, doc_id)

    db = SessionLocal()
    try:
        row = db.query(DocumentRow).filter(
            DocumentRow.doc_id == doc_id,
            DocumentRow.deal_id == deal_id,
        ).first()
    finally:
        db.close()

    if row and row.full_text_md:
        return _full_text_to_chunks(row.full_text_md, row.filename, row.doc_id)
    return []
```

- [ ] **Step 4: Run all context_provider tests**

```bash
cd backend
python -m pytest tests/test_context_provider.py -v
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/context_provider.py backend/tests/test_context_provider.py
git commit -m "feat: implement context_provider load_doc_context, load_deal_context, get_doc_page_chunks"
```

---

### Task 4: Update `single_deal_qa.py`

**Files:**
- Modify: `backend/app/agents/single_deal_qa.py`

- [ ] **Step 1: Swap imports**

In `backend/app/agents/single_deal_qa.py`, replace:

```python
from app.services.vector_store import query_deal, query_document
```

with:

```python
from app.services.context_provider import load_deal_context, load_doc_context
```

- [ ] **Step 2: Update `answer_deal_question`**

Replace:

```python
    retrieved = await query_deal(deal_id, question)
```

with:

```python
    retrieved = await load_deal_context(deal_id, question)
```

- [ ] **Step 3: Update `answer_document_question`**

Replace:

```python
    retrieved = await query_document(deal_id, doc_id, question)
```

with:

```python
    retrieved = await load_doc_context(deal_id, doc_id, question)
```

- [ ] **Step 4: Verify no import errors**

```bash
cd backend
python -c "from app.agents.single_deal_qa import answer_deal_question, answer_document_question; print('ok')"
```

Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add backend/app/agents/single_deal_qa.py
git commit -m "feat: swap single_deal_qa to use context_provider"
```

---

### Task 5: Update `routes_stream.py`

**Files:**
- Modify: `backend/app/api/routes_stream.py`

- [ ] **Step 1: Swap import**

In `backend/app/api/routes_stream.py`, replace:

```python
from app.services.vector_store import query_deal
```

with:

```python
from app.services.context_provider import load_deal_context
```

- [ ] **Step 2: Update `_stream_deal_answer`**

Replace:

```python
        retrieved = await query_deal(deal_id, question)
```

with:

```python
        retrieved = await load_deal_context(deal_id, question)
```

- [ ] **Step 3: Verify**

```bash
cd backend
python -c "from app.api.routes_stream import router; print('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/routes_stream.py
git commit -m "feat: swap routes_stream to use context_provider"
```

---

### Task 6: Update `routes_doc_matrix.py`

**Files:**
- Modify: `backend/app/api/routes_doc_matrix.py`

- [ ] **Step 1: Swap imports**

In `backend/app/api/routes_doc_matrix.py`, replace:

```python
from app.services.vector_store import query_document, get_document_chunks
```

with:

```python
from app.services.context_provider import load_doc_context, get_doc_page_chunks
```

- [ ] **Step 2: Update `_stream_doc_answer`**

Replace:

```python
        retrieved = await query_document(deal_id, doc_id, query)
```

with:

```python
        retrieved = await load_doc_context(deal_id, doc_id, query)
```

And replace:

```python
        full_doc_chunks = get_document_chunks(deal_id, doc_id)
```

with:

```python
        full_doc_chunks = get_doc_page_chunks(deal_id, doc_id)
```

- [ ] **Step 3: Verify**

```bash
cd backend
python -c "from app.api.routes_doc_matrix import router; print('ok')"
```

Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/routes_doc_matrix.py
git commit -m "feat: swap routes_doc_matrix to use context_provider"
```

---

### Task 7: Update `workflow_run_executor.py`

**Files:**
- Modify: `backend/app/services/workflow_run_executor.py`

- [ ] **Step 1: Swap imports**

In `backend/app/services/workflow_run_executor.py`, replace:

```python
from app.services.vector_store import get_document_chunks, query_document
```

with:

```python
from app.services.context_provider import get_doc_page_chunks, load_doc_context
```

- [ ] **Step 2: Update synthesis retrieval in `execute_cell`**

In `execute_cell`, the synthesis path calls `query_document` inside a loop. Replace:

```python
                    chunks = await query_document(
                        deal_id,
                        doc_id,
                        retrieval_query,
                        top_k=_TABULAR_DOC_TOP_K,
                    )
```

with:

```python
                    chunks = await load_doc_context(
                        deal_id,
                        doc_id,
                        retrieval_query,
                    )
```

Note: `load_doc_context` does not accept `top_k` — full-context mode returns all pages; in RAG fallback the top_k is handled internally by the vector_store default.

- [ ] **Step 3: Update per-doc retrieval in `execute_cell`**

Replace:

```python
            retrieved = await query_document(
                deal_id,
                doc_id,
                retrieval_query,
                top_k=_TABULAR_DOC_TOP_K,
            )
```

with:

```python
            retrieved = await load_doc_context(
                deal_id,
                doc_id,
                retrieval_query,
            )
```

- [ ] **Step 4: Update citation enrichment calls**

Replace:

```python
                full_doc_chunks.extend(get_document_chunks(deal_id, doc_id))
```

with:

```python
                full_doc_chunks.extend(get_doc_page_chunks(deal_id, doc_id))
```

And replace the non-synthesis path:

```python
                full_doc_chunks = get_document_chunks(deal_id, cell.row_key)
```

with:

```python
                full_doc_chunks = get_doc_page_chunks(deal_id, cell.row_key)
```

- [ ] **Step 5: Check for any remaining vector_store references in the executor**

```bash
grep -n "vector_store\|query_document\|get_document_chunks" backend/app/services/workflow_run_executor.py
```

Expected: No matches.

- [ ] **Step 6: Verify**

```bash
cd backend
python -c "from app.services.workflow_run_executor import execute_cell; print('ok')"
```

Expected: `ok`

- [ ] **Step 7: Run full test suite to verify Phase 1 is clean**

```bash
cd backend
python -m pytest tests/ -v --ignore=tests/manual_sweep_e2e.py 2>&1 | tail -20
```

Expected: All existing tests pass. (Tests that call RAG functions will still work since `full_context_mode=True` routes through context_provider, and the DB fixture sets up a real in-memory SQLite DB.)

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/workflow_run_executor.py
git commit -m "feat: swap workflow_run_executor to use context_provider — completes Phase 1"
```

---

## Phase 2 — Ingest pipeline

### Task 8: Model fields, DB column, and deal_store changes

**Files:**
- Modify: `backend/app/models/document.py`
- Modify: `backend/app/database.py`
- Modify: `backend/app/services/deal_store.py`
- Modify: `backend/tests/test_deal_store_documents.py`

- [ ] **Step 1: Write failing tests for new field behavior**

Append to `backend/tests/test_deal_store_documents.py`:

```python
def test_add_document_writes_full_text_md(sample_deal):
    from app.models.document import DocumentMetadata
    from app.services import deal_store
    from app.database import SessionLocal, DocumentRow

    deal_store.add_document(
        sample_deal.deal_id,
        DocumentMetadata(
            doc_id="doc-ft",
            deal_id=sample_deal.deal_id,
            filename="report.pdf",
            page_count=3,
            chunk_count=0,
            full_text_md="## Page 1\n\nSome content.",
            parse_tier=1,
        ),
    )

    db = SessionLocal()
    try:
        row = db.query(DocumentRow).filter(DocumentRow.doc_id == "doc-ft").first()
        assert row is not None
        assert row.full_text_md == "## Page 1\n\nSome content."
        assert row.parse_tier == 1
    finally:
        db.close()


def test_add_document_defaults_parse_tier_to_1(sample_deal):
    from app.models.document import DocumentMetadata
    from app.services import deal_store
    from app.database import SessionLocal, DocumentRow

    deal_store.add_document(
        sample_deal.deal_id,
        DocumentMetadata(
            doc_id="doc-def",
            deal_id=sample_deal.deal_id,
            filename="plain.pdf",
            page_count=1,
            chunk_count=0,
        ),
    )

    db = SessionLocal()
    try:
        row = db.query(DocumentRow).filter(DocumentRow.doc_id == "doc-def").first()
        assert row.parse_tier == 1
    finally:
        db.close()
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd backend
python -m pytest tests/test_deal_store_documents.py::test_add_document_writes_full_text_md -v 2>&1 | head -20
```

Expected: FAIL — `DocumentMetadata` doesn't accept `full_text_md` yet.

- [ ] **Step 3: Add fields to `DocumentMetadata`**

In `backend/app/models/document.py`, replace:

```python
class DocumentMetadata(BaseModel):
    doc_id: str
    deal_id: str
    filename: str
    page_count: int = 0
    chunk_count: int = 0
```

with:

```python
class DocumentMetadata(BaseModel):
    doc_id: str
    deal_id: str
    filename: str
    page_count: int = 0
    chunk_count: int = 0
    full_text_md: str | None = None
    parse_tier: int = 1
```

- [ ] **Step 4: Add `parse_tier` column to `DocumentRow`**

In `backend/app/database.py`, after `full_text_md = Column(Text, nullable=True)` on `DocumentRow`, add:

```python
    parse_tier = Column(Integer, default=1)
```

So `DocumentRow` now reads:

```python
    doc_id = Column(String, primary_key=True, index=True)
    deal_id = Column(String, ForeignKey("deals.deal_id", ondelete="CASCADE"), nullable=False)
    filename = Column(String, nullable=False)
    page_count = Column(Integer, default=0)
    chunk_count = Column(Integer, default=0)
    full_text_md = Column(Text, nullable=True)
    parse_tier = Column(Integer, default=1)
```

- [ ] **Step 5: Extend `_ensure_document_cache_columns` to cover `parse_tier`**

In `backend/app/database.py`, replace the entire `_ensure_document_cache_columns` function:

```python
def _ensure_document_cache_columns():
    """Add columns for databases predating the full-context migration.

    SQLAlchemy create_all creates missing tables but does not ALTER existing ones.
    This shim applies additive migrations for columns added post-initial-deploy.
    """
    inspector = inspect(engine)
    if "documents" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("documents")}
    with engine.begin() as conn:
        if "full_text_md" not in existing:
            conn.execute(text("ALTER TABLE documents ADD COLUMN full_text_md TEXT"))
        if "parse_tier" not in existing:
            conn.execute(text("ALTER TABLE documents ADD COLUMN parse_tier INTEGER DEFAULT 1"))
```

- [ ] **Step 6: Update `add_document` to write `full_text_md` and `parse_tier`**

In `backend/app/services/deal_store.py`, update the `add_document` function. In the `if row:` branch (updating existing), add:

```python
            row.full_text_md = doc.full_text_md
            row.parse_tier = doc.parse_tier
```

In the `else:` branch (new DocumentRow), add those fields to the constructor:

```python
            row = DocumentRow(
                doc_id=doc.doc_id,
                deal_id=deal_id,
                filename=doc.filename,
                page_count=doc.page_count,
                chunk_count=doc.chunk_count,
                full_text_md=doc.full_text_md,
                parse_tier=doc.parse_tier,
            )
```

The complete updated `add_document` function:

```python
def add_document(deal_id: str, doc: DocumentMetadata):
    db = SessionLocal()
    try:
        row = db.query(DocumentRow).filter(
            DocumentRow.deal_id == deal_id,
            DocumentRow.filename == doc.filename,
        ).first()
        if row:
            row.doc_id = doc.doc_id
            row.page_count = doc.page_count
            row.chunk_count = doc.chunk_count
            row.full_text_md = doc.full_text_md
            row.parse_tier = doc.parse_tier
        else:
            row = DocumentRow(
                doc_id=doc.doc_id,
                deal_id=deal_id,
                filename=doc.filename,
                page_count=doc.page_count,
                chunk_count=doc.chunk_count,
                full_text_md=doc.full_text_md,
                parse_tier=doc.parse_tier,
            )
            db.add(row)

        db.flush()
        deal_row = db.query(DealRow).filter(DealRow.deal_id == deal_id).first()
        if deal_row:
            deal_row.document_count = db.query(DocumentRow).filter(
                DocumentRow.deal_id == deal_id,
            ).count()
        db.commit()
    finally:
        db.close()
```

- [ ] **Step 7: Run the new tests**

```bash
cd backend
python -m pytest tests/test_deal_store_documents.py -v
```

Expected: All tests PASS, including the two new ones.

- [ ] **Step 8: Run full suite**

```bash
cd backend
python -m pytest tests/ -v --ignore=tests/manual_sweep_e2e.py 2>&1 | tail -20
```

Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add backend/app/models/document.py backend/app/database.py backend/app/services/deal_store.py backend/tests/test_deal_store_documents.py
git commit -m "feat: add full_text_md and parse_tier fields to DocumentMetadata and DocumentRow"
```

---

### Task 9: `parser.py` — `_pages_to_full_text_md` and PyMuPDF tier

**Files:**
- Modify: `backend/app/services/parser.py`
- Create: `backend/tests/test_parser_cascade.py`
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add `pymupdf` to requirements**

In `backend/requirements.txt`, add after the `openpyxl` line:

```
pymupdf>=1.23.0,<2.0
azure-ai-formrecognizer>=3.3.0,<4.0
```

- [ ] **Step 2: Write failing tests for `_pages_to_full_text_md`**

Create `backend/tests/test_parser_cascade.py`:

```python
"""Tests for the 3-tier parsing cascade and full-text markdown builder."""
import pytest
from pathlib import Path
from app.services.parser import _pages_to_full_text_md


def test_pages_to_full_text_md_basic():
    pages = [
        {"page_number": 1, "text": ["Revenue was $10m."], "tables": [], "has_table": False},
        {"page_number": 2, "text": ["EBITDA margin was 25%."], "tables": [], "has_table": False},
    ]
    result = _pages_to_full_text_md(pages)

    assert "## Page 1" in result
    assert "Revenue was $10m." in result
    assert "## Page 2" in result
    assert "EBITDA margin was 25%." in result


def test_pages_to_full_text_md_includes_tables():
    pages = [
        {
            "page_number": 3,
            "text": ["Summary"],
            "tables": ["| Metric | Value |\n| --- | --- |\n| ARR | $5m |"],
            "has_table": True,
        }
    ]
    result = _pages_to_full_text_md(pages)

    assert "## Page 3" in result
    assert "| ARR | $5m |" in result


def test_pages_to_full_text_md_skips_empty_pages():
    pages = [
        {"page_number": 1, "text": [], "tables": [], "has_table": False},
        {"page_number": 2, "text": ["Content here."], "tables": [], "has_table": False},
    ]
    result = _pages_to_full_text_md(pages)

    assert "## Page 1" not in result
    assert "## Page 2" in result


def test_pages_to_full_text_md_empty_input():
    assert _pages_to_full_text_md([]) == ""


def test_cascade_falls_back_to_pymupdf_when_docling_produces_short_text(monkeypatch, tmp_path):
    from app.services import parser

    pdf_path = tmp_path / "test.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")

    # Docling returns < 100 chars total
    def fake_docling(path, progress_callback=None):
        return [{"page_number": 1, "text": ["short"], "tables": [], "has_table": False}]

    pymupdf_called = []

    def fake_pymupdf(path):
        pymupdf_called.append(True)
        return [{"page_number": 1, "text": ["Full content from PyMuPDF."], "tables": [], "has_table": False}]

    monkeypatch.setattr(parser, "_convert_pdf_isolated_with_progress", fake_docling)
    monkeypatch.setattr(parser, "_pymupdf_parse_pdf", fake_pymupdf)
    monkeypatch.setattr(parser, "_count_pdf_pages", lambda _: 1)

    pages, tier = parser._parse_with_cascade(pdf_path)

    assert pymupdf_called, "PyMuPDF should have been called as fallback"
    assert tier == 2
    assert pages[0]["text"] == ["Full content from PyMuPDF."]


def test_cascade_uses_docling_when_it_succeeds(monkeypatch, tmp_path):
    from app.services import parser

    pdf_path = tmp_path / "test.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")

    docling_text = "A" * 200  # > 100 chars — success

    def fake_docling(path, progress_callback=None):
        return [{"page_number": 1, "text": [docling_text], "tables": [], "has_table": False}]

    pymupdf_called = []

    def fake_pymupdf(path):
        pymupdf_called.append(True)
        return []

    monkeypatch.setattr(parser, "_convert_pdf_isolated_with_progress", fake_docling)
    monkeypatch.setattr(parser, "_pymupdf_parse_pdf", fake_pymupdf)
    monkeypatch.setattr(parser, "_count_pdf_pages", lambda _: 1)

    pages, tier = parser._parse_with_cascade(pdf_path)

    assert not pymupdf_called, "PyMuPDF should not be called when Docling succeeds"
    assert tier == 1


def test_cascade_falls_back_to_pymupdf_when_docling_raises(monkeypatch, tmp_path):
    from app.services import parser

    pdf_path = tmp_path / "test.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")

    def fake_docling(path, progress_callback=None):
        raise RuntimeError("Docling crashed")

    pymupdf_called = []

    def fake_pymupdf(path):
        pymupdf_called.append(True)
        return [{"page_number": 1, "text": ["PyMuPDF content " * 20], "tables": [], "has_table": False}]

    monkeypatch.setattr(parser, "_convert_pdf_isolated_with_progress", fake_docling)
    monkeypatch.setattr(parser, "_pymupdf_parse_pdf", fake_pymupdf)
    monkeypatch.setattr(parser, "_count_pdf_pages", lambda _: 1)

    pages, tier = parser._parse_with_cascade(pdf_path)

    assert pymupdf_called
    assert tier == 2
```

- [ ] **Step 3: Run to verify they fail**

```bash
cd backend
python -m pytest tests/test_parser_cascade.py -v 2>&1 | head -30
```

Expected: Failures — `_pages_to_full_text_md`, `_parse_with_cascade`, `_pymupdf_parse_pdf` don't exist yet.

- [ ] **Step 4: Add `_pages_to_full_text_md` to `parser.py`**

In `backend/app/services/parser.py`, add this function after `_dedupe_pages`:

```python
def _pages_to_full_text_md(pages: list[dict]) -> str:
    """Convert raw pages dict list to the '## Page N' markdown format stored in full_text_md."""
    parts = []
    for page in pages:
        content_parts = []
        for text in page.get("text", []):
            if text and text.strip():
                content_parts.append(text.strip())
        for table in page.get("tables", []):
            if table and table.strip():
                content_parts.append(table.strip())
        if not content_parts:
            continue
        parts.append(f"## Page {page['page_number']}")
        parts.extend(content_parts)
    return "\n\n".join(parts)
```

- [ ] **Step 5: Add `_pymupdf_parse_pdf` to `parser.py`**

In `backend/app/services/parser.py`, add this function after `_pages_to_full_text_md`:

```python
def _pymupdf_parse_pdf(file_path: Path) -> list[dict]:
    """Parse PDF using PyMuPDF. Native text extraction only — no OCR.

    Returns pages in the same format as Docling (list of page dicts).
    Fast (~1s / 100 pages). Used as Tier 2 fallback.
    """
    import pymupdf

    pages = []
    doc = pymupdf.open(str(file_path))
    try:
        for page_index in range(len(doc)):
            page = doc[page_index]
            page_number = page_index + 1
            text = page.get_text("text")
            if text and text.strip():
                pages.append({
                    "page_number": page_number,
                    "text": [text.strip()],
                    "tables": [],
                    "has_table": False,
                })
    finally:
        doc.close()

    return pages
```

- [ ] **Step 6: Add `_parse_with_cascade` to `parser.py`**

Add this function after `_pymupdf_parse_pdf`:

```python
_FULL_TEXT_MIN_CHARS = 100


def _parse_with_cascade(
    file_path: Path,
    progress_callback: Callable[[float, str], None] | None = None,
) -> tuple[list[dict], int]:
    """Run the 3-tier parsing cascade. Returns (pages, parse_tier).

    Tier 1: Docling (default) — succeeds if no exception AND total chars >= 100.
    Tier 2: PyMuPDF — fast native text extraction, no OCR.
    Tier 3: Azure Document Intelligence — credential-gated; only attempted if
            AZURE_DI_ENDPOINT and AZURE_DI_KEY are set.

    parse_tier value: 1=Docling, 2=PyMuPDF, 3=AzureDI.
    """
    import logging as _logging

    _log = _logging.getLogger(__name__)

    # Tier 1: Docling
    try:
        pages = _convert_pdf_isolated_with_progress(file_path, progress_callback)
        total_chars = sum(len(t) for p in pages for t in p.get("text", []))
        if total_chars >= _FULL_TEXT_MIN_CHARS:
            return pages, 1
        _log.warning(
            "Docling produced only %d chars for %s — falling back to PyMuPDF",
            total_chars,
            file_path.name,
        )
    except Exception as e:
        _log.warning("Docling failed for %s: %s — falling back to PyMuPDF", file_path.name, e)

    # Tier 2: PyMuPDF
    try:
        pages = _pymupdf_parse_pdf(file_path)
        return pages, 2
    except Exception as e:
        _log.warning("PyMuPDF failed for %s: %s — falling back to Azure DI", file_path.name, e)
        pymupdf_exc = e

    # Tier 3: Azure Document Intelligence (credential-gated)
    import os
    if not (os.environ.get("AZURE_DI_ENDPOINT") and os.environ.get("AZURE_DI_KEY")):
        raise ValueError(
            f"PDF parsing failed for {file_path.name}: Docling and PyMuPDF both failed, "
            "and Azure DI credentials (AZURE_DI_ENDPOINT, AZURE_DI_KEY) are not configured."
        ) from pymupdf_exc

    try:
        pages = _azure_di_parse_pdf(file_path)
        return pages, 3
    except Exception as e:
        raise ValueError(
            f"All three parsing tiers failed for {file_path.name}. Last error: {e}"
        ) from e
```

- [ ] **Step 7: Run the cascade tests**

```bash
cd backend
python -m pytest tests/test_parser_cascade.py -v
```

Expected: All tests PASS (Azure DI test not written yet — that's Task 10).

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/parser.py backend/tests/test_parser_cascade.py backend/requirements.txt
git commit -m "feat: add _pages_to_full_text_md, _pymupdf_parse_pdf, and _parse_with_cascade (Tier 1+2)"
```

---

### Task 10: `parser.py` — Azure DI tier and wire cascade into `parse_pdf_path`

**Files:**
- Modify: `backend/app/services/parser.py`
- Modify: `backend/tests/test_parser_cascade.py`

- [ ] **Step 1: Add Azure DI test**

Append to `backend/tests/test_parser_cascade.py`:

```python
def test_cascade_raises_when_all_tiers_fail_and_no_azure_credentials(monkeypatch, tmp_path):
    import os
    from app.services import parser

    pdf_path = tmp_path / "test.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")

    monkeypatch.setattr(parser, "_convert_pdf_isolated_with_progress", lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("Docling down")))
    monkeypatch.setattr(parser, "_pymupdf_parse_pdf", lambda p: (_ for _ in ()).throw(RuntimeError("PyMuPDF down")))
    monkeypatch.delenv("AZURE_DI_ENDPOINT", raising=False)
    monkeypatch.delenv("AZURE_DI_KEY", raising=False)
    monkeypatch.setattr(parser, "_count_pdf_pages", lambda _: 1)

    with pytest.raises(ValueError, match="Azure DI credentials"):
        parser._parse_with_cascade(pdf_path)


def test_parse_pdf_path_sets_full_text_md_on_metadata(monkeypatch, tmp_path):
    import asyncio
    from app.services import parser

    pdf_path = tmp_path / "report.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")

    def fake_cascade(path, progress_callback=None):
        pages = [
            {"page_number": 1, "text": ["Revenue was $10m."], "tables": [], "has_table": False},
        ]
        return pages, 1

    monkeypatch.setattr(parser, "_parse_with_cascade", fake_cascade)
    monkeypatch.setattr(parser, "_count_pdf_pages", lambda _: 1)

    metadata, sections = asyncio.run(
        parser.parse_pdf_path(pdf_path, "report.pdf", "deal_1")
    )

    assert metadata.full_text_md is not None
    assert "## Page 1" in metadata.full_text_md
    assert "Revenue was $10m." in metadata.full_text_md
    assert metadata.parse_tier == 1
```

- [ ] **Step 2: Run new tests to verify they fail**

```bash
cd backend
python -m pytest tests/test_parser_cascade.py::test_parse_pdf_path_sets_full_text_md_on_metadata -v 2>&1 | head -20
```

Expected: FAIL — `parse_pdf_path` doesn't call `_parse_with_cascade` yet.

- [ ] **Step 3: Add `_azure_di_parse_pdf` to `parser.py`**

Add this function after `_parse_with_cascade`:

```python
def _azure_di_parse_pdf(file_path: Path) -> list[dict]:
    """Parse PDF using Azure Document Intelligence prebuilt-layout model.

    Requires AZURE_DI_ENDPOINT and AZURE_DI_KEY env vars.
    Returns pages in the same format as Docling and PyMuPDF tiers.
    """
    import os
    from azure.ai.formrecognizer import DocumentAnalysisClient
    from azure.core.credentials import AzureKeyCredential

    endpoint = os.environ["AZURE_DI_ENDPOINT"]
    key = os.environ["AZURE_DI_KEY"]

    client = DocumentAnalysisClient(endpoint, AzureKeyCredential(key))
    with open(str(file_path), "rb") as f:
        poller = client.begin_analyze_document("prebuilt-layout", document=f)
    result = poller.result()

    pages: dict[int, dict] = {}

    for page in result.pages:
        pn = page.page_number
        pages[pn] = {"page_number": pn, "text": [], "tables": [], "has_table": False}
        for line in (page.lines or []):
            if line.content and line.content.strip():
                pages[pn]["text"].append(line.content.strip())

    for table in (result.tables or []):
        pn = table.bounding_regions[0].page_number if table.bounding_regions else 1
        if pn not in pages:
            pages[pn] = {"page_number": pn, "text": [], "tables": [], "has_table": False}
        num_cols = table.column_count
        num_rows = table.row_count
        cells = [[""] * num_cols for _ in range(num_rows)]
        for cell in table.cells:
            if 0 <= cell.row_index < num_rows and 0 <= cell.column_index < num_cols:
                cells[cell.row_index][cell.column_index] = cell.content or ""
        if cells:
            md_rows = ["| " + " | ".join(cells[0]) + " |"]
            md_rows.append("| " + " | ".join(["---"] * num_cols) + " |")
            for row in cells[1:]:
                md_rows.append("| " + " | ".join(row) + " |")
            pages[pn]["tables"].append("\n".join(md_rows))
            pages[pn]["has_table"] = True

    return [pages[n] for n in sorted(pages.keys())]
```

- [ ] **Step 4: Update `parse_pdf_path` to use the cascade and write `full_text_md`**

In `backend/app/services/parser.py`, replace the `parse_pdf_path` function:

```python
async def parse_pdf_path(
    file_path: Path,
    filename: str,
    deal_id: str,
    progress_callback: Callable[[float, str], None] | None = None,
) -> tuple[DocumentMetadata, list[ParsedSection]]:
    """Parse a PDF file using the 3-tier cascade (Docling → PyMuPDF → Azure DI).

    Sets full_text_md and parse_tier on the returned DocumentMetadata.
    """
    doc_id = f"{deal_id}_{uuid.uuid4().hex[:8]}"

    pages, parse_tier = await asyncio.to_thread(
        _parse_with_cascade, file_path, progress_callback
    )

    sections = _build_pdf_sections(doc_id, filename, deal_id, pages)
    full_text_md = _pages_to_full_text_md(pages)
    detected_page_count = _count_pdf_pages(file_path)
    parsed_page_count = max((int(p["page_number"]) for p in pages), default=0)

    metadata = DocumentMetadata(
        doc_id=doc_id,
        deal_id=deal_id,
        filename=filename,
        page_count=detected_page_count or parsed_page_count,
        full_text_md=full_text_md or None,
        parse_tier=parse_tier,
    )

    return metadata, sections
```

Note: The old function called `_convert_pdf_isolated_with_lock` directly. The new version calls `_parse_with_cascade` which wraps that same function with the cascade logic. The `asyncio.to_thread` call is kept since the cascade runs blocking I/O.

- [ ] **Step 5: Run all cascade tests**

```bash
cd backend
python -m pytest tests/test_parser_cascade.py -v
```

Expected: All pass.

- [ ] **Step 6: Run full suite**

```bash
cd backend
python -m pytest tests/ -v --ignore=tests/manual_sweep_e2e.py 2>&1 | tail -20
```

Expected: All pass. (Existing `test_parse_pdf_path_uses_isolated_docling_worker` may need updating — see next step.)

- [ ] **Step 7: Update the existing Docling safety test**

The existing test in `test_parser_docling_safety.py` monkeypatches `_convert_pdf_isolated_with_progress` directly and asserts it's called via `parse_pdf_path`. After the refactor, `parse_pdf_path` now calls `_parse_with_cascade` which calls `_convert_pdf_isolated_with_progress`. The monkeypatch still works because `_parse_with_cascade` calls the module-level function.

Run to confirm:

```bash
cd backend
python -m pytest tests/test_parser_docling_safety.py::test_parse_pdf_path_uses_isolated_docling_worker -v
```

If it fails, the test needs to also monkeypatch `_count_pdf_pages`:

```python
    monkeypatch.setattr(parser, "_convert_pdf_isolated_with_progress", fake_convert)
    monkeypatch.setattr(parser, "_count_pdf_pages", lambda _path: 1)
    # Also need to ensure cascade picks Tier 1 by returning sufficient text
```

The `fake_convert` returns `["Executive summary"]` (18 chars). That's less than 100 chars threshold, so cascade will try PyMuPDF. Add a mock for `_pymupdf_parse_pdf` in that test too:

In `test_parser_docling_safety.py`, update `test_parse_pdf_path_uses_isolated_docling_worker`:

```python
def test_parse_pdf_path_uses_isolated_docling_worker(monkeypatch, tmp_path):
    pdf_path = tmp_path / "sample.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 test")
    calls = []

    def fake_convert(path, progress_callback=None):
        calls.append(path)
        if progress_callback:
            progress_callback(1.0, "Parsed document")
        return [
            {
                "page_number": 2,
                "text": ["Executive summary " * 10],  # >= 100 chars so Docling succeeds
                "tables": ["| Metric | Value |\n| --- | --- |\n| ARR | 10 |"],
                "has_table": True,
            }
        ]

    monkeypatch.setattr(parser.settings, "docling_subprocess_enabled", True)
    monkeypatch.setattr(parser, "_convert_pdf_isolated_with_progress", fake_convert)
    monkeypatch.setattr(parser, "_count_pdf_pages", lambda _path: 1)

    metadata, sections = asyncio.run(
        parser.parse_pdf_path(pdf_path, "sample.pdf", "deal_1")
    )

    assert calls == [pdf_path]
    assert metadata.filename == "sample.pdf"
    assert metadata.page_count == 1
    assert metadata.parse_tier == 1
    assert metadata.full_text_md is not None
    assert sections[0].metadata["page_number"] == 2
    assert sections[0].metadata["section_type"] == "text"
    assert "Executive summary" in sections[0].content
    assert sections[1].metadata["section_type"] == "table"
```

- [ ] **Step 8: Run full suite again**

```bash
cd backend
python -m pytest tests/ -v --ignore=tests/manual_sweep_e2e.py 2>&1 | tail -20
```

Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add backend/app/services/parser.py backend/tests/test_parser_cascade.py backend/tests/test_parser_docling_safety.py
git commit -m "feat: add Azure DI tier, wire 3-tier cascade into parse_pdf_path, set full_text_md on metadata"
```

---

### Task 11: `routes_ingest.py` — skip embedding in full-context mode

**Files:**
- Modify: `backend/app/api/routes_ingest.py`
- Create: `backend/tests/test_ingest_full_context.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_ingest_full_context.py`:

```python
"""Integration test: ingest pipeline skips embed when full_context_mode=True."""
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.models.document import DocumentMetadata


def test_ingest_skips_embed_when_full_context_mode_true(monkeypatch, tmp_path, sample_deal):
    from app.api import routes_ingest
    from app.config import settings

    monkeypatch.setattr(settings, "full_context_mode", True)

    embed_called = []

    async def fake_parse(file_path, filename, deal_id, progress_callback=None):
        return (
            DocumentMetadata(
                doc_id=f"{deal_id}_test",
                deal_id=deal_id,
                filename=filename,
                page_count=2,
                chunk_count=0,
                full_text_md="## Page 1\n\nSome content.",
                parse_tier=1,
            ),
            [],  # sections — not used in full context mode
        )

    async def fake_upsert(deal_id, chunks, progress_callback=None):
        embed_called.append(True)
        return len(chunks)

    monkeypatch.setattr(routes_ingest, "parse_document_path", fake_parse)
    monkeypatch.setattr(routes_ingest, "upsert_chunks", fake_upsert)

    # Write a dummy file to disk so _save_upload_to_disk has something
    dest = tmp_path / sample_deal.deal_id
    dest.mkdir(parents=True)
    (dest / "test.pdf").write_bytes(b"%PDF-1.4")

    async def run():
        return await routes_ingest._ingest_saved_path(
            sample_deal.deal_id,
            dest / "test.pdf",
            "test.pdf",
        )

    meta = asyncio.run(run())

    assert not embed_called, "upsert_chunks must not be called in full_context_mode=True"
    assert meta.chunk_count == 0


def test_ingest_calls_embed_when_full_context_mode_false(monkeypatch, tmp_path, sample_deal):
    from app.api import routes_ingest
    from app.config import settings

    monkeypatch.setattr(settings, "full_context_mode", False)

    embed_called = []

    async def fake_parse(file_path, filename, deal_id, progress_callback=None):
        return (
            DocumentMetadata(
                doc_id=f"{deal_id}_test",
                deal_id=deal_id,
                filename=filename,
                page_count=2,
                chunk_count=0,
                full_text_md=None,
                parse_tier=1,
            ),
            [MagicMock()],  # one section to chunk
        )

    def fake_chunk(sections, deal_id, doc_id):
        return [MagicMock()]  # one chunk

    async def fake_upsert(deal_id, chunks, progress_callback=None):
        embed_called.append(True)
        return len(chunks)

    monkeypatch.setattr(routes_ingest, "parse_document_path", fake_parse)
    monkeypatch.setattr(routes_ingest, "chunk_sections", fake_chunk)
    monkeypatch.setattr(routes_ingest, "upsert_chunks", fake_upsert)

    dest = tmp_path / sample_deal.deal_id
    dest.mkdir(parents=True)
    (dest / "test.pdf").write_bytes(b"%PDF-1.4")

    async def run():
        return await routes_ingest._ingest_saved_path(
            sample_deal.deal_id,
            dest / "test.pdf",
            "test.pdf",
        )

    meta = asyncio.run(run())

    assert embed_called, "upsert_chunks must be called when full_context_mode=False"
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd backend
python -m pytest tests/test_ingest_full_context.py::test_ingest_skips_embed_when_full_context_mode_true -v 2>&1 | head -20
```

Expected: FAIL — ingest still calls `upsert_chunks` unconditionally.

- [ ] **Step 3: Update `_ingest_saved_path` in `routes_ingest.py`**

In `backend/app/api/routes_ingest.py`, in the `_ingest_saved_path` function, replace the chunking + embedding block:

```python
    _set_progress(
        upload_id,
        status="processing",
        stage="Chunking document",
        percent=start_percent + span * 0.76,
        filename=filename,
    )
    chunks = chunk_sections(sections, deal_id, doc_metadata.doc_id)
    doc_metadata.chunk_count = len(chunks)

    try:
        _set_progress(
            upload_id,
            status="processing",
            stage="Embedding chunks",
            percent=start_percent + span * 0.82,
            filename=filename,
            detail=f"Preparing {len(chunks)} chunks",
        )
        await upsert_chunks(
            deal_id,
            chunks,
            progress_callback=_progress_mapper(
                upload_id,
                status="processing",
                stage="Embedding chunks",
                start_percent=start_percent + span * 0.82,
                end_percent=start_percent + span * 0.98,
                filename=filename,
            ),
        )
    except Exception as e:
        _set_progress(
            upload_id,
            status="error",
            stage="Embedding failed",
            percent=start_percent + span * 0.82,
            filename=filename,
            detail=str(e),
        )
        raise HTTPException(status_code=500, detail=f"Vector storage failed: {str(e)}")
```

with:

```python
    if not settings.full_context_mode:
        _set_progress(
            upload_id,
            status="processing",
            stage="Chunking document",
            percent=start_percent + span * 0.76,
            filename=filename,
        )
        chunks = chunk_sections(sections, deal_id, doc_metadata.doc_id)
        doc_metadata.chunk_count = len(chunks)

        try:
            _set_progress(
                upload_id,
                status="processing",
                stage="Embedding chunks",
                percent=start_percent + span * 0.82,
                filename=filename,
                detail=f"Preparing {len(chunks)} chunks",
            )
            await upsert_chunks(
                deal_id,
                chunks,
                progress_callback=_progress_mapper(
                    upload_id,
                    status="processing",
                    stage="Embedding chunks",
                    start_percent=start_percent + span * 0.82,
                    end_percent=start_percent + span * 0.98,
                    filename=filename,
                ),
            )
        except Exception as e:
            _set_progress(
                upload_id,
                status="error",
                stage="Embedding failed",
                percent=start_percent + span * 0.82,
                filename=filename,
                detail=str(e),
            )
            raise HTTPException(status_code=500, detail=f"Vector storage failed: {str(e)}")
```

- [ ] **Step 4: Update the completion progress detail to reflect the mode**

In the `_schedule_background_ingest` inner function and in `ingest_document`, the progress detail string `f"Embedded {meta.chunk_count} chunks"` still works because `chunk_count=0` when full context mode. No change needed.

- [ ] **Step 5: Run the ingest tests**

```bash
cd backend
python -m pytest tests/test_ingest_full_context.py -v
```

Expected: Both tests PASS.

- [ ] **Step 6: Run full suite**

```bash
cd backend
python -m pytest tests/ -v --ignore=tests/manual_sweep_e2e.py 2>&1 | tail -20
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/routes_ingest.py backend/tests/test_ingest_full_context.py
git commit -m "feat: skip chunk/embed in full context mode — completes Phase 2"
```

---

## Phase 3 — Railway deployment

### Task 12: Database portability, new dependencies, Railway config

**Files:**
- Modify: `backend/app/database.py`
- Modify: `backend/requirements.txt`
- Create: `railway.toml` (at repo root)

- [ ] **Step 1: Remove SQLite-specific `connect_args` from `database.py`**

In `backend/app/database.py`, replace:

```python
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},  # SQLite-specific; remove for Postgres
    echo=False,
)
```

with:

```python
engine = create_engine(
    settings.database_url,
    echo=False,
)
```

Note: `check_same_thread=False` is SQLite-only and causes errors with Postgres. The SQLAlchemy connection pool handles thread safety for Postgres natively.

- [ ] **Step 2: Verify tests still pass with in-memory SQLite**

```bash
cd backend
python -m pytest tests/ -v --ignore=tests/manual_sweep_e2e.py 2>&1 | tail -20
```

Expected: All pass. (The test conftest uses the default `database_url = "sqlite:///./data/vyntic.db"` which still works without `connect_args`.)

- [ ] **Step 3: Add `psycopg2-binary` to requirements**

In `backend/requirements.txt`, add after the `sqlalchemy` line:

```
psycopg2-binary>=2.9.9,<3.0
```

The `requirements.txt` block around database should now read:

```
# Database
sqlalchemy>=2.0.0,<3.0
psycopg2-binary>=2.9.9,<3.0
```

- [ ] **Step 4: Create `railway.toml` at the repo root**

Create `/Users/szeng/projects/Vyntic/railway.toml`:

```toml
[build]
builder = "dockerfile"

[deploy]
startCommand = "uvicorn app.main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
```

- [ ] **Step 5: Verify the app still imports cleanly**

```bash
cd backend
python -c "from app.database import engine, init_db; print('ok')"
```

Expected: `ok`

- [ ] **Step 6: Run full suite one last time**

```bash
cd backend
python -m pytest tests/ -v --ignore=tests/manual_sweep_e2e.py 2>&1 | tail -30
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/database.py backend/requirements.txt railway.toml
git commit -m "feat: remove SQLite connect_args, add psycopg2-binary, add railway.toml — completes Phase 3"
```

---

## Post-implementation Railway setup (manual, outside this plan)

1. Create Railway project, provision Postgres add-on
2. Mount a persistent volume at `/data`
3. Set environment variables:
   ```
   DATABASE_URL        (auto-provided by Railway Postgres add-on)
   GEMINI_API_KEY
   JWT_SECRET_KEY      (random 32+ char string)
   INTERNAL_API_TOKEN  (random token)
   FULL_CONTEXT_MODE   = true
   UPLOADS_DIR         = /data/uploads
   DEFAULT_ADMIN_EMAIL
   DEFAULT_ADMIN_PASSWORD
   AZURE_DI_ENDPOINT   (optional — enables Tier 3 parsing)
   AZURE_DI_KEY        (optional)
   ```
4. Deploy and hit `/health` to confirm startup

---

## Self-review notes

- `_TABULAR_DOC_TOP_K` constant in `workflow_run_executor.py` becomes unused since `load_doc_context` doesn't accept `top_k`. It can stay — removing it is out of scope.
- The `get_document_chunks` function in `vector_store.py` is still called by context_provider's RAG fallback path via `get_doc_page_chunks`. This is intentional — the RAG path is preserved intact.
- `parse_pdf` (bytes-based) is not updated to use the cascade. It delegates to `parse_pdf_path` via a temp file, so it inherits the cascade automatically.
- `parse_excel` is not affected — Excel files don't go through the PDF cascade.
