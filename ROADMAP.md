# Vyntic — Product Roadmap

## Completed

### Phase 1: Core UX Polish
- [x] **Streaming responses** — LLM output streams token-by-token via SSE into matrix cells with live cursor
- [x] **Query templates** — Pre-built PE question library (Financials, Risk, Commercial, Deal Thesis) accessible via dropdown
- [x] **Export to CSV** — One-click download of the matrix with Markdown stripped for clean spreadsheet output

### Phase 2: Deal Management
- [x] **Drag-and-drop file upload** — Drop PDF/Excel directly onto deal cards in the sidebar
- [x] **Deal status & tags** — Pipeline stages (Screening / DD / IC Review / Closed) with clickable color badges, sector tags with add/remove
- [x] **Multi-file upload** — Upload entire data rooms (multiple files) per deal in a single drop or browse

### Earlier Work
- [x] Excel-style row selection (click / Ctrl+click / Shift+click)
- [x] Markdown rendering of LLM output with react-markdown + remark-gfm
- [x] Recharts bar charts for numeric data detection
- [x] Inline clickable citation badges with portal-rendered source tooltips
- [x] Auto-seed sample deals on backend startup
- [x] Deal detail panel with document list (expand in sidebar)
- [x] Rebrand to Vyntic with logo
- [x] Optimized PE investment prompts (actionable insight framing, red flag detection)

---

## Up Next

### Phase 3: Analysis Quality
_Why: The core data pipeline works. Now we need to make the analysis output more useful for real IC prep._

- [ ] **Conversation memory per deal** — Follow-up questions that build on prior answers ("drill deeper on the customer concentration you mentioned"). Analysts iterate; one-shot Q&A isn't enough.
- [ ] **Side-by-side document viewer** — Click a citation to open the actual source page alongside the answer. IC members want to verify claims against primary documents, not just trust a snippet.
- [ ] **Synthesis row** — Auto-generate a comparison summary row at the bottom when multiple deals are queried. This is the "so what" that a deal lead presents to the IC.

### Phase 4: Pre-Production Prep
_Why: Local Ollama/DeepSeek is great for iteration, but production users need faster, higher-quality answers and persistent data._

- [ ] **Swap Ollama to Claude API** — Replace local DeepSeek with Claude via Anthropic SDK. Same prompt templates, dramatically better analysis quality and speed.
- [ ] **Swap ChromaDB to managed vector DB** — Move from local ChromaDB to Pinecone or Weaviate for persistent storage, better scaling, and metadata filtering.
- [ ] **Auth & multi-tenancy** — User login so each firm/team only sees their own deals. Required before any external deployment.

### Phase 5: Enterprise Features
_Why: These are the features that differentiate Vyntic from a generic RAG tool and justify PE firm adoption._

- [ ] **Deal comparison reports** — Generate formatted PDF/DOCX comparison reports from the matrix for IC distribution.
- [ ] **Email integration** — Forward deal documents via email to auto-ingest into the right deal.
- [ ] **Audit trail** — Log every query, answer, and citation for compliance. PE firms need to demonstrate process.
- [ ] **Custom question sets** — Save and reuse question templates per firm or fund strategy (e.g., "Healthcare DD checklist").
- [ ] **Notifications** — Alert deal team members when new documents are ingested or analysis is ready.

---

## Prioritization Rationale

We sequence features by **proximity to the user's decision moment**:

1. **Phases 1-2 (done)**: Get data in, get answers out, make it feel responsive. Without streaming and drag-drop, the tool feels like a toy.
2. **Phase 3 (next)**: Make the analysis genuinely useful for IC prep. Conversation memory lets analysts dig deeper. The synthesis row is the deliverable they present. Citation verification builds trust.
3. **Phase 4**: Swap to production infrastructure. Only worth doing once the UX is validated — no point optimizing infra for a product nobody uses.
4. **Phase 5**: Enterprise stickiness. These features make Vyntic a workflow tool, not just an analysis tool.
