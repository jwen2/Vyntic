# Plan 5 — Horizontal Scaling + Context Strategy Cascade

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:brainstorming FIRST (multiple infra decisions), then superpowers:executing-plans. Do not start until Plan 4 is merged and the decisions below are made.

**Source:** `docs/assessments/2026-07-02-resiliency-security-assessment.md` — R3, R1 (full).

**Goal:** Make the backend run as N stateless replicas (R3), and deliver the context strategy that actually serves 10s–100s of documents per deal (R1). Together these turn "impressive single-node pilot" into "scales with the customer's document volume" — the core capability an LP data room demands.

**Hard prerequisite:** **Plan 4 merged** (Postgres + tenancy). Horizontal scaling on SQLite is impossible; every shared-state fix below assumes Postgres.

---

## ⚠️ Decisions required before implementation

### D1 — Shared-state backplane
Replicas can't share Python memory. The in-memory `RunEventBus` (SSE) and (post-Plan-3) ingest workers need a shared backplane.
| Option | Use |
|---|---|
| **Redis** (pub/sub + rate-limit + cache) | Recommended — one dependency covers SSE fan-out, cross-replica rate limiting (Plan 2), and Gemini context cache |
| Postgres LISTEN/NOTIFY | No new dependency, weaker for high-fanout SSE |
| Managed queue (SQS/PubSub) + Redis | If job volume is high |

**Recommended: Redis** for pub/sub + cache + rate limiting; **DB-as-queue (Postgres `SELECT ... FOR UPDATE SKIP LOCKED`)** for durable job execution. Confirm.

### D2 — Object storage
Which (S3 / GCS / R2)? Uploads and `full_text_md` blobs move off local disk. Needed for R3 (replicas can't share local disk) and for encryption-at-rest of files (Plan 4 D2).

### D3 — Managed vector DB (only if RAG/cascade needs it at scale)
Embedded ChromaDB is single-node. If the context cascade's RAG tier runs at scale, move to a managed vector DB (Pinecone/pgvector/Chroma-server). **pgvector** keeps it in the Postgres you already have — recommended default unless volume dictates otherwise.

---

## Findings addressed

| ID | Finding |
|---|---|
| R3 | In-memory SSE bus, in-process job execution, embedded ChromaDB, local-disk files → cannot run >1 replica |
| R1 (full) | Full-context sends the whole corpus every time; 3–6 large docs saturate Gemini's window. Needs per-request strategy: full-text under budget, retrieval above it |

---

## Phase A — Stateless replicas (R3)

- [ ] **A1. DB-as-queue for jobs.** Promote the workflow-run and ingest executors from in-process `asyncio.create_task` to a claim-based worker loop over `queued` rows (`FOR UPDATE SKIP LOCKED`). The atomic-claim primitives already exist (workflow cells; Plan 3 ingest jobs) — this generalizes them. Workers can run in the API process (dev) or a separate deployment (prod) with no code change.
- [ ] **A2. Shared SSE backplane.** Replace the in-memory `RunEventBus` with the D1 backplane (Redis pub/sub): a run's events publish to a channel; any replica holding the client's SSE connection subscribes. `GET /runs/{id}` REST re-fetch (already the documented reconnect path) still covers gaps.
- [ ] **A3. Object storage for files + full_text.** Move uploads and `full_text_md` to D2 object storage; DB holds references. Enables replicas + file encryption at rest (Plan 4 D2).
- [ ] **A4. Cross-replica rate limiting.** Move Plan 2's limiter to Redis so limits hold across replicas.
- [ ] **A5. Verify.** Run 2 replicas behind a load balancer; a run started on replica 1 streams to a client connected to replica 2; ingestion processes regardless of which replica received the upload.

## Phase B — Context strategy cascade (R1 full)

Promote the deferred cascade into a real per-request strategy in `context_provider`.

- [ ] **B1. Strategy interface.** `context_provider` chooses per request: `full_text` (corpus under a token budget), `rag` (retrieval-guided page expansion), or `cascade` (full text if the doc/deal fits, else retrieval). Chosen from measured corpus size vs. the model's context budget — not a global flag. **Failing tests first**: small deal → full_text; large deal → rag/cascade, and the answer is grounded in the right pages.
- [ ] **B2. Lazy embedding.** Ingest currently skips embedding in full-context mode. Make embedding lazy/on-demand for documents the cascade routes to RAG, or a background backfill — so only docs that need vectors get them (cost + ingest-latency win). Uses D3 vector store.
- [ ] **B3. Gemini context caching.** For repeated identical document prefixes (chat follow-ups, cell retries, one-doc-per-row columns) use Gemini context caching (Redis-tracked cache handles) — large cost reduction on the exact large-document workloads this plan targets.
- [ ] **B4. Column batching (optional, big cost lever).** One LLM call per (document, all-columns) emitting NDJSON — the ported ai-service pattern. ~N× input-token reduction on `one_doc_per_row` runs over big documents.
- [ ] **B5. Verify at scale.** A 50–100 document deal answers deal-level chat and synthesis correctly and within latency/cost budget — the capability this whole plan exists to prove.

## Phase C — Observability for scale

- [ ] **C1. Per-run/per-cell token + cost accounting** (rearchitect Phase 6 item 5) — unit economics per diligence run, now that volume is the product.
- [ ] **C2. Health/readiness probes, structured logs, basic metrics** (queue depth, replica count, LLM latency/error rate) for the multi-replica deployment.

---

## Definition of done
- ≥2 replicas serve runs, ingestion, and SSE correctly behind a load balancer.
- A 100-document deal is answerable (chat + synthesis) with graceful strategy selection — no silent truncation, no context-window errors.
- Token/cost per run is measured and visible.

## Relationship to other plans
Depends on **Plan 4** (Postgres/tenancy). Consumes the durable-job seam from **Plan 3** and the atomic-claim primitives from the rearchitect work. Completes the R1 story that **Plan 1** only stopgapped.
