# Vyntic

Multi-tenant RAG application for PE deal comparison in a matrix format. Inspired by Hebbia's matrix-based reasoning approach.

**Powered by Google Gemini AI Studio** — uses Gemini 2.0 Flash Lite for fast inference with Gemma 3 27B as automatic fallback.

## Why Vyntic?

Private equity analysts spend hundreds of hours during due diligence manually reading CIMs, quality-of-earnings reports, and financial models — often across multiple competing deals simultaneously. The core challenge isn't access to data; it's the time it takes to extract, compare, and synthesize insights across deal rooms that can contain thousands of pages. Vyntic solves this by letting analysts ask natural-language questions across all active deals at once, returning cited, side-by-side answers in a matrix format. Instead of spending a week building a comparison spreadsheet, an analyst can populate it in minutes — with every claim traceable back to the exact page and document it came from. This applies equally to any finance workflow involving multi-document analysis: M&A due diligence, credit underwriting, equity research, or portfolio monitoring.

## Architecture

```
+-----------------------------------------------------+
|                    Frontend (Next.js)                |
|  +----------------------------------------------+   |
|  |        Matrix Grid (Deals x Queries)         |   |
|  |  Deal A  |  EBITDA?  |  Revenue?  |  + col   |   |
|  |  Deal B  |  $12M     |  $45M      |          |   |
|  |  Deal C  |  $8M      |  $30M      |          |   |
|  +----------------------------------------------+   |
+------------------+------------------------------------+
                   | SSE /matrix/compare/stream
+------------------v------------------------------------+
|                 Backend (FastAPI)                      |
|                                                       |
|  +------------------------------------------+        |
|  |        LangGraph Comparison Engine        |        |
|  |                                           |        |
|  |  +----------+  +----------+               |        |
|  |  | Worker A  |  | Worker B  |  (parallel)  |        |
|  |  | col:deal_a|  | col:deal_b|              |        |
|  |  +-----+----+  +-----+----+              |        |
|  |        +-------+------+                   |        |
|  |          +-----v---+                      |        |
|  |          |Synthesis|                      |        |
|  |          +---------+                      |        |
|  +------------------------------------------+        |
|                                                       |
|  ChromaDB (collection isolation per deal)             |
|  +----------+ +----------+ +----------+               |
|  |col:deal_a| |col:deal_b| |col:deal_c|               |
|  +----------+ +----------+ +----------+               |
|                                                       |
|  Google Gemini AI Studio                              |
|  +----------------------+ +---------------------+     |
|  | gemini-2.0-flash-lite| | gemini-embedding-001|     |
|  +----------------------+ +---------------------+     |
+-------------------------------------------------------+
```

## Key Design Decisions

- **Collection Isolation**: Each deal uses a separate ChromaDB collection — zero context leak between deals
- **Structural Parsing**: Docling for PDFs (high-quality table + text extraction), openpyxl for Excel
- **LangGraph Orchestration**: Manager/Worker fan-out pattern for parallel multi-deal queries
- **Streaming SSE**: Token-by-token LLM output streamed to the frontend for immediate feedback
- **Citation Grounding**: Every answer includes source file and page number references
- **Automatic Fallback**: If Gemini 2.0 Flash Lite hits rate limits, automatically falls back to Gemma 3 27B

## Features

### Core Analysis
- **Matrix comparison grid** — Ask questions across multiple deals simultaneously
- **Streaming responses** — LLM output streams token-by-token with a live cursor
- **Synthesis row** — Automatic cross-deal comparative analysis for each query
- **Inline citations** — Clickable blue badges that show source document, page, and snippet
- **Markdown rendering** — Bold, tables, bullets rendered inline; bar charts for numeric data
- **Query templates** — Pre-built PE question library (Financials, Risk, Commercial, Deal Thesis)
- **CSV export** — Download the matrix as a clean spreadsheet for IC distribution

### Deal Management
- **Drag-and-drop upload** — Drop PDF/Excel files directly onto deal cards
- **Multi-file upload** — Upload an entire data room in one drop
- **Document deletion** — Remove documents with hover-to-reveal delete button and confirmation dialog
- **Pipeline stages** — Track deals through Screening, Due Diligence, IC Review, Closed
- **Sector tags** — Tag deals by sector (Technology, Healthcare, Industrials, etc.)
- **Excel-style selection** — Click, Ctrl+click, Shift+click to select which deals to query

### Data Quality
- **Auto-seed sample data** — Three sample PE deals load automatically on startup
- **PE-optimized prompts** — LLM instructed to lead with insight, flag red flags, contextualize metrics
- **Zero context leak** — Verified isolation between deal namespaces

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **LLM** | Gemini 2.0 Flash Lite (via Google AI Studio) |
| **LLM Fallback** | Gemma 3 27B (automatic on rate limit) |
| **Orchestration** | LangGraph (manager/worker state graph) |
| **Vector DB** | ChromaDB (embedded, collection-per-deal isolation) |
| **Embeddings** | Gemini Embedding 001 (via Google AI Studio) |
| **PDF Parsing** | Docling (local, table-aware, high-quality extraction) |
| **Excel Parsing** | openpyxl |
| **Backend** | FastAPI (Python 3.12) |
| **Frontend** | Next.js 14, React 18, TailwindCSS |
| **Streaming** | Server-Sent Events (SSE) |

---

## Quick Start

### Prerequisites

- **Docker Desktop** with at least **8 GB memory** allocated
  - Docker Desktop > Settings > Resources > Memory > 8 GB+
- **Git** (to clone the repo)
- **Google AI Studio API key** — get one free at [aistudio.google.com](https://aistudio.google.com)

### Step 1: Configure your API key

Create a `.env` file in the project root:

```bash
GEMINI_API_KEY=your_api_key_here
```

### Step 2: Start the services

```bash
cd vyntic

docker compose up --build -d
```

This starts 2 containers:
- `backend` — FastAPI API (port 8000)
- `frontend` — Next.js UI (port 3100)

### Step 3: Verify everything is running

```bash
# Check backend
curl http://localhost:8000/health
# -> {"status":"ok","service":"vyntic"}
```

### Step 4: Open the UI

Open **http://localhost:3100/landing** in your browser. This is the landing page. Three sample deals (Acme Cloud, Pinnacle Healthcare, Summit Manufacturing) auto-load with documents on startup.

---

## Testing

### E2E Test (full pipeline)

The E2E test creates deals, uploads documents, runs queries, and verifies zero context leak across the full pipeline.

```bash
cd sample_data

# Generate sample documents (first time)
python3 generate_samples.py

# Run the full E2E test
python3 test_e2e.py

# Options
python3 test_e2e.py --skip-upload    # Skip document upload (if already done)
python3 test_e2e.py --skip-matrix    # Skip matrix comparison (faster)
python3 test_e2e.py --base-url http://localhost:8000  # Custom URL
```

### Backend Unit Tests (pytest)

Tests cover the streaming SSE endpoint, deal CRUD with stage/tags, multi-file batch upload, and error handling.

```bash
cd backend
pip install -r requirements-dev.txt
pytest -v
```

| Test File | What It Covers |
|-----------|---------------|
| `tests/test_streaming.py` | SSE event format, token streaming, multi-deal interleaving, error events |
| `tests/test_deal_management.py` | Deal stage/tag PATCH, batch upload, doc count, partial failure, CRUD regression |

### Frontend Unit Tests (Jest)

Tests cover query template validation, CSV export logic, and SSE event parsing.

```bash
cd frontend
npm test
```

| Test File | What It Covers |
|-----------|---------------|
| `src/__tests__/streamingApi.test.ts` | SSE parsing, interleaved events, malformed JSON handling |
| `src/__tests__/queryTemplates.test.ts` | Template structure, uniqueness, required categories |
| `src/__tests__/exportMatrix.test.ts` | Markdown stripping, CSV escaping, matrix row generation |

---

## Manual Testing via UI

### 1. Create a deal

1. Open http://localhost:3100/landing
2. Click **"+ Add Deal"** in the top-right
3. Fill in Deal ID, Name, and Description
4. Click **Create**

### 2. Upload documents

Drag PDF/Excel files directly onto any deal card in the sidebar, or click **"Drop files or click to upload"** to browse. Multiple files are supported in a single drop.

### 3. Ask questions

- Type a question in the **"Ask away..."** input and press Enter
- Or click the template icon (list button) to pick from pre-built PE questions
- Results stream in token-by-token across all selected deals
- Click blue citation badges to see the source document and page

### 4. Export results

Click **"Export CSV"** above the matrix to download results as a spreadsheet.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/deals` | Create a new deal |
| GET | `/deals` | List all deals |
| GET | `/deals/{deal_id}` | Get a single deal |
| PATCH | `/deals/{deal_id}` | Update deal stage/tags |
| DELETE | `/deals/{deal_id}` | Delete a deal and its vectors |
| POST | `/deals/{deal_id}/documents` | Upload and index a document |
| POST | `/deals/{deal_id}/documents/batch` | Upload multiple documents at once |
| GET | `/deals/{deal_id}/documents` | List documents for a deal |
| DELETE | `/deals/{deal_id}/documents/{doc_id}` | Delete a document and its vectors |
| POST | `/deals/{deal_id}/query` | Query a single deal (RAG) |
| POST | `/matrix/compare` | Compare multiple deals (batch) |
| POST | `/matrix/compare/stream` | Compare deals with SSE streaming |
| GET | `/deals/metadata/stages` | List valid pipeline stages |
| GET | `/deals/metadata/tags` | List suggested sector tags |

## Sample Queries to Try

| Query | What it tests |
|-------|--------------|
| "What is the EBITDA and EBITDA margin?" | Table extraction, financial metrics |
| "What are the change of control provisions?" | Long-form text comprehension |
| "What is the customer concentration risk?" | Risk analysis across document sections |
| "What is the revenue growth trajectory?" | Multi-year trend analysis |
| "What are the key investment highlights?" | Thesis-level synthesis |

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full product roadmap, including completed features, upcoming phases, and prioritization rationale.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Backend won't start | Check Docker memory is >= 8 GB |
| "invalid argument" from Gemini | Verify your `GEMINI_API_KEY` in `.env` is correct |
| Rate limit errors | The app auto-falls back to Gemma 3 27B. Wait a minute and retry |
| Empty query results | Ensure documents were uploaded first (check deal doc count) |
| Port 8000 in use | Run `lsof -i :8000 -t | xargs kill` then retry |
| Matrix query timeout | LLM inference can take 60+ seconds. The proxy timeout is set to 5 minutes |
