# Plan F1 — Frontend Guardrails & Dead Code Removal

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans. Checkbox steps, commit per task.

**Source:** `docs/assessments/2026-07-07-frontend-audit.md` — FE1, FE2, FE3, FE7, FE13 (partial).

**Goal:** Give the frontend the same safety net the backend already has: linting that catches hook bugs, an error boundary so one render crash doesn't white-screen the app, a test runner with first tests on the pure `lib/` modules, and ~2,900 lines of dead code deleted. No behavior changes for users except crash containment.

**Prerequisite:** none. Independent of the LP-readiness plans; touches no backend code.

**New dev-dependencies (flagged, all standard for a Vite/React/TS stack):** `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`. No runtime dependencies added.

---

## Findings addressed

| ID | Finding |
|---|---|
| FE1 | No ESLint, no lint script, zero frontend tests. |
| FE2 | Rules-of-hooks violation at `pages/DealWorkspacePage.tsx:57` (early return before hooks). |
| FE3 | No error boundary — any render exception white-screens the app. |
| FE7 | ~2,900 lines of dead code from a superseded UI generation. |
| FE13 | (partial) `window.confirm` where `ConfirmDialog` exists. |

---

## Task F1.1 — ESLint with hooks rules

**Files:** create `frontend/eslint.config.js`; modify `frontend/package.json` (devDeps + `"lint": "eslint src"` script).

- [ ] **Step 1:** Install `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`. Flat config: `typescript-eslint` recommended + `react-hooks` recommended (`rules-of-hooks: error`, `exhaustive-deps: warn`). Ignore `dist/`.
- [ ] **Step 2:** Run `npm run lint`. Expected: it **fails** on `DealWorkspacePage.tsx` rules-of-hooks (the FE2 bug — this is the guardrail proving its worth). Triage remaining output: fix trivial violations, downgrade noisy-but-harmless rules to `warn` in the config rather than sprinkling disables.
- [ ] **Step 3:** Fix FE2: in `pages/DealWorkspacePage.tsx`, move `if (!dealId) return null;` (line 57) below all hook calls. `dealId` usages inside hooks/callbacks defined above the guard need a safe form (`dealId ?? ""` or early-exit inside the callback) — keep behavior identical: render nothing when the param is missing.
- [ ] **Step 4:** `npm run lint` green (warnings allowed, errors zero) and `npm run build` green. Commit — `chore(frontend): add ESLint with react-hooks rules; fix DealWorkspacePage hook-order violation`

## Task F1.2 — Error boundaries

**Files:** create `frontend/src/components/ErrorBoundary.tsx`; modify `frontend/src/App.tsx`, `frontend/src/pages/DealWorkspacePage.tsx`.

- [ ] **Step 1:** Class component `ErrorBoundary({ children, fallback? })` with `componentDidCatch` → `console.error` and a default fallback: centered panel, "Something went wrong", error message, a "Reload" button (`window.location.reload()`). Style with existing Tailwind + dark: classes (no `ddTheme` — that system is being retired in Plan F3).
- [ ] **Step 2:** Wrap the route tree in `App.tsx` (inside `ThemeProvider`/`AuthProvider`, around `<Routes>`), and wrap each workspace surface in `DealWorkspacePage.tsx` (`WorkflowsView`, `DealBriefDashboard`, `DealAssistantPanel`) so a crash in one tab leaves the TopBar and other tabs usable.
- [ ] **Step 3:** Manual check: temporarily `throw` in a tab component, confirm containment (tab shows fallback, rest of workspace alive); remove the throw. `npm run build` green. Commit — `feat(frontend): error boundaries at app root and per workspace tab`

## Task F1.3 — Delete dead code (FE7)

**Destructive — confirm file list with the user before executing this task.** All were verified to have zero external imports on `main` @ `19e6d04`; re-verify at execution time (grep each name across `src/`).

**Files (delete):**
`frontend/src/components/AuthGuard.tsx`, `MatrixGrid.tsx`, `MatrixCell.tsx`, `CitationPopover.tsx`, `InlineCitation.tsx`, `DealCard.tsx`, `DealDetailPanel.tsx`, `UploadPanel.tsx`, `ConversationHistory.tsx`, `frontend/src/lib/useTableState.tsx`, `frontend/src/hooks/useMatrix.ts`.

- [ ] **Step 1:** Re-verify each file is unreferenced: `grep -r "<Name>" frontend/src --include=*.ts*` shows only self/intra-chain hits. If anything gained a reference since the audit, drop it from the deletion list and note why.
- [ ] **Step 2:** Delete the files. Check whether `lib/queryTemplates.ts`, `lib/matrixColumnConfig.ts` are still referenced by live code (DocMatrixPanel uses both — keep) and fix any now-dangling comments mentioning MatrixGrid.
- [ ] **Step 3:** `npm run lint`, `npm run build` (tsc catches dangling imports). Commit — `chore(frontend): remove dead components from the pre-DocMatrix UI generation (~2.9k lines)`

## Task F1.4 — Vitest + first tests on pure lib modules

**Files:** modify `frontend/package.json` (devDeps + `"test": "vitest run"`), `frontend/vite.config.ts` (test block, jsdom env); create `frontend/src/lib/markdownUtils.test.ts`, `frontend/src/lib/numericDetector.test.ts`, `frontend/src/lib/diffWords.test.ts`, `frontend/src/components/dd/extractFindingsFromRun.test.ts`.

These four modules are side-effect-free parsers — the cheapest meaningful coverage in the codebase, and they guard the brief/matrix rendering paths that Plan F3 will refactor. Write the tests **before** F3 touches anything so the refactor has a net.

- [ ] **Step 1:** Vitest setup; a trivial smoke test runs green.
- [ ] **Step 2:** Per module, test current observed behavior (characterization tests): `fixMarkdownTables` (well-formed table unchanged; missing separator row repaired), `numericDetector` (currency/percent/plain-number strings detected; prose not), `diffWords` (added/removed/unchanged spans for two short strings), `extractFindingsFromRun` (a realistic completed-run fixture yields findings with severity/title/citation; malformed run yields `[]` not a throw). Read each module first and pin actual behavior — do not guess expected outputs.
- [ ] **Step 3:** `npm test` green. Commit — `test(frontend): vitest + characterization tests for lib parsers`

## Task F1.5 — Replace `window.confirm` with `ConfirmDialog` (FE13 partial)

**Files:** the 3 `window.confirm`/`confirm(` callsites (locate via grep; at audit time they were in workflow surfaces); reuse `frontend/src/components/ConfirmDialog.tsx`.

- [ ] **Step 1:** Swap each native confirm for the existing `ConfirmDialog` open/confirm/cancel state, matching how `HomePage.tsx` uses it. Keep the exact same guarded action.
- [ ] **Step 2:** `npm run lint && npm run build`; manual click-through of each dialog. Commit — `fix(frontend): use ConfirmDialog for all destructive confirmations`

---

## Definition of done
- `npm run lint` (0 errors), `npm run build`, `npm test` all green; one commit per task.
- The lint config is the durable guard — FE2's bug class cannot land again.
