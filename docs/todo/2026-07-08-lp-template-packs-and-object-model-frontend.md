# LP Template Packs + Object-Model Frontend Completion

**Status:** not started (branch `feat/lp-template-packs` exists off `main` @ `8f6bb45`, no commits yet)
**Author of spec:** Claude (session 2026-07-08), handed off mid-implementation. All code facts below were verified against the working tree at `8f6bb45` on 2026-07-08.

---

## 1. Why this work exists (business context — read once, it drives every design choice)

Vyntic is repositioning from buyout-deal due diligence toward **LPs (Limited Partners / institutional allocators)** as the primary market — pensions, endowments, foundations, funds-of-funds, OCIOs, family offices, and the consultants who serve them. Full background: `../../Vyntic_Business_Plan_DRAFT.md` and `../../LP_and_Secondaries_Deep_Research.md` (workspace root, one level above this repo). Key facts an implementer needs:

- LPs evaluate **managers** (GP firms) and their **funds**, not companies. Their two jobs: (a) fund selection — a 4–12-week diligence sprint over DDQs, PPMs, LPAs, track records, side letters; (b) monitoring — a quarterly document grind that never ends.
- The **ILPA DDQ** (Institutional Limited Partners Association Due Diligence Questionnaire) is the standard diligence questionnaire: ~23 sections, 280+ questions. LPs also run **ODD** (Operational Due Diligence) — a separate ops/compliance/security review with veto power.
- Key metrics: **IRR** (annualized return), **TVPI** (total value / paid-in), **DPI** (distributions / paid-in), **RVPI** (residual value / paid-in), **MOIC**. Invariant: **TVPI = DPI + RVPI** — a reported track record where these don't tie out is a real red flag LPs look for. LPs trust DPI most (realized cash).
- Fund terms LPs extract from PPM/LPA: management fee (+ step-downs), carried interest %, preferred return ("pref", usually 8%), waterfall type (**European** = fund-level carry, LP-favorable; **American** = deal-by-deal), GP commitment %, key-person clause, term + extensions, fee offsets, recycling, no-fault divorce/removal rights, organizational expense cap.
- A **side letter** is a per-LP agreement granting special terms (fee discounts, MFN, co-invest rights, reporting undertakings, excuse rights, transfer consents). LPs must track that every promise is honored — nobody tools this well; it's a differentiator.

**PR #94 (merged)** built the object model: `ManagerRow` (GP firm) → funds (`DealRow` with `entity_type="fund"`, `manager_id`, `vintage`, `strategy`) → `PositionRow` (the LP's commitment: committed/called/distributed/NAV). Documents got `doc_category` / `period` / `scope`; `scope="manager"` documents are shared across sibling funds of the same manager in extraction context (the ONE deliberate isolation relaxation — never cross manager boundaries; guarded by `backend/tests/test_object_model.py::TestManagerSharedContext`).

**What's missing (this plan):**
- **Part A:** All 14 built-in workflow templates are still buyout-framed. Fund workspaces need LP-native templates, and templates need entity-type scoping so deal workspaces don't show LP templates and vice versa.
- **Part B:** No standalone Manager page, and the Position API (`GET/PUT /deals/{deal_id}/position`) has **no UI**.

Read `CLAUDE.md` at repo root first (note: it currently lives on unmerged local branch `docs/claude-md`, commit `62f4643` — cherry-pick or read it there). Its invariants apply throughout, especially: additive-only migrations, stable workflow column IDs, single extraction primitive, citations-on-everything.

---

## 2. Verified code facts (so you don't re-derive them)

### Workflows backend
- `WorkflowRow` in `backend/app/database.py` (~line 103 region): columns `id, deal_id (NULL = builtin), name, description, type ("assistant"|"tabular"), row_source ("one_doc_per_row"|"multi_doc_synthesis"), output_format, is_builtin, cloned_from, created_by, timestamps`. **No `entity_type` yet — you add it.**
- Additive migration shim: `backend/app/database.py::_ensure_schema_migrations` — a dict of `table → [(column, DDL)]`. Add `"workflows": [("entity_type", "TEXT DEFAULT 'deal'")]`.
- Pydantic: `backend/app/models/workflow.py` — `Workflow`, `WorkflowCreate`, `WorkflowColumnInput(order_index, label, prompt, format, tags, is_derived, formula)`, `WorkflowStageInput(order_index, label, prompt_md, checkpoint)`. `ColumnFormat` includes `metric, bool, enum, prose, list, kv, markdown` + legacy (`text, bulleted_list, monetary_amount, percentage, number, date, tag, yes_no`).
- Store: `backend/app/services/workflow_store.py::list_workflows(deal_id)` (line ~79) returns builtins (`deal_id IS NULL`) + deal-scoped customs — **entity filtering goes here** (it needs the deal's entity_type; fetch via `deal_store.get_deal`, or pass entity_type in from the route). `create_workflow(deal_id, data, created_by, is_builtin, cloned_from, workflow_id)` (line ~105) — must persist `entity_type` from `data`.
- Routes: `backend/app/api/routes_workflows.py` — `GET /deals/{deal_id}/workflows` calls `workflow_store.list_workflows(deal_id)`. RBAC via `require_deal_access`. Custom workflows created in a fund workspace should inherit that workspace's entity_type.
- Seed: `backend/app/services/workflow_seed.py` (795 lines). Pattern: module-level `WorkflowCreate` constants → `BUILTIN_TEMPLATES: list[tuple[str, WorkflowCreate]]` with **stable ids** (`builtin_qofe_bridge`, …) → `seed_builtin_workflows()` runs on startup, inserts missing ids, and calls `_reconcile_builtin_columns` for existing ones.
- **Reconciler constraints** (`_reconcile_builtin_columns`, line ~725): matches columns **by `order_index`**, patches label/prompt/format/tags + workflow-level name/description/row_source/output_format. It does **NOT add or remove columns** — "schema changes that need new columns should ship under a new built-in id." It does NOT currently reconcile stages (assistant templates) or entity_type — reconcile entity_type too when you add it (one-line addition).
- Prompt house style (copy from `PROACTIVE_SCAN`, seed line ~658): explicit ALL-CAPS focus phrase, "Include [Source N] citations", "write \"Not found\" when the documents do not support the field", kv columns give an exact `Field: [desc]` line format, enum columns say "Return a single token from {…}" then one-sentence justification.
- Context budget: synthesis templates put the whole corpus in context per cell. `backend/tests/test_synthesis_context_budget.py` covers the budget logic. Keep synthesis templates ≤ ~13 columns (the existing max) and prompts focused.

### Derived-column formula engine (for the TVPI check)
`backend/app/services/workflow_run_executor.py::_eval_formula` (line ~515) + `execute_formula_cell` (line ~461), hardened by `tests/test_formula_hardening.py`:
- Syntax: `=` prefix, `[Column Label]` references (resolved from **other cells in the same row**, keyed by column label), arithmetic `+ - * / ( )`, `IF(condition, then, else)` (nestable), quoted string literals.
- **Hard limits: no `**`, expression ≤ 200 chars, no functions besides IF (no ABS).** Absolute-value logic must be written as nested IFs.
- Values come from `_cell_value`: `answer_formatted["raw"]` when present, else the formatted object, else raw answer text. For `metric`-format columns the parsed shape includes a `raw` numeric — **verify with a quick unit test** that `_eval_formula("=[A]+[B]", {...})` receives numerics for metric cells; if metric cells don't resolve to numbers reliably, make the reconciliation column an LLM `enum` column instead of a formula (acceptable fallback, note it in the PR).
- Suggested formula (fits limits, handles both directions of mismatch; tune threshold 0.05):
  `=IF([DPI]+[RVPI]-[TVPI]>0.05,"Mismatch: DPI+RVPI != TVPI",IF([TVPI]-[DPI]-[RVPI]>0.05,"Mismatch: DPI+RVPI != TVPI","Ties out"))`
  (≈150 chars — recount after edits; >200 silently returns "".)

### Object model backend (all merged, working)
- `GET/POST/PATCH/DELETE /managers`, `GET /managers/{id}/funds`, `GET /managers/{id}/documents` (manager-scoped docs across funds; requires access to ≥1 fund) — `backend/app/api/routes_managers.py`.
- `GET /deals/{deal_id}/position` (returns empty Position, not 404, when unset), `PUT /deals/{deal_id}/position` (admin-only, funds only; partial upsert) — `backend/app/api/routes_deals.py`.
- `Deal` pydantic has `entity_type, manager_id, manager_name, vintage, strategy`. `FUND_STAGES = ["Screening", "Diligence", "IC", "Committed", "Monitoring", "Re-up review"]`, `DOC_CATEGORIES` (14 values incl. ddq, ppm, lpa, side_letter, track_record, quarterly_report, capital_account), `stages_for_entity()` — `backend/app/models/deal.py`.
- `PATCH /deals/{deal_id}/documents/{doc_id}/metadata` reclassifies category/period/scope.
- Auth hardening merged (PR #95): audit log (`audit_store.record(...)` — call it for new mutations), rate limiting (slowapi), default-deny route walker test (`tests/test_default_deny.py`) — **every new route must carry an auth dependency or that test fails.**

### Frontend (post F1/F2 refactors — significantly changed from older docs)
- `frontend/src/App.tsx`: lazy routes with `Suspense` + `ErrorBoundary`; `/` landing, `/login`, `/app` home, `/deal/:dealId` workspace. **Add `/manager/:managerId` following the same lazy pattern.**
- API client: `frontend/src/lib/api.ts` — `fetchWrapper` adds JWT + 401 redirect. Manager/position client functions may or may not exist yet — check for `listManagers` etc.; PR #94's frontend included manager create/list in `AddDealDialog`. Add what's missing (`getManager`, `listManagerFunds`, `listManagerDocuments`, `getPosition`, `upsertPosition`).
- Workflow types: `frontend/src/lib/workflows.ts` (`Workflow` interface — add `entity_type`).
- Workspace: `frontend/src/pages/DealWorkspacePage.tsx` — tabs Agent/Workflows/Brief via `TopBar` (`components/dd/TopBar.tsx`, has the breadcrumb + documents button; Position button goes here, funds only). `DocumentsModal` (`components/dd/DocumentsModal.tsx`) is the pattern to copy for a `PositionModal`: fixed-overlay modal, `ddTheme(theme)` colors.
- Workflow library: `components/workflows/WorkflowLibrary.tsx` — receives `workflows` prop from `WorkflowsView.tsx`; if the backend filters by entity_type, the library needs no filtering logic (preferred: filter server-side, single source of truth). Optionally relabel the header copy for fund workspaces ("LP diligence templates…").
- Home sidebar: `components/home/HomeSidebar.tsx` (~319 lines, manager grouping added in PR #94) — make manager group headers navigate to `/manager/:managerId`.
- Styling system: `ddTheme(theme)` from `components/dd/types.ts` for workspace surfaces; `font-mono-plex` uppercase eyebrows; rounded-pill buttons; `ACCENT` from `components/workflows/theme.ts`. Match it — no new CSS frameworks.
- **Verification skill:** `Vyntic/frontend:verify` (in `frontend/.claude/skills/`) has the full recipe for dev servers, auth, and headless screenshots. Use it for end-to-end verification instead of improvising.

### Environment / process
- Tests: `cd backend && .venv/bin/pytest -q` (CI runs bare `pytest`; `pytest.ini` sets `pythonpath=.`). Frontend: `cd frontend && npx tsc --noEmit && npm run build`.
- Docker: stack runs locally (backend :8000, frontend :3100, dev :3200); `backend/app` is bind-mounted → restart container, no rebuild, for backend changes. Login `admin@vyntic.com`/`admin` (requires `ALLOW_INSECURE_DEFAULTS=true` in `.env` — already set).
- Git: commit style is conventional (`feat:`, `fix:`, `docs:`); end commit messages with the Claude co-author line; PRs via `gh pr create`. **Do not commit `.env` or `docker-compose.override.yml`.** `.claude/launch.json` is untracked noise — leave it.

---

## 3. Part A — LP template packs

### Task A1 — `entity_type` on workflows
1. `database.py`: add `entity_type = Column(String, default="deal", index=True)` to `WorkflowRow` + migration shim entry.
2. `models/workflow.py`: `entity_type: str = "deal"` on `Workflow` and `WorkflowCreate`.
3. `workflow_store.py`: persist on create; `_row_to_workflow` maps it (default "deal" for NULL); `list_workflows(deal_id)` filters builtins to `entity_type == <deal's entity_type>` (customs are deal-scoped already — no entity filter needed on them).
4. `workflow_seed.py`: existing 14 templates keep `entity_type="deal"` (the default — no edits needed); reconciler also patches drifted `entity_type`.
5. Route `POST /deals/{deal_id}/workflows`: set `data.entity_type` from the workspace's deal before create (customs inherit their workspace's type).
6. `frontend/src/lib/workflows.ts`: add the field to the `Workflow` interface.
7. Tests (`tests/test_workflows.py` or new file): fund workspace lists only fund builtins + its customs; deal workspace unchanged (14 builtins); custom created in fund workspace gets `entity_type="fund"`.

### Task A2 — author the 7 LP templates
New module `backend/app/services/workflow_seed_lp.py` holding the `WorkflowCreate` constants (keeps `workflow_seed.py` readable); import and extend `BUILTIN_TEMPLATES` with stable ids. All get `entity_type="fund"`. Follow the PROACTIVE_SCAN prompt house style (Section 2). Column counts are targets, not law — but remember the reconciler cannot add/remove columns later without a new builtin id, so err on completeness now.

**1. `builtin_lp_ddq_scan` — "DDQ Gap & Consistency Scan"** (tabular, `multi_doc_synthesis`, excel, 12 cols, all `markdown`)
One column per ILPA DDQ section group: Firm & Ownership · Team & Succession · Track Record · Investment Strategy & Process · Fund Terms & Economics · Valuation Policy · Compliance & Regulatory · IT & Cybersecurity · ESG · LP Base & References · Conflicts of Interest · Service Providers. Each prompt: summarize what the DDQ answers for that section; flag **skipped or evasive answers**; flag **contradictions with the PPM/pitchbook**; propose follow-up questions. Cite everything; "Not found" when the section isn't covered.

**2. `builtin_lp_track_record` — "Track Record Grid"** (tabular, `one_doc_per_row`, excel, 11 cols)
Rows = track-record docs/pitchbook. Columns: Fund name (`text`) · Vintage (`text`, "e.g. 2018") · Fund size (`monetary_amount`) · Net IRR (`percentage`) · TVPI (`metric`) · DPI (`metric`) · RVPI (`metric`) · Loss ratio (`percentage`, % of invested capital in deals returning <1x) · Realized vs unrealized (`kv`) · Restatement & footnote flags (`bulleted_list`: recycled capital, gross-vs-net presentation, cherry-picked subsets, missing funds) · **Reconciliation (`text`, `is_derived=True`, formula from Section 2)**. Metric prompts must say "Return the numeric multiple only, e.g. 1.85".

**3. `builtin_lp_fund_terms` — "Fund Terms Extractor"** (tabular, `multi_doc_synthesis`, excel, 12 cols)
Over PPM + LPA drafts: Management fee (`markdown`: basis, rate, step-down) · Carried interest (`percentage`) · Preferred return (`percentage`) · Waterfall type (`enum`, tags `["European", "American", "Hybrid", "Not disclosed"]`) · GP commitment (`markdown`: % and cash/fee-waiver form) · Key-person provision (`markdown`, quote the clause + trigger/consequences) · Term & extensions (`markdown`) · Fee offsets (`markdown`, % of monitoring/transaction fees offset) · Recycling (`markdown`) · Removal & no-fault divorce (`markdown`) · Organizational expense cap (`monetary_amount`) · Off-market terms summary (`bulleted_list`: flag anything LP-unfavorable vs market norms, e.g. below-100% fee offset, deal-by-deal carry without clawback escrow).

**4. `builtin_lp_odd_screen` — "ODD Screen"** (tabular, `multi_doc_synthesis`, excel, 8 cols)
Over ODD DDQ, Form ADV, valuation policy, audited financials. Severity tag set `_ODD_TAGS = ["Clean", "Monitor", "Red flag"]`. Columns: Valuation governance (`markdown` — who marks, committee independence, auditor scrutiny of Level 3) · Service providers (`kv`: Auditor/Administrator/Custodian/Fund counsel/PB — flag unknown or non-institutional names) · Regulatory & litigation history (`markdown` — ADV disclosures, investigations) · Cybersecurity & BCP (`markdown`) · Compliance program (`markdown` — CCO independence, personal trading, expense allocation) · Conflicts of interest (`markdown` — related-party txns, cross-fund allocation, fee streams to affiliates) · Financial health of the GP (`markdown`) · Overall ODD rating (`enum`, `_ODD_TAGS` + one-sentence justification).

**5. `builtin_lp_lpa_review` — "LPA / ILPA-Alignment Review"** (tabular, `multi_doc_synthesis`, excel, 8 cols)
Alignment tag set `_ALIGN_TAGS = ["LP-favorable", "Market", "GP-favorable", "Silent"]`. One column per topic, each prompt: quote the governing clause (short excerpt + section number), then classify with the tag set per ILPA Principles: Economics (fees/carry/clawback) · Key person · GP removal & termination · Indemnification & exculpation scope · LPAC powers & consents · Transfer & withdrawal restrictions · Reporting undertakings · Fiduciary-duty modifications. Use `markdown` format with an instruction to lead with the tag token, OR `enum` where the tag set alone suffices — implementer's call; keep the clause quote (that's the value).

**6. `builtin_lp_side_letters` — "Side Letter Obligation Extractor"** (tabular, `one_doc_per_row`, excel, 6 cols)
Rows = side letters. Columns: Obligations list (`markdown` — every promise, one bullet each, with section refs) · Category mix (`kv`: counts per category — fee/MFN/co-invest/reporting/transfer/excuse/regulatory) · MFN provision (`markdown` — scope, election mechanics, carve-outs) · Deadlines & triggers (`markdown` — anything time-bound or event-triggered) · Ongoing vs one-time (`kv`) · Quarterly verification checklist (`bulleted_list` — "what to check each quarter to confirm compliance"; this column becomes the seed of the future monitoring feature — keep its label stable).

**7. `builtin_lp_commitment_memo` — "Fund Commitment Memo"** (assistant, word, 4 stages)
Mirror `CIM_TO_MEMO`'s stage structure (seed line ~26). Stages, checkpoints on 1–3:
1. *Manager & Strategy Assessment* — from pitchbook/DDQ/PPM: firm history & ownership, team depth & succession, strategy and edge, fund size vs prior fund (size-creep check), market environment. Cite `[filename p.N]`.
2. *Track Record & Terms Diagnostic* — performance by fund (IRR/TVPI/DPI), dispersion & loss ratio, realized vs unrealized mix, DPI-vs-IRR quality note, terms summary vs ILPA norms, explicit "[BENCHMARK — fill in]" placeholders where peer data is needed.
3. *ODD & Risk Summary* — operational findings, open items, reference-call gaps, side-letter asks to negotiate.
4. *Compose Commitment Memo* (no checkpoint) — sections: Executive Summary · Organization · Strategy · Track Record · Fund Terms · Operational Assessment · Risks & Mitigants · Recommendation (state proposed commitment, or "[COMMITMENT AMOUNT]" placeholder). Preserve citations, keep analyst-edited stage outputs authoritative.

### Task A3 — seed tests
Extend the existing seed test (find it: `grep -rn "seed_builtin" backend/tests/`) or add `test_lp_templates.py`: total builtin count = 21; each LP id present with `entity_type="fund"`; reconciliation idempotent (run `seed_builtin_workflows()` twice, no dupes); track-record derived column has `is_derived` and formula ≤200 chars without `**`; formula unit test for the tie-out (`_eval_formula` with sample values → "Ties out" / "Mismatch…").

### Task A4 (stretch, skip if time-boxed) — demo fixtures
Seed a demo manager ("Hillpath Capital") + 2 funds in `backend/app/seed.py` behind the existing `SEED_SAMPLE_DATA` flag, with 2–3 small fixture docs in `sample_data/` (public ILPA DDQ template PDF is freely downloadable; synthetic track-record xlsx). Do NOT block the PR on this.

---

## 4. Part B — object-model frontend completion

### Task B1 — Manager page
- Route `/manager/:managerId` in `App.tsx` (lazy, inside `ProtectedRoute`, same as others).
- New `frontend/src/pages/ManagerPage.tsx`: header (manager name, description, fund count — data from `GET /managers/{id}`), grid/list of fund cards (`GET /managers/{id}/funds`: name, vintage, strategy, stage chip, doc count; click → `/deal/{deal_id}`), and a "Shared documents" section (`GET /managers/{id}/documents`: filename, category chip, owning fund; note these are `scope="manager"` docs). Reuse `ddTheme` + home-page card styling. Handle 403 on the documents call gracefully (analyst without fund access): show the funds they can see, hide the docs section.
- `HomeSidebar.tsx`: manager group headers become links/buttons navigating to the manager page.
- Back-navigation: breadcrumb "← All funds" to `/app`; from a fund workspace, the manager name in `TopBar`'s breadcrumb should navigate to `/manager/{manager_id}` (TopBar already shows `manager_name › fund name` for funds — make the manager segment clickable; `Deal` has `manager_id`).

### Task B2 — Position panel
- New `frontend/src/components/dd/PositionModal.tsx`, modeled directly on `DocumentsModal.tsx` (overlay, ddTheme, close on Esc).
- Trigger: a "Position" pill button in `TopBar`, rendered **only when `deal.entity_type === "fund"`** (TopBar already receives the deal; verify prop shape).
- Content: form fields Commitment · Currency (USD/EUR/GBP select) · Called · Distributed · NAV · As-of (e.g. "2026-Q2") · Status (active/pending/exited). Load via `GET /deals/{id}/position`; save via `PUT` (admin-only — hide the save button for non-admins using the existing `user.is_admin` pattern; read-only display for analysts).
- Derived display (client-side, no backend): if commitment+called present show "% called"; if called+distributed+NAV present show DPI (= distributed/called) and TVPI (= (distributed+NAV)/called) with 2 decimals. Label them "computed from entered values".
- Number inputs: store raw numbers (API takes floats); display with thousands separators. Empty string → omit field from the PUT body (partial upsert semantics).

### Task B3 — frontend verification
`npx tsc --noEmit && npm run build`, then use the **`Vyntic/frontend:verify` skill** to drive the app: log in as admin, create a manager + fund via the UI, confirm the fund workspace shows the 7 LP templates (and a plain deal still shows 14 buyout templates), open the Position modal, save a position, reload, confirm persistence; visit the manager page from the sidebar. Screenshot the manager page + fund workflow library for the PR.

---

## 5. Order of work & deliverable

1. A1 (scoping) → A2 (templates) → A3 (tests) — backend-complete commit.
2. B1 → B2 → B3 — frontend commit(s).
3. Run full `pytest` (all suites, not just new ones — the default-deny walker and RBAC suites will catch route mistakes) + `tsc` + `npm run build`.
4. PR from `feat/lp-template-packs` to `main` titled "feat: LP template pack + manager page & position panel". Body: what/why (LP repositioning context, one paragraph), the 7 templates table, entity-scoping behavior, screenshots, test summary, and a "deferred" note (demo fixtures A4 if skipped, monitoring surface intentionally out of scope).
5. Update `docs/todo/README.md`: add this plan's row with its outcome; also correct the stale row for Plan 2 (it shipped in PR #95 but the index still says "not started").

## 6. Known traps

- **Reconciler cannot add columns to an existing builtin id.** Get LP template column sets right in this PR; later column additions need new ids (e.g. `builtin_lp_ddq_scan_v2`).
- **Default-deny test**: any new route without an auth dependency fails `tests/test_default_deny.py`.
- **Formula length**: >200 chars silently evaluates to `""` — recount after any edit; no `**`, no ABS.
- **Conftest drops/recreates all tables per test** — seed via stores inside tests; app startup events do not run under `TestClient`.
- **`workflow_store.list_workflows` is also called for the synthesis pseudo-deal** — check callers (`grep -rn "list_workflows" backend/`) before changing its signature; safest is an optional `entity_type` parameter defaulting to `"deal"`.
- **Frontend `Workflow` type** lives in `lib/workflows.ts`, not `lib/api.ts`.
- Landing-page copy is intentionally still buyout-framed — out of scope, don't touch.
