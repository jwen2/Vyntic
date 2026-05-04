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
- Tables: `workflow_runs`, `tabular_cells`. Indexes on `(workflow_id, run_number)` and `(run_id, status)`.
- `POST /deals/{deal_id}/workflows/{workflow_id}/runs` — body: `{ document_ids: [] }`. Creates run + queued cells.
- Executor: async task that pulls queued cells, calls LLM with column prompt + format suffix (port `formatPromptSuffix()` from Mike's `tabular.ts`), updates cell, broadcasts via SSE.
- `GET /runs/{run_id}/stream` — SSE channel of cell-status events.
- FE: `WorkflowRun.tsx` (split-pane), `WorkflowOutput.tsx` (grid + cell detail + run history).
- Cells store `citations: jsonb[]` with `{document_id, filename, page, section, snippet}`.

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

**Next session: start Phase 2 (tabular execution).** First step: pin down the LLM call shape — read `backend/app/services/embedder.py` and any matrix-execution code that already exists, then design the `workflow_runs` + `tabular_cells` schema and a per-cell executor that streams via SSE. Reference Mike's `formatPromptSuffix()` for format enforcement.

## 9. How to resume in a future session

1. Read this file top to bottom.
2. Read the design handoff README at `~/Desktop/PE Data Analysis/design_handoff_workflows/README.md` for any screen you're about to build.
3. Look at the relevant per-screen JSX in `design_handoff_workflows/components/` as the visual source of truth (translates pretty cleanly to inline-style React).
4. Pick the first un-checked Status item in §8.
5. After each meaningful chunk of work, append a dated entry to §8 and tick the corresponding box.
6. Update §6 (later phases) when you start that phase, and §7 if you make a decision.
