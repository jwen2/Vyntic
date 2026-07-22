# LP Fund Brief + Monitoring Wrap-up

**Status:** planned (not started). Branch to create: `feat/lp-fund-brief` off `main`.
**Author:** Claude (session 2026-07-22). Code facts verified against `main` @ `2f12e54` (post PR #104).
**Scope:** (A) replace the buyout-framed Deal Brief with an entity-aware Fund Brief for LP analysts; (B) close the rough edges left by the monitoring wedge (PR #104). Explicit acceptance criteria per task — the reviewer tests against these.

---

## Context (why)

The Brief tab is the "one screen an IC member reads." It is hardwired to `builtin_proactive_scan`
(`frontend/src/components/dd/DealBriefDashboard.tsx:44`) — a buyout template (`entity_type="deal"`) whose
panels extract **Target / Purchase price / Enterprise value / Valuation multiples / Exit considerations**.
On a fund workspace this runs anyway (the single-workflow GET route, `routes_workflows.py::get_deal_workflow`,
checks builtin visibility but **not** entity_type) and produces "Not found" across most fields, collecting
none of what an LP evaluating a manager needs: fund snapshot, terms vs. market, track record with the
TVPI = DPI + RVPI tie-out, team/succession, ODD flags.

The monitoring wedge (PR #104, spec `2026-07-11-lp-monitoring-wedge.md`) shipped working but with three
known rough edges: no UI to set a document's `period` (side-letter verification depends on it — currently a
DevTools workaround), position totals recompute **only** from confirmed notices (a mid-life fund can't carry
an opening balance), and no progress feedback during multi-obligation verification.

Read `CLAUDE.md` first. Governing invariants: additive-only migrations; **the seed reconciler cannot add/
remove columns on an existing builtin id** (new template ⇒ new id); all LLM work through
`extraction_engine.run_extraction` (the brief runs via workflow runs, already compliant); every new route
carries an auth dependency (`tests/test_default_deny.py` walks and fails otherwise); citations on everything.

## Verified code facts

- **Brief data flow:** `useProactiveScanRun(dealId)` fetches `getWorkflow(dealId, "builtin_proactive_scan")`
  + `listRuns(...)`, streams run cells, and maps cells → panels **by column label** (`resultByLabel`).
  Panel field lists are hardcoded: `DEAL_SNAPSHOT_LABEL`/`SNAPSHOT_FIELDS` (Target/Company/Sector/Business
  model/Geography/Seller/Stage), `PROPOSED_TRANSACTION_LABEL`/`TRANSACTION_FIELDS` (Transaction type/Purchase
  price/Enterprise value/Ownership/Valuation/Financing/Timing), `INVESTMENT_THESIS_LABEL`, financial
  highlights (Annual/Quarterly markdown tables), "Analyst next actions". (~lines 330–352, 1197ff.)
- **Thesis parser** keys on heading regexes: `Thesis / Value creation levers / Exit considerations / Risks to
  thesis` (`THESIS_SECTION_HEADINGS`, line ~2313). Keeping these exact heading strings in the new template's
  prompt means **zero parser changes**.
- **Findings extraction** (`extractFindingsFromRun.ts`) mines cells whose column label is in
  `FINDING_COLUMN_LABELS` (six buyout labels, line 29) → drives the Brief findings panel and the TopBar
  deal-breaker pill via `useFindings`/`syncScanFindings`.
- **Brief props:** `DealBriefDashboard` receives only `dealId` (+theme/callbacks). `DealWorkspacePage` holds
  the full `deal` object — pass it (or `entityType`) down.
- **Overrides/diffs** persist in localStorage keyed `vyntic_brief_overrides_<dealId>` /
  `vyntic_brief_diff_<dealId>` — per-deal, so no cross-entity collision.
- **LP seed:** `workflow_seed_lp.py` holds 7 templates, `entity_type="fund"`, ids `builtin_lp_*`, appended to
  `BUILTIN_TEMPLATES` in `workflow_seed.py` (total today: 21). Reconciler patches label/prompt/format/tags/
  entity_type by `order_index`, never adds/removes columns.
- **Monitoring:** `DocumentsModal.tsx` has category `<select>` + scope toggle + `updateDocumentMetadata`
  (which already accepts `period`) — **no period input**. `PositionRow` (database.py ~line 80) has no opening
  balance; `call_notice_store.recompute_position_totals` sets `called_amount`/`distributed_amount` = Σ
  confirmed/paid notices (Nones when zero). `MonitoringPanel.tsx` `handleVerify` is one POST that verifies
  all obligations server-side sequentially; button shows a generic "Verifying…".
- Demo data: Brightwater doc pack merged in `sample_data`-adjacent `output/` (see its `MANIFEST.md` for
  planted findings + the Consistency Ledger used by acceptance criteria below).

---

## Part A — LP Fund Brief

### A1. New builtin `builtin_lp_fund_brief` (backend seed)
In `workflow_seed_lp.py`: tabular, `multi_doc_synthesis`, `entity_type="fund"`, `output_format="excel"`,
name **"Fund Brief"**. New id (reconciler rule). 11 columns, mirroring the Proactive Scan shape so the
dashboard machinery is reused. Follow the house prompt style (ALL-CAPS focus, `[Source N]` citations,
"Not found" convention, kv columns give exact `Field: [desc]` line formats).

| # | Label | Format | Content |
|---|---|---|---|
| 1 | Fund snapshot | kv | `Manager / Fund / Vintage / Strategy / Target size / Hard cap / Geography / Raise stage` |
| 2 | Terms at a glance | kv | `Management fee / Carried interest / Preferred return / Waterfall / GP commitment / Fee offset / Key person / Term` |
| 3 | Key performance data | markdown | "Track Record" table (Fund, Vintage, Size, Net IRR, TVPI, DPI, RVPI) + explicit instruction to note any fund where DPI + RVPI ≠ TVPI; second table for net returns by year if disclosed |
| 4 | Investment thesis | prose | **Exact headings** `Thesis / Value creation levers / Exit considerations / Risks to thesis` (parser reuse; prompt frames "Exit considerations" as liquidity/DPI outlook for an LP) |
| 5 | Analyst next actions | list | Top-5 next diligence asks (same label as buyout → reused verbatim by the panel) |
| 6 | Track record red flags | list | Tie-out mismatches, cherry-picked subsets, gross-vs-net presentation, recycled capital, missing funds |
| 7 | Off-market or LP-unfavorable terms | list | vs. ILPA norms: fee offsets <100%, supermajority removal, low GP commitment, expense caps, deal-by-deal carry |
| 8 | Team & key-person risks | list | Departures (incl. contradictions across documents), succession gaps, key-person coverage |
| 9 | Operational & compliance exposure | list | ADV disclosures, affiliated entities, valuation-governance gaps, cyber/BCP weakness |
| 10 | Data room gaps & omissions | list | Missing DDQ sections, absent audited financials, unanswered questions |
| 11 | Cross-document inconsistencies | list | DDQ vs LPA vs pitchbook contradictions (fees, team, performance) |

Register in `LP_BUILTIN_TEMPLATES` (total builtins: 22).

### A2. Entity-aware Brief dashboard (frontend)
1. `DealWorkspacePage` passes `deal` (or `entityType`) into `DealBriefDashboard`.
2. Workflow id selection: `entityType === "fund" ? "builtin_lp_fund_brief" : "builtin_proactive_scan"`.
3. Extract the hardcoded panel constants into a per-entity config object:
   - deal → current labels/fields (byte-for-byte, regression-safe);
   - fund → `Fund snapshot` + its 8 fields; `Terms at a glance` + its 8 fields; financial-highlights panel
     reads column 3 with tab labels `Track record` (+ `Net returns` when a second table parses); thesis and
     next-actions panels reused unchanged.
4. `extractFindingsFromRun.ts`: add the six LP labels to `FINDING_COLUMN_LABELS` (a Set — union both
   label sets; category inference maps the new labels to severities the same way).
5. Copy: empty-state + button read "Run Fund Brief" on funds; "Run Deal Brief" on deals.
6. Graceful history: a fund that has old Proactive Scan runs (pre-change) simply shows the empty state for
   the new workflow — must not crash or mix runs.

### A3. Backend hardening (small, optional-but-do-it)
`get_deal_workflow` + run-creation path: 404/422 when a **builtin** workflow's `entity_type` mismatches the
workspace's entity (customs unaffected — they're deal-scoped already). Prevents the silent wrong-brief bug
class permanently. Extend `tests/test_workflow_entity_scoping.py` (or nearest suite).

### A4. Tests
Seed count = 22 with `builtin_lp_fund_brief` `entity_type="fund"`; reconciliation idempotent; entity-mismatch
guard (A3) tests; if a frontend test runner exists (check for Vitest config), unit-test the fund panel config
mapping + findings label union — else cover via the manual ACs.

### Acceptance criteria — Part A
Test with the Brightwater demo pack (funds `brightwater_iv` for selection docs; expected values from
`output/MANIFEST.md`):

- **A-AC1** On a **fund** workspace, the Brief tab reads "Fund Brief"; running it executes
  `builtin_lp_fund_brief` (visible in Workflows run history), not Proactive Scan.
- **A-AC2** Fund snapshot panel shows: Manager *Brightwater Capital Partners*, Vintage *2026*, Target size
  *$1.25B*, Hard cap *$1.5B*, Strategy *buyout / industrials & business services* — each with a citation chip
  that opens the source page.
- **A-AC3** Terms at a glance shows: *2.0% fee (1.5% post-investment-period), 20% carry, 8% pref, European
  waterfall, 2.0% GP commitment, 50% fee offset*, and key-person naming *Daniel Roache*.
- **A-AC4** Key performance data renders a Track Record table with Funds I–III (2.10x / 1.90x / 1.50x) and
  the narrative flags Fund III's components (0.40 + 0.95 = 1.35 ≠ 1.50).
- **A-AC5** Findings panel (and TopBar pill) includes at least: the Fund III tie-out mismatch; the 50% fee
  offset and/or 80% removal threshold as off-market terms; the Roache departure contradiction (pitchbook/PPM
  say active, ADV says departed Feb 2026); the DDQ's omitted affiliated broker-dealer.
- **A-AC6** On a **plain deal** workspace (e.g. Acme Cloud Solutions), the Brief is pixel-unchanged: Proactive
  Scan runs, Deal snapshot / Proposed transaction / Annual-Quarterly financials render as before.
- **A-AC7** A fund with only pre-change Proactive Scan history shows the Fund Brief empty state (no crash,
  no stale buyout panels).
- **A-AC8** (A3) `GET /deals/<fund>/workflows/builtin_proactive_scan` returns 404; same for
  `builtin_lp_fund_brief` on a plain deal. Full backend suite green.

---

## Part B — Monitoring wrap-up

### B1. Period field in the Documents modal
Add a small period input per doc row in `DocumentsModal.tsx` (placeholder `2026-Q2`, saves on blur/Enter via
`updateDocumentMetadata(dealId, docId, { period })`, which already supports it; empty string clears). Display
the current period (today it's shown read-only in the meta line).

- **B1-AC1** In a fund's Documents modal, set `2026-Q2` on the Brightwater Q2 quarterly report + PCAP; value
  survives modal close + full page reload.
- **B1-AC2** With periods set **through the UI only** (no DevTools), Monitoring → Side letters → *Verify
  against period* `2026-Q2` returns proposed verdicts (the manifest mix: fee discount **compliant**, 45-day
  reporting **breach**, ESG **unclear**).
- **B1-AC3** Clearing the field empties `period` (verify for that period then finds no docs → clean
  "no reporting documents" rationale, not an error).

### B2. Position opening balance
Additive migration: `positions` += `opening_called`, `opening_distributed` (REAL, nullable) via
`_ensure_schema_migrations`. `PositionUpsert`/`Position` models + PositionModal gain the two fields (helper
text: "balance before notices processed in Vyntic"). `recompute_position_totals` becomes:
`called = (opening_called or 0) + Σ confirmed/paid call amounts` (result `None` only when both sides absent);
distributions likewise. PositionModal: when the fund has ≥1 confirmed notice, Called/Distributed render
read-only with caption "computed: opening balance + processed notices"; otherwise they stay directly editable
(back-compat for funds not using the queue).

- **B2-AC1** On Fund III set opening called `18,750,000`, opening distributed `6,200,000`; process + confirm
  the $1,875,000 Capital Call No. 7 → Position shows Called `20,625,000`; Portfolio roll-up unfunded =
  `25,000,000 − 20,625,000 = 4,375,000` (matches the notice's stated remaining unfunded).
- **B2-AC2** Confirm the $1,400,000 distribution → Distributed `7,600,000`; DPI/TVPI tiles update.
- **B2-AC3** Dismissing the call notice reverts Called to `18,750,000` (recompute, not increment).
- **B2-AC4** A fund with no notices behaves exactly as before (fields editable, no recompute surprises).
  Backend tests cover the baseline math incl. the dismiss path.

### B3. Verification progress feedback (small)
`MonitoringPanel` verify button shows obligation count while busy ("Verifying 7 obligations…"); disable
inputs during the run. (Server stays one POST — streaming is out of scope.)

- **B3-AC1** Kicking off verify on Brightwater's 7 obligations shows the count immediately and re-enables
  with per-obligation verdicts rendered when done.

### B4. Ship the production frontend
`docker compose build frontend && docker compose up -d frontend` after merge so **:3100** matches :3200.

- **B4-AC1** http://localhost:3100 (hard refresh) shows the Portfolio button, manager-grouped sidebar,
  Monitoring tab on funds, and the Fund Brief.

### B5. Extractor fixture tests (backend, small)
Extend `tests/test_monitoring.py`: canned side-letter answer text → `extract_obligations` block parsing
(categories/cadence mapping), canned verify answer → verdict token extraction, distribution-kind detection.

- **B5-AC1** New tests pass; full backend suite green.

### Explicitly still deferred (unchanged from the wedge spec)
Auto-ingestion (email-in/watched folder), deadline notifications/scheduler, quarter-over-quarter NAV deltas,
portfolio analytics (pacing, cross-fund DPI).

---

## Sequencing & deliverable

1. **B1 + B2** (removes the two demo-blocking rough edges; ~1–1.5 days) — commit 1.
2. **A1–A4** Fund Brief (~2–3 days; the frontend panel-config refactor is the bulk) — commit 2+.
3. **B3 + B5** opportunistically alongside; **B4** at merge time.

One PR from `feat/lp-fund-brief` (or two — B-first then A — if review size matters). PR body lists the ACs as
a checklist. Update `docs/todo/README.md`: add this plan's row; mark LP2 done (merged PR #104).

## Traps
- Reconciler: never retrofit columns onto `builtin_proactive_scan`; the fund brief is a **new id**.
- Keep the four thesis heading strings byte-compatible with `THESIS_SECTION_HEADINGS` regexes.
- `resultByLabel` matches on **column label** — panel config labels must equal seed column labels exactly.
- Findings `FINDING_COLUMN_LABELS` is a Set used across entity types — union, don't replace.
- Position recompute now must read opening balances **inside the same store call** (no drift between modal
  writes and queue recompute); write the test for interleaved upsert + confirm.
- A fund's localStorage brief overrides from any accidental old runs are keyed per-deal — harmless, but the
  diff snapshot parser must tolerate a shape from the other entity's panels (guard with the panel config).
