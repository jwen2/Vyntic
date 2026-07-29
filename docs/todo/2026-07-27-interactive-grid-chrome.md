# Plan: Interactive grid chrome normalization

**Status:** remaining UI fidelity work after the design-system push on `feat/typography-phase2-spike`.
**Spec:** `frontend/design-system-spec.html`.

## Goal

Finish the last non-mechanical table/grid styling pass by aligning the two real interactive grid surfaces with the app design-system chrome while preserving their bespoke behavior.

The generic table work is done: read-only financial/monitoring/portfolio tables, citation-rendered tables, answer markdown tables, and the workflow editor's static preview use the shared `.data-table` utility. The shared `Input` primitive is also built and migrated through the obvious app surfaces. The remaining work is only the interactive grid layer.

## Scope

- `frontend/src/components/docmatrix/DocMatrixTable.tsx`
- `frontend/src/components/docmatrix/DocMatrixCell.tsx`
- `frontend/src/components/workflows/tabular-run/RunTable.tsx`
- `frontend/src/components/workflows/tabular-run/RunCell.tsx`
- `frontend/src/components/workflows/tabular-run/styles.ts`

## Non-negotiables

- Preserve `table-layout: fixed`, explicit column widths, sticky first columns, resize handles, and horizontal overflow behavior.
- Preserve doc-matrix drag reorder, sort menu behavior, and document delete/open actions.
- Preserve tabular-run memoized row/cell rendering so streaming updates do not rerender the full grid.
- Preserve selected, loading, running, retry, error, citation, zebra, and hover states.
- Do not force these tables onto `.data-table`; they need a sibling interactive-grid chrome layer.

## Tasks

- [x] Extract shared interactive-grid chrome classes or constants for header cells, body cells, sticky document cells, selected state, zebra rows, and resize handles.
- [x] Migrate Doc Matrix to those classes without changing markup structure beyond class composition.
- [x] Migrate Tabular Run to those classes without changing memoization boundaries.
- [x] Verify light and dark mode screenshots for Doc Matrix and a completed Tabular Run.
- [x] Run `cd frontend && npx tsc --noEmit && npm run build && npm test && npm run lint`.

Selection tint stayed inline rather than becoming a class: `RunCell`'s selected
state uses `tint(ACCENT, n)`, a JS `color-mix()` with no CSS token, so it falls
under the project's "status hues stay inline" rule. Two chrome-only variants
(`.grid-table__td--chrome`, `.grid-table__th--chrome`) exist because this project
has no `tailwind-merge` and `grid-table.css` loads after `@tailwind utilities` —
a shared class must not declare any property its consumer overrides conditionally.

## Done when

- The only remaining table styling divergence is behavior-specific, not accidental hardcoded chrome.
- Resize, reorder, sticky columns, selection, retry, citations, and streaming behavior still work.
- Visual review confirms the two grids match the design-system table/header/body density closely enough to call the UI normalization pass complete.
