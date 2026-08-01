# Context allocator — question-time capacity allocation

**Date:** 2026-07-30
**Track:** context strategy — CS-C, first phase
**Parent spec:** `docs/superpowers/specs/2026-07-29-hybrid-context-strategy-design.md`
**Measurements this builds on:** `docs/superpowers/spikes/2026-07-30-cache-scaling-and-citation-baseline.md`

Replaces the two hardcoded truncation budgets with one algorithm that decides,
per document and per question, how much of each document to send.

---

## Why now, and what changed since the parent spec

The parent spec deferred CS-C behind CS-B. CS-B is answered — implicit prefix
caching holds 92% at a 71K-token prefix, so column batching is not worth its
surgery, and the cost track is closed. What follows is the capacity half.

Four findings reshape the parent spec's Phase 2:

**1. Everything is already embedded.** `vector_store.upsert_chunks` runs
unconditionally at ingest with no `full_context_mode` guard — 4,913 vectors
across 7 deals, including all 4,605 Activision chunks. The parent spec's **2c
(lazy embedding) is therefore moot**: retrieval is available for any deal at
any moment, and the allocator's relevance probe needs no new infrastructure.
Batch embedding remains a real inefficiency (`embedder.py` embeds one text at
a time; 182 sequential calls for 13 documents) but it is a performance fix, not
a prerequisite.

**2. The budget is implemented twice.**

| location | constant | governs |
|---|---|---|
| `context_provider._FC_HARD_CHAR_BUDGET` | `3_200_000` | `load_deal_context` — chat, query, stream |
| `workflow_run_executor._SYNTHESIS_CHAR_BUDGET` | `3_200_000` | `multi_doc_synthesis` cells — tabular runs |

Two copies of the same guessed number, two independent truncation
implementations, both silent, both dropping in document order. The synthesis
path never calls `load_deal_context` — it loops `load_doc_context` per document
and truncates locally — so an allocator installed only in `context_provider`
would miss the highest-volume LLM path in the product.

**3. Only 2 of the 15 call sites assemble multiple documents.** The parent
spec's 2a proposed changing the return type at all 15 invocations across 6
modules. Thirteen of those are single-document paths where ranking and
exclusion are meaningless. Scope narrows accordingly.

**4. `last_context_truncated` is dead code.** Assigned in `context_provider`,
read nowhere in `app/`. Coverage disclosure is net-new surfacing, not the
replacement of a working mechanism.

---

## Decisions

| # | Decision | Rejected alternative |
|---|---|---|
| D1 | **Per-document allocator.** Whole doc while budget lasts, retrieved pages when it doesn't, excluded below a relevance floor. | Binary per-request router (corpus fits → full text, else → RAG). One oversized document would shatter the other fifty-nine into fragments. Already rejected by the parent spec; re-confirmed. |
| D2 | **`rel(d)` = retrieval probe, with category priors as a floor guard.** Ranking stays query-driven; priors only make catastrophic exclusion unreachable. | Pure probe (a weak probe can drop a governing document with nothing to catch it). Weighted priors (every weight is a number nobody can justify, and the saturated eval cannot tell a good set from a bad one). |
| D3 | **Budget from `min(primary_window, fallback_window)`**, queried from the provider and cached. | Primary-only with re-packing on fallback (adds allocator work to the fragile pre-first-token fallback path). A hand-set constant (the same class of guess as `3_200_000`, just relocated). |
| D4 | **Shared allocator wired into both multi-document assemblers**, 13 single-doc sites untouched. | `context_provider` only (leaves the volume path on a divergent duplicate budget). Full 2a everywhere (13 sites gain a return type they have no use for). |
| D5 | **Injectable budget: unit tests + one real-corpus integration test.** | Synthetic multi-megabyte over-budget fixture (slow, and duplicate content makes ranking degenerate). Unit tests alone (never proves the wiring). |
| D6 | **`context_strategy` defaults to `auto`.** | Ship dormant. **This deviates from the parent spec** — see below. |

### D6 deviation, stated plainly

The parent spec says `auto` ships dormant: "an existing deployment upgrades
into *exactly* today's behavior, not into the allocator… For a product
promising citation-grounded answers, silently changing retrieval behavior under
a live customer is the wrong default."

That caution is judged unnecessary here because **step 1 of the algorithm makes
below-budget behavior byte-identical**, and the largest deal in the corpus is
1,401,287 chars against a 3,200,000 budget — nothing is within a factor of two
of the wall. Enabling `auto` is unobservable today. Shipping dormant would mean
the algorithm's first real execution happens on whichever customer corpus
crosses the line first, having never run before.

Decided by the project owner on 2026-07-30. `full_text` and `retrieval` remain
available as explicit overrides.

---

## Architecture

New module `app/services/context_allocator.py`. One type, one entry point, two
callers.

```python
@dataclass(frozen=True)
class ContextSelection:
    chunks: list[dict]          # what to send, unchanged shape
    whole_docs: list[str]       # doc_ids included in full
    partial_docs: list[str]     # doc_ids included as retrieved pages only
    excluded_docs: list[str]    # doc_ids not consulted — surfaced to the user
    strategy: str               # "full_text" | "allocated" | "retrieval"
```

`chunks` keeps the existing `list[dict]` shape so neither caller has to change
how it assembles a prompt. The other four fields are additive.

### Budget resolution

```
window = min(get_model(gemini_model).input_token_limit,
             get_model(gemini_fallback_model).input_token_limit)
budget = window − prompt_overhead − settings.max_tokens − safety_margin
```

where:

- **`prompt_overhead`** — measured per call, not assumed: the rendered system
  prompt plus the user message, converted at the same chars/token ratio. It
  varies by surface (a tabular cell's prompt is longer than a chat question),
  so it is passed in by the caller rather than constant.
- **`settings.max_tokens`** — 4096, the existing `max_output_tokens`.
- **`safety_margin`** — a flat 5% of `window`, absorbing the chars/token
  approximation and any per-request tokens neither term accounts for.

Resolved once per process and cached. `min()` of the two windows is what makes
a mid-request two-tier fallback incapable of overflowing a context that was
packed for the primary model. On metadata failure, falls back to
`settings.context_window_tokens`.

Document sizes come from `LENGTH(full_text_md)` in SQL — no blob transfer, as
the parent spec requires. Chars convert to tokens at 4.0, which measurement
shows is conservative: the 10-Q is 347,855 chars and billed 71,240 prompt
tokens, i.e. 4.88 chars/token on real filing prose. Over-estimating token count
is the safe direction for a budget.

### The algorithm

```
1. Σ size(d) ≤ budget
     → every document whole, strategy="full_text", NO PROBE ISSUED
       ← the guarantee: below the wall, no new behavior executes at all

2. otherwise:
     probe once (a single query_deal call), best-chunk similarity by doc_id
     rank by probe score
     walk the budget:
       remaining ≥ size(d)  → whole document,   remaining −= size(d)
       remaining < size(d)  → retrieved pages,  remaining −= pages
       rel(d) < floor       → excluded, named

3. category floor: lpa, side_letter, form_adv may be demoted to pages
   but are never excluded

4. always reserve enough that rank-1 enters whole — one huge document
   must not consume the budget by sorting first
```

Step 1 is what protects existing accuracy: below the wall, retrieval never
runs, so there is no quality risk to the deals that exist today.

### Wiring

Two call sites converge on `allocate()`:

- `context_provider.load_deal_context` — chat, query, stream
- the `workflow_run_executor` synthesis loop — tabular runs, the volume path

`_FC_HARD_CHAR_BUDGET` and `_SYNTHESIS_CHAR_BUDGET` are both deleted. The 13
single-document call sites (`load_doc_context`, `get_doc_page_chunks`) are
unchanged.

---

## Failure behavior

These are the hardening rules, and they matter more than the happy path.

- **Model metadata unavailable** → configured `context_window_tokens`; the
  allocator still runs.
- **Probe fails or returns nothing** → no document is ever excluded. Fall back
  to document order and budget-cap only. A retrieval outage silently dropping a
  governing document is the single worst failure this system can have, and it
  is made unreachable rather than unlikely.
- **Document absent from the probe results** → *unscored*, never score 0.
  `query_deal` returns at most `settings.top_k` chunks (default 20), and
  several may come from the same document, so on a large corpus most documents
  will simply not appear. Absence is not evidence of irrelevance. Unscored
  documents rank below scored ones but are still walked by the budget and can
  never be excluded on absence alone — only an explicit low score can exclude.
  The probe additionally raises `top_k` to `max(settings.top_k, 5 × len(rows))`
  so that on realistic corpora most documents do get a real score.

  *(Added 2026-07-30 during implementation planning. Same principle as the
  probe-failure rule above, applied to a case the original draft missed.)*
- **`strategy="full_text"` forced on an over-budget corpus** → still truncates,
  but names what it dropped in `excluded_docs`. The escape hatch is not
  permitted to lie either.
- **Manager-shared documents** are allocated within the already-isolated row
  set, so CLAUDE.md invariant 2 holds by construction — but the guard test is
  extended anyway, as the invariant requires.

## Coverage surfacing

`excluded_docs` replaces `last_context_truncated`, which is currently dead. The
backend returns it on query and stream responses and in cell metadata, so the
information is available and honest. **Visual treatment is deferred** to a
frontend follow-up — that is a product-copy decision, not a backend one.

What is not acceptable, and is explicitly ruled out, is shipping exclusion that
is as silent as today's truncation. Exclusion is a deliberate choice by the
system and must be visible in the payload from day one.

## Configuration

```python
context_strategy: str = "auto"          # "auto" | "full_text" | "retrieval"
context_window_tokens: int = ...        # fallback only; see below
full_context_mode: bool = True          # DEPRECATED — back-compat shim
```

> **`context_window_tokens` has no default yet.** It is the floor used when
> the provider metadata call fails, so it must be a real published figure for
> `gemini-3-flash-preview` (the smaller of the two models), read from the model
> documentation at implementation time. It is deliberately left unset here
> rather than guessed — an invented window is exactly the failure the
> `3_200_000` constant represents. First task of the implementation plan.

Note the string `"full_text"` appears in two roles: as a *requested*
`context_strategy` and as the *resulting* `ContextSelection.strategy`. Under
`auto`, a corpus that fits reports `strategy="full_text"` because that is what
actually happened. The request is what the operator asked for; the selection is
what the allocator did.

Resolution: explicit `CONTEXT_STRATEGY` wins. Otherwise derive from
`full_context_mode` (`True → full_text`, `False → retrieval`) so existing
deployments and the existing flag tests keep working.

| value | behavior |
|---|---|
| `auto` | the allocator (default) |
| `full_text` | never rank, never probe; whole corpus every time, truncating loudly if over |
| `retrieval` | force RAG on everything; preserves `full_context_mode=False`, useful for eval baselines |

## Testing

**Unit — injected budget, no API, deterministic**

- under budget → all whole, `strategy="full_text"`, probe never called
- over budget → ranked, walked, demoted correctly
- below floor → excluded **and named**
- category floor → an `lpa` is demoted but never excluded
- rank-1 oversized → still enters whole
- probe raises → nothing excluded

**Integration — real documents, artificially small budget**

`brightwater_iv` at a budget small enough that real documents are demoted and
excluded, proving doc rows, Chroma probes and page chunks flow through end to
end.

**Regression**

- every existing deal allocates all-whole (today's behavior preserved)
- `tests/test_object_model.py::TestManagerSharedContext` extended and passing
- existing flag tests (`test_ingest_full_context.py`,
  `test_synthesis_context_budget.py`, `test_context_budget_guard.py`,
  `test_context_provider.py`) migrated to the enum via the shim

The citation eval scores 1.000 and can only prove non-regression, never
improvement. That is the correct instrument for this change — the requirement
is that the allocator not degrade accuracy — but it cannot be used to tune the
relevance floor. The floor is therefore set conservatively and left alone.

## Out of scope

- **2c lazy embedding** — moot; everything is already embedded
- **Batch embedding in `embedder.py`** — real inefficiency, separate fix
- **The 13 single-document call sites**
- **UI treatment of `excluded_docs`** — frontend follow-up
- **Cold-window cache work** — the other open item from the CS-B measurement
- **Intent classification for exhaustive questions** — the parent spec rules
  this out as speculative; `excluded_docs` visibility is the mitigation

## Known limitations

**Exhaustive questions** ("list every fee across all documents") need coverage,
not relevance. Top-k is structurally wrong for them and so is any relevance
floor. The mitigation is that `excluded_docs` is loud enough that a user asking
one sees coverage was partial.

**The relevance floor is untunable with current instruments.** The eval is
saturated; there is no data that distinguishes a good floor from a bad one.
Hence the category floor guard, which makes the floor's worst mistake
unreachable rather than merely improbable.

**No corpus can currently reach the budget**, so the over-budget path ships
having been exercised only under an injected budget. This is a real risk and
the reason D6 (default `auto`) was chosen over shipping dormant — at least the
code path is reachable and observable in development.
