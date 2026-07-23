# MEMORY.md — Vyntic

Project decision log + session summaries. Read at the start of every session.

---

## Session — 2026-07-22 — /app UI/UX visual refresh (Opus 4.8)

### Worked on
- **`/app` (HomePage) visual-refresh pass** — user is on a FE UI/UX branch (branch name unconfirmed; session started on `main`, work is **all uncommitted in the working tree** — verify branch before committing).
- All changes verified via `frontend:verify` headless-Edge screenshots (backend `:8801` + frontend `:5199`), **both themes**. `tsc --noEmit` clean, `npm run build` green. Backend has live Gemini → real extraction answers rendered during table verification.

### Completed (6 items, all screenshot-verified light+dark)
1. **Counts** — top bar stacked pills → inline `N deals · N docs`; sidebar floating "TOTAL" circle → count folded into the `ACTIVE PIPELINE · N DEALS` eyebrow (`HomeTopBar.tsx`, `HomeSidebar.tsx`; removed `StatPill`).
2. **Header card slimmed** — dropped the "swap matrices" filler + redundant "SELECTED DEAL" pill; `deal_id` now a small accent tag beside the title (`HomePage.tsx`).
3. **Denser sidebar** — per-card "Drop files…" box → compact upload icon; upload+delete **reveal on hover** (only Analyze at rest, so full names show); hover-lift shadow (`DealListItem.tsx`).
4. **Empty matrix → "ask hero"** — new `MatrixAskHero.tsx`, rendered at panel level when `columns.length===0` (NOT a row-span cell). Autofocus input + PE-preset quick-starts + "Searching: docs +N more" scope strip.
5. **Table restyle** (`DocMatrixTable.tsx` + `DocMatrixCell.tsx`) — lighter grid (dropped vertical borders, hairline row rules); sticky Document-column shadow; consistent accent-tint **row hover via `group`/`group-hover`** (doc cell included — fixed old inconsistency); neutral file chips (was loud red/green); hover-only neutral delete; citations = clean accent pills (dropped "Sources" label); **dev metadata (model/latency) hover-only**; raw `blue-*` → `var(--accent)`.
6. **Ask bar** — new `AddQuestionBar.tsx`: persistent "Ask a question to add a column…" bar **above** the grid (input + Templates menu + accent "Add column"). Replaced the cramped/clipped add-column input that lived in the far-right header cell; removed `COL_ADD` reserved width + dead state/imports from `DocMatrixTable`.

### Files touched (all uncommitted)
`pages/HomePage.tsx`, `components/home/{HomeTopBar,HomeSidebar,DealListItem}.tsx`, `components/DocMatrixPanel.tsx`, `components/docmatrix/{DocMatrixTable,DocMatrixCell}.tsx`, **new** `components/docmatrix/{MatrixAskHero,AddQuestionBar}.tsx`.

### Decisions made
- **Objective = visual refresh** (user chose this over "consistency + token migration" up front).
- **Count treatment**: inline text everywhere; sidebar count in the eyebrow (**A2** "count in the eyebrow", chosen over corner-of-heading / subtitle variants).
- **Empty state is pulled OUT of the table** — a row-span cell centered the panel and pushed it off-screen for deals with many docs (bug the user caught); panel-level hero is doc-count-independent.
- **Zebra striping intentionally SKIPPED** — sticky doc column + query cells living in a separate component (`DocMatrixCell`) make per-row backgrounds impractical; rely on hairline rules + accent hover instead.
- **Matrix columns persist client-side** (per browser context), not server DB — a fresh session shows the hero (confirmed empirically; so screenshot tests don't pollute shared state).
- **#6 token migration deferred** — user was at ~27% context; agreed it's a full-session invisible refactor that needs per-file screenshot verification, not worth risking a half-done state.

### Design mocks published (Claude Artifacts — targets/reference)
- Count treatments: `https://claude.ai/code/artifact/bc3014ce-918e-4bf9-9ead-9e7a2f39a9f1`
- Matrix redesign (ask hero + table): `https://claude.ai/code/artifact/a4476bb7-271b-468a-815f-2d00499e4062`
- **Agent-page redesign (Rogo-inspired, QUEUED — mock only, NOT built)**: `https://claude.ai/code/artifact/c8f3cab0-8190-443d-bac3-260e85eda334`

### Next-session priorities
1. **Deal-workspace AGENT page redesign** (top ask) — implement mock `c8f3cab0`: redesign `components/assistant/DealAssistantPanel.tsx` empty state (`ASSISTANT_PROMPTS` grid + composer) into a centered **"Begin your diligence" ask hero** + suggested-research **cards** with document-scope chips (sources = the deal's docs, not Rogo's Web/SEC), inside `dd/TopBar` + `dd/LeftSidebar`. Full session; needs light+dark screenshot verify. User compared to Rogo's landing (`/deal/{id}` looked "sloppy").
2. **#6 scoped token convergence** — point `/app` shell (`HomePage`/`HomeTopBar`/`HomeSidebar`/`DealListItem`) `surface/border/text/muted` off `--landing-*`+hex+`isDark?:` ternaries onto semantic tokens (`--surface`/`--border`/`--text-2`…) so `/app` matches the workspace exactly. Invisible refactor, screenshot-verify each file. Full `ddTheme` deletion still deferred (bigger).
3. **Commit this session's UI/UX work** (confirm the intended branch first) + open PR.

### Housekeeping
- Dev servers may still be running from this session: backend `uvicorn :8801`, vite `:5199`.

---

## Session — 2026-07-09

### Worked on
- **Plan F1 (frontend guardrails) — COMPLETE** on branch **`frontend-guardrails`** (off origin/main @ 645edb5, post-PR #97), 7 commits, **NOT pushed** — user reviewing the UI before deciding on merge/PR.
- Contrast analysis of the post-login monochrome theme (PM's question) + token fixes on the same branch.

### Completed (F1, all verified: lint 0 errors / build / 32 tests green)
- **F1.1** ESLint flat config + react-hooks; **FE2 fixed** (DealWorkspacePage early-return moved below 28 hooks; effects early-exit on missing dealId).
- **F1.2** ErrorBoundary at app root + per workspace tab (Workflows/Brief/Agent).
- **F1.4** Vitest + 32 characterization tests (markdownUtils, numericDetector, diffWords, extractFindingsFromRun, ErrorBoundary).
- **F1.5** 3 native confirm() → ConfirmDialog (both editors + WorkflowsView clone choice, same semantics).
- **F1.3** deleted 11 dead files, 2,609 lines (user-confirmed list; re-verified unreferenced).
- Contrast: light border #d6d6cc→#b0b0a3, borderLight→#d2d2c5, t3 #8a8a80→#6e6e66; dark border #2a2a2a→#424242, borderLight→#2e2e2e, t3 45%→55% white; global :focus-visible outline. All values WCAG-computed.

### Decisions made
- **F2 server-state library = TanStack Query** (option a) — confirmed by Stanley 2026-07-09 after F1 completed; recorded in F2 plan doc header. Rejected: hand-rolled hooks (zero deps but no shared cache, we own the bugs).
- **react-hooks v7 compiler rules** (set-state-in-effect, preserve-manual-memoization, refs, purity) downgraded to **warn** in eslint.config.js — 54 pre-existing findings left visible for Plan F3, rather than error-and-disable. rules-of-hooks stays error.
- **ErrorBoundary unit test replaces the plan's throwaway manual throw check** (durable evidence instead).
- **Monochrome theme stays** — PM's clarity complaint diagnosed as structural contrast (borders 1.3–1.5:1, t3 3.1:1), not absence of hue. Rejected: reverting to old-frontend blue accents (would bury severity-color signal). Blue remnants in DocMatrixPanel + theming consolidation deferred to F3 (FE11/D3).
- Characterization quirk pinned deliberately: `\bΔ\b` never matches (non-ASCII), so "YoY Δ" headers parse as period columns in numericDetector.

### Also completed same session: Plan F2 (data layer), same branch, 7 more commits
- **F2.1** ApiError + request<T>() across api.ts/workflows.ts; 401 → `vyntic:unauthorized` event, AuthProvider (moved inside BrowserRouter) navigates; XHR upload path included.
- **F2.2** lib/sse.ts single reader loop; 3 streams became wrappers (subscribeRun stays EventSource — GET + query-token).
- **F2.3** uploadDoc deleted; interval poller removed (one progress writer).
- **F2.4** TanStack Query (decision: option a, ~13kB dep): QueryClient in main.tsx (staleTime 30s, retry 1); useDeals on useQuery/useMutation same return shape; DealWorkspacePage on getDeal + documents/conversations queries; visible "Couldn't load — Retry" strip replaces catch{setDocuments([])}; getMe() mount check dropped.
- **F2.5** React.lazy all 4 pages: 674 kB single chunk → 205 kB shared + per-route chunks (landing cold load ~229 kB).
- **recharts is now an unused dependency** (last importers were F1.3's deleted files) — NOT removed, needs approval.
- 15 new tests (62 total). All F2 manual click-throughs (upload progress, 3 streaming surfaces, cache behavior, expired-token flow) pending the user's visual review — flag these when they run the app.

### Addendum (2026-07-10): /app contrast, Claude Design, badge-hues recovery
- `/app` light-mode contrast pass (e5a2ed5): DealListItem badge palette + DocMatrixPanel gray-ramp shift.
- **Claude Design project "Vyntic Design System"** created (id 41075050-81a9-420b-a488-e5992f813e27); `foundations/palette.html` documents all tokens/badges with measured ratios. Update it when tokens change.
- A parallel session added the **cobalt accent system** (commits e18f980…f5dd185) with plan/spec in `docs/superpowers/{plans,specs}/2026-07-09-cobalt-accent*`.
- **Recovered the interrupted badge-hues session** (died at usage limit 2026-07-09 21:01; transcript preserved at `docs/transcripts/2026-07-09-210100-badge-hues-session.txt`, untracked): hued stage/sector chips ported + the unreached "accent the numbers" piece completed (da111be); verified via `frontend:verify` headless-Edge screenshots in both themes; `badge-hues` worktree and `frontend-badge-hues` branch removed (no unique commits).
- **2026-07-10 color/contrast pass (Opus 4.8), 3 commits, PUSHED** to origin/frontend-guardrails (branch is now up on GitHub): (1) real `--violet` token pair (light #6d28d9 / dark #b19fdb, +tint/tint-border/on-violet) replacing theme.ts's fake gray VIOLET #5f5f57 — tabular workflows/derived citations/KV cells now genuinely violet; 5 fill sites that hardcoded white text switched to var(--on-violet) since --violet flips light in dark mode like --accent. (2) stage badge maps extracted to `lib/stageBadges.ts`, consumed by both DealListItem and dd/TopBar so the stage hue follows the deal into its workspace. (3) upload-bar error state gray→red; HomePage + workspace error banners → red-tint treatment. Verified via frontend:verify headless-Edge both themes (tokens resolve, TB icons violet w/ correct on-violet text). Claude Design palette.html refreshed with accent+violet token rows.
- **2026-07-10 "do the rest" pass (Opus), 3 more commits, PUSHED**: (5964d40) removed unused recharts dep (zero importers, confirmed); (1119b12) doc-category chips — 14 categories → 3 hued families in DocumentsModal (legal=violet, financial=teal, diligence=amber, other=neutral; reuses badge trios) + swept the last 2 off-palette raw blue-500 column-resize drag handles → var(--accent). **F2 manual click-throughs now DONE** via headless Edge: upload showed clean phase progression (Uploading→Preparing→Complete, single poller, no flicker); agent query streamed a full answer with citations + saved the conversation (SSE client + request/cache path verified end-to-end). Category-family coloring confirmed by reclassifying seeded docs (then reset to "other"). palette.html updated with all families.
- Frontend color/contrast work is now COMPLETE for /app + workspace. Everything from the survey (items 1–6) shipped. Nothing color-related parked.
- **PR #98 OPENED 2026-07-10** (jwen2/Vyntic) from `frontend-guardrails` → main: "Frontend hardening (F1 + F2) + design-system color/contrast pass", 30 commits / 70 files. Covers F1 + F2 + monochrome contrast + cobalt accent + all color work. Green on build/lint(0 err)/test(49). Awaiting review — NOT merged.

### Next-session priorities
1. User verdict on the visual work + F2 click-throughs → merge/PR decision for `frontend-guardrails` (unpushed).
2. Ask about dropping recharts from package.json.
3. F3 next in frontend track (decisions D1–D3 first).
4. Unchanged from 2026-07-08: Postgres for Plan 4 A2/B2/E1; D2 hosting decision for Phase D.

---

## Session — 2026-07-08

### Worked on
- Finished **Plan 2** (auth/audit): implemented Task 2.5 (inline-file XSS hardening), opened + merged **PR #95** (also resolved a duplicate-fix merge conflict in `test_context_budget_guard.py`).
- Started **Plan 4** (Postgres + multi-tenancy) on branch **`postgres-multitenancy`** — 14 commits, **NOT pushed**.

### Completed (Plan 4, all TDD, suite 220 → 270 passing)
- **A1** Alembic: baseline 0001 + migrations 0002–0005; `run_migrations()` adopts pre-Alembic DBs (stamp 0001 → upgrade); compare_metadata guard test pins model↔migration sync.
- **A3** Session-per-request: `current_session()` ContextVar + app-level dependency; owner-task guard so `asyncio.create_task` can't leak the request session; auth dependencies made sync (off the event loop); ~78 `SessionLocal()` sites swapped; `audit_store.record()` deliberately keeps its own session.
- **B1** `tenants` table + `tenant_id` on users/deals/**managers** (managers added beyond plan letter — top-level entity); backfill to `default` tenant.
- **B3** Tenant-scoped auth: tenant gate first in `verify_deal_access` (binds admins + stale access rows), create paths stamp tenant, lists filter.
- **B4** Cross-tenant sweep (`tests/test_cross_tenant.py`) — **caught real holes, all fixed**: DELETE deal + PUT position had no deal-access check at all; `/auth/deals/{id}/access` (both) ungated; 4 ingest routes (upload/delete/reclassify/batch) ungated; audit log leaked all tenants (now denormalized `tenant_id` on rows, migration 0003).
- **C1** Soft-delete (`deleted_at`) + `legal_hold` (423 on delete) + `retention.purge_expired()` (startup sweep; vectors/files cleaned at purge, not delete; `RETENTION_PURGE_DAYS=30`). Note: soft-deleted deal_id 409s on recreate until purged.
- **C2** Pagination: `{items, total, next_offset}` envelopes on deals/documents/conversations/runs/audit lists; frontend `api.ts`/`workflows.ts` unwrap `.items` (components untouched); managers list deliberately not paginated.
- **C3** Conversations persisted to table (was in-memory dict).

### Decisions made
- **D1 = Option A** (row-level `tenant_id` + Postgres RLS at DB layer); **D3 = migrate existing pilot data**. Recorded in the plan doc header.
- C2 = limit/offset (not cursor), default 200/cap 500.
- Plan 2 doc moved to `docs/finished/`; Plan 4 doc checkboxes updated in `docs/todo/`.

### REMAINING (blocked) — what "the rest" needs
1. **A2** (Postgres engine/config + CI postgres job): needs a local Postgres. **Docker Desktop is broken/uninstalled on this machine** (user chose reinstall over winget-native, not done yet). `docker-compose.yml` already has a ready `postgres:16` service. `psycopg2` 2.9.12 already in venv; SQLite PRAGMA listener already dialect-guarded — A2 is mostly "run suite on PG, fix breaks, add CI job".
2. **B2** (RLS enforcement + the named DB-layer isolation proof test — the LP-reviewer artifact): needs A2. Design: policies keyed on `SET app.current_tenant`, set from the request session (A3's `request_session` is the hook point).
3. **E1** (SQLite→Postgres migrator): needs A2. **No pilot data on this machine** (both local DBs empty) — migrator runs wherever the pilot DB lives.
4. **Phase D** (encryption at rest, secrets manager): blocked on **D2 hosting decision** (Neon vs RDS vs Supabase vs defer) — user was asked, interrupted before answering.
5. ~~Push the branch / open PR~~ — **DONE 2026-07-08**: branch pushed, draft **PR #96** open ("[DO NOT MERGE] Plan 4: Postgres multi-tenancy - Phases A/B/C (partial)"). Remaining Plan 4 work lands on this same branch/PR. Repo `MEMORY.md` itself deliberately left untracked (not in the PR).

### Next-session priorities
1. Get Postgres running (ask: Docker reinstall done? else offer winget-native again), then A2 → B2 → E1.
2. Settle D2, then Phase D.
3. Mark PR #96 ready + retitle (drop DO NOT MERGE) once A2/B2/E1 land.

---

## Session — 2026-07-02/03

### Worked on
- **Rearchitect (correctness + consolidation).** Analyzed the repo, verified 15 findings line-by-line, implemented all fixes, consolidated five duplicated extraction paths into one `extraction_engine.py`, deleted the orphaned `ai-service/` sidecar and the decorative LangGraph.
- **LP-readiness assessment.** Evaluated resiliency (large-document scale) and security for pitching institutional LPs; wrote the assessment + five grouped remediation plans.

### Completed
- 28 commits on branch `fable-rearchitect`; **PR #90** open (https://github.com/jwen2/Vyntic/pull/90).
- Backend tests: **74 passing / 23 failing on `main` → 131 passing / 0 failing** (fixed pre-existing failures + added 40+ tests).
- Added GitHub Actions CI (was none). Fixed `pytest.ini` (`pythonpath = .`) so bare `pytest` in CI resolves `app`.
- Installed + authenticated GitHub CLI on this machine.
- Docs: `docs/assessments/2026-07-02-resiliency-security-assessment.md`; five plans in `docs/todo/` (index in `docs/todo/README.md`); completed rearchitect plan in `docs/superpowers/plans/`.

### Decisions made
- **Full-context stays the default**; RAG kept in-repo behind `context_provider` as a strategy seam (owner decision).
- Interrupted runs are **marked errored** on restart, not auto-resumed (avoids surprise token spend; retry endpoints exist).
- Mid-stream LLM failures **raise** rather than falling back (clean error beats duplicated answers).
- Plans organized: `docs/todo/` = open/actionable, `docs/superpowers/plans/` = completed, `docs/assessments/` = findings.

### In progress / not started
- PR #90 not yet merged; last CI run was pending after the `pytest.ini` fix push.
- All five `docs/todo/` remediation plans are **not started**.

### Next-session priorities
1. **Decide the tenancy model** (Plan 4 `postgres-multitenancy.md`, decision D1: row-level Postgres RLS vs schema-per-tenant vs database-per-tenant) — this blocks all Tier-2 work and shapes the Postgres schema.
2. Merge PR #90 (confirm CI green first); optionally split the docs into their own PR if a clean code-only PR is preferred.
3. Then execute `docs/todo/` Tier 0 → Tier 1 (Plans 1–3 are independent of the tenancy decision and can start immediately).

### Two headline gaps (context for the roadmap)
- Full-context mode cannot hold 100s of docs/deal (saturates Gemini's ~1M-token window; warns then sends anyway).
- Conversation-history routes were unauthenticated **and** in-memory (README wrongly claimed SQLite persistence).
