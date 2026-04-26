# Vyntic

AI-native diligence workspace for private equity. Multi-tenant RAG application that lets analysts compare deals in a matrix, run a per-document prompt sheet against a single deal, and unleash an autonomous diligence agent that hunts for red flags across an entire data room.

**Powered by Google Gemini AI Studio** — primary `gemini-3.1-flash-lite-preview`, fallback `gemini-3-flash-preview`, embeddings via `gemini-embedding-001` (3072-dim).

## Landing Page

| Hero | Pricing |
|------|---------|
| ![Landing Hero](docs/screenshots/landing-hero.png) | ![Pricing](docs/screenshots/landing-pricing.png) |

Live at **`/landing`** — public marketing page with hero, logo strip, feature cards, testimonials, three-tier pricing (Free / Pro $99/mo / Enterprise), and a final CTA.

---

## Why Vyntic?

Private equity analysts spend hundreds of hours during due diligence manually reading CIMs, quality-of-earnings reports, and financial models — often across multiple competing deals simultaneously. The bottleneck isn't access to data; it's the time it takes to extract, compare, and synthesize insights across deal rooms that can contain thousands of pages.

Vyntic compresses that work into three surfaces:

1. **Deal-scoped document matrix** — drop in a question, get a row per document with cited answers.
2. **Workstream playbooks** — pre-built Financial / Commercial / Operational / Legal DD question sets that auto-run against a deal and produce IC-ready memos.
3. **Diligence agent + Proactive Sweep** — autonomous investigation that plans, searches, reads, and flags risks the analyst never thought to ask about.

Every claim ties back to the exact page and snippet it came from.

## Architecture

```
+-----------------------------------------------------------------+
|                       Frontend (Next.js 14)                     |
|                                                                 |
|  /             — Dashboard: deal sidebar + per-deal Doc Matrix  |
|  /deal/[id]    — Workspace: Agent / Workstreams / Proactive Scan|
|  /landing      — Public marketing page                          |
|                                                                 |
+--------------------------------+--------------------------------+
                                 | JWT + SSE
+--------------------------------v--------------------------------+
|                     Backend (FastAPI, Python 3.12)              |
|                                                                 |
|  Routes: auth · deals · ingest · query · matrix · stream        |
|          workstream · doc_matrix · sweep · agent · report       |
|          conversation                                           |
|                                                                 |
|  Services:                                                      |
|   parser (Docling subprocess) → chunker → embedder → vector_store
|   deal_store · investigation_store · conversation_store         |
|   report_generator (DOCX with footnoted citations)              |
|                                                                 |
|  ChromaDB — collection isolation per deal, doc_id metadata      |
|  filter for per-document retrieval                              |
|                                                                 |
|  SQLite — users, deals, deal access, conversation history,      |
|  investigations + follow-ups                                    |
|                                                                 |
|  Google Gemini AI Studio                                        |
|   gemini-3.1-flash-lite-preview (primary)                       |
|   gemini-3-flash-preview        (fallback)                      |
|   gemini-embedding-001          (3072-dim)                      |
+-----------------------------------------------------------------+
```

## Key Design Decisions

- **Per-deal vector isolation** — each deal gets its own ChromaDB collection, and per-document retrieval uses a `doc_id` metadata filter to guarantee zero context bleed.
- **JWT auth + RBAC** — `admin` and `analyst` roles, per-deal access control via `DealAccessRow`. Admin-only actions (add/delete deals, upload docs, edit stage) are gated in both UI and API.
- **Persistent SQLite via SQLAlchemy** — ready to swap for Postgres without code changes.
- **Docling in subprocess** — PDF parsing runs in a spawned process with conservative CPU/thread/timeout defaults so macOS startup ingestion never crashes the API process.
- **LangGraph manager/worker** — parallel fan-out for multi-deal matrix queries, with bounded concurrency.
- **Streaming everywhere** — SSE for matrix cells, workstream answers, agent THOUGHT/ACTION traces, and final memos.
- **Two-tier model fallback** — automatic switch from `gemini-3.1-flash-lite-preview` → `gemini-3-flash-preview` on rate-limit, with the serving model badged on every cell.
- **Production frontend in Docker** — port 3100 runs `npm run build && npm run start` for reliable static chunk delivery; port 3200 runs `next dev` for hot reload.

## Features

### Document Matrix (per deal)
- Rows = documents, columns = prompts. Add a prompt → it streams an answer per document.
- **Locked column widths** with horizontal scroll instead of squish — table-layout: fixed with `<colgroup>`-driven sizing.
- **Compact (480px) / Comfortable (720px) density toggle**, persisted to localStorage.
- **Sticky top header + sticky left document column** with z-stacked corner cell.
- Empty state stretches the prompt input to fill the page.
- Excel-like per-column sort/filter dropdowns, drag-to-reorder, double-click rename.
- Inline `[Source N]` citation badges that open a slide-over PDF/Excel preview at the exact page.
- Spreadsheet citations render as compact tables in both source panel and document viewer.
- Result cache in localStorage so prompts survive a page refresh.

### Cross-Deal Matrix (legacy dashboard view)
- Ask one prompt across multiple deals at once with a synthesis row that compares them.
- Markdown tables, bar charts for numeric values, model-served + duration badge per cell.
- CSV export for IC distribution.

### Diligence Workspace (`/deal/[dealId]`)
- Unified **Agent** / **Workstreams** experience with saved agent sessions and red-flag tracking in the dark left rail.
- ⌘K **Ask Agent** overlay with a 4-phase animated trace.
- Coverage chips and dismissible red-flag banner on the dark TopBar; banner CTA is context-aware (Run Proactive Scan vs. View all findings).
- 336px right-side citation panel reused across the matrix and DD views.
- Workstreams sidebar shows a per-document coverage bar, page counts, and flag counts; click a doc to open a scoped DocumentDetailView with three suggested prompts.

### Workstream Playbooks
- Four pre-built DD playbooks — **Financial**, **Commercial**, **Operational**, **Legal** — plus a **Risk Scorecard** with 9 calibrated 1–5 risk questions and color-coded progress bars.
- "Run Full Workstream" with bounded-concurrency SSE streaming and session-level result caching.
- QCard layout: severity pills, confidence bars, inline `[Source N]` badges, and source evidence cards.
- Anti-hallucination guardrails: prompts hard-stop when no relevant info is found; citations are post-verified.

### Proactive Deal Sweep
- Iterates **every chunk** in the deal's collection (not top-K) so the model can find what nobody asked about — buried footnotes, related-party transactions, contingent liabilities, carve-out complications.
- Findings come back as a severity-ranked feed (`[DEAL-BREAKER]` / `[MATERIAL]` / `[NOTEWORTHY]`) with linked citations.

### Diligence Agent (Investigate)
- Autonomous per-deal investigation. THOUGHT/ACTION JSON planner over scoped tools: `search_deal`, `search_document`, `list_documents`, `read_pages`, `flag_finding`, `finish`.
- Streams plan → tool calls → findings → final memo token-by-token.
- **History + persistence**: every run is saved to `investigations` / `investigation_followups`. Open a past run read-only with its original transcript, findings, and memo. Delete from the panel.
- **Follow-up Q&A** grounded in memo + findings + evidence digest.
- Document-scoped runs auto-prefix the goal with `Focus exclusively on the document "<filename>"`.

### IC Report Export
- Generate IC Report → configure (title + workstreams) → preview (rendered with styled tables and citation badges) → download `.docx`.
- Word document includes title page, executive summary table, per-workstream Q&A, markdown-as-Word tables with delta coloring (green/red), and **footnoted** citations (source file, page, snippet) for every `[Source N]`.

### Multi-tenancy & Auth
- JWT login/logout, default admin auto-provisioned on startup.
- Admin and analyst roles. Analyst-mode UI hides admin actions.
- Per-deal access control — analysts only see deals they've been granted access to.
- Conversation history persisted server-side, browsable from the deal workspace.

### Theming & UX
- Dark mode end-to-end via `ThemeProvider` + Tailwind `darkMode: "class"`. Persisted in localStorage.
- DM Sans / DM Mono via `next/font`.
- Slate dark surfaces (`#020617` / `#0f172a`) with `#1e293b` borders.

### Document Viewing
- Slide-over PDF preview at the exact cited page (`#page=N`).
- Authenticated Excel previews with sheet tabs and HTML-table rendering.
- Iframe-friendly auth via `?token=` query-param fallback.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **LLM (primary)** | Gemini 3.1 Flash Lite (preview) via Google AI Studio |
| **LLM (fallback)** | Gemini 3 Flash (preview) — automatic on rate limit |
| **Embeddings** | `gemini-embedding-001`, 3072-dim |
| **Orchestration** | LangGraph (manager/worker state graph) |
| **Agent loop** | THOUGHT/ACTION JSON planner with scoped tools |
| **Relational DB** | SQLite via SQLAlchemy |
| **Vector DB** | ChromaDB (embedded, collection-per-deal) |
| **PDF Parsing** | Docling (subprocess, configurable CPU/threads/timeout) |
| **Excel Parsing** | openpyxl |
| **DOCX Generation** | python-docx with custom XML for footnotes |
| **Backend** | FastAPI (Python 3.12) |
| **Auth** | JWT (python-jose, passlib/bcrypt) |
| **Frontend** | Next.js 14, React 18, TailwindCSS, DM Sans |
| **Streaming** | Server-Sent Events (SSE) |

---

## Quick Start

### Prerequisites

- **Docker Desktop** with at least **8 GB memory** allocated
- **Git**
- **Google AI Studio API key** — free at [aistudio.google.com](https://aistudio.google.com)

### Step 1: Configure your API key

Create a `.env` file in the project root:

```bash
GEMINI_API_KEY=your_api_key_here
```

Optional Docling controls for lower-memory local startup:

```bash
DOCLING_SUBPROCESS_ENABLED=true
DOCLING_DEVICE=cpu
DOCLING_NUM_THREADS=1
DOCLING_OCR_ENABLED=false
DOCLING_TIMEOUT_SECONDS=180
```

### Step 2: Start the services

```bash
docker compose up --build -d
```

This starts three containers:
- `backend` — FastAPI API on **port 8000**
- `frontend` — Production Next build (`build && start`) on **port 3100**
- `frontend-dev` — `next dev` with hot reload on **port 3200**

### Step 3: Verify

```bash
curl http://localhost:8000/health
# -> {"status":"ok","service":"vyntic"}
```

### Step 4: Log in

Open **http://localhost:3100** and authenticate with the auto-provisioned admin:

- **Email:** `admin@vyntic.com`
- **Password:** `admin`

Three sample deals (Acme Cloud, Pinnacle Healthcare, Summit Manufacturing) seed automatically with documents and are bound to the admin account.

### Restarting after frontend changes

Port 3100 runs a production build, so changes require a rebuild:

```bash
docker compose restart frontend         # rebuilds via start-prod.sh
docker compose up -d --build frontend   # full image rebuild if needed
```

Port 3200 hot-reloads — use it during active development.

---

## Testing

### Backend (pytest)

```bash
cd backend
pip install -r requirements-dev.txt
pytest -v
```

| Test File | What It Covers |
|-----------|---------------|
| `tests/test_streaming.py` | SSE event format, token streaming, multi-deal interleaving, error events |
| `tests/test_deal_management.py` | Deal stage/tag PATCH, batch upload, doc count, partial failure, CRUD |
| `tests/test_parser_docling_safety.py` | Docling subprocess isolation and timeout behavior |

### Frontend (Jest)

```bash
cd frontend
npm test
```

Covers SSE parsing, query template structure, and CSV export logic.

### End-to-End

```bash
cd sample_data
python3 generate_samples.py    # first time only
python3 test_e2e.py            # creates deals, uploads, queries, asserts isolation
```

---

## Manual Smoke Test

1. **Log in** — http://localhost:3100, admin credentials above.
2. **Pick a deal** — Acme Cloud is pre-seeded with a CIM, financials, financial DD, legal DD, operational DD, and HR DD.
3. **Document Matrix** — type a prompt in the "Ask a question" column, watch each document stream a cited answer. Add a second and third prompt — columns hold their width and the table scrolls horizontally.
4. **Open the Diligence Workspace** — click a deal name (or use the inline Analyze action).
5. **Run a workstream** — Financial → "Run Full Workstream" → watch all questions stream in parallel.
6. **Run a Proactive Scan** — surfaces risks no one asked about, ranked by severity.
7. **Investigate** — open the Agent tab, give it a goal, watch THOUGHT/ACTION trace, then a final memo.
8. **Generate IC Report** — pick workstreams, preview, download `.docx`.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
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
| GET | `/deals/{id}/documents/{filename}/view` | Stream original file (Authorization header **or** `?token=` query) |
| POST | `/deals/{id}/query` | RAG query against single deal |
| POST | `/deals/{id}/query/document/{doc_id}` | RAG query against a single document (per-doc isolation) |
| POST | `/matrix/compare` | Multi-deal comparison (batch) |
| POST | `/matrix/compare/stream` | Multi-deal comparison (SSE) |
| POST | `/workstream/run` | Run a DD workstream (SSE) |
| POST | `/workstream/question` | Single workstream question (SSE) |
| POST | `/sweep/run` | Proactive Deal Sweep (SSE) |
| POST | `/agent/investigate` | Diligence Agent run (SSE: THOUGHT/ACTION/MEMO) |
| GET | `/agent/investigations` | List saved investigations |
| GET | `/agent/investigations/{id}` | Load a saved investigation |
| DELETE | `/agent/investigations/{id}` | Delete investigation |
| POST | `/agent/investigations/{id}/followup` | Follow-up Q&A grounded in memo |
| POST | `/report/generate` | Generate IC Report `.docx` |
| GET | `/conversation/{deal_id}` | Conversation history |

---

## Sample Queries

| Query | What it tests |
|-------|--------------|
| "What is the EBITDA and EBITDA margin?" | Table extraction, financial metrics |
| "What are the change-of-control provisions?" | Long-form text comprehension |
| "What is the customer concentration risk?" | Risk analysis across sections |
| "What is the revenue growth trajectory?" | Multi-year trend analysis |
| "Find any related-party transactions or unusual clauses" | Best run via Proactive Sweep |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Backend won't start | Docker memory ≥ 8 GB |
| `invalid argument` from Gemini | Check `GEMINI_API_KEY` in `.env` |
| Rate-limit errors | Auto-falls back to `gemini-3-flash-preview`; wait and retry |
| Empty query results | Confirm documents uploaded (deal doc count > 0) |
| Port 8000/3100/3200 in use | `lsof -i :PORT -t \| xargs kill` |
| Frontend serves stale JS on 3100 | `docker compose restart frontend` (re-runs production build) or `docker compose up -d --build frontend` |
| `next dev` fails to load chunks on 3200 | `docker compose up -d --build --force-recreate --renew-anon-volumes frontend-dev` |
| ChromaDB dimension mismatch | Ensure `EMBEDDING_DIM=3072` matches `gemini-embedding-001` output |
| Docling crashes on macOS | Keep `DOCLING_SUBPROCESS_ENABLED=true`, `DOCLING_DEVICE=cpu` |
| PDF preview shows "Not authenticated" | Hard-refresh; iframe uses `?token=` query — confirm token isn't expired |
