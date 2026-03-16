# SpokeMatrix PoC

Multi-tenant RAG application for PE deal comparison in a matrix format. Inspired by Hebbia's matrix-based reasoning approach.

**Fully local — no API keys required.** Runs on Ollama (DeepSeek-R1) + ChromaDB + Docling.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                │
│  ┌──────────────────────────────────────────────┐   │
│  │        Matrix Grid (Deals x Queries)         │   │
│  │  Deal A  │  EBITDA?  │  Revenue?  │  + col   │   │
│  │  Deal B  │  $12M     │  $45M      │          │   │
│  │  Deal C  │  $8M      │  $30M      │          │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────┬───────────────────────────────────┘
                  │ POST /matrix/compare
┌─────────────────▼───────────────────────────────────┐
│                 Backend (FastAPI)                     │
│                                                      │
│  ┌─────────────────────────────────────────┐        │
│  │        LangGraph Comparison Engine       │        │
│  │                                          │        │
│  │  ┌──────────┐  ┌──────────┐             │        │
│  │  │ Worker A  │  │ Worker B  │  (parallel) │        │
│  │  │ col:deal_a│  │ col:deal_b│             │        │
│  │  └────┬─────┘  └────┬─────┘             │        │
│  │       └──────┬───────┘                   │        │
│  │         ┌────▼────┐                      │        │
│  │         │Synthesis│                      │        │
│  │         └─────────┘                      │        │
│  └─────────────────────────────────────────┘        │
│                                                      │
│  ChromaDB (collection isolation per deal)            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │col:deal_a│ │col:deal_b│ │col:deal_c│            │
│  └──────────┘ └──────────┘ └──────────┘            │
│                                                      │
│  Ollama (local LLM + embeddings)                    │
│  ┌──────────────────┐ ┌─────────────────┐           │
│  │ deepseek-r1:8b   │ │ nomic-embed-text│           │
│  └──────────────────┘ └─────────────────┘           │
└──────────────────────────────────────────────────────┘
```

## Key Design Decisions

- **Collection Isolation**: Each deal uses a separate ChromaDB collection — zero context leak between deals
- **Structural Parsing**: Docling for PDFs (high-quality table + text extraction), openpyxl for Excel
- **LangGraph Orchestration**: Manager/Worker fan-out pattern for parallel multi-deal queries
- **Citation Grounding**: Every answer includes source file and page number references
- **Fully Local**: All components run on your machine — no cloud APIs needed

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **LLM** | DeepSeek-R1 8B (via Ollama) |
| **Orchestration** | LangGraph (manager/worker state graph) |
| **Vector DB** | ChromaDB (embedded, collection-per-deal isolation) |
| **Embeddings** | nomic-embed-text (via Ollama) |
| **PDF Parsing** | Docling (local, table-aware, high-quality extraction) |
| **Excel Parsing** | openpyxl |
| **Backend** | FastAPI (Python 3.12) |
| **Frontend** | Next.js 14, React 18, TailwindCSS |

---

## Quick Start

### Prerequisites

- **Docker Desktop** with at least **8 GB memory** allocated
  - Docker Desktop → Settings → Resources → Memory → 8 GB+
- **Git** (to clone the repo)

### Step 1: Start the services

```bash
cd spokematrix

# CPU mode (Mac / Linux / Windows without NVIDIA GPU)
docker compose --profile cpu up --build -d

# GPU mode (Windows / Linux with NVIDIA GPU)
docker compose --profile gpu up --build -d
```

This starts 3 containers:
- `ollama` / `ollama-gpu` — Local LLM server (port 11434)
- `backend` — FastAPI API (port 8000)
- `frontend` — Next.js UI (port 3100)

### Step 2: Pull the AI models (first time only)

```bash
bash scripts/setup.sh
```

This downloads:
- `deepseek-r1:8b` (~5 GB) — the LLM for reasoning
- `nomic-embed-text` (~274 MB) — the embedding model

### Step 3: Verify everything is running

```bash
# Check backend
curl http://localhost:8000/health
# → {"status":"ok","service":"spokematrix"}

# Check Ollama has models
curl http://localhost:11434/api/tags
# → lists deepseek-r1:8b and nomic-embed-text
```

### Step 4: Open the UI

Open **http://localhost:3100** in your browser.

---

## Step-by-Step Testing Guide

### Option A: Automated E2E Test (recommended first run)

The test script creates 3 sample PE deals with realistic financial data, uploads documents, runs queries, and verifies the entire pipeline.

#### 1. Generate sample documents

```bash
cd sample_data
python3 generate_samples.py
```

This creates 6 files:
| File | Description |
|------|-------------|
| `acme_saas_cim.pdf` | CIM for a B2B SaaS ERP company ($42M ARR) |
| `acme_saas_financials.xlsx` | Income statement + balance sheet |
| `pinnacle_health_cim.pdf` | CIM for a healthcare services company (78 clinics) |
| `pinnacle_health_financials.xlsx` | Income statement + balance sheet |
| `summit_industrial_cim.pdf` | CIM for an aerospace components manufacturer ($142M backlog) |
| `summit_industrial_financials.xlsx` | Income statement + balance sheet |

#### 2. Run the E2E test

```bash
python3 test_e2e.py
```

The test runs 6 steps:
1. **Health check** — verifies backend is running
2. **Create deals** — creates acme_saas, pinnacle_health, summit_industrial
3. **Upload documents** — parses PDFs/Excel and embeds into ChromaDB
4. **Single-deal Q&A** — asks deal-specific questions with citation verification
5. **Matrix comparison** — compares all 3 deals across multiple queries
6. **Zero context leak** — verifies no cross-deal data contamination

#### 3. Flags

```bash
# Skip document upload (if already done)
python3 test_e2e.py --skip-upload

# Skip matrix comparison (faster test)
python3 test_e2e.py --skip-matrix

# Custom backend URL
python3 test_e2e.py --base-url http://localhost:8000
```

---

### Option B: Manual Testing via UI

#### 1. Create a deal

1. Open http://localhost:3100
2. Click **"+ Add Deal"** in the top-right
3. Fill in:
   - Deal ID: `acme_saas`
   - Name: `Acme Cloud Solutions`
   - Description: `B2B SaaS ERP platform`
4. Click **Create**

Repeat for additional deals.

#### 2. Upload documents

1. In the left sidebar under **Upload Documents**, select the deal from the dropdown
2. Click **Choose File** and select a PDF or Excel file
3. Wait for the "Parsing and indexing document..." message to complete
4. The deal's doc count will update in the sidebar

#### 3. Ask a single-deal question

Use the API directly (or via the matrix grid):

```bash
curl -X POST http://localhost:8000/deals/acme_saas/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the EBITDA and EBITDA margin?"}'
```

The response includes:
- `answer` — the LLM's response grounded in the documents
- `citations` — source file, page number, and text snippets

#### 4. Run a matrix comparison

In the UI:
1. Create 2+ deals and upload their documents
2. Type a question in the **"Type a question..."** column header
3. Press **Enter** — the system fans out to each deal in parallel
4. Results populate the grid cells
5. Click any cell to see its source citations

Or via API:

```bash
curl -X POST http://localhost:8000/matrix/compare \
  -H "Content-Type: application/json" \
  -d '{
    "deal_ids": ["acme_saas", "pinnacle_health", "summit_industrial"],
    "queries": ["What is the EBITDA?", "What are the key risks?"]
  }'
```

---

### Option C: Manual Testing via Swagger

1. Open **http://localhost:8000/docs**
2. Use the interactive API explorer to test each endpoint:
   - `POST /deals` — Create a deal
   - `GET /deals` — List deals
   - `POST /deals/{deal_id}/documents` — Upload a file
   - `POST /deals/{deal_id}/query` — Ask a question
   - `POST /matrix/compare` — Compare deals

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/deals` | Create a new deal |
| GET | `/deals` | List all deals |
| DELETE | `/deals/{deal_id}` | Delete a deal and its vectors |
| POST | `/deals/{deal_id}/documents` | Upload and index a document |
| POST | `/deals/{deal_id}/query` | Query a single deal (RAG) |
| POST | `/matrix/compare` | Compare multiple deals across queries |

## Sample Queries to Try

| Query | What it tests |
|-------|--------------|
| "What is the EBITDA and EBITDA margin?" | Table extraction, financial metrics |
| "What are the change of control provisions?" | Long-form text comprehension |
| "What is the customer concentration risk?" | Risk analysis across document sections |
| "What is the revenue growth trajectory?" | Multi-year trend analysis |
| "What is the churn rate?" | Specific KPI extraction |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Backend won't start | Check Docker memory is ≥8 GB |
| Model loading slow | First query loads model into RAM (~30s). Subsequent queries are faster |
| "model requires more memory" | Increase Docker memory, or switch to `deepseek-r1:1.5b` in docker-compose.yml |
| Ollama unhealthy | Run `docker-compose restart ollama` |
| Empty query results | Ensure documents were uploaded first (check deal doc count) |
| Port 8000 in use | Run `lsof -i :8000 -t | xargs kill` then retry |
| Port 3100 in use | Change the frontend port mapping in `docker-compose.yml` |
| Matrix query timeout | LLM inference can take 60+ seconds. The proxy timeout is set to 5 minutes |
| No NVIDIA GPU | Use `--profile cpu` instead of `--profile gpu` when starting services |
