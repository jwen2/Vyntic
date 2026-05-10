# Workflows Typed Cells · Agent Handoff

Last updated: 2026-05-10
Repo: `/Users/johnwen/Desktop/PE Data Analysis/Vyntic`
Baseline: `main` fast-forwarded to `origin/main` at commit `39173cd`
Design handoff: `/Users/johnwen/Downloads/design_handoff_workflows 2`

## Purpose

This document is the working handoff for implementing the Workflows tabular-view overhaul from the Claude Code design package. It is intentionally self-contained so another coding agent can pick up from the repo and this file without reading the chat transcript.

The core problem: the current tabular run grid renders every answer shape as a single truncated scalar. This makes prose, lists, term-sheet key/value structures, caveats, and multi-span citations hard to compare in place. The target UX makes the grid itself the reading surface by typing each answer cell and rendering by shape.

## Source Artifacts

- Primary typed-cells spec: `/Users/johnwen/Downloads/design_handoff_workflows 2/REQUIREMENTS_TYPED_CELLS.md`
- Primary visual canvas: `/Users/johnwen/Downloads/design_handoff_workflows 2/Workflows UX Review.html`
- Typed-cell mock JSX: `/Users/johnwen/Downloads/design_handoff_workflows 2/wf-ux/*.jsx`
- Older workflows feature canvas: `/Users/johnwen/Downloads/design_handoff_workflows 2/Workflows Feature.html`
- Older workflow feature mock JSX: `/Users/johnwen/Downloads/design_handoff_workflows 2/components/*.jsx`
- Existing implementation plan for current workflows feature: `docs/workflows_implementation_plan.md`

Treat the newer typed-cells requirements and `Workflows UX Review.html` as canonical for the tabular-view work. Use the older workflows feature handoff as context for library, run history, exports, checkpoints, formula columns, and multi-doc synthesis.

## Current Implementation Snapshot

Backend:

- `backend/app/models/workflow.py` defines legacy `ColumnFormat` values: `text`, `bulleted_list`, `number`, `percentage`, `monetary_amount`, `currency`, `yes_no`, `date`, `tag`.
- `backend/app/models/workflow_run.py` defines `TabularCell.answer_formatted: Any` and citations as `list[Citation | None]`.
- `backend/app/models/query.py` defines `Citation(source_file, page, text_snippet, deal_id?)`.
- `backend/app/services/workflow_format.py` contains prompt suffixes and parsers for legacy formats.
- `backend/app/services/workflow_exports.py` exports `answer_formatted` to Excel.
- `backend/app/services/workflow_run_executor.py` calls `format_prompt_suffix()` and `parse_answer()` per cell.

Frontend:

- `frontend/src/lib/matrixColumnConfig.ts` mirrors legacy `ColumnFormat`, `FORMAT_OPTIONS`, `PE_COLUMN_PRESETS`, and tag/pill helpers.
- `frontend/src/lib/workflows.ts` mirrors workflow/run/cell API types.
- `frontend/src/lib/api.ts` defines the client `Citation` interface.
- `frontend/src/components/workflows/TabularRun.tsx` is the main tabular grid. It currently renders completed cells through `ValueCell`, `DisplayValue`, `formatCellValue()`, and `compactScalar()`, which force everything into one line.
- `frontend/src/components/workflows/TabularEditor.tsx` currently uses a simple format `<select>` and a basic grid preview.

## Target Answer Shapes

Every column should have exactly one answer shape. Old values must continue to work for at least one release.

New canonical shapes:

| Shape | `format` value | Parsed value |
|---|---|---|
| Metric | `metric` | `{ value: number, unit?: string, period?: string, raw?: string }` |
| Date | `date` | `{ iso: string, granularity: "day" | "month" | "quarter" | "year" }` |
| Boolean | `bool` | `{ value: boolean }` |
| Enum | `enum` | `{ value: string, allowed?: string[] }` |
| Prose | `prose` | `{ summary: string, body: string, caveats: Caveat[] }` |
| List | `list` | `{ items: ListItem[], ordered: boolean }` |
| KeyValue | `kv` | `{ pairs: Array<{ key: string, value: string | number, unit?: string }> }` |

Compatibility mapping:

| Legacy value | New shape |
|---|---|
| `text` | `prose` |
| `bulleted_list` | `list` |
| `number` | `metric` |
| `percentage` | `metric` |
| `monetary_amount` | `metric` |
| `currency` | `metric` or `enum` depending on use; default to `metric` for migration |
| `yes_no` | `bool` |
| `tag` | `enum` |
| `date` | `date` |

## Phase Plan

### Phase 0 · Baseline And Branch

Goals:

- Work from a clean checkout of current `main`.
- Create a branch for typed-cells work.
- Capture the current test/build commands and known state.

Checklist:

- `git status --short --branch`
- `git switch -c workflows-typed-cells`
- Identify backend and frontend test commands.
- Record failures or missing dependencies in this doc.

### Phase 1 · Typed Data Contract

Goals:

- Extend backend and frontend format types to include the canonical shapes.
- Preserve old format behavior.
- Update prompt suffixes and parsers to produce structured values for new shapes.
- Add parser tests before doing large frontend work.

Backend tasks:

- `backend/app/models/workflow.py`: extend `ColumnFormat`.
- `backend/app/services/workflow_format.py`: add parser helpers for `metric`, `prose`, `list`, `kv`, `bool`, `enum`; keep legacy branches.
- `backend/app/services/workflow_exports.py`: export new shapes sensibly while preserving legacy export behavior.
- `backend/app/models/workflow_run.py`: add optional `quality` field stub to `TabularCell`.
- `backend/app/models/query.py`: add optional `kind` and `span_label` fields to `Citation` with backward-compatible defaults.
- `backend/tests/test_workflow_format_typed.py`: cover each new parser and fallback behavior.

Frontend tasks:

- `frontend/src/lib/matrixColumnConfig.ts`: extend `ColumnFormat`, `FORMAT_OPTIONS`, presets, and label/short helpers.
- `frontend/src/lib/workflows.ts`: add optional `quality` and typed formatted-value definitions.
- `frontend/src/lib/api.ts`: extend `Citation` with `kind?: "extracted" | "derived"` and `span_label?: string`.

Acceptance checks:

- Backend parser tests pass.
- Existing legacy parser behavior remains covered and unchanged.
- Frontend typecheck/build reaches at least the same state as baseline.

### Phase 2 · Tabular Grid Renderer Foundation

Goals:

- Replace the one-line scalar display path with a typed renderer.
- Make prose/list/kv readable in-grid while keeping metrics compact.
- Preserve row selection, retry affordances, citations, column resizing, and horizontal scroll.

Frontend tasks:

- Add `frontend/src/components/workflows/cells/`.
- Add pure renderers: `CellRenderer`, `MetricCell`, `DateCell`, `BoolCell`, `EnumCell`, `ProseCell`, `ListCell`, `KVCell`, `EmptyCell`.
- Add shared primitives for caveat and citation chips.
- Update `TabularRun.tsx` to dispatch through `CellRenderer`.
- Keep `formatCellValue()` only as a compatibility/export-style fallback, not the primary display.

Acceptance checks:

- Prose shows summary + caveats in comfortable layout.
- List shows one item per line when space allows.
- KV shows stacked pairs.
- Metric/date/bool/enum remain compact and scannable.
- Empty/out-of-scope complete cells render as muted explicit chips.
- Retry button, cell selection, and sidebar still work.

### Phase 3 · Density Controls

Goals:

- Add `Comfortable` and `Reader` density modes first; add `Compact` once typed renderers are stable.
- Persist density locally per workflow.

Frontend tasks:

- Add `DensityToggle`.
- Add `density` state to `TabularRun.tsx`.
- Pass density into typed renderers.
- Persist in localStorage, e.g. `vyntic_workflow_density_${workflow.id}`.

Acceptance checks:

- Comfortable is default.
- Reader shows full prose body in-grid.
- Switching density causes no network request or rerun.
- Density survives reload.

### Phase 4 · Editor Shape Authoring

Goals:

- Let analysts declare answer shape up front.
- Add prompt auto-detection hints and shape-specific controls.
- Preview how a cell will render before running.

Frontend tasks:

- Replace format `<select>` in `TabularEditor.tsx` with `ShapePicker`.
- Add prompt heuristic:
  - summarize/describe/explain -> `prose`
  - list/enumerate -> `list`
  - extract X, Y, Z -> `kv`
  - revenue/margin/EBITDA/$/% -> `metric`
  - closing/vintage/expiration/date -> `date`
  - yes/no phrasing -> `bool`
- Add `ShapeOptionsInspector`.
- Add `CellRenderPreview`.
- Reuse these controls in the in-run column edit modal.

Acceptance checks:

- Shape selection saves and reloads.
- Auto-detect is a passive hint, not an automatic switch.
- Preview matches comfortable-density renderer closely enough for analyst trust.

### Phase 5 · Provenance Scaffold

Goals:

- Start treating citations as multi-span provenance.
- Keep backend and frontend backward compatible.

Tasks:

- Add optional citation fields to backend and frontend types.
- Default missing citation kind to `extracted` in UI.
- Add `CellSourcesPanel` as a replacement for the current sidebar answer/citation body.
- In v1, show full answer plus all spans. Defer quality signals until Phase 7 unless already available.

Acceptance checks:

- All non-null citations render.
- Null citation holes are skipped.
- Clicking a citation still opens the document viewer at the page/snippet.

### Phase 6 · Migration And Compatibility

Goals:

- Move existing workflows to the new taxonomy without breaking old runs.
- Preserve exports.

Tasks:

- Add idempotent dry-run migration script or service helper.
- Map legacy formats to new shapes.
- Log every migration.
- Add write mode only after dry-run output is reviewed.

Acceptance checks:

- Built-in templates continue to run.
- Existing runs still render using legacy fallback.
- Excel export diff on sample runs shows no material value regression.

### Phase 7 · Later Work

v2:

- Compact density.
- Per-column density override.
- Rich `CellSourcesPanel`.
- Server-computed `cell.quality` with coverage and hallucination risk.

v3:

- Compare-across-rows mode.
- Anchor row selection.
- Diff highlighting.
- Agreement/conflict quality signals.

## Test Commands

Backend:

- From `backend/`: `pytest`
- Focused parser tests once added: `pytest tests/test_workflow_format_typed.py`
- Syntax sanity if dependencies are missing: `python -m py_compile app/services/workflow_format.py app/models/workflow.py app/models/workflow_run.py app/models/query.py`

Frontend:

- From `frontend/`: `npm run build`
- If available in `package.json`, prefer `npm run lint` and/or `npm run typecheck` for faster loops.

## Progress Log

### 2026-05-10 · Phase 4/5/6 completion pass

- Added shared shape authoring controls in `frontend/src/components/workflows/cells/ShapeControls.tsx`.
- Reused the same `ShapePicker`, `ShapeOptionsInspector`, passive `detectShape()` hints, and `CellRenderPreview` in both:
  - `frontend/src/components/workflows/TabularEditor.tsx`
  - `frontend/src/components/workflows/TabularRun.tsx` in-run column edit menu
- Added a selected-cell preview in the workflow editor so analysts can see a comfortable-density typed cell before running.
- Made in-grid citation chips clickable when rendered inside the run grid; citation clicks still open `DocumentViewer` at the cited page/snippet.
- Replaced the old run sidebar answer/source block with `CellSourcesPanel`, which renders:
  - the selected typed cell in reader density
  - the full extracted answer with inline citation handling
  - every non-null source span with default `kind = extracted` behavior and optional `span_label`
- Added Phase 6 migration support:
  - `backend/app/services/workflow_format_migration.py`
  - `backend/scripts/migrate_workflow_formats.py`
  - `backend/tests/test_workflow_format_migration.py`
- Added `SEED_SAMPLE_DATA` startup flag and set Docker dev default to `false` so local backend health is not blocked by sample document ingestion after container recreation.
- Migration behavior is dry-run by default. Write mode is explicit:
  - Dry run: `PYTHONPATH=. python scripts/migrate_workflow_formats.py`
  - Apply: `PYTHONPATH=. python scripts/migrate_workflow_formats.py --write`

Verification:

- `npm run build` from `frontend/` passed.
- `PYTHONPATH=. .venv/bin/pytest tests/test_workflow_format_typed.py tests/test_workflow_format_migration.py` from `backend/` passed: 13 tests.
- Recreated Docker dev services with `docker compose -p spokematrix up -d --build --force-recreate --renew-anon-volumes backend frontend-dev`, then recreated backend with the seed flag. Verified `http://localhost:3200/login` returns 200 and `http://localhost:8000/health` returns `{"status":"ok","service":"vyntic"}`.

### 2026-05-10 · Phase 2/3/4 foundations

- Added `frontend/src/components/workflows/cells/CellRenderer.tsx`.
- Wired `TabularRun.tsx` completed cells through `CellRenderer`.
- Added typed render paths for metric, date, bool, enum, prose, list, kv, and empty/error cells.
- Added citation chips and caveat chips as an initial in-grid provenance/readability pass.
- Added `compact`, `comfortable`, and `reader` density state in `TabularRun.tsx`.
- Added `DensityToggle` in the run header and persisted density to `localStorage` using `vyntic_workflow_density_${workflow.id}`.
- Began Phase 4 in `TabularEditor.tsx` by replacing the column format select with a canonical shape picker for extraction columns.
- Added passive auto-detect hints in the editor based on label/prompt text.
- New extraction columns now default to `prose` instead of legacy `text`.

Verification:

- `npm run build` from `frontend/` passed after renderer and density wiring.
- `npm run build` from `frontend/` passed again after the editor shape picker.
- `PYTHONPATH=. .venv/bin/pytest tests/test_workflow_format_typed.py` from `backend/` still passes: 10 tests.

### 2026-05-10 · Phase 1 typed data contract

- Extended backend `ColumnFormat` with new shapes: `metric`, `bool`, `enum`, `prose`, `list`, `kv`.
- Extended backend `Citation` with `kind` and `span_label`; default `kind` is `extracted`.
- Added optional `quality` stub to `TabularCell`.
- Extended `workflow_format.py` prompt suffixes and parsers for new typed shapes while preserving legacy format parsing.
- Updated tabular Excel export handling for prose/list/kv/date/value-shaped formatted cells.
- Extended frontend `ColumnFormat`, `FORMAT_OPTIONS`, presets, citation types, and workflow typed-cell value types.
- Added fallback display support in `TabularRun.tsx` for new formatted objects before the full typed renderer lands.
- Added `backend/tests/test_workflow_format_typed.py`.

Verification:

- `npm ci` was required because frontend dependencies were absent; it succeeded after running with approved network access.
- `npm run build` from `frontend/` passed.
- Created `backend/.venv` and installed `requirements-dev.txt` after approved network access.
- `PYTHONPATH=. .venv/bin/pytest tests/test_workflow_format_typed.py` from `backend/` passed: 10 tests.
- Full backend `PYTHONPATH=. .venv/bin/pytest` currently fails on pre-existing/auth-test-harness issues: many route tests receive `401 Unauthorized`, and an older streaming test patches `app.api.routes_stream.ChatOllama`, which is no longer present. Typed-cell parser tests pass within that run.

### 2026-05-10 · Setup

- Fresh pulled `main`; repo fast-forwarded to `39173cd`.
- Read the full typed-cells requirements doc and the visual mock sources.
- Created this handoff doc.
- Created branch `workflows-typed-cells`.
- Frontend scripts available: `npm run dev`, `npm run build`, `npm run start`.
- Backend pytest is configured with `testpaths = tests`.

## Current Status

Phase 0 is complete. Phase 1 typed data contract is implemented and focused tests pass. Phase 2 renderer foundation and Phase 3 density controls are implemented. Phase 4 is implemented for editor and in-run column editing, including shape-specific enum options and render preview. Phase 5 provenance scaffold is implemented as a first `CellSourcesPanel` pass. Phase 6 migration support is implemented as an opt-in dry-run/write helper and CLI script. Phase 7 remains later work for server-computed quality signals, compare-across-rows mode, anchor row selection, and diff highlighting.
