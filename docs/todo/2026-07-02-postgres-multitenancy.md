# Plan 4 — Postgres Migration + Multi-Tenancy

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:brainstorming FIRST (this plan has an unresolved architecture decision), then superpowers:executing-plans. Do **not** start implementation until the tenancy decision (below) is made with the owner.

**Source:** `docs/assessments/2026-07-02-resiliency-security-assessment.md` — R2, S2, R6, S7, S8.

**Goal:** Move off single-writer SQLite onto Postgres (R2), with an **organizational tenant model designed into the schema** (S2), plus pagination (R6), encryption at rest (S7), and soft-delete/retention/legal-hold (S8). This is the keystone Tier-2 plan — Plan 5 depends on it, and the tenancy shape is a schema decision that is far cheaper now than as a retrofit.

**Why these are one plan:** tenancy, soft-delete, and pagination are all schema/query-layer decisions that must be made *at* the Postgres cut, not bolted on after. Encryption at rest is the same infra decision. Migrating twice is the thing to avoid.

---

## ⚠️ Decisions required before any implementation

### D1 — Tenant isolation model (the big one)
| Option | Isolation | Ops cost | LP-pitch story |
|---|---|---|---|
| **A. Row-level (`tenant_id` on every table + Postgres RLS)** | Strong if RLS enforced at DB layer | Low (one DB) | "Enforced isolation at the database layer via row-level security" |
| **B. Schema-per-tenant** | Stronger | Medium | "Each customer has an isolated schema" |
| **C. Database-per-tenant** | Strongest; trivial per-customer export/delete | High (N DBs to migrate/back up/monitor) | "Your data is a physically separate database" — easiest compliance story |

**Recommendation:** **A (row-level + Postgres RLS)** for operational sanity, *provided* RLS is enforced at the DB layer (not just app `WHERE` clauses) so an app bug can't cross tenants. Fund-of-funds security teams sometimes require C; if a named prospect demands physical separation, revisit. **This choice shapes every task below — resolve it first.**

> **RESOLVED 2026-07-08: Option A** (row-level `tenant_id` + Postgres RLS, enforced at the DB layer).

### D2 — Hosting / managed Postgres
Which managed Postgres (RDS / Cloud SQL / Neon / Supabase)? Determines connection pooling, backup, and encryption-at-rest configuration. Needed before Task 4.5.

### D3 — Migration of existing pilot data
Is there production/pilot SQLite data to migrate, or is this greenfield? Determines whether Task 4.6 (data migration) is needed.

> **RESOLVED 2026-07-08: existing pilot data must be migrated** — Task 4.6 and the default-tenant backfill are in scope.

---

## Findings addressed

| ID | Finding |
|---|---|
| R2 | SQLite single-writer ceiling |
| S2 | No organizational tenancy — every customer shares one DB, isolated only by app-level `WHERE` |
| R6 | No pagination on `list_deals` / `list_documents` / conversations |
| S7 | No encryption at rest |
| S8 | Hard deletes; no soft-delete / retention / legal-hold |
| (bonus) | Persist conversation history — currently in-memory (`conversation_store.py:9`), lost on restart |

---

## Phase A — Foundations (Alembic + Postgres, no behavior change)

- [ ] **A1. Introduce Alembic.** Replace the ad-hoc `_ensure_document_cache_columns` shim with Alembic migrations; baseline the current schema. (Prereq for every schema change here.)
- [ ] **A2. Postgres engine + config.** Add `psycopg` driver wiring; the connect-listener currently sets SQLite PRAGMAs (`database.py`) — guard it so Postgres is clean. Parameterize `DATABASE_URL`. CI runs the suite against Postgres (service container) in addition to SQLite.
- [ ] **A3. Session-per-request dependency.** Replace the ~30 `SessionLocal()/expunge/close` copies with a FastAPI dependency (rearchitect Phase 6 item 8) — Postgres connection pooling needs disciplined session lifecycle. Move blocking DB + bcrypt off the event loop.

## Phase B — Tenant model (per D1; assumes Option A)

- [ ] **B1. `TenantRow` + `tenant_id` everywhere.** New `tenants` table; add `tenant_id` FK to `users`, `deals`, and (via deal) all deal-scoped tables. Alembic migration backfills a default tenant for existing rows (per D3).
- [ ] **B2. Enforce at the DB layer.** Enable Postgres **Row-Level Security** with policies keyed on a per-request `SET app.current_tenant`. The session dependency sets it from the authenticated user's tenant. **Failing test first:** a query as tenant A cannot read tenant B's rows even with a deliberately-wrong app-level filter (proves DB-layer enforcement, not app-layer).
- [ ] **B3. Tenant-scoped auth.** `create_user`/login/registration bind to a tenant; `require_deal_access` and `require_admin` operate within tenant. Admin becomes tenant-admin (a super-admin concept, if needed, is separate and explicit).
- [ ] **B4. Cross-tenant regression suite.** Dedicated tests that every list/get/mutation is tenant-scoped. This is the durable guard for the highest-severity finding.

## Phase C — Data lifecycle (S8) + pagination (R6)

- [ ] **C1. Soft-delete + retention.** Add `deleted_at` (soft-delete) to deals/documents; deletes set it rather than hard-removing. Add a `legal_hold` flag that blocks deletion/retention purge. A retention job hard-purges soft-deleted rows past a configurable window unless held. Vector/file cleanup follows the same lifecycle.
- [ ] **C2. Pagination.** Cursor or limit/offset on `list_deals`, `list_documents`, conversation history, run lists, audit log. Consistent envelope (`items`, `next_cursor`). Frontend `api.ts` updated to page.
- [ ] **C3. Persist conversation history.** Move `conversation_store` from the in-memory dict to a tenant-scoped table (fixes the README's false "persisted in SQLite" claim and makes chat history durable + multi-worker safe).

## Phase D — Encryption at rest (S7) + infra

- [ ] **D1. DB encryption at rest** via the managed Postgres offering (per D2) + documented KMS. Application-level field encryption for the most sensitive columns if a prospect requires it (decision point).
- [ ] **D2. File storage encryption.** When uploads move to object storage (Plan 5), enable SSE; until then, document that local-disk uploads are unencrypted (gap to close).
- [ ] **D3. Secrets manager (S9).** Move `GEMINI_API_KEY`, JWT secret, DB creds out of env/`.env` into a secrets manager (per D2's cloud). Per-tenant Gemini keys if noisy-neighbor/rate-isolation is required (decision point).

## Phase E — Data migration (only if D3 = existing data)

- [ ] **E1.** One-shot migrator: SQLite → Postgres, assigning existing rows to the default tenant, moving `full_text_md`, preserving run history and IDs. Dry-run + verification counts. Rollback plan.

---

## Definition of done
- Suite green against Postgres in CI; cross-tenant regression suite (B4) green.
- No hard deletes; legal-hold blocks purge; all list endpoints paginate.
- Encryption-at-rest documented and enabled.
- **A named RLS/tenant test proves isolation is enforced at the DB layer, not just app code** — this is the artifact to show an LP security reviewer.

## Explicitly deferred to Plan 5
Object storage for files, managed vector DB, horizontal scaling, and the context-strategy cascade. This plan makes the data layer correct and isolated; Plan 5 makes it scale out.
