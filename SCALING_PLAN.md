# SpokeMatrix — Production Scaling Plan

## Executive Summary

This plan replaces the self-hosted PoC stack (Ollama + ChromaDB on a single machine) with managed cloud services to support multi-tenant PE teams at scale: **Claude API for LLM, OpenAI Embeddings API, and Pinecone for vector storage**.

---

## 1. Current PoC Architecture

| Layer | Technology | Limitation |
|-------|-----------|------------|
| LLM | DeepSeek-R1:8b via Ollama | Single GPU, no HA, ~15 tok/s |
| Embeddings | nomic-embed-text via Ollama | Sequential, single-node |
| Vector DB | ChromaDB (local PersistentClient) | No replication, no auth, disk-bound |
| PDF Parsing | Docling (local) | CPU-bound, fine for scale |
| API Server | FastAPI single-instance | No horizontal scaling |

---

## 2. Target Production Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Frontend   │────▶│   FastAPI     │────▶│  Claude API      │
│  (Vercel)    │     │  (ECS/Cloud   │     │  (Anthropic)     │
│              │     │   Run)        │     │  claude-sonnet-4-20250514     │
└──────────────┘     └──────┬───────┘     └──────────────────┘
                            │
                    ┌───────┼────────┐
                    ▼       ▼        ▼
             ┌──────────┐ ┌────────────┐ ┌──────────────┐
             │ Pinecone │ │ OpenAI     │ │ PostgreSQL   │
             │ (vector) │ │ Embeddings │ │ (metadata)   │
             │ p2 pods  │ │ text-3-lg  │ │ (RDS/Cloud   │
             └──────────┘ └────────────┘ │  SQL)        │
                                         └──────────────┘
```

---

## 3. Component-by-Component Migration

### 3a. LLM: Ollama (DeepSeek-R1:8b) → Claude API

**Why Claude:** Best-in-class reasoning for financial document analysis, large context window (200K tokens), native citation support, and strong structured output.

**Changes required:**
- `single_deal_qa.py` — Replace `ChatOllama` with `ChatAnthropic` (langchain-anthropic)
- `config.py` — Replace `ollama_*` settings with `anthropic_api_key`, `anthropic_model`
- `prompts.py` — Adapt system prompts for Claude's instruction style
- Remove Ollama service from `docker-compose.yml`

**Model recommendation:** `claude-sonnet-4-20250514` for the best cost/quality balance on financial analysis.

### 3b. Embeddings: Ollama (nomic-embed-text) → OpenAI Embeddings API

**Why OpenAI Embeddings:** Industry-standard quality, high throughput, batch API available.

**Changes required:**
- `embedder.py` — Replace Ollama HTTP calls with `openai.embeddings.create()`
- `config.py` — Add `openai_api_key`, change `embedding_model` to `text-embedding-3-large`, `embedding_dim` to 3072
- Remove mock fallback (cloud service has SLA)

### 3c. Vector DB: ChromaDB → Pinecone

**Why Pinecone:** Managed, scales to billions of vectors, built-in namespaces (maps to deal isolation), SOC2 compliant, sub-50ms P95 queries.

**Changes required:**
- `vector_store.py` — Replace ChromaDB client with Pinecone client
- Map `deal_id` → Pinecone namespace (1:1 replacement for collection-per-deal)
- `config.py` — Add `pinecone_api_key`, `pinecone_index_name`
- Remove ChromaDB volume from `docker-compose.yml`

### 3d. Metadata Store: Add PostgreSQL

**Why:** Deal metadata, user accounts, RBAC, audit logs — ChromaDB currently holds some of this implicitly.

- Add PostgreSQL (RDS or Cloud SQL) for structured data
- Migrate deal/document metadata from in-memory to Postgres
- Add SQLAlchemy or Prisma ORM layer

### 3e. Compute: Docker Compose → Container Orchestration

- Deploy FastAPI to **AWS ECS Fargate** or **GCP Cloud Run**
- Auto-scaling based on request volume
- Frontend to **Vercel** or **CloudFront + S3**

---

## 4. Cost Estimate

### Assumptions
- **10 PE teams**, each analyzing **20 deals/month**
- **50 documents per deal** (avg 30 pages each)
- **200 queries per deal** across the analysis lifecycle
- Total: **200 deals/month**, **10,000 documents/month**, **40,000 queries/month**

### 4a. Claude API (LLM)

| Parameter | Value |
|-----------|-------|
| Model | claude-sonnet-4-20250514 |
| Input tokens per query | ~6,000 (system + context + question) |
| Output tokens per query | ~800 |
| Queries/month | 40,000 |

| Item | Calculation | Monthly Cost |
|------|------------|-------------|
| Input tokens | 40,000 × 6,000 = 240M tokens × $3/MTok | **$720** |
| Output tokens | 40,000 × 800 = 32M tokens × $15/MTok | **$480** |
| **Subtotal** | | **$1,200/mo** |

*With prompt caching (system prompts reused): ~30% savings → **~$850/mo***

### 4b. OpenAI Embeddings API

| Parameter | Value |
|-----------|-------|
| Model | text-embedding-3-large |
| Tokens per document chunk | ~300 |
| Chunks per document | ~20 |
| Documents/month | 10,000 |
| Query embeddings/month | 40,000 |

| Item | Calculation | Monthly Cost |
|------|------------|-------------|
| Document embeddings | 10,000 × 20 × 300 = 60M tokens × $0.13/MTok | **$7.80** |
| Query embeddings | 40,000 × 50 tokens × $0.13/MTok | **$0.26** |
| **Subtotal** | | **~$8/mo** |

### 4c. Pinecone (Vector DB)

| Parameter | Value |
|-----------|-------|
| Plan | Standard (p2 pod) |
| Vectors stored | ~200K (growing) |
| Queries/month | 40,000 |
| Dimensions | 3,072 |

| Item | Monthly Cost |
|------|-------------|
| 1× p2 pod (Standard) | **$70/mo** |
| Scaling to 2 pods at ~500K vectors | **$140/mo** |
| **Estimate** | **$70–140/mo** |

### 4d. Infrastructure

| Service | Monthly Cost |
|---------|-------------|
| AWS ECS Fargate (2 tasks, 1 vCPU, 2GB) | **$60/mo** |
| RDS PostgreSQL (db.t4g.micro) | **$15/mo** |
| Vercel (Pro, frontend) | **$20/mo** |
| CloudWatch / monitoring | **$10/mo** |
| **Subtotal** | **~$105/mo** |

### 4e. Total Monthly Cost Summary

| Component | Monthly Cost |
|-----------|-------------|
| Claude API (LLM) | $850–1,200 |
| OpenAI Embeddings | ~$8 |
| Pinecone | $70–140 |
| Infrastructure | ~$105 |
| **Total** | **$1,033–$1,453/mo** |

### Cost Scaling Notes

- **Linear scaling:** Costs scale linearly with queries and documents
- **At 5× volume (50 teams):** ~$5,500–7,000/mo
- **Biggest lever:** Claude API is ~80% of cost; use prompt caching and Haiku for simple queries to optimize
- **Batch embedding:** OpenAI batch API offers 50% discount for non-real-time embedding jobs

---

## 5. Migration Priority

| Phase | Scope | Effort | Impact |
|-------|-------|--------|--------|
| **Phase 1** | Claude API + OpenAI Embeddings | 2–3 days | Removes GPU dependency, 10× faster responses |
| **Phase 2** | Pinecone migration | 2 days | Production-grade vector storage with isolation |
| **Phase 3** | PostgreSQL + auth | 3–5 days | Multi-tenant RBAC, audit trail |
| **Phase 4** | Container orchestration + CI/CD | 3–5 days | Auto-scaling, zero-downtime deploys |

---

## 6. Risk Considerations

| Risk | Mitigation |
|------|-----------|
| API rate limits (Claude/OpenAI) | Implement retry with exponential backoff; request rate limit increases |
| Vendor lock-in (Pinecone) | Abstract vector store behind interface (already done with current design) |
| Data residency / compliance | Pinecone supports AWS us-east-1 and eu-west-1; Claude API supports EU region |
| Cost overruns | Set billing alerts, implement per-tenant usage tracking, use Haiku for simple lookups |
| Latency increase (cloud vs local) | Claude Sonnet is faster than local DeepSeek-R1:8b; net improvement expected |
