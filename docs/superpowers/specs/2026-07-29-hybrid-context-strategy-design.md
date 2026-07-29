# Hybrid Context Strategy — Design

**Date:** 2026-07-29
**Status:** Approved, not yet planned
**Supersedes the retrieval half of:** `docs/superpowers/specs/2026-06-03-full-context-migration-design.md`
**Relationship to Plan 5:** implements Phase B of `docs/todo/2026-07-02-horizontal-scaling-context-cascade.md`, and **decouples it from the Plan 4 (Postgres) gate** — see "Relationship to existing plans".

---

## Problem

Vyntic runs full-context by default: `context_provider` loads every document's `full_text_md` and sends the whole corpus on every call. The RAG path (ChromaDB, `vector_store.py`, `embedder.py`, `chunker.py`) is intact but unreachable, gated behind a global `full_context_mode` boolean.

Three things are wrong with the status quo as document volume grows toward the target case — an LP fund data room of 50–100 documents.

**1. Silent truncation.** `context_provider.py:169` drops chunks past a hardcoded `_FC_HARD_CHAR_BUDGET = 3_200_000` in document order, logs a warning, and answers anyway. `_select_synthesis_chunks` does the same per cell. For a product whose core promise is that every claim cites a page (CLAUDE.md invariant 6), answering from a corpus that quietly lost its tail is the worst available behavior.

**2. The truncation flag is racy.** `context_provider.py:23` `last_context_truncated` is a module-level mutable global written on every call. `execute_run` dispatches cells concurrently under a semaphore (`workflow_run_executor.py:226`), so whichever cell finishes last wins. The flag is already meaningless under concurrency.

**3. Cost scales with cells × corpus, and nothing exploits the repetition.** `execute_cell` makes one LLM call per cell, each loading that document's full text. A 12-column × 40-document `one_doc_per_row` run sends every document **12 times**. Synthesis rows load the entire corpus per cell.

## Non-problem (corrected during design)

Corpus size alone is **not** the cost driver, and the capacity wall is further out than it feels.

| Corpus | Tokens (~600/page) | vs. 1M window |
|---|---|---|
| 100 pages | ~60K | 6% |
| Realistic fund data room (~850pp) | ~500K | 50% |
| 100 documents × ~50pp | ~3M | **300% — the wall** |

The wall is around 1,500 pages. A realistic data room *fits*. What doesn't fit is 100 genuinely large documents.

> **Unverified:** per-token and cached-token pricing for `gemini-3.1-flash-lite`, and the context cache's storage charge, were not confirmed during design. No savings figure should be quoted until they are checked against Google's live pricing.

## Core reframe

**Cost and capacity are independent axes.** Collapsing them into one "full context vs. RAG" dial is what makes the decision hard to specify.

- **Retrieval is a capacity mechanism** — what to do when the corpus physically does not fit. It is a *bad* cost mechanism, because it buys savings with accuracy.
- **Caching and batching are cost mechanisms** — they reduce spend while the model sees byte-identical context, so they carry no quality risk.

**Retrieval below the capacity wall is a quality regression, not a saving.** A management fee defined in LPA §3.2, stepped down in §3.4, and waived in a side letter that calls it a "Fee Discount" will not co-retrieve on a top-k query for *"management fee"*. Full context gets all three. This is the diligence miss that breaks allocator trust.

Per surface:

| Surface | Corpus/call | Calls per user action | Dominant lever |
|---|---|---|---|
| Chat turn | whole deal | 1, repeated per follow-up | cache |
| `one_doc_per_row` cell | 1 doc | × columns | batching / cache |
| Synthesis cell | whole deal | columns × rows | cache + allocation |
| Doc matrix cell | 1 doc | columns × docs | batching / cache |
| Monitoring extractor | 1 doc | 2–3 fixed prompts | merge prompts |

## Approach

Cost first, capacity second, behind a stable interface. Rejected alternatives:

- **Capacity first** — solves a wall not yet hit, adds embedding spend, carries quality risk.
- **Binary per-request router** (corpus fits → full text, else → RAG) — flips an entire 60-document request to fragments because one document pushed it over. Bad boundary behavior; would be rewritten.

---

## Phase 0 — Measurement

Neither optimization is decidable without a baseline.

**0a. Token + cost accounting.** Instrument `stream_with_fallback` to record prompt/completion tokens per call, attributed to `(surface, deal_id, run_id, cell_id)`. This is Plan 5's C1 pulled to the front. It also replaces the estimated column multiplier above with a measured one.

**0b. Eval harness.** 30–50 questions with known page-level answers across 3–4 real documents, run against `run_extraction` directly (not the HTTP surface) so it stays fast and needs no app lifecycle.

Two scores:

- **Citation accuracy — fully automatable, load-bearing.** Did the answer cite the page that actually contains the fact? The product promise as a number, with no human and no LLM judge in the loop. This is the signal that catches the side-letter miss.
- **Answer correctness** — LLM-judge or manual. Noisier, secondary.

## Phase 1 — Cost (no quality risk)

**1a. Caching spike (timeboxed).** Resolve before writing code: (i) does `langchain-google-genai` expose explicit `CachedContent`; (ii) does `gemini-3.1-flash-lite` do implicit prefix caching; (iii) minimum cacheable token count and storage cost.

> **Risk:** `llm.py:47` uses `ChatGoogleGenerativeAI`. If that wrapper has no cache support and implicit caching does not apply, these calls drop to the native `google-genai` SDK — meaning `stream_with_fallback` grows a second client path *including* the two-tier fallback logic. This is a spike outcome, not an assumption.

**1b. Caching.** Cache the document-prefix portion of the system prompt, keyed by content hash. Natural cache units are the repeated ones: a document across a column sweep, a deal across chat follow-ups, a cell across retries. Measured against the 0a baseline.

**1c. Column batching — conditional, decided by data.**

Batching and caching are **substitutes, not complements**, for `one_doc_per_row`: batching stops sending the document 12 times; caching makes sending it 12 times nearly free. They target the same tokens. Batching's *additional* win is latency and output overhead (12 calls → 1), not input tokens.

Batching is also expensive to build. `execute_run` dispatches one `run_one(cell_id)` per cell; each takes an **atomic claim** (`workflow_run_executor.py:280`), publishes its **own SSE event** (line 393), and is independently retryable (`kick_off_cell_retry`, `kick_off_column_retry`). One call per (document, all-columns) breaks all four — requiring group claims, fan-out of one response into N cell completions, and a single-cell path that does not re-run the batch.

**Only build 1c if 1b leaves a residual that justifies that surgery.**

## Phase 2 — Capacity

**2a. `ContextSelection` replaces `list[dict]`.**

```python
@dataclass
class ContextSelection:
    chunks: list[dict]
    whole_docs: list[str]      # doc_ids included in full
    partial_docs: list[str]    # doc_ids included as retrieved pages only
    excluded_docs: list[str]   # doc_ids not consulted — surfaced to the user
    strategy: str              # "full_text" | "retrieval" | "allocated"
```

Applies to all three `context_provider` entry points (`load_deal_context`, `load_doc_context`, `get_doc_page_chunks`) across **six modules, ~15 invocations**: `single_deal_qa` (×2), `routes_query` (×1), `routes_stream` (×1), `routes_doc_matrix` (×2), `monitoring_extractor` (×3), `workflow_run_executor` (×6).

Budget is derived from the model's window minus system prompt, user message, and an output reserve — replacing the hardcoded `_FC_HARD_CHAR_BUDGET`, a guessed 800K-token constant.

**2b. Fail-loud coverage.** `excluded_docs` is per-call, removing the racy `last_context_truncated` global entirely. Surfaced in chat answers, cell metadata, and the run summary as an "answered without: X, Y" disclosure.

**2c. Lazy embedding.** Triggered at **ingest**, not at query: when a new upload pushes a deal over budget, enqueue a backfill for that deal on the existing `IngestJobRow` queue. Embedding inline during a run would stall it.

> **Hard prerequisite:** `embedder.py:21` embeds one text at a time in a Python loop. Backfilling several thousand chunks that way is unusably slow. True batch embedding is a dependency of 2c, not a nice-to-have.

**2d. The allocator.**

```
budget   = model_window − prompt_overhead − output_reserve
size(d)  = length(full_text_md)          # cheap SQL, no blob transfer
rel(d)   = retrieval probe + category/scope priors

1. Σ size(d) ≤ budget  → every doc whole.  strategy="full_text"
                          ← small-deal case: today's behavior, exactly.
                            no embeddings, no retrieval, no quality risk

2. otherwise, rank by rel(d), then walk:
     remaining ≥ size(d) → whole doc,        remaining −= size(d)
     remaining < size(d) → retrieved pages,  remaining −= pages
     rel(d) < floor      → excluded, named

3. always reserve enough that rank-1 enters whole — one huge document
   must never consume the entire budget by arriving first
```

Full context and RAG become the two endpoints of one spend decision. **Step 1 is the guarantee** that small-deal accuracy never regresses: below the wall, retrieval never runs.

## Configuration — the escape hatch

```python
# config.py
context_strategy: str = "auto"      # "auto" | "full_text" | "retrieval"
full_context_mode: bool = True      # DEPRECATED — back-compat shim
```

**Resolution:** explicit `CONTEXT_STRATEGY` wins. Otherwise derive from `full_context_mode` — `True → full_text`, `False → retrieval`.

**Consequence, deliberate:** an existing deployment upgrades into *exactly today's behavior*, not into the allocator. Phase 2 ships dormant; enabling it is an explicit env change. For a product promising citation-grounded answers, silently changing retrieval behavior under a live customer is the wrong default. It also gives the eval a clean comparison — run the golden set under `full_text` and `auto`, diff citation accuracy, flip when the numbers earn it.

| State | Behavior |
|---|---|
| `full_text` | Never rank, never retrieve, never embed. Whole corpus every time. |
| `auto` | The Phase 2 allocator. |
| `retrieval` | Force RAG on everything. Preserves `full_context_mode=False`; useful for debugging and eval baselines. |

**One deliberate deviation from literal today-behavior:** in `full_text`, an over-budget corpus still truncates, but *names* the dropped documents in `excluded_docs` rather than dropping them silently. It never fires below the wall, so current deals are unaffected — it just means the escape hatch cannot lie either.

Per-deal override ("this fund is weird, always read everything") is an obvious future want. **Not in scope** — YAGNI.

## Known limitations

**Exhaustive questions.** "List every fee across all documents", "which quarters missed the hurdle" need *coverage*, not relevance. Top-k is structurally wrong for them, and so is any relevance floor.

Intent classification to auto-detect them is **deliberately not built** — speculative and hard to get right. The mitigation is 2b: make `excluded_docs` loud enough that a user asking an exhaustive question sees coverage was partial. A dedicated exhaustive mode is a later conversation.

**Relevance filtering as a quality mechanism.** Past some size, sending 500K tokens of irrelevant quarterly reports may degrade an answer that lives in the LPA (lost-in-the-middle). Plausible, **not asserted** — the Phase 0 eval is what would establish it.

## Testing

- **Phase 1:** golden-set answers unchanged pre/post caching — context is byte-identical, so divergence means a bug. 0a shows the cost delta.
- **Phase 2:** allocator unit tests over synthetic sizes — under budget → all whole; over → allocated; below floor → excluded *and named*. Budget arithmetic tested independently of the LLM.
- **Invariant 2 guard:** `tests/test_object_model.py::TestManagerSharedContext` must still pass. Allocation runs over the already-isolated row set, so manager isolation holds by construction — but CLAUDE.md requires extending that test when context assembly changes, and this changes it.
- **Existing flag tests** (`test_ingest_full_context.py`, `test_synthesis_context_budget.py`, `test_context_budget_guard.py`, `test_context_provider.py`) must be migrated to the enum via the back-compat shim.

## Relationship to existing plans

Implements **Plan 5 Phase B** (`docs/todo/2026-07-02-horizontal-scaling-context-cascade.md`): B1 → Phase 2a/2d, B2 → 2c, B3 → 1b, B4 → 1c (conditional), C1 → 0a.

**Plan 5 gates Phase B on Plan 4 (Postgres). That gate does not apply to this work.** B1 and B2 need nothing from Postgres — the strategy interface is in-process, and embedded ChromaDB is sufficient at single-node volumes. Only Plan 5's D3 (managed vector DB / pgvector) is a scale concern, and it is not on this path. This spec is therefore executable on the current SQLite + Chroma stack, ahead of Plan 4.

Phase 0's eval harness is new — no extraction-quality measurement exists in the repo today.

## Scope note for planning

This spec spans three phases and should **not** become one implementation plan. Phase 1's content is decided by Phase 0's measurements (1c is explicitly conditional), and Phase 2's thresholds are tunable only against Phase 0's eval.

Recommended decomposition: **Plan A = Phase 0 + 1a spike** (measurement and the caching feasibility answer), then **Plan B = Phase 1** written against real numbers, then **Plan C = Phase 2**. Writing Plan B or C now would be writing against assumptions this spec explicitly declines to make.

## Definition of done

- Token/cost per call is measured and attributable per surface and run.
- A golden-set citation-accuracy score exists and is tracked across changes.
- Caching is either landed with a measured cost reduction, or explicitly rejected with the spike's findings recorded.
- A corpus past the model window produces a **named** coverage disclosure — never a silent drop — under every value of `context_strategy`.
- `CONTEXT_STRATEGY=full_text` reproduces today's behavior.
