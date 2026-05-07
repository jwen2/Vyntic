# Workflows Feature — Implementation Plan

> **Living document.** Updated each session as work progresses. A future Claude (or human) should be able to open this file cold and resume with no other context.

## 1. What we're building

A **Workflows** feature for Vyntic — reusable, deal-scoped templates that turn deal documents into structured outputs. Two modes:

- **Assistant** — multi-stage prompt pipelines that produce IC-ready memos (markdown / Word).
- **Tabular** — column-defined extraction grids (rows = docs or synthesized questions; columns = format-enforced LLM extractions).

Inspired by the open-source Mike repo (Harvey clone) but extended for PE diligence requirements: cell-level citations, immutable run history, deal-scoped permissions, multi-stage runs with checkpoints, formula columns, multi-doc synthesis, Excel/Word output.

## 2. Source-of-truth references

| Resource | Path |
|---|---|
| **Design handoff (canonical spec)** | `~/Desktop/PE Data Analysis/design_handoff_workflows/` — `README.md` is the authoritative design doc; `Workflows Feature.html` is the interactive canvas; per-screen JSX in `components/` |
| Mike repo (reference) | `~/Desktop/PE Data Analysis/mike/` |
| Vyntic codebase | `~/Desktop/PE Data Analysis/spokematrix/` |
| This plan | `spokematrix/docs/workflows_implementation_plan.md` |

The design handoff README is the source of truth for screens, data model, behavior, and v1 scope. This plan tracks **how** we're implementing it inside the existing Vyntic codebase.

## 3. Codebase orientation

### Backend (FastAPI + SQLAlchemy + SQLite)
- **SQLAlchemy models live in `backend/app/database.py`** (not `models/`). The `models/` directory holds Pydantic request/response schemas only.
- **No migrations system.** `init_db()` calls `Base.metadata.create_all`. Additive schema changes use a manual shim like `_ensure_document_cache_columns()` in `database.py`. Net-new tables work out of the box on next startup.
- **Route pattern:** `backend/app/api/routes_*.py`, registered in `main.py`. Auth via `Depends(get_current_user)` + `require_deal_access(user, deal_id)`.
- **Service layer:** `backend/app/services/*.py` — thin DB/IO wrappers (e.g., `deal_store.py`).
- Existing tables: `deals`, `documents`, `users`, `deal_access`, `investigations`, `investigation_followups`, plus matrix/conversation tables.

### Frontend (Next.js 15 / React 19, app router)
- **Inline `style={{}}` with `ddTheme(theme)` tokens — NOT Tailwind classes for theming.** The handoff README incorrectly says "use Tailwind classes"; ignore that. Match the inline-style + `ddTheme` pattern from existing `src/components/dd/*` files. Tokens at `src/components/dd/types.ts`.
- **Mode-based deal workspace:** `src/app/deal/[dealId]/page.tsx` renders different views based on `mode` (`assistant` | `agent` | `workstreams`). We add `workflows` to this union.
- **Top bar segmented control:** `src/components/dd/TopBar.tsx`. The `DealWorkspaceMode` type and `ModeSegmentedControl` `items` array are the insertion points.
- **API client:** `src/lib/api.ts` — fetch wrappers, auth token, types. New module: `src/lib/workflows.ts`.
- **Reusable for tabular grid:** `src/components/MatrixGrid.tsx`, `src/components/MatrixCell.tsx`, `src/lib/matrixColumnConfig.ts` (`ColumnFormat`, `FORMAT_OPTIONS`, `getPillClass`, `PE_COLUMN_PRESETS`), `src/lib/exportMatrix.ts`, `src/components/DocumentViewer.tsx`, `src/components/dd/CitationPanel.tsx`.

### Important deviations from the handoff README
1. **Backend stack:** handoff assumes TypeScript (`src/lib/api.ts` server-side, drizzle-style schema). Actual: Python FastAPI + SQLAlchemy. The handoff's SQL DDL is the **target schema**; we translate it to SQLAlchemy column definitions.
2. **Theming:** handoff says "Tailwind dark mode classes." Actual: inline styles with `ddTheme()`.
3. **Migrations:** handoff implies real migrations. Actual: `create_all` + additive shims. Sufficient for now; revisit for prod.

## 4. Phase plan

| Phase | Scope | Outcome |
|---|---|---|
| **1. Skeleton + Library + Editors** | Workflows tab; CRUD endpoints + 4 tables (workflows, stages, columns, variables); 8 seed templates; Library, Assistant Editor, Tabular Editor screens | Browse, clone, edit templates. No execution. |
| **2. Tabular execution** | `workflow_runs` + `tabular_cells` tables; run-start endpoint; per-cell LLM executor; SSE streaming; Tabular Run + Output screens | End-to-end tabular workflow. |
| **3. Assistant execution + checkpoints** | `assistant_stage_outputs`; staged executor with pause/resume; Assistant Run + Memo Output screens | End-to-end assistant workflow. |
| **4. Polish (v1 close)** | Excel/Word export endpoints; formula columns; multi-doc synthesis rows; run history viewer | Ship-ready v1 (matches handoff "v1 must ship" list). |

## 5. Phase 1 detail — Skeleton + Library + Editors

### 5.1 Backend tasks

| # | File | Task |
|---|---|---|
| 1.1 | `backend/app/database.py` | Add SQLAlchemy classes: `WorkflowRow`, `WorkflowStageRow`, `WorkflowColumnRow`, `WorkflowVariableRow`. CASCADE on `deal_id` and `workflow_id`. |
| 1.2 | `backend/app/models/workflow.py` (NEW) | Pydantic schemas: `Workflow`, `WorkflowCreate`, `WorkflowUpdate`, `WorkflowStage`, `WorkflowColumn`, `WorkflowVariable`, plus enums (`WorkflowType`, `RowSource`, `OutputFormat`, `ColumnFormatPy`). |
| 1.3 | `backend/app/services/workflow_store.py` (NEW) | DB helpers: `list_workflows(deal_id)`, `get_workflow(workflow_id)`, `create_workflow`, `update_workflow`, `delete_workflow`, `clone_workflow`. |
| 1.4 | `backend/app/api/routes_workflows.py` (NEW) | Endpoints: `GET/POST /deals/{deal_id}/workflows`, `GET/PUT/DELETE /deals/{deal_id}/workflows/{workflow_id}`, `POST /deals/{deal_id}/workflows/{workflow_id}/clone`. |
| 1.5 | `backend/app/main.py` | Register `routes_workflows.router`. |
| 1.6 | `backend/app/services/workflow_seed.py` (NEW) | Seed 8 built-in templates idempotently. Called from `main.py` startup, after `seed_sample_data`. Built-ins use `is_builtin=True` and a special `deal_id="__builtin__"` (or null) — TBD during build. |

### 5.2 Frontend tasks

| # | File | Task |
|---|---|---|
| 2.1 | `frontend/src/lib/workflows.ts` (NEW) | API client + TS types matching Pydantic models. Reuse `getAuthToken()` and `apiFetch` patterns from `lib/api.ts`. |
| 2.2 | `frontend/src/components/dd/TopBar.tsx` | Add `"workflows"` to `DealWorkspaceMode`; add icon + label to `ModeSegmentedControl items`. |
| 2.3 | `frontend/src/app/deal/[dealId]/page.tsx` | Update `loadNavFromLocal` to accept `"workflows"`; add render branch for `mode === "workflows"` rendering `<WorkflowsView />`. |
| 2.4 | `frontend/src/components/workflows/WorkflowsView.tsx` (NEW) | Shell that owns sub-route state (`library` \| `editor`) and the selected workflow id. Renders `<WorkflowLibrary>` or `<WorkflowEditor>`. |
| 2.5 | `frontend/src/components/workflows/WorkflowLibrary.tsx` (NEW) | Library screen — search + Built-in / Custom sections + workflow cards. |
| 2.6 | `frontend/src/components/workflows/WorkflowCard.tsx` (NEW) | Card primitive — icon + title + type tag + run count + description + Run/Edit buttons. |
| 2.7 | `frontend/src/components/workflows/AssistantEditor.tsx` (NEW) | 3-column editor — stages rail + prompt editor + flow preview. |
| 2.8 | `frontend/src/components/workflows/TabularEditor.tsx` (NEW) | 2-column editor — config panel + live grid preview. Reuses `ColumnFormat` from `matrixColumnConfig.ts`. |
| 2.9 | `frontend/src/components/workflows/types.ts` (NEW) | Shared FE-only types and small helpers (icons per type, etc.). |

### 5.3 Verification

- `npm run dev` (frontend) + uvicorn (backend) start cleanly.
- Navigate to a deal → click "Workflows" tab → see 8 built-in templates.
- Click "Edit Copy" on a built-in → custom copy appears under "Custom Workflows."
- Open the custom workflow in editor → assistant or tabular UX renders correctly per type.
- Edit a stage prompt or column → save → reload → change persists.
- Delete the custom workflow → it's gone.

### 5.4 Out of Phase 1 (deferred)

- Run execution (no `workflow_runs` table yet; `Run` button on cards is a stub or hidden).
- SSE streaming.
- Excel/Word export.
- Cell editing / citation viewer.
- Formula columns / multi-doc synthesis (in `WorkflowColumnRow` schema but disabled in editor UI).
- Deal-lead vs analyst permission split (everyone with deal access can edit for now).

## 6. Phase 2–4 detail (sketch — fill in when phase starts)

### Phase 2: Tabular execution

**Existing patterns to reuse (verified in worktree):**
- LLM client: `backend/app/agents/llm.py` — `stream_with_fallback(messages)` async generator + `_last_meta` singleton (model, fallback flag, duration_ms). Reuse directly.
- Document-scoped extraction: pattern at `backend/app/api/routes_doc_matrix.py:31-95` (`_stream_doc_answer`). Steps: `query_document(deal_id, doc_id, query)` → ChromaDB filter by `doc_id` → `build_context_string()` → SystemMessage with `SINGLE_DEAL_SYSTEM` + interpolated context + HumanMessage → stream → `extract_citations()`. Mirror for cells.
- Citation model: `backend/app/models/query.py` — `Citation(source_file, page, text_snippet, deal_id?)`. Reuse.
- Citation extraction: `backend/app/utils/citations.py:441-547` — `extract_citations(answer, retrieved_chunks, deal_id, page_context_chunks)` returns `(cleaned_answer, citations)`.
- SSE: `StreamingResponse(media_type="text/event-stream")`, events as `data: {json}\n\n`.
- Vector store: `backend/app/services/vector_store.py` — `query_document(deal_id, doc_id, query)`, `get_document_chunks(deal_id, doc_id)`.

**Net-new in Vyntic:**
- `formatPromptSuffix()` analog (port from Mike) — appends format-specific output instructions per `ColumnFormat`. New `backend/app/services/workflow_format.py`.
- Per-cell run/cell persistence — no `*_runs`/`*_cells` tables exist yet.

**Schema (new tables in `database.py`):**
```
workflow_runs:
  id (uuid), workflow_id (FK), deal_id (FK), run_number (int, per-workflow),
  status (pending|running|complete|cancelled|error),
  document_ids_json (text), started_by (FK users nullable),
  started_at, completed_at
  Index: (workflow_id, run_number desc)

tabular_cells:
  id (uuid), run_id (FK CASCADE), row_key (string — doc_id; later: synthesis_q_id),
  column_id (FK workflow_columns), status (queued|running|complete|error),
  answer (text), answer_formatted_json (text), citations_json (text),
  model, fallback, duration_ms, error_message,
  started_at, completed_at
  Index: (run_id, status), (run_id, row_key, column_id)
```

**Endpoints (new `routes_workflow_runs.py`):**
- `POST /deals/{deal_id}/workflows/{workflow_id}/runs` — body `{ document_ids: string[] }`. Creates run + queued cells, kicks off executor task. Returns the run.
- `GET /deals/{deal_id}/workflows/{workflow_id}/runs` — list runs for a workflow.
- `GET /runs/{run_id}` — full run + cells.
- `GET /runs/{run_id}/stream` — SSE: per-cell status updates as cells flow queued→running→complete.
- `POST /runs/{run_id}/cancel` — sets queued cells to cancelled.

**Executor design:**
- Background task spawned via `asyncio.create_task` from the route handler (returns immediately).
- Bounded concurrency: `asyncio.Semaphore(N=4)` over cells.
- Per cell: load column → `query_document(deal_id, doc_id, prompt)` → assemble messages with column prompt + format suffix → `stream_with_fallback` → `extract_citations` → save cell → broadcast SSE event.
- SSE broadcast: in-memory `defaultdict[run_id, list[asyncio.Queue]]`. Each connected client gets its own queue; producer pushes events to all queues for that run. Cleaned up on disconnect.
- Run finalization: when all cells reach a terminal state, mark run `complete` (or `error` if any cell errored).

**FE work:**
- `lib/workflows.ts`: types for `WorkflowRun`, `TabularCell`; `startWorkflowRun`, `getRun`, `streamRun` (EventSource), `cancelRun`.
- `WorkflowsView`: add screen states `run` (live grid) and `output` (completed grid).
- `DocumentSelectorModal`: checkbox list of deal documents, "Run" CTA.
- `TabularRun`: 2-col split — left = doc list with status icons + run log; right = live grid with progressive cell fills + cell-detail panel.
- `TabularOutput`: 2-col split — left = stats bar + grid; right = cell detail + run history.
- Wire Run buttons in `WorkflowCard` and `TabularEditor` to open `DocumentSelectorModal`.

**Phase 2 cuts (deferred):**
- Editing a completed cell's answer manually (Phase 4).
- Run history viewer (Phase 4).
- Multi-doc synthesis row execution (Phase 4 — Phase 2 only `one_doc_per_row`).
- Cancel mid-run cleanup of in-flight LLM call (queued cells stop, in-flight finish naturally).
- Excel export (Phase 4).

### Phase 3: Assistant execution + checkpoints
- Table: `assistant_stage_outputs`.
- Executor runs stages serially. After each stage with `checkpoint=true`, status → `checkpoint`; user calls approve endpoint to resume.
- `POST /runs/{run_id}/stages/{stage_id}/approve` body: `{ edited_md?: string }`.
- FE: `AssistantRun.tsx` (3-column with editable checkpoint output), `MemoOutput.tsx` (centered memo + TOC).

### Phase 4: Polish for v1 close
- Excel: extend `exportMatrix.ts` for tabular runs.
- Word: server-side python-docx or similar for memos.
- Formula columns: simple expression evaluator on already-extracted cell values.
- Multi-doc synthesis rows: `row_source = "multi_doc_synthesis"` — workflow stores synthesis questions; runs spawn one cell per (question, column).
- Run history viewer in output screens.

## 7. Open questions / TBD

- **Built-in workflow scoping:** scope built-ins with `deal_id=NULL` and filter `WHERE deal_id IS NULL OR deal_id = :dealId`, or copy the seed into every deal? *Decision (Phase 1.1):* `deal_id=NULL` + global read; cloning materializes a deal-scoped copy.
- **`run_number` per workflow vs per deal:** handoff says "auto-increment per workflow." Use a SELECT MAX(run_number)+1 on insert, guarded by row lock on the workflow row, or a separate counter column on `workflows`. Defer to Phase 2.
- **Permissions:** handoff says only deal leads can edit. We currently don't have a "lead" role distinct from "analyst." Defer; let any deal member edit in v1, gate later via `deal_access.role`.
- **Variables UX:** how are variables (`{deal_name}`, `{sector}`) interpolated at run time, and where are deal-level values stored? Defer to Phase 2 — Phase 1 just stores them in `workflow_variables`.

## 8. Progress log

Newest entries at the top. Each entry: date, phase step, what landed, file paths.

### 2026-05-06 — Phase 4 v1 close ✅

Finished the Phase 4 workflow polish pass.

**Files added:**
- `backend/app/services/workflow_exports.py` — server-side Excel and Word
  export helpers using `openpyxl` and `python-docx`.

**Files modified:**
- `backend/app/api/routes_workflow_runs.py` — tabular multi-doc synthesis run
  creation plus `GET /runs/{run_id}/export.xlsx` and
  `GET /runs/{run_id}/export.docx`.
- `backend/app/models/workflow_run.py` — `synthesis_questions` on run-create.
- `backend/app/services/workflow_run_store.py` — generic row keys for tabular
  runs, full cell/column loaders for export and formulas.
- `backend/app/services/workflow_run_executor.py` — formula cells now evaluate
  after extraction cells; multi-doc synthesis cells retrieve across all selected
  documents.
- `frontend/src/lib/workflows.ts` — synthesis-question run payload and export
  download client.
- `frontend/src/components/workflows/DocumentSelectorModal.tsx` — synthesis row
  editor shown for `multi_doc_synthesis`.
- `frontend/src/components/workflows/TabularRun.tsx` — synthesis rows render in
  the grid, derived columns are included, completed tabular runs expose Excel
  export.
- `frontend/src/components/workflows/MemoOutput.tsx` — Word export button.
- `frontend/src/components/workflows/WorkflowsView.tsx`,
  `WorkflowLibrary.tsx`, `WorkflowCard.tsx` — run history drawer and ability to
  reopen existing runs.

**Verification status:**
- ✅ Backend py_compile for changed workflow modules.
- ✅ Frontend `npm run build`.
- ✅ Formula evaluator sanity check in backend container:
  `IF(CoC="No" AND Exclusivity="Yes", "High", "Low") → High`,
  `[Reported EBITDA]+[Owner Adj] → 15`.

### 2026-05-05 — Phase 3.5 value-first workflow outputs ✅

Added a value-first extraction pass after reviewing the Mike workflow model and
the Phase 3 run implementation. Decision: no schema overhaul yet. Vyntic's
durable run/cell/stage model is the right foundation; the missing piece was
the output contract and presentation layer.

**Files modified:**
- `backend/app/services/workflow_format.py` — format suffixes now instruct
  the LLM to return compact values first, with citations after the value.
  Numbers, percentages, dates, currencies, tags, and yes/no answers are
  constrained to analyst-usable cells instead of explanatory prose. Missing
  values should return blank.
- `backend/app/services/workflow_run_executor.py` — assistant stages now get
  an output discipline directive: default to extracted findings, compact
  bullets, short tables, or labeled values; only write memo prose when the
  stage explicitly asks for a memo.
- `frontend/src/components/workflows/TabularRun.tsx` — completed tabular
  cells render from `answer_formatted` first and show only the compact value
  in-grid. Cells stay collapsed to one small line; clicking a value opens its
  supporting document when citations exist.
- `frontend/src/components/workflows/MemoOutput.tsx` — assistant output labels
  now distinguish memo output from extraction output for markdown-style runs.

**Recommendation for Phase 4:**
- Add an explicit workflow-level `output_style` enum:
  `value_extract | findings_pack | memo_draft`.
- Add a right-side cell/detail drawer for tabular runs so the compact grid
  stays clean while full rationale, citations, model metadata, and analyst
  edits remain one click away.
- Add built-in templates specifically for source extraction, such as
  "Key Metrics Extract", "Contract Terms Extract", and "Management Q&A Extract."

### 2026-05-05 — Phase 3 assistant execution + checkpoints ✅ (backend verified end-to-end)

Phase 3 ships the assistant workflow execution path: serial stage runs,
checkpoint pause/resume, analyst-edited stage outputs, and the
checkpoint-aware `AssistantRun` and `MemoOutput` screens.

**Files added (2):**
- `frontend/src/components/workflows/AssistantRun.tsx` — 3-col live view
  (stage rail + focused stage detail with checkpoint editor + input docs).
- `frontend/src/components/workflows/MemoOutput.tsx` — centered memo
  (TOC + sources sidebar) for completed assistant runs.

**Files modified:**
- `backend/app/database.py` — `WorkflowRunRow.stage_outputs` relationship +
  new `AssistantStageOutputRow` table. Stage data (label / prompt_md /
  checkpoint) is snapshotted onto the row at run-create so editing the
  template later doesn't corrupt prior runs.
- `backend/app/models/workflow_run.py` — `AssistantStageOutput` schema,
  `StageOutputStatus` literal, `StageApprovePayload`, `StageOutputEvent`.
  `RunStatus` extended with `"checkpoint"`.
- `backend/app/services/workflow_run_store.py` — assistant-run helpers:
  `create_assistant_run`, `next_queued_stage`, `mark_stage_running`,
  `complete_stage(needs_checkpoint=...)`, `approve_stage`, `error_stage`,
  `cancel_queued_stages`, `all_stages_terminal`, `list_terminal_stages`.
- `backend/app/services/workflow_run_executor.py` — `execute_assistant_run`
  (loop over queued stages, pause on checkpoint) and
  `execute_assistant_stage` (build prior-stage context + multi-doc
  retrieval + LLM + citations). Reuses the existing `RunEventBus`.
- `backend/app/api/routes_workflow_runs.py` — POST /runs dispatches on
  workflow.type; new `POST /runs/{run_id}/stages/{stage_output_id}/approve`
  endpoint; cancel handles both cells and stages.
- `frontend/src/lib/workflows.ts` — `AssistantStageOutput` /
  `StageOutputStatus` / `RunStreamStageEvent` types, `WorkflowRun.stage_outputs`,
  `approveStage` client.
- `frontend/src/components/workflows/WorkflowsView.tsx` — `memo` screen
  state; assistant cards now route through `AssistantRun` then
  auto-flip to `MemoOutput` on `onComplete`.
- `frontend/src/components/workflows/WorkflowLibrary.tsx` /
  `WorkflowCard.tsx` — Run buttons live for both tabular and assistant.
- `frontend/src/components/workflows/TabularRun.tsx` — added the new
  `checkpoint` key to its `RunStatusPill` map (unreachable for tabular,
  but required by the type).

**Verification status:**
- ✅ Backend: full assistant run drove pending → running → checkpoint →
  approve → running → checkpoint → approve (with `edited_md`) → running
  → complete on `builtin_cim_to_memo` against `acme_saas_cim.pdf`.
  3 stages, citations attached per stage, analyst edit preserved
  in `assistant_stage_outputs.edited_md`.
- ✅ TypeScript clean (`npx tsc --noEmit` for `src/components/workflows/**`).
- ✅ FE rendered correctly through stage 1 running (verified on dev
  preview): stage rail shows ●/numbers, focused stage shows
  "Generating…" placeholder, input-docs sidebar populated, summary line
  reads `Stage 1 of 3 · generating`.
- ✅ Backend SSE confirmed via curl — `text/event-stream` returns the
  expected `{"type": "snapshot", ...}` envelope and stays open through
  checkpoints (no terminal-event close).
- ⚠️ Live SSE updates inside the browser: works through the docker prod
  frontend proxy (port 3100), but Next.js 14's dev-server proxy
  (`npm run dev` on port 3000) buffers the response and EventSource
  receives nothing until reconnect. **This is pre-existing** — the same
  issue is visible on the user's tabular runs as repeated
  "Stream connection error — reconnecting…" log entries; it's not a
  Phase 3 regression. Verify assistant run UX on port 3100 (or the
  docker `frontend-dev` build at 3200) until the dev-proxy is fixed.

**Decisions taken during build:**
- **Schema snapshotting:** `assistant_stage_outputs` copies `label`,
  `prompt_md`, and `checkpoint` from the workflow stage at run-create
  time. This prevents a mid-run edit to the workflow template from
  corrupting an in-flight or historical run. `stage_id` is kept as a
  back-pointer with `ON DELETE SET NULL` so deletes don't cascade-blow
  the run history.
- **Re-entrant executor:** `kick_off_assistant_run` is safe to call
  multiple times. After approve, the route just calls it again — the
  loop picks up from the next queued stage, so we don't need a separate
  resume path or signal-channel. Guards against double-execution would
  require a per-run lock; deferred until concurrent approve clicks
  become a real problem.
- **Run-level `checkpoint` status:** added to `RunStatus` literal so the
  status pill / SSE consumers can distinguish "paused waiting for
  human" from "still grinding". Tabular runs never enter this state.
- **Multi-doc context:** stage prompts retrieve chunks across all
  selected documents and concatenate via `build_context_string`. We
  pass `page_context_chunks=None` to `extract_citations` because
  there's no single canonical full-text per stage. This loses the
  "exact-page" disambiguation that single-doc tabular cells get;
  acceptable for memos where the citation is a pointer back to the
  source doc, not a precise quote anchor.
- **MemoOutput is a separate screen** (not a "complete" branch inside
  AssistantRun): cleaner separation, lets the analyst go from a
  3-column live view straight into a centered memo without the rail
  dominating. AssistantRun fires `onComplete` once when the SSE
  delivers `status="complete"` (or on initial REST snapshot if the run
  was already done). WorkflowsView flips screen state to `memo`.
- **Stage events are published before run events:** `complete_stage`
  → publish stage event → set run status → publish run event. Lets the
  FE update the focused stage state before the run-level transition.
- **Edit handling:** the textarea uses `editDrafts: Map<id, string>`
  for the active checkpoint. We send `edited_md` only if it differs
  from `output_md`; otherwise the backend stores `null` and the memo
  view falls back to the raw output. Approving without typing keeps
  the memo lean.

**Notes for future sessions:**
- Phase 4 deliverables that are Phase-3-adjacent: Word/PDF export of
  the memo (server-side python-docx), and a "view existing run" entry
  point from the library so users can open a completed assistant run
  directly to MemoOutput. Today the only path into AssistantRun /
  MemoOutput is to start a fresh run.
- The `Run #N · Memo Output` view does not currently expose a way to
  re-edit a stage post-completion. Decision: edits during the run are
  the audit boundary; post-run edits would need a versioned stage_output
  story (Phase 4 territory).
- Citations rendering uses `cite.source_file · p.{page}` with the
  snippet on click. The `[Source N]` markers are stripped from
  `output_md` by `extract_citations`. If you want inline citation
  pills inside the memo body (rather than the footer chips today),
  we'd need to keep the markers and post-render replace them — a
  ~half-day refactor.
- The dev-proxy SSE issue can be worked around by setting
  `NEXT_PUBLIC_API_URL=http://localhost:8000` and adjusting CORS so the
  browser hits FastAPI directly. Out of scope for Phase 3.

### 2026-05-04 — Phase 2 backend + run UX complete ✅ (verification pending)
Phase 2 ships tabular execution end-to-end: per-cell LLM calls with format
enforcement, citations, SSE streaming, and a live-grid run viewer.

Built in a separate `git worktree` at `~/Desktop/PE Data Analysis/spokematrix-phase2/`
(branch `workflows-phase-2`) so the user's Phase 1 testing on the original
checkout was undisturbed.

**Files added (8):**
- `backend/app/models/workflow_run.py` — Pydantic schemas for runs, cells, SSE events.
- `backend/app/services/workflow_run_store.py` — SQLAlchemy store for runs + cells.
- `backend/app/services/workflow_format.py` — `format_prompt_suffix()` (port from Mike) + `parse_answer()` per-format parser.
- `backend/app/services/workflow_run_executor.py` — async per-cell executor + in-memory `RunEventBus` (pub-sub keyed by run_id).
- `backend/app/api/routes_workflow_runs.py` — POST run, GET run, GET stream (SSE), POST cancel, GET runs list.
- `frontend/src/components/workflows/DocumentSelectorModal.tsx` — pre-run document picker.
- `frontend/src/components/workflows/TabularRun.tsx` — split-pane live grid (docs+log left, grid+cell-detail right) with SSE subscription.

**Files modified:**
- `backend/app/database.py` — `WorkflowRunRow` + `TabularCellRow` tables.
- `backend/app/main.py` — register `workflow_runs_router`.
- `frontend/src/lib/workflows.ts` — run/cell types + `startWorkflowRun`, `getRun`, `cancelRun`, `subscribeRun` (EventSource with `?token=` auth).
- `frontend/src/components/workflows/WorkflowsView.tsx` — `run` screen state + modal wiring.
- `frontend/src/components/workflows/WorkflowLibrary.tsx` — passes `onRun` to tabular cards.
- `frontend/src/components/workflows/WorkflowCard.tsx` — Run button live for tabular when `onRun` provided; assistant cards still show `Run (Phase 3)`.

**Verification status:**
- ✅ TypeScript check (`npx tsc --noEmit`) clean in worktree (after symlinking node_modules from main checkout).
- ✅ Python imports clean for all new modules.
- ✅ `parse_answer()` smoke-tested for yes_no / number / percentage / monetary_amount / date / bulleted_list / tag — all return correctly typed values.
- ⏳ End-to-end browser verification deferred until Phase 1 PR merges; the running docker mounts the user's main checkout, not the worktree, and we don't want to disrupt their Phase 1 test session.

**Decisions taken during build:**
- Reused Vyntic's existing `[Source N]` citation convention rather than Mike's `[[page:N||quote:...]]` JSON shape — keeps `extract_citations()` reusable as-is. Trade-off: less rich citations than Mike's spec but zero new parsing code.
- Bounded executor concurrency via `asyncio.Semaphore(4)`. Tunable later via env var if Gemini rate limits become tight.
- `RunEventBus` is in-memory per process. Single-uvicorn-worker assumption holds for now; multi-worker requires Redis pub-sub later (logged as TODO).
- TabularOutput viewer (separate completed-run screen with stats bar + run history sidebar + export actions) deferred to Phase 4 — `TabularRun` already renders terminal state correctly. Re-prioritize once IC needs to look at past runs.
- Derived columns are stubbed: their cells complete with a "deferred to Phase 4" placeholder rather than failing. Keeps QofE Bridge's `Adjustment Quality` column from blocking the rest of the run.
- Cancel sets queued cells to error with "Cancelled before execution" — in-flight cells finish naturally (no kill of in-flight LLM call). Acceptable for Phase 2.
- Multi-doc synthesis still deferred — Phase 2 only handles `one_doc_per_row`.

**Notes for future sessions:**
- Run number is computed via `MAX(run_number) + 1` per workflow at create time — fine for low concurrency; if multiple users start runs simultaneously on the same workflow, they could collide. Wrap in transaction or move to a counter column when this matters.
- SSE stream's heartbeat is `: ping\n\n` every 20s when idle — keeps proxies from killing the connection.
- The frontend reconnects automatically on EventSource error (browser default). Server-side state is durable, so reconnect just re-subscribes; clients should refetch via REST after disconnect to catch missed events.

### 2026-05-03 — Phase 1 complete ✅
End-to-end happy path verified on dev server (1440×900 dark mode):
- Workflows tab renders in deal workspace top bar.
- Library lists all 8 built-in templates in 3-col grid + Custom Workflows section.
- "Edit Copy" on a built-in creates a deal-scoped clone (verified for both `assistant` and `tabular` types).
- AssistantEditor renders 3-col layout (stages rail / prompt editor / flow preview) with editable name, prompt, checkpoint toggle, output format toggle.
- TabularEditor renders 2-col layout (config panel / live grid preview) with row source toggle, column cards with format badges, derived columns section.
- Save / Delete actions wire correctly; built-ins are read-only.

Files added (12):
- `backend/app/models/workflow.py`
- `backend/app/services/workflow_store.py`
- `backend/app/services/workflow_seed.py`
- `backend/app/api/routes_workflows.py`
- `frontend/src/lib/workflows.ts`
- `frontend/src/components/workflows/WorkflowsView.tsx`
- `frontend/src/components/workflows/WorkflowLibrary.tsx`
- `frontend/src/components/workflows/WorkflowCard.tsx`
- `frontend/src/components/workflows/AssistantEditor.tsx`
- `frontend/src/components/workflows/TabularEditor.tsx`
- `frontend/src/components/workflows/theme.ts`

Files modified:
- `backend/app/database.py` (4 new SQLAlchemy classes + their relationships)
- `backend/app/main.py` (register `workflows_router` + call `seed_builtin_workflows()` on startup)
- `frontend/src/components/dd/TopBar.tsx` (added `"workflows"` to `DealWorkspaceMode` + segmented control item)
- `frontend/src/app/deal/[dealId]/page.tsx` (loadNavFromLocal accepts new mode; new render branch; sidebar hidden in workflows mode)

DB shape after Phase 1 (verified via `sqlite3 data/vyntic.db ".tables"`):
- New tables: `workflows`, `workflow_stages`, `workflow_columns`, `workflow_variables`.
- Built-ins seeded with deterministic IDs (`builtin_*`) so re-seed is a no-op.

Decisions taken during build:
- **Built-in scoping:** `deal_id IS NULL` + `is_builtin=TRUE`. Filter in `list_workflows` is `WHERE deal_id IS NULL OR deal_id = :deal_id`. Confirmed in §7.
- **Replace-vs-merge for stages/columns/variables on update:** went with full replace (simpler than diff). `workflow_store._replace_children` handles it.
- **No-execution Phase 1 UX:** Run buttons render as `Run (soon)` and are disabled. Avoids dead-end state when users click before Phase 2 lands.

Notes for Phase 2:
- Backend port 8000 is already running under Docker (`docker-compose.yml`) with volume-mounted source + uvicorn `--reload` — file edits hot-reload, schema additions land via `init_db()` on restart. No DB reset needed; new tables + seeds just appear.
- Default admin login is `admin@vyntic.com` / `admin` (from `app/config.py`).
- `.claude/launch.json` at the workdir root has `backend` and `frontend` entries already; use `frontend` for Next dev server.
- One stale custom workflow may exist in the dev DB from manual verification (`QofE Bridge (Copy)` and `CIM → IC Memo Draft (Copy)` for the `acme_saas` deal). Harmless; deletable via UI.

### 2026-05-03 — Plan authored
- Surveyed Vyntic codebase + design handoff.
- Created this plan doc.
- Phase 1 task list seeded; starting on Phase 1.1 (SQLAlchemy models).

### Status
- [x] Phase 1.1 — SQLAlchemy workflow models in `database.py`
- [x] Phase 1.2 — Pydantic schemas in `models/workflow.py`
- [x] Phase 1.3 — `workflow_store.py` service
- [x] Phase 1.4 — `routes_workflows.py` endpoints
- [x] Phase 1.5 — Register router in `main.py`
- [x] Phase 1.6 — `workflow_seed.py` (8 built-in templates)
- [x] Phase 1.7 — `lib/workflows.ts` FE client
- [x] Phase 1.8 — TopBar mode + segmented control
- [x] Phase 1.9 — `page.tsx` mode plumbing
- [x] Phase 1.10 — `WorkflowsView.tsx` shell
- [x] Phase 1.11 — `WorkflowLibrary.tsx`
- [x] Phase 1.12 — `WorkflowCard.tsx`
- [x] Phase 1.13 — `AssistantEditor.tsx`
- [x] Phase 1.14 — `TabularEditor.tsx`
- [x] Phase 1.15 — Verify end-to-end on dev server
- [x] Phase 2 — Tabular execution (PR #67 merged into main 2026-05-04)
- [x] Phase 3.1 — `AssistantStageOutputRow` table + relationship
- [x] Phase 3.2 — `workflow_run_store` assistant helpers
- [x] Phase 3.3 — `execute_assistant_run` + `execute_assistant_stage`
- [x] Phase 3.4 — `POST /runs/{run_id}/stages/{stage_output_id}/approve`
- [x] Phase 3.5 — FE `workflows.ts` types + `approveStage` client
- [x] Phase 3.6 — `AssistantRun.tsx`
- [x] Phase 3.7 — `MemoOutput.tsx`
- [x] Phase 3.8 — `WorkflowsView` + library wiring
- [x] Phase 3.9 — Backend end-to-end verified (FE blocked on dev-proxy SSE — works on docker prod 3100)
- [x] Phase 4.1 — Excel export for tabular runs
- [x] Phase 4.2 — Word export for assistant memos
- [x] Phase 4.3 — Formula columns evaluator
- [x] Phase 4.4 — Multi-doc synthesis row execution
- [x] Phase 4.5 — Run history viewer + "open existing run" entry point

**Next session: UX improvements.** Phase 4 is implemented for v1. Remaining
product/design work should focus on making workflow runs feel analyst-native:
compact model-ready grids, clearer cell detail/source drawers, better synthesis
question presets, and export polish.

## 9. How to resume in a future session

1. Read this file top to bottom.
2. Read the design handoff README at `~/Desktop/PE Data Analysis/design_handoff_workflows/README.md` for any screen you're about to build.
3. Look at the relevant per-screen JSX in `design_handoff_workflows/components/` as the visual source of truth (translates pretty cleanly to inline-style React).
4. Pick the first un-checked Status item in §8.
5. After each meaningful chunk of work, append a dated entry to §8 and tick the corresponding box.
6. Update §6 (later phases) when you start that phase, and §7 if you make a decision.
