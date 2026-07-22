# LP Monitoring Wedge — Capital-Call Queue + Side-Letter Compliance Tracker

**Status:** IMPLEMENTED on `feat/lp-monitoring-wedge` (backend + frontend + tests; verified end-to-end incl. live LLM side-letter extraction). Open questions Q1–Q4 resolved as recommended.
**Author:** Claude (session 2026-07-11). Code facts verified against `main` @ `7d7aa12`.
**Reviewer decisions captured (2026-07-11):** manual upload + classify (no auto-ingestion this pass) · side-letter verification = *LLM suggests, analyst confirms* · deadlines = *in-app board only* (no email/scheduler) · surface = *portfolio-wide + per-fund*.

---

## 1. Why this exists (business context — drives every design choice)

Vyntic has repositioned toward **LPs** (institutional allocators). Selection is now well-served: the object model (managers → funds → positions, PR #94) and 7 LP built-in templates (PR #102) shipped. But the primer's *other half* — **monitoring** — is untouched, and it is the moat: an LP in 50–100 funds processes hundreds of quarterly packages, and **capital calls arrive on ~10-business-day wire deadlines** that cannot be missed. Monitoring is what turns a one-time diligence sale into a renewing subscription. No competitor owns cited, re-runnable *analysis* of the quarterly document flood (DiligenceVault owns DDQ routing; Canoe owns structured data capture).

This plan builds the **first sticky monitoring wedge** — the two highest-pain, most-demoable pieces:

1. **Capital-Call & Distribution Queue.** Extract amount, due date, purpose, and remaining unfunded from each notice; verify against the position; surface a deadline board (portfolio-wide + per-fund). Ties directly to the ~10-day wire pain.
2. **Side-Letter Compliance Tracker.** A side letter grants a specific LP special terms (fee discounts, MFN, co-invest, reporting undertakings, excuse rights). LPs must confirm every promise is honored every quarter — **nobody tools this well** (per the primer, a genuine differentiator). Each obligation is extracted once, then re-checked against each new quarterly package: *LLM proposes compliant/breach/unclear with citations; analyst confirms.*

Both activate schema that the object model **deliberately shipped mostly-empty in v1 for exactly this** (`doc_category`, `period`, `PositionRow`). Read `CLAUDE.md` (repo root) first — its invariants govern: additive-only migrations, single extraction primitive (`extraction_engine.run_extraction`), citations-on-everything, default-deny routes, stable IDs.

Background: `../../LP_and_Secondaries_Deep_Research.md` §1.4 (monitoring), §1.5 (capital-call / distribution / PCAP docs), side letters. Prior specs: `2026-07-05-lp-object-model...`, `2026-07-08-lp-template-packs...` (both complete).

**Explicitly OUT of scope this pass** (deferred fast-follows, note in PR): auto-ingestion (email-in / watched folder), email/push notifications + scheduler, quarter-over-quarter NAV delta view, full portfolio analytics (pacing, cross-fund DPI). This wedge is the data model + the two views that prove the pain is worth paying for.

---

## 2. Verified code facts (don't re-derive)

### Schema (`backend/app/database.py`)
- `PositionRow` (line ~80): PK `deal_id` (FK→deals, one row per fund), `commitment_amount, currency, called_amount, distributed_amount, nav, as_of, status, updated_at`. Store: `manager_store.get_position(deal_id)` / `upsert_position(deal_id, PositionUpsert)` (lines 106/117).
- `DocumentRow` (line ~99): has `doc_category` (indexed), `period`, `scope`. `DOC_CATEGORIES` in `models/deal.py` already includes `capital_call`, `distribution_notice`, `side_letter`, `quarterly_report`, `capital_account`.
- **Additive migration shim** `_ensure_schema_migrations` (line ~420): dict `table → [(col, DDL)]`. New tables via `Base.metadata.create_all` (automatic). New columns on existing tables go in this dict. **No Alembic, no destructive DDL.**

### Extraction primitive (`backend/app/services/extraction_engine.py`)
`async run_extraction(chunks, user_message, *, deal_id=None, page_context_chunks=None, require_citations=False, empty_context_placeholder=None, on_token=None) -> ExtractionResult` (line 34). `ExtractionResult` carries cleaned answer + `citations`. Get `chunks` from `context_provider.load_doc_context(deal_id, doc_id, question)` (single doc) or `load_deal_context(deal_id, question)` (whole fund; already includes manager-scoped docs). **All new LLM extraction MUST route through this** — never a parallel Gemini call. `require_citations=True` blanks answers with no valid citation (use it).

### Routes / RBAC / audit
- Route modules under `backend/app/api/`, registered in `main.py`. Every route needs an auth dependency or `tests/test_default_deny.py` (route walker) fails. `require_deal_access(user, deal_id)` for fund-scoped reads; `require_admin(user)` for mutations. Analyst = read; admin = write (matches positions/docs).
- Audit: `audit_store.record(user, action, resource_type=, resource_id=, deal_id=, request=)` (`services/audit_store.py:23`). Call it on new mutations (`callnotice.confirm`, `sideletter.verify`, etc.).
- Portfolio-wide reads must enforce access **per fund** and filter to the caller's visible funds — copy the pattern in `routes_managers.py::list_manager_funds` (lines 83–97: admin sees all; else loop `verify_deal_access` and collect visible).

### Frontend (post-F3 decomposition)
- `frontend/src/App.tsx`: lazy routes inside `ProtectedRoute` — `/app`, `/deal/:dealId`, `/manager/:managerId`. **Add `/portfolio`** the same way.
- Pages: `HomePage`, `DealWorkspacePage`, `ManagerPage` exist. Workspace tabs enum `DealWorkspaceMode = "agent" | "workflows" | "brief"` in `components/dd/TopBar.tsx:7` (items list line ~320). **Add two per-fund tabs** here (or a single "Monitoring" tab with sub-views — see §4).
- Styling: `ddTheme(theme)` from `components/dd/types.ts`; `font-mono-plex` uppercase eyebrows; rounded pills; `ACCENT` from `components/workflows/theme.ts`. Position UI shipped as `components/dd/PositionModal.tsx` — **copy its shape** for the new modals/panels. API client `lib/api.ts` (`fetchWrapper` = JWT + 401). Verify end-to-end with the **`Vyntic/frontend:verify`** skill.

### Environment
- `cd backend && .venv/bin/pytest -q` (bare `pytest` in CI; conftest drops+recreates tables per test → seed via stores in tests, startup events don't run under `TestClient`). Frontend: `cd frontend && npx tsc --noEmit && npm run build`. Docker: backend `app/` bind-mounted (restart, no rebuild). Login `admin@vyntic.com`/`admin`. Don't commit `.env` / `docker-compose.override.yml`.

---

## 3. Backend design

### 3.1 New tables (both via `create_all`; no data migration)

```
call_notices                          — one row per processed capital-call / distribution notice
  id            (uuid pk)
  deal_id       (fk deals, indexed)   — the fund
  doc_id        (fk documents, nullable, SET NULL)  — source notice
  kind          str                   — "call" | "distribution"
  amount        float | null
  currency      str  = "USD"
  due_date      str | null            — ISO "2026-08-14"; distributions use it as pay/record date
  period        str | null            — "2026-Q3"
  purpose       str  = ""             — extracted narrative (what the call funds)
  status        str  = "pending"      — "pending" | "confirmed" | "paid" | "dismissed"
  outstanding_before float | null     — unfunded commitment implied at notice time (extracted or computed)
  citations_json text = "[]"          — Citation[] backing the extracted figures
  extracted_json  text = "{}"         — raw structured extraction for audit/debug
  created_at / updated_at

side_letter_obligations               — one row per obligation extracted from a side letter
  id            (uuid pk)
  deal_id       (fk deals, indexed)
  doc_id        (fk documents, nullable, SET NULL)  — source side letter
  category      str                   — fee | mfn | coinvest | reporting | transfer | excuse | regulatory | other
  text          str                   — the obligation, one sentence
  section_ref   str  = ""             — clause/section pointer
  cadence       str  = "ongoing"      — "ongoing" | "one_time"
  verify_hint   str  = ""             — "what to check each quarter" (from extraction)
  citations_json text = "[]"
  status        str  = "active"       — "active" | "waived" | "archived"
  created_at

side_letter_checks                    — one verification of one obligation against one period
  id            (uuid pk)
  obligation_id (fk side_letter_obligations, CASCADE, indexed)
  period        str                   — "2026-Q2"
  verdict       str                   — "compliant" | "breach" | "unclear"
  llm_verdict   str | null            — the model's original proposal (kept when analyst overrides)
  rationale     str  = ""             — model's reasoning / analyst note
  citations_json text = "[]"          — evidence from the quarterly package
  confirmed_by  int | null            — user id who confirmed/overrode
  confirmed_at  datetime | null       — null = proposed, awaiting confirmation
  created_at
  (unique index on (obligation_id, period) — one current check per obligation per period; re-run replaces)
```

New stores `services/call_notice_store.py`, `services/side_letter_store.py` (own their sessions, return Pydantic; mirror `manager_store.py`). Pydantic in `models/monitoring.py`.

### 3.2 Capital-call extraction

`services/monitoring_extractor.py::extract_call_notice(deal_id, doc_id) -> CallNoticeDraft`:
1. `chunks = await context_provider.load_doc_context(deal_id, doc_id, question)`.
2. One `run_extraction` call, `require_citations=True`, `deal_id=deal_id`, asking for a strict field block (house style from `PROACTIVE_SCAN`): `Kind: [call|distribution]`, `Amount:`, `Currency:`, `Due date: [ISO or Not found]`, `Period:`, `Purpose:`, `Outstanding/unfunded after this call: [if stated]`. Parse the block (reuse the kv-parse approach in `workflow_format.py`; keep parsing tolerant — "Not found" → null).
3. Return a draft (not yet persisted) with citations. Route persists on confirm.

**Deliberately a bespoke extractor, not a workflow template**, because the output is a typed record feeding a queue, not grid cells. It still goes through `run_extraction` (invariant preserved).

### 3.3 Side-letter extraction + verification
- `extract_side_letter_obligations(deal_id, doc_id) -> list[ObligationDraft]`: one `run_extraction` over the side letter asking for a numbered list of obligations, each with `category`, `text`, `section_ref`, `cadence`, `verify_hint`, citations. Persist on confirm (analyst can prune the list first).
- `verify_obligations_against_period(deal_id, period) -> list[CheckDraft]`: load the fund's quarterly-package context for that `period` (filter `DocumentRow` by `deal_id` + `period` + category in {quarterly_report, capital_account, financial_statements}); for each active obligation, one `run_extraction` asking "Given this obligation: '{text}', does the quarterly package show it honored? Answer verdict {compliant|breach|unclear} + one-sentence rationale, cite evidence." Store as `side_letter_checks` rows with `confirmed_at=NULL` (proposed). **Analyst confirms/overrides** via route → sets `verdict`, `confirmed_by`, `confirmed_at`; original model verdict retained in `llm_verdict`.
  - Batch note: N obligations = N extraction calls; run sequentially or with the existing bounded concurrency helper (check `workflow_run_executor` for the pattern). Keep it a background-ish request or cap N; fine for v1 volumes.

### 3.4 Routes (`api/routes_monitoring.py`, registered in `main.py`)

Per-fund (all `require_deal_access`; mutations also `require_admin` + audit):
- `POST /deals/{deal_id}/call-notices/extract` body `{doc_id}` → draft (no persist).
- `POST /deals/{deal_id}/call-notices` body = confirmed draft → persist; if `kind=call` optionally bump `PositionRow.called_amount`, if `distribution` bump `distributed_amount` (analyst-confirmed only — see Open Question Q2).
- `GET /deals/{deal_id}/call-notices` → list for the fund.
- `PATCH /deals/{deal_id}/call-notices/{id}` → status (paid/dismissed) + editable fields.
- `POST /deals/{deal_id}/side-letters/extract` `{doc_id}` → obligation drafts.
- `POST /deals/{deal_id}/side-letters/obligations` → persist confirmed obligations (bulk).
- `GET /deals/{deal_id}/side-letters/obligations` → list + latest check per obligation.
- `POST /deals/{deal_id}/side-letters/verify` `{period}` → run verification, return proposed checks.
- `PATCH /deals/{deal_id}/side-letters/checks/{id}` → confirm/override verdict.

Portfolio-wide (enforce per-fund access, filter to visible funds — `routes_managers` pattern):
- `GET /portfolio/call-notices?status=pending&horizon_days=30` → all upcoming notices across visible funds, each annotated with fund name + manager name, sorted by `due_date`.
- `GET /portfolio/positions` → all visible fund positions + fund/manager labels + computed unfunded (`commitment - called`), for the roll-up.
- `GET /portfolio/compliance` → obligations whose latest check is `breach` or `unclear`, across visible funds (the "needs attention" list).

### 3.5 Tests (`tests/test_monitoring.py`)
Table-stakes with the merged patterns: extraction parse (mock `run_extraction` / feed canned text → correct fields); confirm persists + audits; RBAC (analyst can read, cannot confirm; portfolio endpoints hide funds the analyst can't see — reuse `test_object_model.py::test_manager_funds_are_filtered_by_access` shape); default-deny walker passes (auto). Verification: proposed check has `confirmed_at=NULL`; override keeps `llm_verdict`; unique (obligation, period) replace-on-rerun. Position write-back only on confirm.

---

## 4. Frontend design

### 4.1 Portfolio dashboard — new `/portfolio` route + `pages/PortfolioPage.tsx`
The LP "whole book" view (primer's most-stressed dimension). Reachable from `HomePage` top bar / sidebar ("Portfolio" link). Three stacked panels using `ddTheme` cards:
1. **Upcoming capital calls** — table from `GET /portfolio/call-notices`: due date (color-coded: red ≤5 business days, amber ≤10, normal beyond), fund, manager, amount, purpose, status pill. Row → fund workspace. This is the hero panel; it visualizes the ~10-day wire pain.
2. **Commitments roll-up** — from `GET /portfolio/positions`: per fund committed / called / distributed / NAV / **unfunded**, with column totals. DPI/TVPI computed client-side (as in `PositionModal`).
3. **Compliance attention** — from `GET /portfolio/compliance`: obligations flagged breach/unclear, fund + manager + obligation + verdict, row → the fund's side-letter view.

### 4.2 Per-fund: one new "Monitoring" workspace tab
Add `"monitoring"` to `DealWorkspaceMode` (`TopBar.tsx`), rendered **only when `deal.entity_type === "fund"`**. The tab hosts two sub-sections (segmented control):
- **Capital calls & distributions** — list of processed notices + a "Process a notice" action: pick a doc already classified `capital_call`/`distribution_notice` → calls `/extract` → shows the draft with citations → analyst edits/confirms → persists. Confirmed rows show amount, due date, purpose, status controls (mark paid/dismiss), and citation chips (reuse `InlineCitation`/`CitationPanel`).
- **Side letters** — obligations list (grouped by category) with, per obligation, the latest check verdict badge. A "Verify against period" control (period picker) runs `/verify`, then renders each proposed verdict inline for **confirm/override** (this is the differentiator UX — make the confirm action obvious, show the model's rationale + evidence citation). First-time setup: "Extract obligations from a side letter" (pick a `side_letter` doc → `/extract` → review/prune → save).

Keep it inside the existing workspace shell; reuse citation components and `ddTheme`. No new CSS framework.

### 4.3 API client + verification
Add typed functions to `lib/api.ts` for all endpoints above. `tsc --noEmit && npm run build`, then drive with `Vyntic/frontend:verify`: create fund, upload+classify a capital-call fixture, process it, confirm; upload+classify a side letter, extract obligations, verify against a period, override one verdict; open `/portfolio` and confirm the notice + breach appear. Screenshot the portfolio dashboard + the side-letter confirm flow for the PR.

---

## 5. Sequence & deliverable
1. Schema + stores + Pydantic (§3.1) → 2. extractors through `run_extraction` (§3.2–3.3) → 3. routes + audit + tests (§3.4–3.5) — backend-complete commit. 4. Portfolio page (§4.1) → 5. per-fund Monitoring tab (§4.2) → 6. verify (§4.3).
Full `pytest` + `tsc` + `npm run build` green. PR `feat/lp-monitoring-wedge` → `main`, titled "feat: LP monitoring wedge — capital-call queue + side-letter compliance tracker". Body: business context (1 para), the two features, the confirm-not-automate design choice, screenshots, tests, and the explicit deferred list (§1). Update `docs/todo/README.md` (add row + outcome). Optional demo fixtures: a synthetic capital-call notice + side letter for Hillpath Fund IV in `sample_data/` (don't block the PR).

## 6. Open questions for the reviewer (answer inline or in PR)
- **Q1 — Position write-back:** should confirming a `call` notice auto-increment `PositionRow.called_amount` (and distribution → `distributed_amount`)? Recommended **yes, on confirm only**, with the analyst able to edit the delta — it keeps the roll-up live without a separate data-entry step. Risk: double-count if the same notice is processed twice (mitigate: the notice row is the source of truth; recompute called = Σ confirmed call notices rather than blind increment). *Leaning: recompute from notices, not blind increment.*
- **Q2 — Period model:** `period` is a free string ("2026-Q2") today. For verification we match obligations to a quarter by `DocumentRow.period`. OK to keep free-string with a suggested-format helper, or introduce a validated quarter type now? Recommended **keep free-string** (matches doc classification already shipped); validate lightly in the picker.
- **Q3 — Business-day math** for the deadline color bands: use a simple calendar-day approximation (≤7 red / ≤14 amber) for v1 to avoid a holiday-calendar dependency? Recommended **yes**, note it as an approximation.
- **Q4 — Verification cost:** N obligations × per-quarter = N LLM calls. Fine at v1 volumes; if a fund has many obligations, cap or background it. Acceptable for this pass?

## 7. Known traps
- New route without an auth dependency → `test_default_deny.py` fails.
- Portfolio endpoints must filter by per-fund access, not just authenticate — an analyst must never see a fund they lack access to.
- `run_extraction` short-circuits on empty chunks (`empty_context=True`) — handle "no quarterly docs for this period yet" as a clean "nothing to verify against", not an error.
- Conftest wipes tables per test; startup seeding doesn't run under `TestClient`.
- Keep all extraction through `run_extraction`; do not add a second LLM path.
- `PositionModal.tsx` is the styling/interaction template — match it; don't reinvent modal patterns.
