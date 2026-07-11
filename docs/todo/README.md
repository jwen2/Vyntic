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
| LP1 | `2026-07-08-lp-template-packs-and-object-model-frontend.md` | 7 LP built-in templates + workflow entity-scoping; Manager page + Position panel | PR #94 (merged) | **not started** — fully-specced handoff, self-contained context |

## Frontend quality (audit 2026-07-07)

From `docs/assessments/2026-07-07-frontend-audit.md` (audited on `main` @ `19e6d04`, post PR #92). Independent of the tiers above; F1 touches no backend, F3 Task F3.4 adds two small backend stores and should coordinate with Plan 2 so the new routes are default-deny + audited.

| # | Plan | Scope | Findings | Depends on | Status |
|---|---|---|---|---|---|
| F1 | `2026-07-07-frontend-guardrails.md` | ESLint + hooks-rule fix, error boundaries, dead-code deletion, Vitest | FE1–FE3, FE7, FE13-part | — | **done** — moved to `docs/finished/` |
| F2 | `2026-07-07-frontend-data-layer.md` | typed errors, one SSE client, one upload path, TanStack Query (decided), code splitting | FE4, FE8, FE10, FE12 | F1 | **done** — moved to `docs/finished/` |
| F3 | `2026-07-07-frontend-decomposition-client-state.md` | god-component decomposition, typed-cell rendering (**D1**), findings/overrides → backend (**D2**), theming + a11y (**D3**) | FE5, FE6, FE9, FE11, FE13 | F1, F2; F3.4 coordinates with Plan 2 | not started, 3 decisions in header |

## Suggested order
1. **Plan 2** (auth/audit) → 2. resolve **Plan 4 D1 tenancy decision**, then **Plan 4** → 3. **Plan 5**.
Frontend track (parallel): **F1 + F2 done** → **F3** (resolve D1–D3 first; align F3.4 with Plan 2).

Plans 1 and 3 shipped in PR #91 (Plan 3's concurrency decision resolved as the in-process pool over DB job rows). Plan 2 can proceed immediately. Plans 4–5 need the D1/D2/D3 decisions in Plan 4's header settled first — start with tenancy (D1), since it shapes the Postgres schema everything else builds on.
