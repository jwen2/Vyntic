# docs/todo — Open Implementation Plans

Actionable, not-yet-started implementation plans. Each is task-by-task and test-first (execute with superpowers:executing-plans). As a plan is completed, move it to `docs/finished/`.

Sources: `docs/assessments/2026-07-02-resiliency-security-assessment.md` (Plans 1–5), `docs/assessments/2026-07-07-frontend-audit.md` (Plans F1–F3).

## Institutional-LP readiness (resiliency + security)

Ordered by the assessment's tiers. Tiers 0–1 are concrete code on the current stack; Tier 2 plans lead with **Decisions required** because they carry architecture forks.

| # | Plan | Tier | Findings | Depends on | Status |
|---|---|---|---|---|---|
| 1 | `2026-07-02-tier0-security-hotfixes.md` | 0 — before any exposure | S1, S3, R1-guard, S9-CORS | — | **done (PR #91)** — moved to `docs/finished/` |
| 2 | `2026-07-02-auth-access-control-audit.md` | 1 — before paid pilot | S1-cross, S4, S5, S6, S9-XSS | Plan 1 | **done (PR #95)** |
| 3 | `2026-07-02-durable-ingestion-parsing.md` | 1 — before paid pilot | R4, R5 | — | **done (PR #91)** — moved to `docs/finished/` |
| 4 | `2026-07-02-postgres-multitenancy.md` | 2 — before multi-tenant | R2, S2, R6, S7, S8 | **tenancy decision (D1)** | blocked on decisions |
| 5 | `2026-07-02-horizontal-scaling-context-cascade.md` | 2 — before multi-tenant | R3, R1-full | Plan 4 | blocked on Plan 4 |

## LP product repositioning

| # | Plan | Scope | Depends on | Status |
|---|---|---|---|---|
| LP1 | `2026-07-08-lp-template-packs-and-object-model-frontend.md` | 7 LP built-in templates + workflow entity-scoping; Manager page + Position panel | PR #94 (merged) | **done (PR #102)** — 21 entity-scoped built-ins, Manager page, Position panel, Hillpath Fund IV fixtures; second demo fund deferred |
| LP2 | `2026-07-11-lp-monitoring-wedge.md` | Capital-call queue + side-letter compliance tracker (LLM-suggests/analyst-confirms) + portfolio dashboard | LP1 | **implemented** on `feat/lp-monitoring-wedge`; auto-ingestion + notifications + QoQ deltas deferred |

## Frontend quality (audit 2026-07-07)

From `docs/assessments/2026-07-07-frontend-audit.md` (audited on `main` @ `19e6d04`, post PR #92). Independent of the tiers above; F1 touches no backend, F3 Task F3.4 adds two small backend stores and should coordinate with Plan 2 so the new routes are default-deny + audited.

| # | Plan | Scope | Findings | Depends on | Status |
|---|---|---|---|---|---|
| F1 | `2026-07-07-frontend-guardrails.md` | ESLint + hooks-rule fix, error boundaries, dead-code deletion, Vitest | FE1–FE3, FE7, FE13-part | — | **done** — moved to `docs/finished/` |
| F2 | `2026-07-07-frontend-data-layer.md` | typed errors, one SSE client, one upload path, TanStack Query (decided), code splitting | FE4, FE8, FE10, FE12 | F1 | **done** — moved to `docs/finished/` |
| F3 | `2026-07-07-frontend-decomposition-client-state.md` | god-component decomposition, typed-cell rendering (**D1**), findings/overrides → backend (**D2**), theming + a11y (**D3**) | FE5, FE6, FE9, FE11, FE13 | F1, F2; F3.4 coordinates with Plan 2 | **done (PR #101)** — `DocMatrixPanel`/`TabularRun` decomposed, brief KV/list cells typed, findings/overrides server-side, semantic CSS-var tokens landed. `ddTheme()` kept as a compat shim (102 call sites) rather than deleted — see DS2. `DealBriefDashboard` decomposition (FE5) still deferred |

| FE5 | `2026-07-25-fe5-brief-decomposition.md` | Decompose `DealBriefDashboard` (2,502 lines → 374 shell + `brief/` dir); characterization tests for the untested parsers first | — (last god component) | **done** — FE5.1–FE5.5 merged (PR #116); FE5.6 (ddTheme conversion + shim deletion) on `feat/fe5.6-brief-theming`. Decisions: **D1 tests-before-move**, **D2 extract first, restyle second**. Unblocks the Card primitive (62 of ~75 card sites lived here) |

## Workspace UX

| # | Plan | Scope | Depends on | Status |
|---|---|---|---|---|
| UX1 | `2026-07-23-recent-activity-workflow-runs.md` | Surface a deal's workflow runs alongside agent chats in the left-rail "Recent" (new `GET /deals/{id}/runs` route + `WorkflowsView` deep-link prop) | — (frontend-led + 1 additive backend route) | not started, 2 decisions in header (D1 grouped-vs-unified, D2 live status) |

## Design system

| # | Plan | Scope | Depends on | Status |
|---|---|---|---|---|
| UI1 | `2026-07-23-button-design-system.md` | Shared `<Button>` component (5 variants, 3 sizes, states, hover "flare" motion) from the finalized Claude Design artifact; migrate first tranche (workflows, agent, `/app` shell) of 169 raw `<button>` call sites | PR #111 merged | **in progress** on `feat/button-design-system` — component + `button.css` + `--danger` tokens (D2 dedicated file, D3 = artifact burnt-orange `#c2410c`) + 10 tests; tranche-1 migrations done (WorkflowCard/Library, RunToolbar, DealAssistantPanel, LeftSidebar, HomeTopBar account trigger). Poor-fit buttons (RunCell, DealListItem, HomeTopBar Add-deal) deferred → UI2 |
| UI2 | `2026-07-24-button-system-v2.md` | Finish button rollout: unify app on one red (migrate `#ef4444` pills onto `--danger`), resolve deferred poor-fit buttons, migrate remaining ~140 call sites (incl. docmatrix Tailwind tree) | UI1 first tranche | **done** — §1–§3 + palette convergence merged (PR #114); long-tail non-action buttons + status-scale green/amber tokens optionally remain |
| DS | `2026-07-24-design-system-primitives.md` | Modal primitive (`components/ui/`) → `ddTheme(theme)` retirement (**775** refs, not 102) → Card/Panel primitive | UI1/UI2 pattern, F3.5 tokens | **DS1 done** (Modal, 5 dialogs, verified light+dark). **DS2 done** — 18 file-groups converted (`5fd8255` final); its Step 3 (delete the shim) was unreachable until the brief was decomposed and is now **closed by FE5.6** — zero `ddTheme`/`DD_LIGHT`/`DD_DARK` left in `frontend/src`. DS3 (Card primitive; `SectionLabel` dedup — 6 duplicates found) not started, now unblocked |

## Suggested order
1. Resolve **Plan 4 D1 tenancy decision**, then implement **Plan 4** → 2. **Plan 5**.
Frontend track (parallel): **F1 + F2 done** → **F3** (resolve D1–D3 first; align F3.4 with Plan 2).

Plans 1 and 3 shipped in PR #91 (Plan 3's concurrency decision resolved as the in-process pool over DB job rows), and Plan 2 shipped in PR #95. Plans 4–5 need the D1/D2/D3 decisions in Plan 4's header settled first — start with tenancy (D1), since it shapes the Postgres schema everything else builds on.
