# Demo Mode — Operational Due Diligence Walkthrough

**Date:** 2026-08-03
**Status:** Approved, ready for implementation planning
**Scope:** Frontend-only demo mode reachable from the landing page. Free-roam workspace on mocked data, with a staged **DDQ Gap & Consistency Scan** run as the centerpiece.

**Revised 2026-08-04** — the centerpiece workflow changed from `ODD Screen` to `DDQ Gap & Consistency Scan` after recording. See [Why the centerpiece changed](#why-the-centerpiece-changed).

## Goal

Replace the landing page's "See a demo" → `#contact` mailto-style CTA with an interactive product walkthrough. A visitor clicks once, lands in a working Vyntic workspace populated entirely with fixture data, and can freely explore. The designed centerpiece is a **DDQ Gap & Consistency Scan** run that streams 12 cells, every claim citing a real page of a real PDF.

The demo positions Vyntic for **LP operational due diligence** — not investment diligence. The story it tells is: *the manager's own DDQ and marketing materials contradict its Form ADV on a Key Person, and Vyntic caught it with citations and wrote the follow-up questions.*

Non-goals: no backend changes, no new runtime dependency, no LLM calls at demo time, no authentication, no lead capture inside the demo itself.

## What already exists

The demo content problem is largely solved by material already in the repo.

**Corpus** — `output/` holds 13 fictional documents (328 KB total) for Brightwater Capital Partners, a two-fund GP. Seeded on startup by `backend/app/seed.py:99-160` as `brightwater_iv` (2026 vintage, in diligence) and `brightwater_iii` (2021 vintage, Glenmoor Endowment holds a $25M position, in monitoring). `output/MANIFEST.md` documents every planted finding and the expected verdict for each.

**Workflow** — `workflow_seed_lp.py:25` defines the `DDQ Gap & Consistency Scan` built-in (`builtin_lp_ddq_scan`): `entity_type="fund"`, `type="tabular"`, `row_source="multi_doc_synthesis"`, 12 columns — Firm & Ownership, Team & Succession, Track Record, Investment Strategy & Process, Fund Terms & Economics, Valuation Policy, Compliance & Regulatory, IT & Cybersecurity, ESG, LP Base & References, Conflicts of Interest, Service Providers. All `markdown`.

Every column shares one prompt shape, and it is the reason this workflow is the centerpiece:

> Review the {SECTION} section across the DDQ and supporting materials. Summarize the answers, **flag skipped or evasive responses, identify contradictions with the PPM or pitchbook**, and propose focused follow-up questions.

`ODD Screen` (`workflow_seed_lp.py:96`, 8 columns, ends in an `enum` rating) remains in the workflow library and is reachable in the demo, but is **not** the staged run.

**Findings the recording actually produced**, verified against `output/MANIFEST.md`:

| Finding | Contradiction | Lands in column | Status |
|---|---|---|---|
| Daniel Roache ceased to be an advisory employee 2026-02-28 (Form ADV) | Still listed as active senior team in PPM *and* pitchbook (both dated July 2026); named **Key Person** in the LPA | Team & Succession (headline), echoed in Strategy, Conflicts, Fund Terms | ✅ **Headline.** Model writes "A material inconsistency exists" unprompted and asks why the PPM still presents him as current |
| 2023 SEC deficiency letter on expense allocation, remediated | Disclosed in Form ADV only; absent from PPM and pitchbook | Compliance & Regulatory (+ 4 more) | ✅ Model explicitly calls it an omission from the PPM/pitchbook |
| No SOC 2, no fixed pen-test cadence | DDQ cybersecurity answer | IT & Cybersecurity | ✅ Explicit "Governance Gaps"; testing cadence "at management's discretion" |
| Level 3 assets GP-marked, third-party review only **annually** | Against a claimed quarterly valuation committee | Valuation Policy | ✅ |
| Affiliated broker-dealer **Brightwater Securities, LLC** receives transaction fees (Form ADV) | Omitted from the DDQ conflicts answer | Conflicts of Interest | ❌ **Not produced.** Model instead reports the firm "does not expect Fund IV to rely on affiliated service providers" |
| DDQ claims 100% fee offset | LPA provides **50%** | Fund Terms & Economics | ❌ **Not produced, and answered the other way** — the model asserts DDQ/PPM/pitchbook are *consistent* on fees |
| Q2 2026 report dated Aug 29 = **60 days** after quarter end | Side letter requires 45 | Monitoring surface (not the grid) | Unaffected by this change |

The last two are planted findings the model missed. **The demo must not present either as caught.** A false negative is honest; staging a finding the fixture does not contain is not.

## Architecture

### Entry and mode activation

`/demo` is a public route registered in `App.tsx` outside `ProtectedRoute`. It is not a page — it is an activation gate that:

1. Detects an existing real auth token. If present, confirms with the user before proceeding, then clears it. A live session must never blend with fixture data.
2. Sets the demo flag in `sessionStorage` (`vyntic_demo_mode`). Session-scoped so closing the tab ends the demo; surviving refresh so the back button and hard reloads work.
3. Redirects to `/app`.

From that point the visitor uses **the normal app routes** — `/app`, `/deal/brightwater_iv`, `/deal/brightwater_iii`, `/portfolio`, `/manager/brightwater_capital`.

**Why redirect rather than nest under `/demo/*`:** every page component builds links as hardcoded absolute paths (`/deal/:id`). Nesting would require rewriting link construction across the app. Redirecting means free-roam navigation works with no changes to any page component.

The cost of that choice is that the URL does not say "demo". Mitigated by a persistent banner (see below).

### Demo banner

A fixed banner renders whenever the flag is set: `Demo — sample data. Brightwater Capital is fictional.` with an **Exit demo** control that clears the flag, clears in-memory fixture state, and returns to `/`.

### Transport interception

All mocking happens at the network boundary. The app's network surface is three chokepoints:

| Chokepoint | Covers |
|---|---|
| `lib/api.ts:62` `fetchWrapper` | every REST call in the app |
| `lib/sse.ts` `sseStream` | chat, assistant, and doc-matrix POST streams |
| `lib/workflows.ts:412` `new EventSource` | the workflow-run GET stream — the ODD centerpiece |

A new `src/demo/` module provides:

- `isDemoMode()` — reads the session flag
- `demoFetch(method, path, body)` — a `(method, path)` → fixture router returning a synthetic `Response`
- `demoSseStream(url, body, handlers)` — scripted event emitter for POST streams
- `demoEventSource(url)` — a minimal `EventSource`-shaped object driven by a timeline

Each chokepoint gains a single early-return guard. When the flag is off there is no behavior change and no added work on the production path.

**Auth needs no demo-awareness.** The mock transport answers `GET /auth/me` with a demo user, so `AuthContext` and `ProtectedRoute` behave normally — they simply see an authenticated session.

### The one non-transport change

`DocumentViewer.tsx:56` constructs `viewUrl` as a literal `/api/deals/{dealId}/documents/{filename}/view?token=...` and loads it into an `<iframe>`. Iframes bypass `fetch`, so transport interception cannot reach it.

Fix: extract the URL construction into a helper that returns `/demo-assets/docs/{filename}` when the flag is set. The 13 corpus files (12 PDFs + 1 XLSX, 328 KB total) are copied to `frontend/public/demo-assets/docs/` at build time and served statically. The `#page=N` fragment and Excel `?sheet=N` param continue to work unchanged.

The asset prefix is deliberately **`/demo-assets/`, not `/demo/`** — `/demo` is a client route, and nesting static files beneath it would depend on static-file serving winning over the SPA fallback. A distinct prefix removes the collision entirely.

The directory is flat and keyed by filename alone, dropping `dealId`. This is safe because filenames are unique across the whole corpus; the plan must assert that uniqueness rather than assume it.

This preserves the product's core credibility promise: clicking a citation opens the genuine document at the genuine page.

### Fixture data model

Fixtures are typed against the **real API response models** already exported from `lib/api.ts` and `lib/workflows.ts` (`Deal`, `Manager`, `DocumentMetadata`, `WorkflowRun`, `TabularCell`, `Position`, …). Typing them against the real interfaces is what keeps the demo from drifting silently as the app evolves — a breaking API shape change becomes a `tsc` failure.

Mutations (create, update, upload) resolve against an in-memory store so no interaction errors out. Destructive controls (delete deal, delete document) are hidden in demo mode rather than faked.

## The staged run

### Why the centerpiece changed

The ODD Screen was recorded twice and failed its content gate both times. The reasons are structural, not fixable by re-rolling:

1. **Its column prompts never ask for contradictions.** They ask the model to *assess* eight operational dimensions. The demo's entire narrative is about catching inconsistencies between documents — work no ODD Screen column instructs. `DDQ Gap & Consistency Scan` is the one built-in written for exactly that.
2. **Three of its eight columns are thin in this corpus.** Cybersecurity & BCP, Compliance program and Financial health of the GP returned blank cells. Not model failure: `llm_calls` shows every call succeeded with real completion tokens, and `extraction_engine.py:78-79` then discarded the text for carrying no resolvable citation. That is CLAUDE.md Invariant 6 working correctly — an uncited claim is dropped rather than shown.
3. **The 2-row grid was invented, not designed.** Built-in synthesis templates are meant to run **one-click**: `routes_workflow_runs.py:116-120` defaults the single row label to the workflow name when no `synthesis_questions` are supplied.

Two row-key lessons, both learned the expensive way, recorded so they are not repeated:

- Rows for `multi_doc_synthesis` are fed to the model **as the question** (`workflow_run_executor.py:298`; the payload field is literally `synthesis_questions`). Entity-name rows give the model nothing to answer.
- Row questions must **never name a document subset**. "What do the LPA, PPM and Form ADV show…" pushed the model to answer from documents that do not cover the column's topic, producing uncited prose that was then correctly blanked. Blank cells doubled.

Measured outcome:

| | ODD, entity rows | ODD, question rows | **DDQ scan, one-click** |
|---|---|---|---|
| Cells | 16 | 16 | 12 |
| Blank cells | 3 | 6 | **0** |
| Citations | 32 | 22 | **59** |
| Answer chars | 4,864 | 4,093 | **16,462** |
| Prompt leaked into answer | 0 | 1 | 0 |

### Row axis

**Decision: 1 row × 12 columns = 12 cells**, run one-click. The row is labelled with the workflow name, exactly as the built-in intends. A single row cannot drift findings between rows and cannot blank a cell for lack of a row-specific question.

The trade is a less dramatic grid shape than 2 × 8. It is more than repaid: 12 populated cells carrying 16,462 characters and 59 citations is over three times the content of the 16-cell ODD grid, with no holes.

**Rejected alternative:** one row per fund (Fund IV vs Fund III). A run is keyed to a single `deal_id`, so Fund III's documents would not legitimately be in Fund IV's context. The demo would depict something the real product would not do.

### Playback

Entry path: fund workspace → Workflows tab → **DDQ Gap & Consistency Scan** card → Run.

The replay is driven by the **recorded run's own timings**, not invented jitter. Each cell carries a real `started_at` / `completed_at`, so the schedule is derived from those offsets relative to `run.started_at`:

- Total wall clock **6.8 seconds** — the real duration. An earlier draft of this spec claimed 20–30 seconds; that was invented, and slowing the replay to hit it would misrepresent the product as slower than it is.
- **Concurrency of 4** emerges for free from the real offsets: cells 1–4 start within 0.2 s of each other, and each later cell starts as an earlier one finishes.
- Each cell emits **`running` then `complete`**, mirroring the real executor, which publishes an event when it marks a cell running (`workflow_run_executor.py:278`) and again on completion. That gives genuine in-flight spinners for the 1.1–2.7 s each cell actually took. A `pending → complete` flip would discard the most convincing part of the animation.

**Browsing a completed run does not re-animate it.** `useTabularRun.ts:353` calls `subscribeRun` unconditionally, including for runs already `complete`, so the replay is armed only by a `POST .../runs` in the same session. Opening the recorded run from history emits one immediate snapshot of the finished run instead.

**A resubscribe mid-replay must not kill the animation.** The same effect has `docs` in its dependency array, and `docs` is populated asynchronously, so it re-runs once after mount. If that lands after the replay started, a consume-once arm would leave the resubscription with nothing to animate — a silently static grid of finished answers. Teardown therefore hands the arm *back* unless the replay already finished.

The accepted consequence: if the visitor navigates away mid-replay rather than resubscribing, the arm survives, and re-opening that run from history animates it once more. This is **intended**, not a leak to fix. It is benign — arguably what the visitor wants — and eliminating it would require a timed handoff window whose complexity is not justified. The behaviour that mattered, and that is guarded by test, is that a run which *completed* never re-animates.

There is **no enum verdict cell** — this workflow has no `enum` column, so no `Clean | Monitor | Red flag` badge appears. The model does use "**Red Flag:**" as an inline label inside three columns (Fund Terms, Valuation Policy, Service Providers), so the risk language is present in the prose without a badge to stage.

Every cell carries citations resolving to a real `doc_id` and page in the corpus. One citation resolves to `brightwater_track_record.xlsx` **page 0** — correct, not a defect: spreadsheets have no pages and page 0 is the product's sheet-level citation convention.

### Content sourcing

Fixture cell content is produced by **recording a real run, then freezing it verbatim**:

1. Start the backend against the seeded Brightwater corpus. `GEMINI_API_KEY` is present in `backend/.env`. (Docker is not available on the dev machine; run `backend/.venv` uvicorn directly.)
2. `node scripts/record_demo_run.mjs <email> <password> "DDQ Gap & Consistency Scan"` — runs one-click against `brightwater_iv` with all 7 documents in context.
3. Snapshot the completed run — cells, `answer_formatted` payloads, citations, timings — to `frontend/src/demo/fixtures/recorded-ddq-scan-run.json`.

**The fixture is committed verbatim. No hand-editing of cell content, for tone or anything else.** Recording rather than hand-authoring is what makes the citations correct by construction; editing the text would forfeit exactly that. If a finding is missing, the demo does not claim it. At demo time nothing calls an LLM.

Cell payloads must respect the kind-tagged `answer_formatted` contract — never key-sniff (`lib/cellShapes.ts`).

## Free-roam surface coverage

Fixtures are required for every surface a visitor can reach:

- **`/app`** — fund list showing both Brightwater funds
- **`/deal/brightwater_iv`** — workspace: fund brief, documents, doc matrix, workflows library, prior completed runs so the workspace is not empty on arrival
- **`/deal/brightwater_iii`** — monitoring workspace, where the **60-day quarterly report vs. 45-day side-letter undertaking breach** lands
- **`/manager/brightwater_capital`** — manager page with both funds and the manager-scoped documents
- **`/portfolio`** — positions, the Glenmoor $25M Fund III commitment, capital call queue, side-letter compliance

### Chat

Free-text questions cannot be convincingly mocked. Chat ships with **suggested-question chips** mapped to canned cited answers covering the recorded narrative — the Roache key-person contradiction, the 2023 SEC deficiency letter, the SOC 2 gap, and the Level 3 valuation review cadence. Chips must not promise findings the recording does not contain.

Off-script input gets an honest fallback rather than a fabricated answer:

> This demo answers a fixed set of questions. In the live product this runs against your documents.

Disabling chat entirely was rejected — cited Q&A is central to the pitch.

## Landing page change

`LandingNav.tsx:63` and `:94` change from `href="#contact"` to `to="/demo"`. A "Talk to us" link pointing at `#contact` is kept alongside so the lead-capture path is not lost.

**Coordination note:** per `CLAUDE.md`, the landing page still deliberately sells the buyout story pending LP repositioning. An LP-ODD demo hanging off it will read as a mismatch until that copy work lands. This is a known, accepted inconsistency, not something this work fixes.

## Testing

- **Unit** — the `(method, path)` fixture router resolves every path the app requests; unknown paths fail loudly in dev rather than returning empty data silently.
- **Type** — fixtures are typed against the real exported API interfaces, so `npx tsc --noEmit` catches drift.
- **Component** — the staged run timeline drives all 12 cells to completion with no blanks; the demo flag off means zero interception.
- **Fixture integrity** — a test asserts every citation in the recorded run resolves to a real corpus `doc_id` and a page within that document, so hand-editing the fixture cannot silently pass.
- **Manual** — walk every free-roam surface with the backend **stopped**, confirming no surface errors and no network request escapes. This is the real acceptance test: the demo must work with no backend at all.
- Existing suites (`npx tsc --noEmit`, `npm run build`, vitest, eslint) stay green.

## Risks

| Risk | Mitigation |
|---|---|
| Fixtures drift as the app evolves | Fixtures typed against real API interfaces; `tsc` fails on shape changes |
| A visitor reaches an un-mocked corner | Unknown-path handler fails loudly in dev; manual sweep of every surface with the backend stopped |
| Demo state contaminates a real session | Session-scoped flag, real token cleared on entry with confirmation, explicit Exit control |
| Fictional GP mistaken for a real firm | Persistent banner names Brightwater as fictional; `output/MANIFEST.md` disclaimer already establishes this |

## Open items for the implementation plan

None blocking. The run is recorded and committed (`frontend/src/demo/fixtures/recorded-ddq-scan-run.json`, run `0a15ef21`): 12/12 cells, 0 blanks, 59 valid citations.

`recorded-odd-run.json` has been **deleted**. It was an honest recording, but the weaker one — 4 of 8 gate findings, three blank cells — and it ended up with no code references once the centerpiece moved to the DDQ scan. Wiring it up as prior-run history would also have meant fixturing the ODD Screen workflow, adding surface for a run whose blank cells are exactly what a demo must not show. It remains recoverable from commit `fb6586c` if it is ever wanted.
