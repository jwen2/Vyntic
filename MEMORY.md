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

## Session — 2026-08-04 · Demo mode (LP operational due diligence)

### Worked on
Planning and executing an interactive **demo mode**: the landing page's "See a demo" CTA becomes a public `/demo` route dropping a visitor into a fully working workspace backed entirely by fixture data, with a staged ODD Screen run as the centerpiece. Focus is **operational** due diligence for LPs, not investment diligence.

### Completed
- Spec: `docs/superpowers/specs/2026-08-03-demo-mode-odd-design.md` (commit `0678f19`)
- Plan: `docs/superpowers/plans/2026-08-03-demo-mode-odd.md`, 10 tasks (commit `6aefa84`)
- Branch `feat/demo-mode-odd`. **Tasks 1–3 done, each reviewed clean:**
  - T1 `277ca82..2ce8375` — demo flag, fixture-router transport, `/demo` gate. Took 2 fix rounds.
  - T2 `61f6c5a` — Brightwater deal/manager/document fixtures.
  - T3 `8606931` — 13 corpus files as static assets + `buildDocumentViewUrl`.
- Test suite 243 → 270 passing, no regressions.

### Decisions made
- **Approach A** (frontend-only fixture layer) over a backend demo tenant — no infra, no LLM at runtime, no auth surface. Fixtures recorded from a real run so they read as real.
- **Free-roam** browsing with the ODD run as the staged centerpiece; `/demo` flips a session flag then redirects into the *normal* app routes, so no page component's links need rewriting.
- Interception at three chokepoints only: `api.ts::fetchWrapper`, `sse.ts::sseStream`, `workflows.ts::subscribeRun`. `DocumentViewer`'s iframe URL is the one non-transport change.
- Static assets live at **`/demo-assets/`, never `/demo/`** (`/demo` is a client route).
- Chat answers a fixed question set with an honest off-script fallback — never a fabricated answer.
- Demo mode clears any real auth token on entry; a live session must never blend with fixtures.

### In progress — BLOCKED ON A DECISION
**Task 4 (recording the ODD run) is paused awaiting the owner's choice.** The recording ran honestly (commit `fb6586c`, 32/32 citations valid, zero fabrication) but **failed its content gate 4/8**: `Red flag` never appears (both rows say `Monitor`), the fee-offset contradiction is never flagged, and two findings landed in the wrong row leaving cells blank.

Root cause is two design errors in the plan, not model failure:
1. For `multi_doc_synthesis`, `workflow_run_executor.py:298` feeds `row_key` to the model **as the question**. The row keys were entity *names*, not questions — hence blank cells and drifting findings.
2. **ODD Screen's prompts never ask for contradiction detection.** `LP_DDQ_SCAN` "DDQ Gap & Consistency Scan" (`workflow_seed_lp.py:25`) is the built-in written for it — every column says "flag skipped or evasive responses, identify contradictions with the PPM or pitchbook". The spec's "three DDQ answers are contradicted by primary documents" narrative belongs to that workflow.

Four options were put to the owner (A: re-record ODD Screen with question-shaped rows; B: that plus record the DDQ scan as prior-run history; C: switch the centerpiece to the DDQ scan; D: accept and rewrite the spec to Monitor/Monitor). **Full detail in `.superpowers/sdd/2026-08-03-demo-mode-odd/progress.md`.**

### Next-session priorities
1. **Answer the Task 4 question**, then re-record and resume Tasks 5–10 from the SDD ledger.
2. Carried-forward items already logged: `xhrUpload` bypasses the demo interception (uploads would hit a real endpoint) → Task 8; `.xlsx` is served raw but the real backend renders it to HTML server-side, so it downloads instead of displaying → Task 8; manual backend-stopped browser sweep still unrun → Task 10.

### Environment notes
- **Docker is not installed on this machine.** The backend runs locally via `backend/.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000`; the Brightwater corpus is already seeded and parsed in `backend/data/vyntic.db`, so no re-ingestion is needed.
- Real corpus metadata (doc_ids, page counts, chunk counts, the stable `builtin_lp_odd_screen` column ids) is captured in `.superpowers/sdd/2026-08-03-demo-mode-odd/corpus-ground-truth.md`. **11 of 13 page counts in the plan text were wrong** — trust that file, not the plan.

---

## Session 2026-08-04 → 08-05 — demo mode Tasks 4–8a

**Branch `feat/demo-mode-odd`, 20 commits, suite 243 → 354 passing (373 with uncommitted 8b work).**

### Decided
- **Centrepiece workflow changed: `ODD Screen` → `DDQ Gap & Consistency Scan`.** The ODD Screen was recorded twice and failed its content gate both times. Root cause was structural, not luck: its column prompts never ask for contradictions, and three of its eight columns are thin in the Brightwater corpus. The DDQ scan is the only built-in whose prompts say "flag skipped or evasive responses, identify contradictions with the PPM". Recorded one-click (the shape built-in synthesis templates are designed for) it returns 12/12 cells, **0 blanks, 59 citations, 3.4× the content**, and catches the Daniel Roache key-person contradiction unprompted.
- **Blank cells were never a row-key problem.** `extraction_engine.py:78-79` discards any answer carrying no resolvable citation (`require_citations=True`). That is invariant 6 working correctly — the model wrote those answers and the product refused to show them uncited.
- **Synthesis row questions must never name a document subset.** Naming "the LPA, PPM and Form ADV" pushed the model to answer from documents lacking the material, producing uncited prose that was then blanked. Blank cells doubled.
- **Replay uses the recording's real timings** — 6.8s wall clock, concurrency of 4 — not the plan's invented 250–600ms jitter and claimed 20–30s. Slowing the demo to hit the old number would misrepresent the product as slower than it is.
- **Deleted `recorded-odd-run.json`** (weaker recording, 3 blank cells, zero references; recoverable from `fb6586c`).
- **Accepted as intended, not a defect:** navigating away mid-replay and returning re-animates the run once. The bug it replaced was a silently static grid; closing this fully needs a timed handoff window not worth the complexity.

### The recurring lesson: the plan text is unreliable, verify against reality
Every plan guess checked so far has been wrong — 11 of 13 page counts, the `doc_id` scheme, the `DocumentMetadata` shape, the SSE event shape (`{type:"citations"}` does not exist and would have rendered nothing), citation pages ("forty-five (45) days" appears nowhere; the real text is "45 days"), and the findings/brief-overrides **envelope** (`res.findings`/`res.overrides` — the plan's bare array would have resolved `undefined` in the Brief while passing the plan's own test).

### Content honesty — the hardest part, took three passes
The recording missed two planted findings (the 100%-vs-50% fee offset, and the Brightwater Securities broker-dealer). Dropping those *questions* was not enough: the surviving answers still repeated the run's affirmative "the documents are consistent" conclusions. Probing `"does the ddq say 100% fee offset"` returned a confident, well-cited, **wrong** answer — and a prospect can open the DDQ this demo ships and see p7 say 100%. Fixed in `23f22cb` by deleting the consistency sentences, dropping the Conflicts card entirely, and removing an unsupported PPM citation. **Rule: an affirmative false consistency is worse than a missing finding.**

### In progress — read this before touching the tree
**Task 8b is UNCOMMITTED in the working tree (16 files) and stopped mid-flight.** Suite green (39 files/373) and tsc clean, but its browser verification never ran, so the key result — that the upload request no longer leaves the browser — is unproven. **Do not `git checkout`/`restore`/`stash` frontend/.** Full inventory and resume options are in `.superpowers/sdd/2026-08-03-demo-mode-odd/progress.md`.

### Next session priorities
1. Finish 8b (verify the pre-rendered xlsx figures against the real workbook; prove the upload no longer escapes).
2. 8c — monitoring/portfolio/brief data fixtures. Note the Brief tab currently shows "Awaiting scan output / 0 sources" while its header claims "Complete · 12/12".
3. Task 9 (demo banner + landing CTA — makes the demo publicly reachable, deliberately last), then Task 10 (backend-stopped sweep, including a *second* run in one session).

### Confirmed defects found by driving a real browser, not by reading code
- `/demo` bounced first-time visitors to `/login` (`AuthProvider` bootstraps before the flag is set) — fixed in `c6485ed` with a hard navigation.
- **`xhrUpload` genuinely escapes to the real network** — the POST left the browser twice and returned 500 from the dev proxy. The only request in a full six-pass walk that escaped.
- The doc-matrix surface throws `This surface is not part of the demo`, reachable from `/app` by any column chip.

### Process notes
- **Never `git add -A` in this repo** — the tree carries unrelated untracked scratch files (`.ds-*`, `.t6-*`, `.t7-*`, `.t8-*`) from earlier sessions. I swept ~40 of them into a commit and had to reset. Stage explicit paths.
- **Run vitest from `frontend/`.** From the repo root it picks up a different config and reports bogus failures (I briefly misreported "71 failed").
- Do not run a mutation-testing reviewer in parallel with an agent that commits — a mutant nearly landed in someone else's commit.
- `--reporter=basic` exits 1 on vitest 4 and makes every mutant look killed.
