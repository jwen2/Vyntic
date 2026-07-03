# docs/todo — Open Implementation Plans

Actionable, not-yet-started implementation plans. Each is task-by-task and test-first (execute with superpowers:executing-plans). As a plan is completed, move it to `docs/finished/`.

Source of these plans: `docs/assessments/2026-07-02-resiliency-security-assessment.md`.

## Institutional-LP readiness (resiliency + security)

Ordered by the assessment's tiers. Tiers 0–1 are concrete code on the current stack; Tier 2 plans lead with **Decisions required** because they carry architecture forks.

| # | Plan | Tier | Findings | Depends on | Status |
|---|---|---|---|---|---|
| 1 | `2026-07-02-tier0-security-hotfixes.md` | 0 — before any exposure | S1, S3, R1-guard, S9-CORS | — | **done (PR #91)** — moved to `docs/finished/` |
| 2 | `2026-07-02-auth-access-control-audit.md` | 1 — before paid pilot | S1-cross, S4, S5, S6, S9-XSS | Plan 1 | not started |
| 3 | `2026-07-02-durable-ingestion-parsing.md` | 1 — before paid pilot | R4, R5 | — | **done (PR #91)** — moved to `docs/finished/` |
| 4 | `2026-07-02-postgres-multitenancy.md` | 2 — before multi-tenant | R2, S2, R6, S7, S8 | **tenancy decision (D1)** | blocked on decisions |
| 5 | `2026-07-02-horizontal-scaling-context-cascade.md` | 2 — before multi-tenant | R3, R1-full | Plan 4 | blocked on Plan 4 |

## Suggested order
1. **Plan 2** (auth/audit) → 2. resolve **Plan 4 D1 tenancy decision**, then **Plan 4** → 3. **Plan 5**.

Plans 1 and 3 shipped in PR #91 (Plan 3's concurrency decision resolved as the in-process pool over DB job rows). Plan 2 can proceed immediately. Plans 4–5 need the D1/D2/D3 decisions in Plan 4's header settled first — start with tenancy (D1), since it shapes the Postgres schema everything else builds on.
