# Full-Context Migration — MVP Design Spec

**Date:** 2026-06-03  
**Branch:** `backend/full-context-migration`  
**Status:** Approved

---

## Overview

Replace the RAG (ChromaDB) retrieval pipeline with full-context document reads. The existing RAG code stays in the repo but becomes unreachable at runtime. A config flag (`full_context_mode`) controls which path is active — flipping it to `false` restores the full RAG pipeline with no code changes.

Simultaneously: fix the 3-tier parsing cascade (Docling → PyMuPDF → Azure Document Intelligence) and migrate deployment to Railway + Postgres.

---

## Goals

- Improve answer accuracy by eliminating top-k retrieval truncation
- Fix `full_text_md` population so it's written during ingest, not lazily
- Add 3-tier parsing fallback with parse tier tracking (foundation for future quality-score routing)
- Deploy to Railway with managed Postgres

## Non-goals (deferred)

- Gemini context caching (cost optimization — post-MVP)
- Quality-score-based parser selection (Option B — requires tuning data)
- ChromaDB removal (keep code, just unreachable)
- Horizontal scaling (Railway single-instance volume is fine for MVP)

---

## Architecture

### Current flow

```
Ingest:  upload → Docling (subprocess) → chunk_sections → upsert_chunks (ChromaDB)
                  └─ full_text_md written lazily by internal sidecar route (often NULL)

Query:   question → query_deal/query_document (ChromaDB top-k) → LLM
```

### Target flow

```
Ingest:  upload → parser cascade (Docling→PyMuPDF→AzureDI) → full_text_md written to DB
                  (chunk_sections + upsert_chunks skipped when full_context_mode=True)

Query:   question → context_provider.py → full_text_md read from DB → LLM
```

### Files that become unreachable (not deleted)

- `app/services/vector_store.py`
- `app/services/embedder.py`
- `app/services/chunker.py` (chunk_sections call skipped)

---

## Component 1: Config flag

`app/config.py` — new field:

```python
full_context_mode: bool = True
```

Set `FULL_CONTEXT_MODE=false` in Railway env to restore RAG for any call site.

---

## Component 2: Context provider (`app/services/context_provider.py`)

New file. All 5 RAG call sites import from here instead of `vector_store` directly.

### Public interface

```python
async def load_deal_context(deal_id: str, question: str) -> list[dict]:
    """Load context for a deal-level question across all documents."""

async def load_doc_context(deal_id: str, doc_id: str, question: str) -> list[dict]:
    """Load context for a single-document question."""
```

### Return format

Returns `list[dict]` in the same shape as `query_deal`/`query_document` today:
```python
{"content": str, "source_file": str, "page": int, "doc_id": str, "score": float, "section_type": str}
```

All downstream code (`build_context_string`, `extract_citations`, `CONTEXT_TEMPLATE`) is unchanged.

### Full-text path

Reads `full_text_md` from `DocumentRow`. Splits on `## Page N` headers to produce per-page dicts with correct page numbers. If `full_text_md` is null (document ingested before migration), falls back to reconstructing from ChromaDB chunks — same behavior as the existing internal route.

For `load_deal_context`: concatenates all documents in the deal. With Gemini Flash's 1M token window, a 5-doc deal at ~50K tokens/doc fits comfortably.

### RAG fallback path

When `full_context_mode=False`, delegates to the original `vector_store` functions via a deferred import:

```python
if not settings.full_context_mode:
    from app.services.vector_store import query_deal
    return await query_deal(deal_id, question)
```

### Call sites updated (import swap only)

| File | Before | After |
|---|---|---|
| `single_deal_qa.py` | `query_deal`, `query_document` | `load_deal_context`, `load_doc_context` |
| `workflow_run_executor.py` | `query_document` | `load_doc_context` |
| `routes_stream.py` | `query_deal` | `load_deal_context` |
| `routes_doc_matrix.py` | `query_document` | `load_doc_context` |

`comparison_graph.py` calls `answer_deal_question` which inherits the fix — no direct change needed.

---

## Component 3: Document model changes

`app/models/document.py` — two new fields on `DocumentMetadata`:

```python
class DocumentMetadata(BaseModel):
    doc_id: str
    deal_id: str
    filename: str
    page_count: int = 0
    chunk_count: int = 0
    full_text_md: str | None = None   # written to DB during ingest
    parse_tier: int = 1               # 1=Docling, 2=PyMuPDF, 3=AzureDI
```

`app/database.py` — new column on `DocumentRow`:

```python
parse_tier = Column(Integer, default=1)
```

Added to `_ensure_schema()` migration block:
```python
if "parse_tier" not in existing:
    conn.execute(text("ALTER TABLE documents ADD COLUMN parse_tier INTEGER DEFAULT 1"))
```

`app/services/deal_store.py` — new function:

```python
def save_full_text(doc_id: str, full_text_md: str, parse_tier: int) -> None:
    """Write parsed full text and parse tier to the document row."""
```

---

## Component 4: 3-tier parsing cascade

`app/services/parser.py` — refactored internals, same public signature.

### Cascade logic

```
Tier 1: Docling
  Success criteria: no exception AND result has ≥100 total chars
  On failure: log warning, fall to Tier 2

Tier 2: PyMuPDF (pymupdf package)
  Native-text extraction only, no OCR. Fast (~1s/100 pages).
  On failure: log warning, fall to Tier 3

Tier 3: Azure Document Intelligence (azure-ai-formrecognizer)
  Model: prebuilt-layout
  Requires AZURE_DI_ENDPOINT + AZURE_DI_KEY env vars.
  If vars absent: skip tier, re-raise Tier 2 exception with clear message.
  On failure: raise ValueError (surfaces to user as upload error)
```

### New dependencies

```
pymupdf
azure-ai-formrecognizer
```

### Path to quality-score routing (Option B — future)

Foundation is laid:
- `parse_tier` column identifies which tier fired per document
- Add `_score_parse_quality(full_text_md, page_count) -> float` — checks chars/page ratio, table count, etc.
- If Docling score below threshold, re-parse with PyMuPDF and take better result
- No interface changes required

### Ingest pipeline changes (`routes_ingest.py`)

After `parse_document_path` returns:

```python
# Write full_text_md and parse_tier before adding document record
if doc_metadata.full_text_md:
    deal_store.save_full_text(doc_metadata.doc_id, doc_metadata.full_text_md, doc_metadata.parse_tier)

# Skip embedding when full_context_mode is True
if not settings.full_context_mode:
    chunks = chunk_sections(sections, deal_id, doc_metadata.doc_id)
    doc_metadata.chunk_count = len(chunks)
    await upsert_chunks(deal_id, chunks, ...)

deal_store.add_document(deal_id, doc_metadata)
```

---

## Component 5: Railway + Postgres deployment

### Database engine change (`database.py`)

```python
# Remove SQLite-specific connect_args
engine = create_engine(settings.database_url)
```

`DATABASE_URL` is set automatically by Railway when Postgres add-on is provisioned.

### Schema inspection fix (`database.py` — `_ensure_schema`)

Replace SQLite `PRAGMA table_info` with dialect-agnostic SQLAlchemy inspection:

```python
from sqlalchemy import inspect as sa_inspect
inspector = sa_inspect(engine)
existing = {col["name"] for col in inspector.get_columns("documents")}
```

### New dependencies

```
psycopg2-binary
```

### Railway config (`railway.toml`)

```toml
[build]
builder = "dockerfile"

[deploy]
startCommand = "uvicorn app.main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
```

### File uploads

Mount Railway persistent volume at `/data`. Set `UPLOADS_DIR=/data/uploads` in Railway env vars. `DATABASE_URL` provided automatically by Railway Postgres add-on.

### Required Railway environment variables

```
DATABASE_URL         = postgresql://...  (auto-provided by Railway Postgres add-on)
GEMINI_API_KEY       = ...
JWT_SECRET_KEY       = <random 32+ char string>
INTERNAL_API_TOKEN   = <random token>
FULL_CONTEXT_MODE    = true
UPLOADS_DIR          = /data/uploads
DEFAULT_ADMIN_EMAIL  = ...
DEFAULT_ADMIN_PASSWORD = ...
# Optional — enables Tier 3 parsing
AZURE_DI_ENDPOINT    = ...
AZURE_DI_KEY         = ...
```

---

## Implementation phases

### Phase 1 — Full-context query path (no ingest changes yet)
1. Add `full_context_mode` to config
2. Create `context_provider.py`
3. Update the 5 call sites (import swaps)
4. Verify: existing deals with populated `full_text_md` answer correctly; null `full_text_md` falls back gracefully

### Phase 2 — Fix ingest pipeline
1. Add `full_text_md` + `parse_tier` to `DocumentMetadata`
2. Add `parse_tier` column + `_ensure_schema` migration
3. Add `deal_store.save_full_text()`
4. Add PyMuPDF tier to `parser.py`
5. Add Azure DI tier to `parser.py` (credential-gated)
6. Update `routes_ingest.py` to write `full_text_md` + skip embedding when flag is True
7. Verify: new uploads populate `full_text_md`; parse_tier reflects which tier fired

### Phase 3 — Railway deployment
1. Update `database.py` (remove SQLite connect_args, fix schema inspection)
2. Add `psycopg2-binary` to `requirements.txt`
3. Write `railway.toml`
4. Configure Railway: provision Postgres add-on, set env vars, mount volume
5. Deploy and smoke test

---

## Risks

| Risk | Mitigation |
|---|---|
| `full_text_md` null for existing documents | Phase 1 gracefully falls back to chunk reconstruction |
| Deal with many large docs exceeds context window | Gemini Flash 1M token limit — flag any deal exceeding ~800K tokens in logs |
| Azure DI credentials not available at launch | Tier 3 is credential-gated — app functions on Docling+PyMuPDF alone |
| Postgres schema drift from SQLite | Additive-only migrations via `_ensure_schema()` |
