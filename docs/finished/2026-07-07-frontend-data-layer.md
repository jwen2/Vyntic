# Plan F2 — Frontend Data Layer Consolidation

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans. Checkbox steps, commit per task.

**Source:** `docs/assessments/2026-07-07-frontend-audit.md` — FE4, FE8, FE10 (frontend half), FE12.

**Goal:** One way to talk to the backend: a shared request helper with typed errors, one SSE client instead of four, one upload path instead of two (with the double-polling race fixed), cached server state instead of hand-rolled `fetch → useState` everywhere, and route-level code splitting.

**Prerequisite:** Plan F1 (lint + tests exist so this refactor has a net). Touches no backend code — `GET /deals/{deal_id}` already exists.

**Decision required before Task F2.4:** server-state library. Options: (a) **TanStack Query** (`@tanstack/react-query`) — caching, invalidation, dedup, retries, devtools; the standard answer; one new runtime dep. (b) Hand-rolled `useQuery`-shaped hook (zero deps, no cache sharing between components, we own the bugs). **Recommended: (a).** This is a new runtime dependency outside the current stack — confirm before implementing. If (b) is chosen, Task F2.4 shrinks to "extract shared fetch hooks" and the caching wins are foregone.

> **DECIDED 2026-07-09: (a) TanStack Query.** Confirmed by Stanley in session — rationale: the hand-rolled `fetch → useState → useEffect` duplication (FE4) and most of the react-hooks `set-state-in-effect` warnings left from Plan F1 are exactly what it eliminates; the ~13kB dep is accepted.

---

## Findings addressed

| ID | Finding |
|---|---|
| FE4 | Hand-rolled server state; no caching; `listDeals().find()` where `GET /deals/{id}` exists; failure coerced to empty states. |
| FE8 | Four duplicated SSE parsers; `uploadDoc`/`uploadDocs` duplication; two concurrent 1s pollers racing on upload progress. |
| FE10 | (frontend half) 401 hard-redirect buried in the fetch layer; raw `res.text()` JSON shown to users. |
| FE12 | No code splitting — landing visitors download recharts + all workspace surfaces. |

---

## Task F2.1 — Typed request helper + error convention

**Files:** modify `frontend/src/lib/api.ts` (add `ApiError`, `request<T>()`; migrate all `fetchWrapper` callsites), `frontend/src/lib/workflows.ts` (same helper).

- [ ] **Step 1:** `class ApiError extends Error { status: number; detail: string }`. `request<T>(path, init?): Promise<T>` wraps `fetchWrapper`, parses error bodies as JSON and prefers `detail`/`message` fields over raw text, throws `ApiError`. Non-JSON bodies fall back to trimmed text.
- [ ] **Step 2:** Migrate every `const res = await fetchWrapper(...); if (!res.ok) throw new Error(await res.text()); return res.json();` block in `api.ts` and `workflows.ts` to `request<T>()`. Roughly 20 callsites; purely mechanical.
- [ ] **Step 3:** 401 handling: `fetchWrapper` stops calling `window.location.href` directly. It clears the token and dispatches `window.dispatchEvent(new Event("vyntic:unauthorized"))`; `AuthProvider` listens and routes to `/login` via the router (state cleared, no full page reload). Keep the token-clear in the transport layer — only navigation moves out.
- [ ] **Step 4:** Vitest: `ApiError` parsing (`{"detail":"Deal not found"}` → message "Deal not found"; HTML error page → text fallback). Manual: expired-token flow lands on `/login`. Commit — `refactor(frontend): typed ApiError + request helper; 401 handling out of transport layer`

## Task F2.2 — One SSE client

**Files:** create `frontend/src/lib/sse.ts`; modify `frontend/src/lib/api.ts` (rewrite `matrixCompareStream`, `docMatrixStream`, `singleQuestionStream` as thin wrappers), `frontend/src/lib/workflows.ts` (`subscribeRun` likewise).

- [ ] **Step 1:** `sseStream<T>(url: string, body: unknown, handlers: { onEvent(e: T): void; onFinish?(): void; onError?(err: Error): void }): AbortController` — auth header, POST, `reader → TextDecoder → split("\n\n") → "data: "` parse loop, malformed-line skip, AbortError swallow. This is the verbatim loop currently copy-pasted four times; extract, don't redesign.
- [ ] **Step 2:** Rewrite the four streams as wrappers that keep their **exact current signatures and event types** (callers untouched). `docMatrixStream` keeps its payload-shape-to-event mapping inside its wrapper.
- [ ] **Step 3:** Vitest with a mocked `ReadableStream`: events split across chunk boundaries parse correctly; malformed JSON skipped; abort doesn't call `onError`. Manual: agent chat, doc matrix, tabular run all stream. Commit — `refactor(frontend): single sseStream client behind existing stream APIs`

## Task F2.3 — One upload path, one poller

**Files:** modify `frontend/src/hooks/useDeals.ts`.

- [ ] **Step 1:** Delete `uploadDoc`; `uploadDocs(deal_id, files)` is the only path (it already special-cases `files.length === 1`). Update the callers (`HomePage` passes `uploadDocs` down; grep for `uploadDoc\b` to catch stragglers).
- [ ] **Step 2:** Fix the double-poll: remove the `setInterval` — `waitForProcessing`'s 1s loop is the single source of progress. XHR `onUploadProgress` keeps driving the 0–10% upload phase; the poll loop owns everything after. Two writers racing on `uploadProgressByDeal` becomes one.
- [ ] **Step 3:** Manual: single-file and multi-file upload both show upload → processing → complete without progress flicker; error path shows the failure state. Commit — `refactor(frontend): single upload path, single progress poller`

## Task F2.4 — Server-state caching (per decision above)

**Files:** modify `frontend/src/main.tsx` (QueryClientProvider), `frontend/src/hooks/useDeals.ts` (reimplement on useQuery/useMutation, same return shape), `frontend/src/pages/DealWorkspacePage.tsx`, `frontend/src/pages/HomePage.tsx`; add `getDeal(deal_id)` to `frontend/src/lib/api.ts`.

- [ ] **Step 1:** Add `getDeal(deal_id: string): Promise<Deal>` calling `GET /deals/{deal_id}` (backend `routes_deals.py:54`). `DealWorkspacePage` uses it instead of `listDeals().find()`; drop the redundant `getMe()` mount check (`ProtectedRoute` + the 401 event from F2.1 already cover it).
- [ ] **Step 2:** `QueryClient` with conservative defaults (`staleTime` ~30s, `retry: 1`). Reimplement `useDeals` internals on `useQuery(["deals"])` + mutations with `invalidateQueries(["deals"])`, **keeping its current return shape** so `HomePage` barely changes. Upload progress state stays local (it's client state, not server state).
- [ ] **Step 3:** Migrate `DealWorkspacePage`'s documents + conversations fetches to `useQuery(["deal", dealId, "documents" | "conversations"])`. Kill the `catch { setDocuments([]) }` pattern: components get `{ data, isLoading, error }` and render a visible error state ("Couldn't load documents — Retry") distinct from empty.
- [ ] **Step 4:** Full manual pass: home → workspace → back (deals list served from cache, no spinner flash); create/delete deal invalidates; documents modal reflects upload/delete. `npm run lint && npm run build && npm test`. Commit — `feat(frontend): TanStack Query for server state; GET /deals/{id}; visible error states`

## Task F2.5 — Route-level code splitting

**Files:** modify `frontend/src/App.tsx`.

- [ ] **Step 1:** `React.lazy` each page (`LandingPage`, `LoginPage`, `HomePage`, `DealWorkspacePage`) behind one `<Suspense>` with the existing spinner as fallback. This alone splits recharts + react-markdown + the workspace out of the landing bundle.
- [ ] **Step 2:** `npm run build`; confirm in the vite output that the landing chunk no longer contains recharts, and note before/after main-chunk size in the commit message. Manual: cold-load `/`, `/login`, `/app`, `/deal/:id`. Commit — `perf(frontend): route-level code splitting`

---

## Definition of done
- Lint/build/tests green; one commit per task.
- Grep guards: zero `new Error(await res.text())` outside `request()`; one `getReader()` callsite (`sse.ts`); zero `uploadDoc\b`; zero `window.location.href` in `lib/`.
