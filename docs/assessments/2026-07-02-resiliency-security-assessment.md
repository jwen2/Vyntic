# Resiliency & Security Assessment — Institutional-LP Readiness

> **Type:** Assessment + remediation roadmap (not a task-by-task execution plan). Findings are static-analysis only — no load test or pen-test was run. Each remediation tier can be spun out into its own execution plan (see `2026-07-02-rearchitect-correctness-consolidation.md` for the format).

**Question this answers:** Can Vyntic handle LP-scale document volumes (10s–100s of docs per deal), and is it secure enough to pitch to institutional customers (fund-of-funds, etc.)?

**Verdict:** Vyntic is a well-built **single-tenant pilot**, not yet a multi-tenant SaaS. The analytical surface is demo-ready; the data platform underneath (tenancy, durability, auditability, scale) is at pilot maturity. Two findings are severe enough to block any external exposure: full-context mode **cannot** hold "100s of documents" per deal, and the conversation-history API has **no authentication at all**.

Assessed 2026-07-02 against `fable-rearchitect` (post-rearchitect commits). File:line references current as of that branch.

---

## Severity legend

| Sev | Meaning |
|---|---|
| **P0** | Blocks any external/LP exposure. Small, non-negotiable. |
| **High** | Blocks a paid pilot with one fund. |
| **Med** | Blocks calling it multi-tenant / selling to a second customer. |

---

## Part 1 — Resiliency & scale

### R1 (P0-scale): Full-context mode has a hard document-volume ceiling — contradicts the "100s of documents" requirement

**Where:** `app/services/context_provider.py:81` (`load_deal_context`), `:112` (warn-only threshold).

`load_deal_context` loads **every** document's `full_text_md` for the deal into memory and sends the **entire corpus** to Gemini on every deal-level question. Consequences:

- Gemini Flash caps at ~1M tokens. Code warns at ~800K tokens (≈3.2M chars) then **sends anyway** — `:112` is `logger.warning`, not a guard. A 300-page CIM ≈ 0.5–1M chars, so **3–6 large documents saturate the window** for deal-level chat and every synthesis workflow. A 50–100 doc data room is a hard Gemini error or silent truncation, not "slow."
- **No graceful degradation** — no per-request fallback to RAG when a deal exceeds the window; `full_context_mode` is a global flag, not a size-triggered strategy.
- **Every question re-sends the whole corpus** — no caching. A 15-column synthesis re-ships the corpus 15×.
- **Memory pressure:** `db.query(DocumentRow).filter(...).all()` pulls every `full_text_md` blob into Python at once — a 100-doc deal is potentially hundreds of MB resident per concurrent request, per user.

**Fix direction:** Promote the deferred **context-strategy cascade** (rearchitect plan Phase 6, item 4) out of "deferred": full text under a token budget, retrieval-guided page expansion above it, chosen per request in `context_provider`. This is the feature that makes the core "lots of documents" claim true — not a nice-to-have for this customer base. Also: add a real guard that fails gracefully (or auto-switches to RAG) instead of silently truncating, and lazy-load `full_text_md` rather than `.all()`-ing every blob.

### R2 (High): SQLite single-writer ceiling

**Where:** `app/database.py` — one SQLite file for users, deals, documents, runs, cells, conversations.

WAL (now enabled) helps concurrent reads, but there is still exactly **one writer**. Concurrent ingestion + a running workflow (4 cells writing) + a second analyst → write contention and `database is locked`. Fine for single-user pilot; hard wall for even a 10-person fund. **Postgres migration (SCALING_PLAN) is the unblock and a prerequisite for R3, T1, and most of Part 2.**

### R3 (High): Nothing can run as more than one process

**Where:** in-memory `RunEventBus` (`workflow_run_executor.py`), in-memory `_ingest_progress` dict (`routes_ingest.py`), in-process `asyncio.create_task` execution, embedded ChromaDB, local-disk file storage.

All assume a single process. Two backend replicas would not share runs, progress, or SSE events — so **horizontal scaling / N+1 redundancy is impossible today**. Institutional uptime SLAs require it. Unblock needs: external queue (or DB-as-queue from rearchitect Phase 6 item 1), shared pubsub/cache for SSE + progress, object storage, managed vector DB.

### R4 (High): Ingestion is fire-and-forget and non-durable — and it *is* the document workload

**Where:** `app/api/routes_ingest.py:266` (`_schedule_background_ingest` → `asyncio.create_task`); progress in in-memory `_ingest_progress`.

Same durability hole we fixed for workflow runs, but ingestion has **no reconciler**. A backend restart mid-ingest leaves documents stuck at "processing" forever; progress state is lost on restart and invisible to other workers. When an LP uploads a 200-doc data room, this is the path that must be bulletproof — today a single deploy/crash during that upload orphans an unknown number of documents with no recovery and no visibility.

**Fix direction:** Persist ingest jobs to the DB (status rows), add a startup reconciler mirroring `reconcile_interrupted_runs`, and move progress to shared storage.

### R5 (Med-High): Parsing throughput is serialized

**Where:** `app/config.py` — `docling_max_concurrent_jobs=1`, `docling_timeout_seconds=180`, `docling_queue_max_size=2`.

Docling runs one CPU-bound job at a time. Uploading 100 PDFs parses them essentially in series (potentially hours), with backpressure that just rejects past a queue of 2. The "dump the whole data room" moment hits this wall immediately. Needs a real parsing queue with a worker pool, and likely a managed/GPU parse tier for large volumes.

### R6 (Med): No pagination anywhere

**Where:** `list_deals`, `deal_store.list_documents`, conversation history — all return everything.

At hundreds of deals/documents these are unbounded payloads that quietly degrade the UI at the exact data volumes being targeted. Cheap to fix.

---

## Part 2 — Security (institutional-LP lens)

### S1 (P0): Conversation history API is completely unauthenticated

**Where:** `app/api/routes_conversation.py` — no `get_current_user`, no `require_deal_access` on any endpoint; mounted with no router-level dependency (`main.py:52`).

Anyone who can reach the API can **read, write, or delete any deal's entire Q&A history** — the analytical answers with financial specifics and citations — by iterating `deal_id`. Straightforward confidentiality breach of exactly the data LPs care most about. Every other deal route already has the right dependencies; these were missed.

**Fix:** Add `current_user: UserRow = Depends(get_current_user)` + `require_deal_access(current_user, deal_id)` to all three handlers. Cheap; do first. **This is also the strongest argument for S-cross-cutting below.**

### S1-cross-cutting (High): Access control is per-route opt-in, not default-deny

One forgotten decorator (S1) = a full data-room leak. Institutional-grade authz needs a **centralized default-deny layer** — e.g. a router-level dependency or middleware that requires auth + deal scoping unless a route explicitly opts out — so a new route is secure by default. Pair with the `require_admin` model already added in the rearchitect work.

### S2 (P0/Critical for buyer): No organizational tenancy — every customer shares one database

**Where:** one `users` table, one `deals` table, one SQLite file, one ChromaDB; isolation is per-user `DealAccessRow` rows only.

No firm/tenant concept. For fund-of-funds (fiduciaries handling their LPs' confidential commitments), "your data lives in the same database as other customers', isolated only by an application `WHERE` clause" rarely passes security review. Expect a requirement for **row-level tenant isolation enforced at the data layer, or database-per-tenant**. This is the single biggest architectural gap for this customer base and it shapes the Postgres schema — **decide before the migration, not after.**

### S3 (High): Secrets are unsafe-by-default

**Where:** `app/config.py` — `assert_production_secrets` (added in rearchitect) only fires when `environment == "production"` is explicitly set.

Deploy without setting that var and the default JWT signing key + `admin`/`admin` sail through. Invert to fail-closed: require an explicit `development` to allow defaults, or generate a random secret at first boot. Also: a single shared `GEMINI_API_KEY` across all customers = one leak blast-radius and one shared rate-limit bucket (noisy-neighbor).

### S4 (High): No audit logging

Nothing records who accessed which deal/document, when. An LP compliance team **will** ask for this in their vendor questionnaire; absence often ends the conversation. Access/audit trails are effectively mandatory for institutional data rooms — design in, don't bolt on.

### S5 (High): JWTs in query strings + no revocation

**Where:** `app/auth.py:112` (`?token=` accepted); no blocklist / session invalidation anywhere.

`?token=` puts 24h JWTs into server logs, browser history, proxy logs. And a leaked token is valid for a full day regardless — offboarding an analyst doesn't cut access until expiry. Needs short-lived, single-purpose download/iframe tokens **and** a revocation mechanism (blocklist or short TTL + refresh).

### S6 (Med-High): Open self-registration + no rate limiting

**Where:** `/auth/register` unauthenticated; no throttling on login/register.

Anyone reachable can mint an account; credential stuffing/brute force unmitigated. For a closed institutional product, gate registration behind invite/SSO and throttle auth endpoints. LP reviews frequently require SSO/SAML outright.

### S7 (Med-High): No encryption at rest

SQLite DB + uploaded PDFs sit plaintext on local disk. Fund financials and LP commitment data are among the most confidential documents that exist. Encryption at rest + a documented KMS story is a standard institutional checkbox.

### S8 (Med): Hard deletes, no retention / legal-hold

Deletes now cascade correctly (FK fix) but are permanent — no soft-delete, retention policy, or legal-hold. Institutional compliance often *requires* retention and hold; an unrecoverable `DELETE` is itself a compliance problem (mirror image of a leak).

### S9 (Low-Med): Prod hardening gaps noted in passing

- CORS allowlist is hardcoded localhost ports with `allow_credentials=True` (`main.py:31`) — no production origin story.
- User-uploaded files served inline from the same origin (PDF, Excel→HTML). The Excel path escapes cells correctly; worth a broader review that no inline-served path enables stored-XSS.
- No secrets manager/vault; secrets live in env/`.env`.

---

## Remediation roadmap (defensible sequencing)

**Implementation plans** (in `docs/superpowers/plans/`) group these findings into workstreams:

| Plan | Covers | Depends on |
|---|---|---|
| `2026-07-02-tier0-security-hotfixes.md` | S1, S3, R1-guard, S9-CORS | — |
| `2026-07-02-auth-access-control-audit.md` | S1-cross, S4, S5, S6, S9-XSS | Plan 1 |
| `2026-07-02-durable-ingestion-parsing.md` | R4, R5 | — |
| `2026-07-02-postgres-multitenancy.md` | R2, S2, R6, S7, S8 | (tenancy decision) |
| `2026-07-02-horizontal-scaling-context-cascade.md` | R3, R1-full | Plan 4 |

### Tier 0 — Before *any* external/LP exposure (small, non-negotiable)
- **S1** — authenticate conversation routes.
- **S3** — secrets fail-closed by default.
- **R1 (partial)** — replace silent truncation with a graceful guard (fail clearly or auto-RAG) so a big deal never silently returns wrong answers.

### Tier 1 — Before a paid pilot with one fund
- **R4** — durable, reconciled ingestion.
- **S1-cross-cutting** — centralized default-deny authz layer.
- **S4** — audit logging.
- **S5** — token revocation + short-lived scoped tokens.
- **S6** — gate registration, rate-limit auth.

### Tier 2 — Before "multi-tenant" / a second customer
- **R2 + S2** — Postgres migration **with organizational tenancy designed in** (row-level isolation or DB-per-tenant). Tenancy decision must precede the schema.
- **R3** — horizontal-scaling replumb (DB-as-queue, shared pubsub/cache, object storage, managed vector DB).
- **R1 (full)** — context-strategy cascade that actually delivers "100s of documents."
- **R5** — parsing queue + worker pool (+ managed parse tier).
- **S7** — encryption at rest + KMS.
- **S8** — retention / soft-delete / legal-hold.
- **R6, S9** — pagination, CORS/prod hardening, secrets manager, SSO/SAML.

---

## Through-line for the pitch

The **analytical** surface is genuinely strong and demo-ready. The **data platform** underneath — tenancy, durability, auditability, scale — is at pilot maturity. LPs buy the platform as much as the analysis, and a fund-of-funds security questionnaire will probe exactly the items above. None are surprising for this stage; the risk is walking into diligence without having closed Tier 0 and Tier 1.

**Caveat:** static analysis only. The exact document count where full-context breaks (R1) is computed from code paths + Gemini limits, not load-tested; the auth gaps (S1) are read directly from routes but a full sweep for *other* unauthenticated routes wants a real test pass. Recommended next step if pursued: a dedicated execution plan starting with the **tenancy design (S2)**, since it constrains the Postgres migration everything else depends on.
