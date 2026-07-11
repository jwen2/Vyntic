# Plan F3 — Frontend Decomposition, Typed Cells & Client-State Migration

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans. Checkbox steps, commit per task.

**Source:** `docs/assessments/2026-07-07-frontend-audit.md` — FE5, FE6, FE9, FE11, FE13 (rest).

**Goal:** Break the three god components into maintainable feature modules, render typed workflow cells directly instead of synthesizing fake markdown for retired parsers, move analyst work-product (findings, brief overrides) from localStorage to the backend, and converge on one theming system.

**Prerequisites:** Plan F1 (lint + characterization tests — the F1.4 parser tests are the safety net for F3.3) and Plan F2 (the data layer these components get rebuilt on). Task F3.4 adds backend endpoints — coordinate with Plan 2 (auth/audit) so the new routes are born default-deny and audited.

**Decisions required before starting:**

> **RESOLVED 2026-07-10 (Stanley):** D1 → (a) render typed cells directly; D2 → (a) backend tables + routes; D3 → (a) one theming system (CSS vars + Tailwind). All three took the recommended option.

- **D1 (before F3.3):** Brief rendering. (a) **Render `answer_formatted` typed cells directly** (kv/list/prose components) and delete `synthesizeBriefAnswer` + the workstream-era extractors (~1.5k lines); prose-only sections keep a slim markdown path. (b) Keep the adapter and only decompose. **Recommended: (a)** — the adapter is lossy (JSON → fake markdown → regex re-parse) and self-documented as a bridge. Cost: the brief's field-override/diff features must be re-pointed at typed pairs instead of parsed lines.
- **D2 (before F3.4):** Findings/overrides persistence. (a) **New backend tables + routes** (`deal_findings`, `brief_overrides`) with a one-time client-side import of existing localStorage data; (b) stay client-side. **Recommended: (a)** — this is analyst work-product in an LP diligence tool; localStorage means data loss, no multi-device, no audit trail. Requires backend work (small: two stores, CRUD routes, tests in the existing patterns).
- **D3 (before F3.5):** Theming target. (a) **CSS variables + Tailwind semantic tokens** (extend the existing `--landing-*` var approach app-wide; delete `ddTheme`/`DD_DARK`/`DD_LIGHT` inline-style objects); (b) keep both systems. **Recommended: (a).** Mechanical but wide — every `style={{ background: c.bg }}` in `dd/` and `workflows/` becomes a class.

---

## Findings addressed

| ID | Finding |
|---|---|
| FE5 | God components: `DealBriefDashboard` 2,434 / `TabularRun` 2,278 / `DocMatrixPanel` 1,786 lines; 16–26 useState each; whole-surface re-renders on SSE tokens. |
| FE6 | `synthesizeBriefAnswer` adapter: typed JSON → fake markdown → 1.5k lines of legacy prose parsers. |
| FE9 | Findings, brief overrides/diffs, matrix columns, compare-state live only in localStorage. |
| FE11 | Three theming systems (Tailwind `dark:`, `ddTheme` inline objects, landing CSS vars). |
| FE13 | (rest) modal a11y (`role="dialog"`, focus trap, Escape), `key={index}` on reorderable lists, off-palette spinner. |

---

## Task F3.1 — Decompose `DocMatrixPanel` (1,786 lines, 26 useState)

**Files:** create `frontend/src/components/docmatrix/` (`DocMatrixToolbar.tsx`, `DocMatrixTable.tsx`, `DocMatrixCell.tsx`, `ColumnConfigPopover.tsx`, `useDocMatrix.ts`); shrink `frontend/src/components/DocMatrixPanel.tsx` to composition + layout.

- [ ] **Step 1:** Map the 26 state atoms into clusters: column config (persisted), run state (per-doc results, streaming), UI chrome (popovers, drafts, viewer). Move column config + run state into `useDocMatrix(dealId, documents)` — a `useReducer` covering `columns / results / runStatus`, exposing `{ state, startRun, cancelRun, addColumn, updateColumn, removeColumn }`. localStorage read/write of columns stays inside the hook (until/unless D2 later absorbs it).
- [ ] **Step 2:** Extract presentational pieces: toolbar (presets, run/cancel, export), table (header + rows, `React.memo` rows keyed by `doc_id` so one cell's token stream doesn't re-render every row), cell (answer, citations, status), column-config popover. Props down, callbacks up; no context needed at this size.
- [ ] **Step 3:** Behavior parity pass against `main`: run all columns, cancel mid-stream, add/edit/remove column, presets, export, citation click-through, doc delete. `npm run lint && npm run build && npm test`. Commit — `refactor(frontend): decompose DocMatrixPanel into docmatrix/ module`

## Task F3.2 — Decompose `TabularRun` (2,278 lines, 21 useState)

**Files:** create `frontend/src/components/workflows/tabular-run/` (`RunToolbar.tsx`, `RunTable.tsx`, `RunCell.tsx` — composing the existing `cells/CellRenderer.tsx`, `useTabularRun.ts`); shrink `frontend/src/components/workflows/TabularRun.tsx`.

- [ ] **Step 1:** Same split discipline as F3.1: `useTabularRun(run, workflow)` owns subscription state (via `subscribeRun` from F2.2), cell results, and derived-column recompute; components own presentation. Memoize rows on `(row_id, cell versions)` so token streams update one cell, not the table.
- [ ] **Step 2:** The two localStorage reads at current lines ~108–148 (view prefs) move into the hook with a single namespaced key.
- [ ] **Step 3:** Parity pass: start run, stream, checkpoint pause/resume, cell edit/override, export, ConfirmDialog paths. Commit — `refactor(frontend): decompose TabularRun into tabular-run/ module`

## Task F3.3 — Brief renders typed cells directly (D1)

**Files:** create `frontend/src/components/dd/brief/` (`BriefKvPanel.tsx`, `BriefListPanel.tsx`, `BriefProsePanel.tsx`, `useBriefData.ts`); modify `frontend/src/components/dd/DealBriefDashboard.tsx` (shrinks drastically); delete `synthesizeBriefAnswer` and the now-unused extractors (`extractFields`, `extractMetrics`, `extractFinancialTables`, `extractThesisSections`, `extractActionItems` — exact set determined by what still has callers after the switch).

- [ ] **Step 1:** Inventory which brief panels consume which cell shape (kv → snapshot/transaction panels; list → next actions/risks; prose → thesis/financial narrative). Write it in the PR description — this is the contract replacing the parsers.
- [ ] **Step 2:** Build the three typed panels reading `cell.answer_formatted` (`{pairs}`, `{items, ordered}`, `{summary, body}`) with graceful fallback to `cell.answer` markdown when `answer_formatted` is null (old runs). Field overrides/diffs re-point at `pairs[].key` instead of parsed "Field: Value" lines; existing localStorage overrides keyed by label still match since labels are the keys.
- [ ] **Step 3:** Switch the dashboard to the typed panels; delete the adapter and dead extractors. The F1.4 characterization tests that covered deleted parsers get deleted with them; `extractFindingsFromRun` (still live — findings pipeline) keeps its tests.
- [ ] **Step 4:** Parity pass with a real Proactive Scan run (old run + fresh run): all panels populate, overrides and diff view work, findings still extract. Commit — `refactor(frontend): brief renders typed cells directly; retire markdown-synthesis parsers`

## Task F3.4 — Findings + brief overrides to the backend (D2)

**Files (backend):** modify `backend/app/database.py` (`DealFindingRow`, `BriefOverrideRow`); create `backend/app/services/finding_store.py`, routes on `backend/app/api/routes_deals.py` (`GET/PUT /deals/{deal_id}/findings`, `GET/PUT /deals/{deal_id}/brief-overrides` — deal-scoped auth like siblings); create `backend/tests/test_findings_store.py`.
**Files (frontend):** modify `frontend/src/components/dd/useFindings.ts` (server-backed via F2's query layer, one-time localStorage import), `frontend/src/lib/api.ts` (client functions), `DealBriefDashboard` override read/write.

- [ ] **Step 1 (backend):** Additive schema via the existing `_ensure_schema_migrations` shim; stores + routes following `manager_store.py` patterns; tests: CRUD, deal-scoped access denied cross-deal, RBAC parity with documents.
- [ ] **Step 2 (frontend):** `useFindings` loads from the server; on first load, if localStorage has findings for the deal and the server has none, POST them up (one-time migration), then clear the local key. Same shape (`Finding` type unchanged). Brief overrides identically.
- [ ] **Step 3:** Full backend suite green; frontend parity pass (validate/reject findings, override a field, reload from another browser profile — state follows the account now). Commit — `feat: server-side persistence for findings and brief overrides with localStorage import`

## Task F3.5 — One theming system + a11y pass (D3, FE13)

**Files:** modify `frontend/src/index.css` (semantic CSS vars for dark scope), `frontend/tailwind.config.js` (colors reading the vars), then mechanically across `dd/` and `workflows/`: replace `ddTheme(theme)` inline styles with classes; delete `DD_DARK`/`DD_LIGHT`/`ddTheme` from `frontend/src/components/dd/types.ts` and prune `workflows/theme.ts`; fix `ProtectedRoute.tsx` spinner color; modal a11y in `DocumentsModal`, `ConfirmDialog`, `DocumentViewer`, `DocumentSelectorModal`.

- [ ] **Step 1:** Define semantic tokens (`--surface`, `--surface-alt`, `--border`, `--text-1/2/3`, `--accent`) with light values from the existing `--landing-*` vars and dark values from `DD_DARK`; expose as Tailwind colors (`bg-surface`, `text-t1`, …).
- [ ] **Step 2:** Convert `dd/` and `workflows/` components file-by-file (this is the wide-but-mechanical part; do it after F3.1–F3.3 so you're converting the decomposed files, not the monoliths). Components stop taking a `theme` prop where they only used it for colors.
- [ ] **Step 3:** a11y: each modal gets `role="dialog"` + `aria-modal`, initial focus, focus trap, Escape-to-close (some have Escape already — verify); replace `key={index}` with stable ids on reorderable lists (matrix columns, findings, workflow columns); spinner uses the accent token.
- [ ] **Step 4:** Visual pass in both themes across landing, home, workspace tabs, modals. Commit — `refactor(frontend): single CSS-variable theming; modal a11y; stable list keys`

---

## Definition of done
- Lint/build/tests green; backend suite green (F3.4); one commit per task.
- Grep guards: zero `synthesizeBriefAnswer`, zero `ddTheme(` outside deleted files, zero `DD_DARK`; `DealBriefDashboard.tsx`, `TabularRun.tsx`, `DocMatrixPanel.tsx` each under ~400 lines.
