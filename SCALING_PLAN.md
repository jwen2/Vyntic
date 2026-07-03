# Vyntic — Production Scaling Plan

## Executive Summary

This plan scales the current Gemini-powered PoC (local Docker, ChromaDB, local file storage) into a multi-tenant production system for PE teams. Each layer has a clear migration path with cost estimates.

---

## 1. Current PoC Architecture

| Layer | Technology | Limitation |
|-------|-----------|------------|
| LLM | Gemini 3 Flash via Google AI Studio | Free-tier rate limits, single API key |
| Embeddings | gemini-embedding-001 via Google AI Studio | Sequential, single-key quota |
| Vector DB | ChromaDB (local PersistentClient, optional RAG mode) | No replication, no auth, disk-bound |
| File Storage | Local disk (`/app/data/uploads/`) | Single-node, no CDN, no access control |
| Metadata DB | SQLite (`vyntic.db`, WAL) | Single-writer, no concurrent access |
| PDF Parsing | Docling (local) | CPU-bound, fine for PoC scale |
| API Server | FastAPI single-instance (Docker) | No horizontal scaling |
| Frontend | Vite + React (Docker, `vite preview`) | No CDN, single-instance |

---

## 2. Target Production Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Frontend   │────▶│   FastAPI     │────▶│  Google Gemini   │
│  (Vercel /   │     │  (ECS/Cloud   │     │  Pro API         │
│   CloudFront)│     │   Run)        │     │  (paid tier)     │
└──────────────┘     └──────┬───────┘     └──────────────────┘
                            │
                    ┌───────┼────────┬────────────┐
                    ▼       ▼        ▼            ▼
             ┌──────────┐ ┌────────────┐ ┌──────────┐ ┌──────────┐
             │ Pinecone │ │    S3 /    │ │ Postgres │ │ CloudFront│
             │ (vector) │ │    GCS     │ │ (RDS /   │ │ (PDF CDN) │
             │ p2 pods  │ │ (files)    │ │ Cloud    │ └──────────┘
             └──────────┘ └────────────┘ │ SQL)     │
                                         └──────────┘
```

---

## 3. Component-by-Component Scaling

### 3a. LLM: Free-Tier Gemini → Paid Gemini API (or Claude)

**Current:** Gemini 3 Flash (primary) + Gemini 2.5 Flash (fallback) on free-tier API keys with 15K token/min quotas.

**Production options:**

| Option | Strengths | Cost (40K queries/mo) |
|--------|-----------|----------------------|
| Gemini 2.5 Pro (paid) | Best multimodal, 1M context, cheapest per-token | ~$400/mo |
| Claude Sonnet (Anthropic) | Best financial reasoning, 200K context | ~$1,200/mo |
| Hybrid routing | Gemini for simple lookups, Claude for complex analysis | ~$600/mo |

**Changes required:**
- `llm.py` — Add paid API key, remove `convert_system_message_to_human` workaround if using models with system instruction support
- `config.py` — Add `gemini_tier: str = "paid"` or switch to Anthropic SDK
- Implement request-level model routing (simple queries → Flash, complex → Pro/Sonnet)

**Scaling levers:**
- Prompt caching (Gemini supports cached context) — 30-50% cost reduction
- Request batching for non-real-time synthesis queries
- Per-tenant rate limiting to prevent noisy-neighbor issues

### 3b. Embeddings: Free-Tier Gemini → Paid Embedding API

**Current:** `gemini-embedding-001` (3072-dim) on free-tier, sequential single-key quota.

**Production options:**

| Option | Dimensions | Cost/MTok | Throughput |
|--------|-----------|-----------|------------|
| Gemini Embedding (paid) | 3072 | ~$0.004 | High (batch API) |
| OpenAI text-embedding-3-large | 3072 | $0.13 | Very high (batch) |
| Cohere embed-v3 | 1024 | $0.10 | High |

**Changes required:**
- `embedder.py` — Add batch embedding support (process chunks in groups of 100)
- Add async queue for non-blocking embedding during ingestion
- Implement embedding cache (Redis) for frequently queried terms

**Scaling levers:**
- Batch API (50% cheaper for non-real-time document ingestion)
- Dimensionality reduction (Matryoshka embeddings at 1536-dim for 2x storage savings)
- Pre-compute query embeddings for template questions

### 3c. Vector DB: ChromaDB → Pinecone (or Qdrant Cloud)

**Current:** ChromaDB PersistentClient on local Docker volume. One collection per deal (cosine similarity). No replication, no auth, disk-bound.

**Production options:**

| Option | Strengths | Cost (200K vectors) |
|--------|-----------|-------------------|
| Pinecone (Standard) | Managed, SOC2, namespaces map to deals | $70/mo |
| Qdrant Cloud | Open-source core, payload filtering, self-host option | $50/mo |
| pgvector (in Postgres) | Single DB for everything, simpler infra | $0 (included in RDS) |

**Recommended:** Pinecone — namespaces provide 1:1 replacement for collection-per-deal isolation.

**Changes required:**
- `vector_store.py` — Replace ChromaDB client with Pinecone client
- Map `deal_id` → Pinecone namespace
- `config.py` — Add `pinecone_api_key`, `pinecone_index_name`
- Remove ChromaDB volume from deployment

**Scaling levers:**
- Pinecone serverless (pay-per-query, auto-scales to zero)
- Metadata filtering (replace full-text fallback queries)
- Hybrid search (sparse + dense retrieval for financial terminology)

### 3d. File Storage: Local Disk → S3/GCS + CDN

**Current:** Original uploaded documents stored at `/app/data/uploads/{deal_id}/{filename}` on Docker volume. Served via FastAPI `FileResponse`. No access control, no CDN, lost on container restart without volume mount.

**Production architecture:**

```
Upload Flow:
  User → FastAPI → S3 (store original) → parse → embed → Pinecone

View Flow:
  User clicks citation → Frontend requests signed URL → S3 pre-signed URL (15min TTL)
                       → Browser renders PDF via iframe with #page=N
```

**Changes required:**
- `routes_ingest.py` — Replace `open(dest_path, "wb")` with `boto3.upload_fileobj()`
- `routes_deals.py` — Replace `FileResponse` with S3 pre-signed URL redirect
- Add `s3_bucket`, `s3_region` to config
- Add CloudFront distribution for PDF serving (reduces latency for large files)
- Implement per-deal folder isolation: `s3://{bucket}/{tenant_id}/{deal_id}/{filename}`

**Access control:**
- Pre-signed URLs with 15-minute TTL (no public access)
- S3 bucket policy restricts to CloudFront origin only
- Per-tenant IAM roles for data isolation
- Audit log every document access

**Scaling levers:**
- S3 Intelligent-Tiering (auto-move cold deals to cheaper storage)
- CloudFront caching for frequently viewed documents
- S3 Transfer Acceleration for large file uploads
- Lifecycle policies (archive deals older than 2 years to Glacier)

**Cost estimate:**

| Scale | Storage | Requests | CDN | Total |
|-------|---------|----------|-----|-------|
| 10 teams, 10K docs | ~50GB | ~100K reads/mo | ~200GB transfer | ~$15/mo |
| 50 teams, 50K docs | ~250GB | ~500K reads/mo | ~1TB transfer | ~$60/mo |
| 200 teams, 200K docs | ~1TB | ~2M reads/mo | ~5TB transfer | ~$200/mo |

### 3e. Metadata DB: SQLite → PostgreSQL

**Current:** SQLite (`vyntic.db`) + in-memory deal store. Single-writer, no concurrent access, lost without volume mount.

**Production:**
- AWS RDS PostgreSQL (or GCP Cloud SQL)
- Add proper ORM migrations (Alembic)
- Multi-tenant schema: add `tenant_id` to all tables
- Row-level security (RLS) for deal isolation between teams

**Changes required:**
- `database.py` — Replace SQLite connection string with PostgreSQL
- Add Alembic for schema migrations
- `deal_store.py` — Remove in-memory store, use DB directly
- Add connection pooling (SQLAlchemy `pool_size`, `max_overflow`)
- Add `users`, `teams`, `audit_logs` tables

**Tables to add for production:**

```sql
-- Multi-tenant support
CREATE TABLE tenants (id UUID PRIMARY KEY, name TEXT, plan TEXT);
CREATE TABLE users (id UUID PRIMARY KEY, tenant_id UUID REFERENCES tenants, email TEXT, role TEXT);

-- Audit trail
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    tenant_id UUID, user_id UUID, deal_id TEXT,
    action TEXT,  -- 'query', 'upload', 'delete', 'view_document'
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Document tracking (enhanced)
CREATE TABLE documents (
    doc_id TEXT PRIMARY KEY,
    deal_id TEXT NOT NULL,
    tenant_id UUID NOT NULL,
    filename TEXT NOT NULL,
    s3_key TEXT NOT NULL,        -- S3 object key
    file_size_bytes BIGINT,
    page_count INT DEFAULT 0,
    chunk_count INT DEFAULT 0,
    ingested_at TIMESTAMPTZ DEFAULT now()
);
```

### 3f. Compute: Docker Compose → Container Orchestration

**Current:** Docker Compose with 2 services (backend, frontend) on a single machine.

**Production options:**

| Option | Strengths | Complexity |
|--------|-----------|------------|
| AWS ECS Fargate | Serverless containers, auto-scaling, no cluster management | Low |
| GCP Cloud Run | Scale-to-zero, pay-per-request, simple deployment | Low |
| Kubernetes (EKS/GKE) | Full control, complex workloads, GPU scheduling | High |

**Recommended:** ECS Fargate (or Cloud Run) for the API server. Vercel for the frontend.

**Scaling configuration:**
- Auto-scale 2-10 backend instances based on CPU/request count
- Health check endpoint (`/health`) for load balancer
- Graceful shutdown for in-flight SSE streams
- Separate task definition for background ingestion (CPU-intensive parsing)

### 3g. PDF Parsing: Local Docling → Async Worker Queue

**Current:** Docling runs synchronously in the FastAPI request handler. Large PDFs block the API thread.

**Production:**
- Move parsing to background worker (Celery + Redis, or SQS + Lambda)
- Return `202 Accepted` with a job ID immediately
- Frontend polls for ingestion completion
- Scale workers independently of API servers

```
Upload → API (store file in S3) → SQS message → Worker (parse + chunk + embed + store)
                                                      ↓
                                              Update DB: status = "ready"
```

---

## 4. Cost Estimate at Scale

### Assumptions
- **10 PE teams**, **20 deals/month each**
- **50 documents/deal** (avg 30 pages)
- **200 queries/deal** across analysis lifecycle
- **Total:** 200 deals/mo, 10K documents/mo, 40K queries/mo

### Monthly Cost Breakdown

| Component | Service | Monthly Cost |
|-----------|---------|-------------|
| LLM (Gemini Pro, paid) | Google AI Platform | $400–800 |
| Embeddings (Gemini, paid) | Google AI Platform | ~$10 |
| Vector DB | Pinecone Standard (1× p2 pod) | $70 |
| File Storage | S3 + CloudFront (50GB) | ~$15 |
| Metadata DB | RDS PostgreSQL (db.t4g.micro) | $15 |
| Compute | ECS Fargate (2 tasks, 1vCPU, 2GB) | $60 |
| Frontend | Vercel Pro | $20 |
| Monitoring | CloudWatch + Sentry | $15 |
| **Total** | | **$605–$1,005/mo** |

### Scaling Curve

| Scale | Teams | Queries/mo | Docs/mo | Est. Monthly Cost |
|-------|-------|-----------|---------|------------------|
| Seed | 10 | 40K | 10K | $600–1,000 |
| Growth | 50 | 200K | 50K | $2,500–4,000 |
| Scale | 200 | 800K | 200K | $8,000–14,000 |

**Biggest cost lever:** LLM is 60-70% of total. Optimize with:
- Prompt caching (30-50% savings)
- Model routing (Flash for simple, Pro for complex)
- Response caching for repeated template queries across deals

---

## 5. Migration Priority

| Phase | Scope | Effort | Impact |
|-------|-------|--------|--------|
| **Phase 1** | Paid Gemini API + file persistence (S3) | 2–3 days | Removes rate limits, enables document viewer |
| **Phase 2** | Pinecone + PostgreSQL migration | 3–4 days | Production-grade storage with isolation |
| **Phase 3** | Auth + multi-tenant (Clerk/Auth0) | 3–5 days | Team-based access control, audit trail |
| **Phase 4** | ECS/Cloud Run + Vercel deployment | 2–3 days | Auto-scaling, zero-downtime deploys |
| **Phase 5** | Async ingestion worker + monitoring | 2–3 days | Non-blocking uploads, observability |

---

## 6. Security & Compliance

| Area | PoC | Production |
|------|-----|-----------|
| Auth | None | Clerk/Auth0 with RBAC |
| Data isolation | ChromaDB collections | Pinecone namespaces + Postgres RLS + S3 prefix policies |
| Encryption at rest | None | S3 SSE-S3, RDS encryption, Pinecone encrypted |
| Encryption in transit | HTTP (Docker internal) | TLS everywhere (ALB → backend, S3, Pinecone) |
| Document access | Direct FileResponse | Pre-signed URLs with TTL, audit log |
| API keys | `.env` file | AWS Secrets Manager / GCP Secret Manager |
| SOC2 | N/A | Pinecone, AWS, Vercel all SOC2 compliant |

---

## 7. Risk Considerations

| Risk | Mitigation |
|------|-----------|
| Gemini API rate limits | Paid tier has 10x higher limits; implement retry with exponential backoff |
| Vendor lock-in (Pinecone) | Vector store abstracted behind interface; can swap to pgvector or Qdrant |
| Large PDF ingestion timeouts | Async worker queue decouples upload from processing |
| S3 cost for large doc libraries | Intelligent-Tiering + Glacier lifecycle for archived deals |
| Multi-region latency | CloudFront for files, regional API deployment for compute |
| Data residency / GDPR | Choose S3 + RDS regions per tenant; Pinecone supports EU |
