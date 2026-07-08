# Frontend Audit — React + TypeScript (2026-07-07)

Audited on `main` @ `19e6d04` (post PR #92, Manager → Fund → Position object model). Read-only review of `frontend/src` (~90 files). Plans derived from this: `docs/todo/2026-07-07-frontend-guardrails.md`, `2026-07-07-frontend-data-layer.md`, `2026-07-07-frontend-decomposition-client-state.md`.

**What's healthy:** `strict: true` TypeScript with near-zero `any` (1 occurrence), typed API interfaces mirroring Pydantic schemas, sensible feature foldering (`dd/`, `workflows/`, `home/`, `landing/`), consistent Tailwind usage in newer components.

## Findings

| ID | Finding | Evidence |
|---|---|---|
| FE1 | **No guardrails**: no ESLint config, no lint script, zero frontend tests (backend has 157). Has already let a real bug through — see FE2. | `frontend/package.json` scripts; no `.eslintrc*`/`eslint.config.*`; no `*.test.*` under `src/` |
| FE2 | **Rules-of-hooks violation**: early `return null` before all hook calls. Latent crash class; exactly what `eslint-plugin-react-hooks` catches. | `pages/DealWorkspacePage.tsx:57` |
| FE3 | **No error boundary anywhere** — one render exception white-screens the whole app, losing in-flight analyst state. | grep `ErrorBoundary\|componentDidCatch`: 0 matches |
| FE4 | **Hand-rolled server state**: every surface does `fetch → useState → useEffect`; no caching/dedup/invalidations; mutations full-refetch. Workspace fetches **all deals** then `.find()`s one although `GET /deals/{deal_id}` exists (`routes_deals.py:54`); `getMe()` re-verified per page mount on top of `ProtectedRoute`. Several catches coerce failure to empty (`catch { setDocuments([]) }`) so "failed to load" is indistinguishable from "empty". | `hooks/useDeals.ts`, `pages/DealWorkspacePage.tsx:122-159`, `pages/HomePage.tsx` |
| FE5 | **God components**: `dd/DealBriefDashboard.tsx` 2,434 lines (16 useState), `workflows/TabularRun.tsx` 2,278 (21 useState), `DocMatrixPanel.tsx` 1,786 (26 useState). All feature work funnels through them; SSE token updates re-render whole surfaces. | line/hook counts per file |
| FE6 | **Legacy parser adapter**: `synthesizeBriefAnswer` converts typed-cell JSON back into fake markdown so ~1.5k lines of retired workstream-era prose parsers can re-extract structure (structured → prose → re-parsed structured; lossy, self-documented as a bridge). | `dd/DealBriefDashboard.tsx:72-128` |
| FE7 | **Dead code (~2,900 lines)**: `AuthGuard.tsx`, `MatrixGrid.tsx` → `MatrixCell.tsx` → `CitationPopover.tsx`/`InlineCitation.tsx`/`lib/useTableState.tsx`, `DealCard.tsx` → `DealDetailPanel.tsx`, `UploadPanel.tsx`, `ConversationHistory.tsx`, `hooks/useMatrix.ts` (395 lines). Zero external imports; a superseded UI generation. | import graph |
| FE8 | **Duplication**: four hand-rolled SSE parsers (`matrixCompareStream`, `docMatrixStream`, `singleQuestionStream` in `api.ts`; `subscribeRun` in `workflows.ts`); `uploadDoc`/`uploadDocs` ~100 near-identical lines each (`uploadDocs` already handles the single-file case); uploads run **two concurrent 1s pollers** (a `setInterval` + the `waitForProcessing` loop) racing on the same progress state. | `lib/api.ts:320-622`, `hooks/useDeals.ts:75-271` |
| FE9 | **localStorage as shadow database**: analyst work-product lives only in the browser — findings (`dd/useFindings.ts`), brief field overrides + diff snapshots, matrix column configs, compare-view state. Hand-rolled key migrations already exist (`DealWorkspacePage.tsx:33-38`) — the tell it outgrew localStorage. Data-loss + no-multi-device by design. | 31 `localStorage.*Item` callsites |
| FE10 | **Auth/transport**: bearer token in localStorage (XSS-exfiltratable — overlaps assessment S5/S9-XSS, Plan 2); 401 handling does `window.location.href` hard redirect from inside the fetch layer; errors surface as `throw new Error(await res.text())` so raw `{"detail":...}` JSON reaches the UI. | `lib/api.ts:16-34`, all callsites |
| FE11 | **Three theming systems**: Tailwind `dark:` classes, `ddTheme()` inline-style token objects (`dd/types.ts:80-106`), landing CSS variables — components mix `className` and `style` for the same concern. | `dd/types.ts`, `workflows/theme.ts`, `index.css` |
| FE12 | **No code splitting**: single bundle ships landing page + recharts + react-markdown + all workspace surfaces to every visitor. No `React.lazy`/`Suspense` anywhere. | grep: 0 matches |
| FE13 | **UX/a11y inconsistencies**: `window.confirm` in 3 places despite a styled `ConfirmDialog`; 33 `aria-`/6 `role=` across ~90 components; modals lack `role="dialog"`/focus traps; `key={index}` 20× (risky for reorderable matrix columns); `ProtectedRoute` spinner hard-codes off-palette `#2563eb`. | grep counts |

## Non-goals / explicitly out of scope
- Rewriting the landing page (self-contained, low churn).
- Moving the JWT to httpOnly cookies — that's a backend/auth decision belonging to Plan 2 (`2026-07-02-auth-access-control-audit.md`), noted there as S5-adjacent.
