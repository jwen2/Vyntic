# Vyntic

AI-native diligence workspace for private equity. Three focused surfaces:

1. **Tabular document analysis** — spreadsheet-like grids where rows are documents and columns are extraction prompts. Every cell streams a typed answer with inline citations.
2. **Agent chat** — free-form Q&A across the deal corpus, with document scoping, suggested investigations, and a one-click Proactive Scan handoff.
3. **Saved workflows** — built-in templates for common diligence patterns (DD packs, QofE bridge, contract review, comp set, etc.) plus custom workflows analysts author themselves. Runs are persisted, exportable, and re-runnable.

**Powered by Google Gemini AI Studio** — primary `gemini-3.1-flash-lite`, fallback `gemini-3-flash-preview`, embeddings via `gemini-embedding-001` (3072-dim).

---

## Why Vyntic?

PE analysts spend hundreds of hours during due diligence manually reading CIMs, quality-of-earnings reports, and financial models. The bottleneck isn't access to data; it's the time it takes to extract, compare, and synthesize insights across deal rooms that can run thousands of pages.

Vyntic compresses that work without ever pulling answers from the model's priors. Every claim ties back to the exact page and snippet it came from. Context is always loaded per deal — zero cross-deal context bleed.

---

## The three surfaces

### 1. Tabular document analysis

Inside any deal: open a tabular workflow → pick docs → click Run → get a grid where each cell streams an answer.

Two row sources:

- **`one_doc_per_row`** — M docs × N columns, one cell per (doc, prompt). Use when you want each document analyzed independently.
- **`multi_doc_synthesis`** — one row × N columns, each cell runs against the full corpus. Use when the question is about the deal as a whole.

Cells are **typed**: each column declares a shape (`metric` / `prose` / `list` / `kv` / `enum` / `bool` / `date` / `markdown` / etc.) and the executor returns a structured answer the renderer can format. Inline `[Source N]` citation chips open the original document at the exact page.

**Compare view** swaps the grid for one column wide, one card per row, with word-level LCS diff highlighting against an anchor — solves the "how does this clause differ across drafts?" problem in one click.

### 2. Agent chat

A streamed RAG chat at `/deal/[id]` (Agent tab). Ask anything about the deal corpus; get cited answers. Features:

- **Document scoping chips** above the input — pick which docs to scope the question to, or leave empty to query the whole deal.
- **Suggested investigations** on the empty state — five PE-shaped prompts (red flags, cross-validation, deep-scan Legal DD, concentration risks, cross-doc inconsistencies).
- **Run Proactive Scan** CTA — one click runs the `builtin_proactive_scan` workflow and routes you to the Brief tab to see the synthesis.
- **Persisted conversation history** in the left sidebar — every chat is saved per deal, browsable, restorable.
- **Cmd/Ctrl-K** from anywhere returns to the Agent tab.

### 3. Saved workflows

The Workflows tab houses both **built-in templates** (visible across all deals) and **deal-scoped workflows** the analyst authors.

**14 built-in templates:**

| Template | Type | Rows | Notes |
|---|---|---|---|
| CIM → IC Memo Draft | assistant | — | 3-stage memo generator with checkpoints |
| QofE Bridge | tabular | one doc/row | Reported → adjusted EBITDA with line-item adjustments |
| Contract Stack Review | tabular | one doc/row | Parties / CoC / exclusivity / MFN / auto-renew / termination |
| Customer Concentration | tabular | one doc/row | Top-N revenue %, contract status, churn flag |
| Management Profiles | tabular | one doc/row | Execs × role / tenure / prior PE / equity rollover |
| Red Flag Scanner | assistant | — | Full data room scan, tagged by category + severity |
| Follow-up Q List | assistant | — | Questions for the next management meeting |
| Comp Set Builder | tabular | one doc/row | Uploaded docs + reference data → comparable set |
| **Financial DD** | tabular | synthesis | 15 cols: revenue, EBITDA, working capital, debt, etc. |
| **Commercial DD** | tabular | synthesis | 13 cols: TAM, customer concentration, retention, pricing |
| **Operational DD** | tabular | synthesis | 13 cols: management, key person, vendor concentration |
| **Legal DD** | tabular | synthesis | 12 cols: litigation, IP, CoC, regulatory, FCPA |
| **Risk Scorecard** | tabular | synthesis | 9 cols of 1–5 risk scores with traffic-light tags |
| **Proactive Scan** | tabular | synthesis | 11 cols, drives the Brief tab + Findings extraction |

Two workflow shapes are supported: **tabular** (the grid surface above) and **assistant** (sequential stages, each producing a memo section, with optional human checkpoints between stages).

**Built-in reconciliation:** on every backend startup, the seed runs `_reconcile_builtin_columns` which patches existing built-in workflow rows in place when the source code drifts. Column IDs are preserved so existing run history keeps working, but label/prompt/format tweaks propagate without a manual DB reset.

**Custom workflows** clone from a built-in template or start blank. The TabularEditor exposes prompt, format, tag, and derived-column controls per column.

**Runs are persisted** — every cell, every citation, every duration metric. Re-running a workflow on a different doc set creates a new run; old runs stay browsable. Exports: `.xlsx` for tabular runs, `.docx` for assistant runs.

### Deal Brief (derived from Proactive Scan)

The **Brief tab** is a structured dashboard derived from the latest completed `builtin_proactive_scan` run. Panels:

- **Deal snapshot** — Target / Company / Sector / Business model / Geography / Seller / Stage (kv-format cells synthesized back to markdown for the dashboard parsers)
- **Proposed transaction** — Transaction type / Purchase price / EV / Ownership / Valuation / Financing / Timing
- **Key financial highlights** — Yahoo Finance style markdown tables (Annual + Quarterly)
- **Investment thesis** — Thesis / Value creation levers / Exit considerations / Risks
- **Analyst next actions** — Top 5 next diligence asks

A **"Run Deal Brief"** button on the empty state kicks off the underlying workflow. Field overrides (`vyntic_brief_overrides_*`) and run-to-run diffs (`vyntic_brief_diff_*`) persist in localStorage so analyst edits survive re-runs.

**Findings extraction** runs automatically after each Proactive Scan completes — six "finding-producing" columns (Hidden financial risks, Buried contractual & legal risks, Operational vulnerabilities, Data room gaps, Cross-doc inconsistencies, Regulatory exposure) are parsed into structured `Finding` objects with severity inference (`[DEAL-BREAKER]` / `[MATERIAL]` / `[NOTEWORTHY]`), titles, citations, and stable ids that survive re-runs. The TopBar deal-breaker pill updates live.

### Document management

Compact **📄 N** button in the TopBar of every deal page. Opens a modal listing each document with filename, page count, chunk count, and inline-confirm delete.

---

## Architecture

```
+-----------------------------------------------------------------+
|              Frontend (Vite + React 18 + react-router)          |
|                                                                 |
|  /              — Dashboard: deal list + per-deal Doc Matrix    |
|  /deal/[id]     — Workspace: Agent / Workflows / Brief tabs     |
|  /landing       — Public marketing page                         |
|  /login         — JWT login                                     |
|                                                                 |
+--------------------------------+--------------------------------+
                                 | JWT + SSE (/api proxy)
+--------------------------------v--------------------------------+
|                     Backend (FastAPI, Python 3.12)              |
|                                                                 |
|  Routes: auth · deals · ingest · query · matrix · stream        |
|          doc_matrix · workflows · workflow_runs · conversation  |
|                                                                 |
|  Services:                                                      |
|   parser (Docling subprocess) → full_text_md (primary context)  |
|   extraction_engine — the one primitive: context → prompt →     |
|     stream w/ fallback → typed answer + citations; used by      |
|     chat, tabular cells, assistant stages, doc matrix, compare  |
|   context_provider — full-context (default) or RAG strategy     |
|   workflow_store · workflow_run_store · workflow_run_executor   |
|   workflow_seed (built-in templates + reconciliation)           |
|   workflow_format (typed-cell directives + parsers)             |
|   workflow_exports (.xlsx / .docx)                              |
|   deal_store · conversation_store                               |
|                                                                 |
|  SQLite — users, deals, deal access, documents (incl.           |
|           full_text_md), workflows, workflow_runs,              |
|           tabular_cells, conversation history                   |
|                                                                 |
|  ChromaDB — optional RAG path (full_context_mode=false):        |
|             collection-per-deal, doc_id metadata filter         |
|                                                                 |
|  Google Gemini AI Studio                                        |
|   gemini-3.1-flash-lite          (primary, GA)                  |
|   gemini-3-flash-preview         (fallback)                     |
|   gemini-embedding-001           (3072-dim, RAG mode only)      |
+-----------------------------------------------------------------+
```

## Key design decisions

- **Full-context by default** — documents are parsed once into `full_text_md` and the whole document (or corpus, up to a token budget) is sent as context. Simpler and cheaper to maintain than the RAG pipeline, which stays available behind `context_provider` (`FULL_CONTEXT_MODE=false`) as a per-request strategy for the future.
- **One extraction engine** — every surface (chat, tabular cells, assistant stages, doc matrix, multi-deal compare) answers through `extraction_engine.run_extraction`: context → prompt → stream with fallback → citations. Grounding/citation fixes apply everywhere at once.
- **Per-deal isolation** — context is always loaded per deal (and per document via `doc_id`); in RAG mode each deal additionally gets its own ChromaDB collection. Zero cross-deal context bleed either way.
- **JWT auth + RBAC** — `admin` and `analyst` roles, per-deal access control via `DealAccessRow`. Admin-only actions (create deals, delete deals, upload docs, edit stage) enforced in the API (`require_admin`) and reflected in the UI.
- **Typed cells** — every workflow column declares a shape; the executor appends a JSON/format directive to the LLM prompt and parses the structured response into `answer_formatted`. Renderers consume the typed shape directly. The `markdown` shape skips the JSON directive for columns whose prompts need rich markdown (tables, multi-section narrative).
- **Built-in reconciliation** — `seed_builtin_workflows` runs on every startup and patches existing built-in workflow rows in place when source code drifts. Column IDs preserved → existing run history keeps working.
- **Run lifecycle is DB-truth** — cells/stages are claimed atomically (`queued → running`), cancel stops all queued work and the run stays `cancelled`, and a startup reconciler marks runs stranded by a restart as errored (checkpoint-paused runs survive restarts and resume via approve).
- **Docling in subprocess** — PDF parsing runs in a spawned process with conservative CPU/thread/timeout defaults so local startup ingestion never crashes the API process.
- **Two-tier model fallback** — automatic switch from `gemini-3.1-flash-lite` → `gemini-3-flash-preview` when the primary fails before its first token, with the serving model badged on every cell. Mid-stream failures error the cell cleanly (retry from the UI) rather than restarting the answer.
- **Streaming everywhere** — SSE for chat answers, tabular cell completion, assistant stage outputs, run status transitions.

---

## Tech stack

| Component | Technology |
|---|---|
| **LLM (primary)** | Gemini 3.1 Flash Lite (GA) via Google AI Studio |
| **LLM (fallback)** | Gemini 3 Flash (preview) — automatic on pre-token failure |
| **Embeddings** | `gemini-embedding-001`, 3072-dim (RAG mode only) |
| **Relational DB** | SQLite via SQLAlchemy (WAL, FK enforcement on) |
| **Vector DB** | ChromaDB (embedded, collection-per-deal; optional RAG mode) |
| **PDF parsing** | Docling (subprocess, configurable CPU/threads/timeout) |
| **Excel parsing** | openpyxl |
| **DOCX generation** | python-docx |
| **Backend** | FastAPI (Python 3.12) |
| **Auth** | JWT (python-jose, bcrypt) |
| **Frontend** | Vite 5, React 18, react-router, TailwindCSS, DM Sans / DM Mono |
| **Streaming** | Server-Sent Events (SSE) |

---

## Quick start

### Prerequisites

- **Docker Desktop** with at least **8 GB memory** allocated
- **Git**
- **Google AI Studio API key** — free at [aistudio.google.com](https://aistudio.google.com)

### 1. Configure

Create a `.env` file in the project root:

```bash
GEMINI_API_KEY=your_api_key_here

# Dev only: allows booting on the default JWT secret + admin password.
# Without this (or real JWT_SECRET_KEY / DEFAULT_ADMIN_PASSWORD values)
# the backend refuses to start. Never set in production.
ALLOW_INSECURE_DEFAULTS=true
```

Optional Docling controls for lower-memory local startup:

```bash
DOCLING_SUBPROCESS_ENABLED=true
DOCLING_DEVICE=cpu
DOCLING_NUM_THREADS=1
DOCLING_OCR_ENABLED=false
DOCLING_TIMEOUT_SECONDS=180
```

### 2. Start

```bash
docker compose up --build -d
```

Three containers come up:

- `backend` — FastAPI on **port 8000**
- `frontend` — production `vite build` served by `vite preview` on **port 3100**
- `frontend-dev` — `vite` dev server with hot reload on **port 3200**

### 3. Verify

```bash
curl http://localhost:8000/health
# -> {"status":"ok","service":"vyntic"}
```

### 4. Log in

Open **http://localhost:3100** (or `:3200` for dev) and sign in:

- **Email:** `admin@vyntic.com`
- **Password:** `admin`

Sample deals seed automatically with documents and are bound to the admin account.

### Running natively (no Docker)

Both services run directly if you have **Python 3.11+** and **Node 18+** installed.

**Backend** — create `backend/.env` (not the project root — the backend reads `.env` relative to its own working directory):

```bash
GEMINI_API_KEY=your_api_key_here

# Dev only: allows booting on the default JWT secret + admin password.
# Never set in production.
ALLOW_INSECURE_DEFAULTS=true
```

Everything else (SQLite path, ChromaDB dir, uploads dir) falls back to defaults under `backend/data/`. Then:

```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1     # Windows PowerShell (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

If `docling` isn't installed (it pulls heavy dependencies), PDF parsing automatically falls back to PyMuPDF — fine for local testing.

**Frontend** — no `.env` needed; the Vite proxy targets `http://localhost:8000` by default:

```bash
cd frontend
npm install
npm run dev
```

Open the printed URL (default **http://localhost:5173**) and log in with the same credentials as above.

### Restarting after frontend changes

Port 3100 serves a production build baked into the image, so changes require a rebuild:

```bash
docker compose up -d --build frontend   # rebuild image (runs vite build)
```

Port 3200 hot-reloads — use it during active development.

---

## Testing

### Backend

```bash
cd backend
pip install -r requirements-dev.txt
pytest -v
```

| Test file | What it covers |
|---|---|
| `tests/test_streaming.py` | SSE event format, token streaming, multi-deal interleaving, error events |
| `tests/test_streaming_json.py` | Structured JSON SSE payloads |
| `tests/test_deal_management.py` | Deal stage/tag PATCH, batch upload, doc count, CRUD |
| `tests/test_deal_store_documents.py` | Per-deal document persistence and isolation |
| `tests/test_parser_docling_safety.py` | Docling subprocess isolation and timeout behavior |
| `tests/test_vector_store_metadata.py` | ChromaDB metadata filter correctness |
| `tests/test_workflow_format_typed.py` | Typed-cell directive + parse round-trip per format |
| `tests/test_workflow_format_migration.py` | Legacy format → typed migration |
| `tests/test_llm_config.py` | Model fallback wiring |

### Frontend

There is no frontend test framework yet; the type gate is the build:

```bash
cd frontend
npm run build   # runs tsc, then vite build
```

Both suites run in CI on every PR (`.github/workflows/ci.yml`).

---

## API endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/login` | Authenticate, receive JWT |
| POST | `/auth/register` | Create account |
| GET | `/auth/me` | Current user profile |
| GET | `/health` | Health check |
| POST | `/deals` | Create deal |
| GET | `/deals` | List deals |
| GET | `/deals/{id}` | Get deal |
| PATCH | `/deals/{id}` | Update stage/tags |
| DELETE | `/deals/{id}` | Delete deal + vectors |
| POST | `/deals/{id}/documents` | Upload + index a document |
| POST | `/deals/{id}/documents/batch` | Upload multiple |
| GET | `/deals/{id}/documents` | List documents |
| DELETE | `/deals/{id}/documents/{doc_id}` | Delete a document + vectors |
| GET | `/deals/{id}/documents/{filename}/view` | Stream original file (`Authorization:` header or `?token=` query) |
| POST | `/deals/{id}/query` | RAG query against single deal (Agent chat) |
| POST | `/deals/{id}/query/stream` | Streaming version |
| POST | `/deals/{id}/document_matrix/stream` | Per-document matrix grid (dashboard) |
| POST | `/matrix/compare` | Multi-deal comparison (batch) |
| POST | `/matrix/compare/stream` | Multi-deal comparison (SSE) |
| GET | `/deals/{id}/workflows` | List workflows visible to the deal (built-in + deal-scoped) |
| POST | `/deals/{id}/workflows` | Create workflow |
| GET | `/deals/{id}/workflows/{wid}` | Get workflow |
| PUT | `/deals/{id}/workflows/{wid}` | Update workflow |
| DELETE | `/deals/{id}/workflows/{wid}` | Delete (deal-scoped only) |
| POST | `/deals/{id}/workflows/{wid}/clone` | Clone built-in into deal-scoped |
| POST | `/deals/{id}/workflows/{wid}/runs` | Start a run (tabular or assistant) |
| GET | `/deals/{id}/workflows/{wid}/runs` | List runs |
| GET | `/runs/{rid}` | Get run with cells |
| GET | `/runs/{rid}/stream` | SSE stream of cell updates |
| GET | `/runs/{rid}/export.xlsx` | Excel export of tabular run |
| GET | `/runs/{rid}/export.docx` | Word export of assistant run |
| POST | `/runs/{rid}/cancel` | Cancel a running run |
| POST | `/runs/{rid}/cells/{cid}/retry` | Retry a single cell |
| POST | `/runs/{rid}/columns/{cid}/retry` | Retry every cell in a column |
| POST | `/conversation` | Save a conversation entry |
| GET | `/conversation` | Conversation history |
| DELETE | `/conversation` | Clear conversation history |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Backend won't start | Docker memory ≥ 8 GB |
| Backend exits with "Refusing to start with default secrets" | Set `ALLOW_INSECURE_DEFAULTS=true` in `.env` (dev only), or real `JWT_SECRET_KEY` / `DEFAULT_ADMIN_PASSWORD` values (production) |
| `invalid argument` from Gemini | Check `GEMINI_API_KEY` in `.env` |
| Rate-limit errors | Auto-falls back to `gemini-3-flash-preview`; wait and retry |
| Empty query results | Confirm documents uploaded (deal doc count > 0) |
| Port 8000/3100/3200 in use | `lsof -i :PORT -t \| xargs kill` |
| Frontend serves stale JS on 3100 | `docker compose up -d --build frontend` (the build is baked into the image) |
| ChromaDB dimension mismatch (RAG mode) | Ensure `EMBEDDING_DIM=3072` matches `gemini-embedding-001` output |
| Docling crashes on macOS | Keep `DOCLING_SUBPROCESS_ENABLED=true`, `DOCLING_DEVICE=cpu` |
| PDF preview shows "Not authenticated" | Hard-refresh; iframe uses `?token=` query — confirm token isn't expired |
| Built-in workflow has stale prompt/format | Restart backend; `_reconcile_builtin_columns` patches existing rows in place |
| Run shows "Interrupted by server restart" | The backend restarted mid-run; retry the affected cells (or the whole run) from the run UI |
