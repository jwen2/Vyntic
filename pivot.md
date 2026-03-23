# Vyntic Pivot: Recurring Financial Statement Processor

## Context

PE firms spend 80% of their time on deal due diligence. A core pain point is **processing financial statements** — the same types of documents from the same set of portfolio companies, arriving monthly/quarterly. This is repetitive, manual, structured extraction work that:
- Claude/Cowork can't do well (generic AI misses specific formats)
- Internal PE teams are actively building custom tools for (validated demand)
- No good off-the-shelf solution exists

The current Vyntic app is a multi-deal comparison matrix — but PE firms evaluate deals individually, not side-by-side. The pivot shifts from "compare deals" to "process and extract structured data from recurring financial documents."

**Entry wedge:** "Upload your monthly/quarterly statements, we extract the numbers into your Excel model automatically."

**Differentiation from Claude:** Persistent format memory, structured output (not text), recurring workflow automation.

---

## What to Build (MVP)

### Core Flow
1. **Upload** financial statement (PDF, CSV, XLS)
2. **Auto-detect** company + statement type (revenue report, P&L, balance sheet, etc.)
3. **Extract** line items into structured key-value pairs with confidence scores
4. **Review** — analyst confirms/corrects extractions (human-in-the-loop)
5. **Export** to Excel model or download as structured CSV
6. **Learn** — corrections improve future extractions for same company/format

### MVP Scope (Phase 1)
- Single-deal workspace (not matrix)
- Upload PDF/XLS financial statements
- LLM-powered extraction into structured table (line items, values, periods)
- Side-by-side view: original document | extracted data table
- Export extracted data as XLSX
- Basic company/document type organization

### Phase 2 (Post-validation)
- Format memory: "remember" company-specific statement layouts
- Historical trending: auto-compare Q1 vs Q2 vs Q3 extractions
- Template library: common statement types (P&L, BS, CF, revenue detail)
- Excel model integration: map extracted fields to specific cells in user's model
- Deal intelligence: search across all historical deals

---

## What to Reuse from Current Codebase

### Keep (high reuse)
- **Document parsing pipeline** (`backend/app/services/parser.py`) — PDF/XLSX extraction already works
- **Table-aware chunking** (`backend/app/services/chunker.py`) — preserves table structure
- **ChromaDB vector store** (`backend/app/services/vector_store.py`) — for searching across docs
- **Gemini LLM integration** (`backend/app/agents/llm.py`) — streaming + fallback
- **Citation/source tracking** (`backend/app/utils/citations.py`) — maps extractions to source doc+page
- **Document viewer** (`frontend/src/components/DocumentViewer.tsx`) — side-by-side original view
- **Deal model** (`backend/app/models/deal.py`) — becomes "Company" or "Portfolio Company"
- **File upload flow** (`frontend/src/components/DealCard.tsx`) — drag-drop upload

### Modify
- **Matrix grid → Extraction table**: Rows = line items, not deals. Columns = periods or fields.
- **Q&A prompts → Extraction prompts**: Instead of open-ended questions, structured extraction instructions
- **SSE streaming → Extraction progress**: Show extraction happening in real-time
- **Query templates → Statement templates**: P&L, Balance Sheet, Cash Flow, Revenue Detail

### Remove/Replace
- Multi-deal comparison matrix view
- Synthesis/comparison agent (LangGraph multi-deal)
- Deal-vs-deal workflows

---

## Key Files to Modify

### Backend
- `backend/app/agents/prompts.py` — New extraction-focused prompts
- `backend/app/agents/single_deal_qa.py` → `extraction_agent.py` — Structured extraction logic
- `backend/app/api/routes_stream.py` — Extraction streaming endpoint
- `backend/app/models/` — New models for ExtractionResult, LineItem, StatementType
- New: `backend/app/services/extraction.py` — Core extraction pipeline

### Frontend
- `frontend/src/app/page.tsx` — New single-company workspace layout
- `frontend/src/components/MatrixGrid.tsx` → `ExtractionTable.tsx` — Line item table
- `frontend/src/components/MatrixCell.tsx` → `ExtractionRow.tsx` — Editable extracted values
- New: `frontend/src/components/ExtractionReview.tsx` — Side-by-side doc + extracted data
- Keep: `frontend/src/components/DocumentViewer.tsx` — Source document panel

---

## UX Mockup

```
┌─────────────────────────────────────────────────────────┐
│  VYNTIC  │  Acme Corp ▼  │  Q3 2025 Revenue Report     │
├──────────┴───────────────┬──────────────────────────────┤
│                          │                              │
│  EXTRACTED DATA          │  SOURCE DOCUMENT             │
│  ─────────────           │  ──────────────              │
│                          │                              │
│  Line Item    │ Value    │  [PDF/XLS viewer showing     │
│  ─────────────┼────────  │   the original document      │
│  Gross Rev    │ $4.2M ✅ │   with highlighted regions   │
│  Net Revenue  │ $3.8M ✅ │   matching extracted data]   │
│  COGS         │ $1.1M ✅ │                              │
│  Gross Margin │ 73.8% ✅ │                              │
│  OpEx         │ $1.9M ⚠️ │  ← click to see source      │
│  EBITDA       │ $0.8M ✅ │                              │
│               │          │                              │
│  [+ Add row]             │                              │
│                          │                              │
├──────────────────────────┴──────────────────────────────┤
│  [Export to Excel ▼]  [Save & Next Statement]           │
└─────────────────────────────────────────────────────────┘
```

---

## Verification Plan

1. Upload a sample financial PDF → verify extraction produces structured line items
2. Upload a sample XLS → verify table data is correctly parsed and extracted
3. Click an extracted value → verify it highlights the source location in the document viewer
4. Export as XLSX → verify clean spreadsheet with line items, values, source references
5. Upload a second statement from same company → verify format recognition
6. Test with real-world messy statements (scanned PDFs, inconsistent formatting)

---

## Implementation Order

1. **New extraction prompt + agent** — LLM extracts structured JSON from document chunks
2. **New data models** — ExtractionResult, LineItem with confidence scores
3. **New API endpoint** — POST /extract with streaming progress
4. **New frontend layout** — Split view: extracted table | document viewer
5. **Export** — XLSX download of extracted data
6. **Polish** — Company management, statement history, format templates

---

## Key Insight from PE Analyst Interview

> "Same type of statements from the same set of 10 companies. Digesting and reading the CSVs and PDFs that Claude won't catch."
> — Their internal team is actively building this. Validated demand, no market solution.

### Why not Claude/Cowork?
- Claude is session-based (no persistence)
- Claude gives text answers, not structured data
- Claude handles one-off tasks, not recurring workflows
- Claude can't learn company-specific statement formats

### Competitive Positioning
| Capability | Claude/Cowork | Internal Tools | Vyntic |
|---|---|---|---|
| General doc Q&A | ✅ | ❌ | ⚠️ Don't compete |
| Structured extraction | ❌ | 🔨 Building | ✅ Core value |
| Persistent deal memory | ❌ Session-based | ❌ Siloed | ✅ |
| Format learning | ❌ | ❌ | ✅ Phase 2 |
| Export to Excel models | ❌ | Partial | ✅ |
