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

### Phase 3: Analysis Quality
- [x] **Conversation memory per deal** — Q&A history stored in SQLite, last 3 exchanges injected into LLM context for follow-up questions
- [x] **Side-by-side document viewer** — Click a citation to open the actual source PDF page in a slide-over panel for IC verification
- [x] **Synthesis row** — Auto-generated concise comparison summary (one paragraph) at the bottom of multi-deal queries with inline source citations
- [x] **SQLite persistence** — Deal store migrated from in-memory dict to SQLAlchemy/SQLite — deals survive container restarts
- [x] **Citation integrity** — LLM no longer fabricates [Source N] references when no documents are ingested
- [x] **DeepSeek-R1 think tag stripping** — `<think>` blocks stripped from all streamed and stored output

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

### Phase 4: UI Polish & UX (Pre-Production)
_Why: The core pipeline and analysis features work. Now we need to make the app feel production-ready before investing in infrastructure._

| Priority | Feature | Why |
|----------|---------|-----|
| **P0** | **Error boundaries & toast notifications** | Errors show in a global red banner — needs contextual toasts (success on upload, error on query failure) so users know what happened without blocking the UI |
| **P0** | **Loading skeletons** | Replace "Analyzing..." spinners with skeleton placeholders that match the cell layout — feels faster and more polished |
| **P1** | **Dark mode** | No dark mode currently. PE analysts working late will want this. Tailwind `dark:` classes make it straightforward |
| **P1** | **Mobile/tablet responsiveness** | Sidebar is fixed 288px, matrix has no breakpoints. Need a collapsible sidebar and responsive table for tablet use |
| **P1** | **Conversation panel UI** | Backend conversation memory is built but the frontend panel needs wiring — chat sidebar with message bubbles, follow-up input, clear history |
| **P2** | **Query management** | No way to delete/reorder/rename queries once added. Need column actions (delete, rename, reorder drag-and-drop) |
| **P2** | **Deal search & filtering** | With 10+ deals the sidebar becomes unusable. Add search box, filter by stage/tag, sort options |
| **P2** | **Keyboard shortcuts** | Power users want Ctrl+Enter to submit query, Escape to close panels, arrow keys to navigate cells |
| **P2** | **Better chart visualizations** | Only bar charts right now. Add line charts for time series, comparison charts across deals |
| **P3** | **Onboarding / empty state improvement** | The "How it works" blue box is static. Add a guided walkthrough for first-time users |
| **P3** | **Component library migration** | All components are hand-built. Consider Shadcn/ui for consistency — buttons, dialogs, dropdowns, toasts all get a cohesive design system |

### Phase 5: Production Infrastructure
_Why: Only worth doing once the UX is validated — no point optimizing infra for a product nobody uses._

| Feature | Migration Path |
|---------|---------------|
| **PostgreSQL + pgvector** | SQLAlchemy models already written — swap connection string, add vector extension |
| **Swap Ollama to Claude API** | Replace local DeepSeek with Claude via Anthropic SDK. Same prompt templates, dramatically better analysis quality and speed |
| **Authentication & multi-tenancy** | NextAuth.js or Clerk — add login page, API auth headers, user-scoped deals |
| **File storage** | Local disk → S3/Azure Blob with presigned URLs |
| **Production Next.js build** | Currently running `next dev` — switch to `next build && next start` |
| **CI/CD pipeline** | GitHub Actions for lint, test, build, deploy |
| **Rate limiting & monitoring** | API rate limits, Sentry for error tracking, basic analytics |

### Phase 6: Enterprise Features
_Why: These features differentiate Vyntic from a generic RAG tool and justify PE firm adoption._

- [ ] **Deal comparison reports** — Generate formatted PDF/DOCX comparison reports from the matrix for IC distribution
- [ ] **Email integration** — Forward deal documents via email to auto-ingest into the right deal
- [ ] **Audit trail** — Log every query, answer, and citation for compliance. PE firms need to demonstrate process
- [ ] **Custom question sets** — Save and reuse question templates per firm or fund strategy (e.g., "Healthcare DD checklist")
- [ ] **Notifications** — Alert deal team members when new documents are ingested or analysis is ready

---

## Prioritization Rationale

We sequence features by **proximity to the user's decision moment**:

1. **Phases 1-3 (done)**: Get data in, get answers out, make analysis genuinely useful for IC prep. Conversation memory, document verification, and synthesis are the deliverables analysts present.
2. **Phase 4 (next)**: Polish the UI so it feels like a real product — dark mode, responsive layout, toast notifications, loading skeletons. This is what separates a prototype from something you'd put in front of an IC.
3. **Phase 5**: Swap to production infrastructure. Only worth doing once the UX is validated.
4. **Phase 6**: Enterprise stickiness. These features make Vyntic a workflow tool, not just an analysis tool.
