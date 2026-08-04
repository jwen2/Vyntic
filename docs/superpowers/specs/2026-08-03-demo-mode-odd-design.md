# Demo Mode — Operational Due Diligence Walkthrough

**Date:** 2026-08-03
**Status:** Approved, ready for implementation planning
**Scope:** Frontend-only demo mode reachable from the landing page. Free-roam workspace on mocked data, with a staged ODD Screen run as the centerpiece.

## Goal

Replace the landing page's "See a demo" → `#contact` mailto-style CTA with an interactive product walkthrough. A visitor clicks once, lands in a working Vyntic workspace populated entirely with fixture data, and can freely explore. The designed centerpiece is an **ODD Screen** workflow run that streams 16 cells and lands a `Red flag` verdict, every claim citing a real page of a real PDF.

The demo positions Vyntic for **LP operational due diligence** — not investment diligence. The story it tells is: *three DDQ answers are contradicted by primary documents, and Vyntic caught all three with citations.*

Non-goals: no backend changes, no new runtime dependency, no LLM calls at demo time, no authentication, no lead capture inside the demo itself.

## What already exists

The demo content problem is largely solved by material already in the repo.

**Corpus** — `output/` holds 13 fictional documents (328 KB total) for Brightwater Capital Partners, a two-fund GP. Seeded on startup by `backend/app/seed.py:99-160` as `brightwater_iv` (2026 vintage, in diligence) and `brightwater_iii` (2021 vintage, Glenmoor Endowment holds a $25M position, in monitoring). `output/MANIFEST.md` documents every planted finding and the expected verdict for each.

**Workflow** — `workflow_seed_lp.py:96` defines the `ODD Screen` built-in: `entity_type="fund"`, `type="tabular"`, `row_source="multi_doc_synthesis"`, 8 columns:

1. Valuation governance (`markdown`)
2. Service providers (`kv`)
3. Regulatory & litigation history (`markdown`)
4. Cybersecurity & BCP (`markdown`)
5. Compliance program (`markdown`)
6. Conflicts of interest (`markdown`)
7. Financial health of the GP (`markdown`)
8. Overall ODD rating (`enum` — `Clean | Monitor | Red flag`)

**Planted ODD findings** drawn from `output/MANIFEST.md`:

| Finding | Contradiction | Lands in column |
|---|---|---|
| Daniel Roache ceased to be an advisory employee 2026-02-28 (Form ADV) | Still listed as active senior team in PPM *and* pitchbook; named **Key Person** in the LPA; DDQ succession answer is evasive | GP financial health, Compliance program |
| Affiliated broker-dealer **Brightwater Securities, LLC** receives transaction fees (Form ADV) | Omitted entirely from the DDQ conflicts answer | Conflicts of interest |
| 2023 SEC deficiency letter on expense allocation, remediated | Disclosed in Form ADV only | Regulatory & litigation |
| Level 3 assets GP-marked, third-party review only **annually** | Against a claimed quarterly valuation committee | Valuation governance |
| DDQ claims 100% fee offset | LPA provides **50%** | Compliance program |
| No SOC 2, no fixed pen-test cadence | DDQ cybersecurity answer | Cybersecurity & BCP |
| Q2 2026 report dated Aug 29 = **60 days** after quarter end | Side letter requires 45 | Monitoring surface (not the ODD grid) |

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

## The staged ODD run

### Row axis

`row_source="multi_doc_synthesis"` means rows are free-text labels supplied at run start (`routes_workflow_runs.py:110`), and the UI renders the `row_key` verbatim for synthesis workflows (`CompareView.tsx:500`). The 8 ODD dimensions are the columns.

**Decision: 2 rows × 8 columns = 16 cells.**

1. `Management company — Brightwater Capital Partners, LLC`
2. `Fund vehicle — Brightwater Capital Partners IV, L.P.`

Rationale:

- It mirrors how ODD questionnaires are actually structured: management-company risk is assessed separately from vehicle-level risk.
- It stays **honest about context**. Both rows are answerable from documents legitimately in Fund IV's context — the entity-scoped DDQ, LPA, PPM and pitchbook, plus the manager-scoped Form ADV, valuation policy, and track record, which resolve in through `context_provider._manager_shared_doc_rows` (CLAUDE.md Invariant 2).
- 16 cells give the grid enough mass to be worth watching fill, and `CompareView` — which already exists and is built for comparing rows — works on it.

**Rejected alternative:** one row per fund (Fund IV vs Fund III). More visually dramatic, but a run is keyed to a single `deal_id`, so Fund III's documents would not legitimately be in Fund IV's context. The demo would depict something the real product would not do.

### Playback

Entry path: fund workspace → Workflows tab → **ODD Screen** card → Run.

`demoEventSource` replays a fixture timeline of `cell_start` / `cell_done` events in **column-major order**, matching the real executor's dispatch ordering, at jittered ~250–600 ms intervals for a total of roughly 20–30 seconds.

The final column resolves to:

- Management company → **`Red flag`**
- Fund vehicle → **`Monitor`**

Every cell carries citations resolving to a real `doc_id` and page in the corpus.

### Content sourcing

Fixture cell content is produced by **recording a real run, then freezing it**:

1. Boot the stack with the seeded Brightwater corpus. `GEMINI_API_KEY` is present in `backend/.env`, so this is viable.
2. Run the ODD Screen against `brightwater_iv` with the two row labels above.
3. Snapshot the completed run — cells, `answer_formatted` payloads, citations, timings — to JSON.
4. Hand-edit for tone and to sharpen the ODD narrative, keeping citations pointing at genuinely correct pages.

Recording rather than hand-authoring matters because the output *was* real, so it reads as real and the citations are correct by construction. At demo time nothing calls an LLM.

Cell payloads must respect the kind-tagged `answer_formatted` contract — never key-sniff (`lib/cellShapes.ts`).

## Free-roam surface coverage

Fixtures are required for every surface a visitor can reach:

- **`/app`** — fund list showing both Brightwater funds
- **`/deal/brightwater_iv`** — workspace: fund brief, documents, doc matrix, workflows library, prior completed runs so the workspace is not empty on arrival
- **`/deal/brightwater_iii`** — monitoring workspace, where the **60-day quarterly report vs. 45-day side-letter undertaking breach** lands
- **`/manager/brightwater_capital`** — manager page with both funds and the manager-scoped documents
- **`/portfolio`** — positions, the Glenmoor $25M Fund III commitment, capital call queue, side-letter compliance

### Chat

Free-text questions cannot be convincingly mocked. Chat ships with **suggested-question chips** mapped to canned cited answers covering the ODD narrative.

Off-script input gets an honest fallback rather than a fabricated answer:

> This demo answers a fixed set of questions. In the live product this runs against your documents.

Disabling chat entirely was rejected — cited Q&A is central to the pitch.

## Landing page change

`LandingNav.tsx:63` and `:94` change from `href="#contact"` to `to="/demo"`. A "Talk to us" link pointing at `#contact` is kept alongside so the lead-capture path is not lost.

**Coordination note:** per `CLAUDE.md`, the landing page still deliberately sells the buyout story pending LP repositioning. An LP-ODD demo hanging off it will read as a mismatch until that copy work lands. This is a known, accepted inconsistency, not something this work fixes.

## Testing

- **Unit** — the `(method, path)` fixture router resolves every path the app requests; unknown paths fail loudly in dev rather than returning empty data silently.
- **Type** — fixtures are typed against the real exported API interfaces, so `npx tsc --noEmit` catches drift.
- **Component** — the ODD run timeline drives cells to completion and lands the `Red flag` enum; the demo flag off means zero interception.
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

None blocking. The recording branch in content sourcing is resolved — `GEMINI_API_KEY` is present.
