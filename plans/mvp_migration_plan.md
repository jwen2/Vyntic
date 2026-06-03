# Vyntic MVP Tech Spec

**Scope:** Three phases — full-context query layer, parsing fallback chain, production infrastructure. Written against the current codebase.

---

## Phase 1: Full-Context Query Layer

**Goal:** Replace vector retrieval with full document reads using `full_text_md` already stored in the `documents` table.

**Files touched:** `single_deal_qa.py`, `workflow_run_executor.py`, `prompts.py`

---

### 1.1 Citation Strategy

The current citation system works by numbering retrieved chunks as `[Source 1]`, `[Source 2]`, etc. and mapping them back after generation. With full context there are no chunks — so we preserve the same infrastructure by splitting `full_text_md` into pages and treating each page as a source.

Docling already segments output by page number in `full_text_md`. Split on page boundaries, number each page as a source block, pass all of them. `extract_citations()` is unchanged.

---

### 1.2 New helper: `load_document_sources`

Add to a new file `backend/app/services/document_loader.py`:

```python
from sqlalchemy.orm import Session
from app.database import DocumentRow

def load_document_sources(db: Session, doc_id: str) -> list[dict]:
    """
    Load full_text_md for a document and split into page-level source blocks
    compatible with the existing build_context_string / extract_citations pipeline.
    """
    row = db.query(DocumentRow).filter(DocumentRow.doc_id == doc_id).first()
    if not row or not row.full_text_md:
        return []

    # Split on page markers emitted by Docling: "## Page N" or "\n---\n"
    # Fall back to treating the whole doc as page 1 if no markers found
    pages = _split_by_page(row.full_text_md, row.filename)
    return pages


def load_deal_sources(db: Session, deal_id: str, doc_ids: list[str] | None = None) -> list[dict]:
    """Load full text for all documents in a deal (or a subset)."""
    query = db.query(DocumentRow).filter(DocumentRow.deal_id == deal_id)
    if doc_ids:
        query = query.filter(DocumentRow.doc_id.in_(doc_ids))
    rows = query.all()

    sources = []
    for row in rows:
        if row.full_text_md:
            sources.extend(_split_by_page(row.full_text_md, row.filename, row.doc_id))
    return sources


def _split_by_page(full_text_md: str, filename: str, doc_id: str = "") -> list[dict]:
    import re
    # Docling emits page markers; split on them
    page_blocks = re.split(r'\n(?=<!-- Page \d+-->|## Page \d+)', full_text_md)
    sources = []
    for i, block in enumerate(page_blocks):
        if not block.strip():
            continue
        page_num_match = re.search(r'(?:Page |page )(\d+)', block[:50])
        page_num = int(page_num_match.group(1)) if page_num_match else (i + 1)
        sources.append({
            "content": block.strip(),
            "metadata": {
                "source_file": filename,
                "page_number": page_num,
                "section_type": "text",
                "doc_id": doc_id,
            },
            "score": 1.0,  # no retrieval score needed for full context
        })
    return sources
```

> **Before implementing:** Inspect actual `full_text_md` values in the database to confirm what page delimiters Docling is emitting. Run:
> ```sql
> SELECT full_text_md FROM documents LIMIT 1;
> ```
> Adjust `_split_by_page` regex accordingly.

---

### 1.3 Modify `single_deal_qa.py`

Replace both functions. The structure is identical — only the retrieval step changes.

```python
async def answer_deal_question(db: Session, deal_id: str, question: str) -> QueryResponse:
    retrieved = load_deal_sources(db, deal_id)  # replaces query_deal()

    if not retrieved:
        return QueryResponse(
            deal_id=deal_id,
            question=question,
            answer="No documents found for this deal.",
            citations=[],
        )

    context_str = build_context_string(retrieved)
    system_prompt = SINGLE_DEAL_SYSTEM.format(context=context_str)

    answer = await invoke_with_fallback([
        SystemMessage(content=system_prompt),
        HumanMessage(content=question),
    ])

    cleaned_answer, citations = extract_citations(answer, retrieved, deal_id=deal_id)
    return QueryResponse(deal_id=deal_id, question=question, answer=cleaned_answer, citations=citations)


async def answer_document_question(db: Session, deal_id: str, doc_id: str, question: str) -> QueryResponse:
    retrieved = load_document_sources(db, doc_id)  # replaces query_document()
    # rest identical
```

The `db: Session` parameter needs to be threaded in from the route handler. Check `routes_query.py` for how the session is currently passed and follow the same pattern.

---

### 1.4 Modify `workflow_run_executor.py`

Two retrieval callsites to replace:

**Tabular `one_doc_per_row` cells** (`execute_cell`, line ~320):
```python
# Before
retrieved = await query_document(deal_id, doc_id, retrieval_query, top_k=_TABULAR_DOC_TOP_K)

# After
retrieved = load_document_sources(db, doc_id)
```

**Tabular `multi_doc_synthesis` cells** (`execute_cell`, line ~300):
```python
# Before
for doc_id in run.document_ids:
    chunks = await query_document(deal_id, doc_id, retrieval_query, top_k=_TABULAR_DOC_TOP_K)
    retrieved.extend(chunks)
retrieved = sorted(retrieved, key=..., reverse=True)[:_TABULAR_SYNTHESIS_MAX_CHUNKS]

# After
retrieved = load_deal_sources(db, deal_id, doc_ids=run.document_ids)
```

**Assistant stages** (`execute_assistant_stage`, line ~718):
```python
# Before
for doc_id in document_ids:
    chunks = await query_document(deal_id, doc_id, stage.prompt_md, top_k=_ASSISTANT_DOC_TOP_K)

# After
all_chunks = load_deal_sources(db, deal_id, doc_ids=document_ids)
```

The `get_document_chunks()` calls used for citation page context can also be replaced with `load_document_sources()` — same data, no need to hit ChromaDB.

Remove `_TABULAR_DOC_TOP_K`, `_TABULAR_SYNTHESIS_MAX_CHUNKS`, `_ASSISTANT_DOC_TOP_K` constants — no longer needed.

---

### 1.5 Update system prompt (`prompts.py`)

The current `SINGLE_DEAL_SYSTEM` prompt is tuned for numbered chunk sources. Verify it still instructs the model to use `[Source N]` markers with page-level sources. If it references "retrieved passages" or "search results" specifically, update that language to "document pages."

---

### 1.6 ChromaDB

Do not remove ChromaDB. Leave the ingest pipeline intact — chunks are still written to ChromaDB during document upload. This preserves the hybrid option for later and avoids breaking the ingest flow. ChromaDB just stops being read during queries.

Remove the `top_k` setting from active use but leave it in `config.py` — it's harmless.

---

### 1.7 Token limits

Current `max_tokens: int = 4096` in `config.py` is the output cap, not input. Gemini 3.1 Flash Lite's context window is 1M tokens — large enough for any PE document. No changes needed.

For very large deals (many documents, multi-doc synthesis), monitor context size. A 200-page deal room is ~300–500k tokens. Gemini handles it but costs more. Flag this for later optimization.

---

## Phase 2: Parsing Fallback Chain

**Goal:** Docling → PyMuPDF → Azure Document Intelligence, with quality validation triggering fallthrough.

**Files touched:** `parser.py`, `config.py`, `requirements.txt`

---

### 2.1 Quality validation function

Add to `parser.py`:

```python
def _validate_parse_quality(pages: list[dict], expected_page_count: int | None) -> tuple[bool, str]:
    """
    Returns (is_acceptable, reason).
    Triggers fallback if output looks truncated or structurally empty.
    """
    if not pages:
        return False, "no pages returned"

    total_chars = sum(
        len(" ".join(p["text"])) + sum(len(t) for t in p["tables"])
        for p in pages
    )
    chars_per_page = total_chars / len(pages)

    if chars_per_page < 100:
        return False, f"low content density: {chars_per_page:.0f} chars/page"

    if expected_page_count and len(pages) < expected_page_count * 0.5:
        return False, f"page count mismatch: got {len(pages)}, expected ~{expected_page_count}"

    return True, "ok"
```

---

### 2.2 PyMuPDF fallback

Add to `requirements.txt`:
```
pymupdf>=1.24.0,<2.0
```

Add to `parser.py`:

```python
def _parse_with_pymupdf(file_path: Path) -> list[dict]:
    import fitz  # pymupdf
    doc = fitz.open(str(file_path))
    pages = []
    for page_num, page in enumerate(doc, start=1):
        text = page.get_text()
        tables = []
        try:
            for table in page.find_tables():
                md = _pymupdf_table_to_markdown(table)
                if md:
                    tables.append(md)
        except Exception:
            pass
        pages.append({
            "page_number": page_num,
            "text": [text.strip()] if text.strip() else [],
            "tables": tables,
            "has_table": bool(tables),
        })
    doc.close()
    return pages


def _pymupdf_table_to_markdown(table) -> str:
    rows = table.extract()
    if not rows:
        return ""
    header = "| " + " | ".join(str(c or "") for c in rows[0]) + " |"
    separator = "| " + " | ".join("---" for _ in rows[0]) + " |"
    body = "\n".join(
        "| " + " | ".join(str(c or "") for c in row) + " |"
        for row in rows[1:]
    )
    return "\n".join([header, separator, body])
```

---

### 2.3 Azure Document Intelligence fallback

Add to `requirements.txt`:
```
azure-ai-documentintelligence>=1.0.0,<2.0
```

Add to `config.py`:
```python
azure_di_endpoint: str = ""
azure_di_key: str = ""
azure_di_enabled: bool = False  # off by default until credentials configured
```

Add to `parser.py`:

```python
async def _parse_with_azure_di(file_path: Path) -> list[dict]:
    from azure.ai.documentintelligence import DocumentIntelligenceClient
    from azure.core.credentials import AzureKeyCredential

    client = DocumentIntelligenceClient(
        endpoint=settings.azure_di_endpoint,
        credential=AzureKeyCredential(settings.azure_di_key),
    )

    with open(file_path, "rb") as f:
        poller = client.begin_analyze_document(
            "prebuilt-layout",
            analyze_request=f,
            content_type="application/octet-stream",
        )
    result = poller.result()

    pages: dict[int, dict] = {}
    for page in result.pages:
        pn = page.page_number
        pages[pn] = {"page_number": pn, "text": [], "tables": [], "has_table": False}
        for line in (page.lines or []):
            if line.content.strip():
                pages[pn]["text"].append(line.content.strip())

    for table in (result.tables or []):
        pn = table.bounding_regions[0].page_number if table.bounding_regions else 1
        if pn not in pages:
            pages[pn] = {"page_number": pn, "text": [], "tables": [], "has_table": False}
        md = _azure_table_to_markdown(table)
        if md:
            pages[pn]["tables"].append(md)
            pages[pn]["has_table"] = True

    return [pages[pn] for pn in sorted(pages)]


def _azure_table_to_markdown(table) -> str:
    if not table.cells:
        return ""
    row_count = table.row_count
    col_count = table.column_count
    grid = [[""] * col_count for _ in range(row_count)]
    for cell in table.cells:
        grid[cell.row_index][cell.column_index] = cell.content or ""
    if not grid:
        return ""
    header = "| " + " | ".join(grid[0]) + " |"
    separator = "| " + " | ".join("---" for _ in grid[0]) + " |"
    body = "\n".join("| " + " | ".join(row) + " |" for row in grid[1:])
    return "\n".join([header, separator, body])
```

---

### 2.4 Wire fallback chain into `parse_pdf_path`

Replace the current single-path parse in `parse_pdf_path`:

```python
async def parse_pdf_path(...):
    doc_id = f"{deal_id}_{uuid.uuid4().hex[:8]}"
    expected_pages = _count_pdf_pages(file_path)
    pages = None
    tier_used = "docling"

    # Tier 1: Docling
    try:
        if settings.docling_subprocess_enabled:
            pages = await asyncio.to_thread(_convert_pdf_isolated_with_lock, file_path, progress_callback)
        else:
            pages = await asyncio.to_thread(_docling_convert_pdf_with_lock, str(file_path))
        ok, reason = _validate_parse_quality(pages, expected_pages)
        if not ok:
            logger.warning("Docling quality check failed (%s), falling back", reason)
            pages = None
    except Exception as exc:
        logger.warning("Docling failed: %s, falling back to PyMuPDF", exc)
        pages = None

    # Tier 2: PyMuPDF
    if pages is None:
        tier_used = "pymupdf"
        try:
            pages = await asyncio.to_thread(_parse_with_pymupdf, file_path)
            ok, reason = _validate_parse_quality(pages, expected_pages)
            if not ok:
                logger.warning("PyMuPDF quality check failed (%s)", reason)
                pages = None
        except Exception as exc:
            logger.warning("PyMuPDF failed: %s", exc)
            pages = None

    # Tier 3: Azure Document Intelligence
    if pages is None and settings.azure_di_enabled:
        tier_used = "azure_di"
        try:
            pages = await _parse_with_azure_di(file_path)
        except Exception as exc:
            logger.error("Azure DI failed: %s", exc)
            pages = []

    if not pages:
        pages = []

    logger.info("Parsed %s: tier=%s pages=%d", file_path.name, tier_used, len(pages))
    # ... rest of function unchanged
```

Log `tier_used` per document. After a few real deals you'll see what percentage falls through to each tier — use that to tune the quality thresholds.

---

### 2.5 Remove macOS workarounds on Linux

The spawn context and conservative thread limits in `parser.py` are needed on Mac. On Linux they add overhead without benefit.

In Railway, set:
```
DOCLING_SUBPROCESS_ENABLED=false
DOCLING_NUM_THREADS=4
```

The subprocess isolation was a macOS fix; Linux doesn't need it.

---

## Phase 3: Production Infrastructure

### 3.1 PostgreSQL

**In `database.py`:** Make `connect_args` conditional:
```python
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, echo=False)
```

**In Railway**, set:
```
DATABASE_URL=postgresql://user:password@host:5432/vyntic
```

No ORM changes needed — SQLAlchemy handles the rest.

**Migration:** On first Railway deploy, `Base.metadata.create_all(engine)` runs on startup (check `main.py`). Tables will be created fresh. No migration tool needed for initial deploy.

---

### 3.2 Cloudflare R2 for document storage

Documents are currently saved to `./data/uploads` — local disk, lost on redeploy.

Add to `requirements.txt`:
```
boto3>=1.34.0,<2.0
```

Add to `config.py`:
```python
r2_account_id: str = ""
r2_access_key_id: str = ""
r2_secret_access_key: str = ""
r2_bucket_name: str = "vyntic-documents"
r2_enabled: bool = False
```

File read/write calls in `routes_ingest.py` and `routes_deals.py` need to be updated to use boto3 when `r2_enabled=True`, falling back to local disk when False. This keeps local dev working without credentials.

Serve PDFs via presigned URLs, not public access.

---

### 3.3 ChromaDB persistence on Railway

ChromaDB writes to `./data/chroma` by default. On Railway, attach a persistent volume mounted at `/data`. Set:
```
CHROMA_PERSIST_DIR=/data/chroma
UPLOADS_DIR=/data/uploads
```

Railway persistent volumes survive deploys. Without one, ChromaDB is wiped on every deploy and all embeddings are lost.

---

### 3.4 Dockerfile

Create `backend/Dockerfile`:
```dockerfile
FROM python:3.11-slim

# System deps for Docling (Linux native — no macOS workarounds needed)
RUN apt-get update && apt-get install -y \
    libgl1 libglib2.0-0 libsm6 libxext6 libxrender-dev \
    libgomp1 poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Docling models at build time so first parse isn't slow
RUN python -c "from docling.document_converter import DocumentConverter; DocumentConverter()"

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

The `RUN python -c "..."` line bakes Docling model weights into the image (~1–2GB). Build time is longer but cold-start parse time drops from 2–3 minutes to seconds.

---

### 3.5 Railway configuration

Create `railway.toml` at repo root:
```toml
[build]
builder = "dockerfile"
dockerfilePath = "backend/Dockerfile"

[deploy]
startCommand = "uvicorn app.main:app --host 0.0.0.0 --port 8000"
healthcheckPath = "/health"
healthcheckTimeout = 60
restartPolicyType = "on_failure"
```

**Environment variables to set in Railway dashboard:**
```
DATABASE_URL=postgresql://...       # from Railway PostgreSQL add-on
GEMINI_API_KEY=...
JWT_SECRET_KEY=...                  # openssl rand -hex 32
INTERNAL_API_TOKEN=...              # openssl rand -hex 32
DEFAULT_ADMIN_EMAIL=...
DEFAULT_ADMIN_PASSWORD=...
CHROMA_PERSIST_DIR=/data/chroma
UPLOADS_DIR=/data/uploads
DOCLING_SUBPROCESS_ENABLED=false
DOCLING_NUM_THREADS=4
DOCLING_OCR_ENABLED=true
SEED_SAMPLE_DATA=false
R2_ENABLED=true
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=vyntic-documents
AZURE_DI_ENDPOINT=...               # when ready
AZURE_DI_KEY=...
AZURE_DI_ENABLED=true
```

---

### 3.6 Frontend (Vercel)

No code changes needed for Vercel deployment. In Vercel dashboard:

- Set `NEXT_PUBLIC_API_URL=https://your-railway-app.railway.app`
- Attach custom domain
- Vercel handles SSL automatically

If SSE streaming breaks after deploy (Vercel's edge network can buffer it), add to `next.config.js`:
```js
module.exports = {
  async headers() {
    return [{ source: '/api/:path*', headers: [{ key: 'X-Accel-Buffering', value: 'no' }] }]
  }
}
```
SSE calls go directly to Railway (not through Next.js API routes), so this may not be needed — verify first.

---

## Summary: What Changes Where

| File | Change |
|---|---|
| `services/document_loader.py` | New file — full-text source loader |
| `agents/single_deal_qa.py` | Replace `query_deal` / `query_document` with `load_document_sources` |
| `services/workflow_run_executor.py` | Replace all `query_document` calls with `load_document_sources` |
| `agents/prompts.py` | Verify `[Source N]` instructions work with page-level sources |
| `services/parser.py` | Add quality validation + PyMuPDF fallback + Azure DI fallback + fallback chain wiring |
| `config.py` | Add Azure DI settings, R2 settings; make `connect_args` conditional |
| `database.py` | Conditional `connect_args` for SQLite vs. PostgreSQL |
| `requirements.txt` | Add `pymupdf`, `azure-ai-documentintelligence`, `boto3` |
| `backend/Dockerfile` | New file |
| `railway.toml` | New file |

**Not touched:** ChromaDB ingest pipeline, chunker, embedder, auth, workflow definitions, frontend components, export routes.

---

## Order of Operations

1. Inspect `full_text_md` in the database to confirm page delimiter format before writing `_split_by_page`
2. Implement Phase 1 locally, test against existing seeded documents
3. Implement Phase 2 parsing fallback, test with a scanned PDF and a complex financial table PDF
4. Set up Railway + PostgreSQL + R2, deploy, smoke test end-to-end
5. Configure Vercel, point domain, verify SSE streaming
6. Enable Azure DI once credentials are set up — can deploy without it initially
