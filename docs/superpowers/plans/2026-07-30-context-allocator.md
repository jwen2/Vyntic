# Context Allocator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two hardcoded 3.2M-char truncation budgets with one algorithm that decides, per document and per question, how much of each document to send.

**Architecture:** A new pure-function allocator (`context_allocator.py`) ranks documents by a Chroma relevance probe and walks a token budget — whole document while it fits, retrieved pages when it doesn't, excluded (and named) below a floor. Budget comes from the provider's own model metadata rather than a constant. Two multi-document assembly points call it; the thirteen single-document call sites are untouched.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy, ChromaDB, `google-generativeai`, pytest.

**Spec:** `docs/superpowers/specs/2026-07-30-context-allocator-design.md`

## Global Constraints

- All commands run from `backend/`. The venv is `backend/.venv` (`.venv/Scripts/python.exe` on Windows).
- **Always pass a scratch `DATABASE_URL` when running pytest** — a bare run wipes the dev SQLite database, which holds the seeded Brightwater corpus. Use:
  `DATABASE_URL="sqlite:///<scratch>/test.db" .venv/Scripts/python.exe -m pytest -q`
- Do **not** set `ALLOW_INSECURE_DEFAULTS` when running the full suite — it makes `tests/test_prod_secrets_guard.py` fail. `backend/.env` already supplies real secrets.
- Schema migrations are additive-only. This plan adds no columns and no tables.
- CLAUDE.md invariant 2: context isolation. Nothing may cross a manager boundary. `tests/test_object_model.py::TestManagerSharedContext` must pass and is extended in Task 8.
- CLAUDE.md invariant 5: one LLM primitive. This plan adds no new LLM call path.
- Existing chunk dicts have the shape `{content, source_file, page, doc_id, score, section_type}`. Do not change it.
- `context_strategy` defaults to `"auto"` (spec D6, deliberate deviation from the parent spec).
- Category floor list is exactly `{"lpa", "side_letter", "form_adv"}`. Do not add to it without a spec change.

---

### Task 1: Resolve the real model window

The budget must come from the provider, not a guess. `genai.get_model()` exposes `input_token_limit`. The fallback constant must be a real published figure, so step 1 reads it from the API rather than inventing it.

**Files:**
- Create: `backend/app/services/context_budget.py`
- Modify: `backend/app/config.py` (add `context_window_tokens`, `context_strategy`)
- Test: `backend/tests/test_context_budget.py`

**Interfaces:**
- Consumes: `settings.gemini_model`, `settings.gemini_fallback_model`, `settings.max_tokens`
- Produces:
  - `resolve_window() -> int` — cached; `min()` of both models' input limits
  - `budget_tokens(prompt_overhead_chars: int) -> int`
  - `chars_to_tokens(n: int) -> int` and `CHARS_PER_TOKEN = 4.0`

- [x] **Step 1: Read the real limits from the provider and record them**

Run:
```bash
PYTHONIOENCODING=utf-8 PYTHONPATH=. .venv/Scripts/python.exe -c "
import google.generativeai as genai
from app.config import settings
genai.configure(api_key=settings.gemini_api_key)
for m in (settings.gemini_model, settings.gemini_fallback_model):
    info = genai.get_model(f'models/{m}')
    print(m, 'input:', info.input_token_limit, 'output:', info.output_token_limit)
"
```

This makes one metadata call per model (not a generation call). Write the **smaller** `input_token_limit` down — it becomes the `context_window_tokens` default in Step 3. If the call fails (no network/quota), use the published limit from the Gemini model documentation for `gemini-3-flash-preview`. Do not guess.

- [x] **Step 2: Write the failing test**

```python
# backend/tests/test_context_budget.py
import pytest
from app.services import context_budget


def test_window_is_min_of_both_models(monkeypatch):
    monkeypatch.setattr(context_budget, "_fetch_input_limit",
                        lambda name: {"primary": 1_000_000, "fallback": 400_000}[name])
    monkeypatch.setattr(context_budget.settings, "gemini_model", "primary")
    monkeypatch.setattr(context_budget.settings, "gemini_fallback_model", "fallback")
    context_budget.resolve_window.cache_clear()
    assert context_budget.resolve_window() == 400_000


def test_window_falls_back_to_config_when_metadata_fails(monkeypatch):
    def boom(name):
        raise RuntimeError("no network")
    monkeypatch.setattr(context_budget, "_fetch_input_limit", boom)
    monkeypatch.setattr(context_budget.settings, "context_window_tokens", 123_456)
    context_budget.resolve_window.cache_clear()
    assert context_budget.resolve_window() == 123_456


def test_budget_subtracts_overhead_reserve_and_margin(monkeypatch):
    monkeypatch.setattr(context_budget, "resolve_window", lambda: 100_000)
    monkeypatch.setattr(context_budget.settings, "max_tokens", 4_000)
    # overhead 4000 chars -> 1000 tokens; margin 5% of 100_000 = 5_000
    assert context_budget.budget_tokens(4_000) == 100_000 - 1_000 - 4_000 - 5_000


def test_chars_to_tokens_is_conservative():
    # 4.0 chars/token over-estimates tokens vs the measured 4.88 — safe direction
    assert context_budget.chars_to_tokens(4_000) == 1_000
```

- [x] **Step 3: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/Scripts/python.exe -m pytest tests/test_context_budget.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.context_budget'`

- [x] **Step 4: Add the config settings**

In `backend/app/config.py`, alongside the existing `full_context_mode` (line ~66):

```python
    # Context strategy. "auto" runs the allocator; "full_text" and "retrieval"
    # are explicit overrides. full_context_mode is the deprecated shim.
    context_strategy: str = "auto"
    # Fallback window used only when the provider metadata call fails.
    # Value recorded from genai.get_model() — see plan Task 1 Step 1.
    context_window_tokens: int = <value recorded in Step 1>
```

Replace `<value recorded in Step 1>` with the integer from Step 1. This is the one number in the plan that cannot be written ahead of time, because inventing it would reproduce exactly the failure `_FC_HARD_CHAR_BUDGET = 3_200_000` represents.

- [x] **Step 5: Write the implementation**

```python
# backend/app/services/context_budget.py
"""Token budget derivation.

The window is asked of the provider rather than hardcoded, and is the MINIMUM
of the primary and fallback models: stream_with_fallback can switch models
mid-request, so a context packed for the larger window would overflow the
smaller one after the packing decision was already made.
"""
import logging
from functools import lru_cache

from app.config import settings

logger = logging.getLogger(__name__)

CHARS_PER_TOKEN = 4.0  # measured 4.88 on real filing prose; 4.0 over-estimates
SAFETY_MARGIN_FRACTION = 0.05


def chars_to_tokens(n: int) -> int:
    return int(n / CHARS_PER_TOKEN)


def _fetch_input_limit(model_name: str) -> int:
    import google.generativeai as genai
    info = genai.get_model(f"models/{model_name}")
    return int(info.input_token_limit)


@lru_cache(maxsize=1)
def resolve_window() -> int:
    """Smaller of the two models' input windows. Cached for process lifetime."""
    try:
        limits = [
            _fetch_input_limit(settings.gemini_model),
            _fetch_input_limit(settings.gemini_fallback_model),
        ]
        return min(limits)
    except Exception as exc:
        logger.warning(
            "Model metadata unavailable (%s) — falling back to "
            "context_window_tokens=%d", exc, settings.context_window_tokens,
        )
        return settings.context_window_tokens


def budget_tokens(prompt_overhead_chars: int) -> int:
    """Tokens available for document context on this call."""
    window = resolve_window()
    margin = int(window * SAFETY_MARGIN_FRACTION)
    return window - chars_to_tokens(prompt_overhead_chars) - settings.max_tokens - margin


def resolved_strategy() -> str:
    """One place that decides the effective strategy.

    Explicit CONTEXT_STRATEGY wins; otherwise derive from the deprecated
    full_context_mode shim so existing deployments and flag tests keep working.
    Tasks 4 and 6 both call this rather than re-deriving the condition.
    """
    explicit = (settings.context_strategy or "").strip().lower()
    if explicit in {"auto", "full_text", "retrieval"}:
        return explicit
    return "full_text" if settings.full_context_mode else "retrieval"
```

Add a test for it in the same file:

```python
def test_resolved_strategy_prefers_explicit_setting(monkeypatch):
    monkeypatch.setattr(context_budget.settings, "context_strategy", "retrieval")
    monkeypatch.setattr(context_budget.settings, "full_context_mode", True)
    assert context_budget.resolved_strategy() == "retrieval"


def test_resolved_strategy_falls_back_to_the_deprecated_flag(monkeypatch):
    monkeypatch.setattr(context_budget.settings, "context_strategy", "")
    monkeypatch.setattr(context_budget.settings, "full_context_mode", False)
    assert context_budget.resolved_strategy() == "retrieval"
```

- [x] **Step 6: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/Scripts/python.exe -m pytest tests/test_context_budget.py -q`
Expected: PASS, 4 passed

- [x] **Step 7: Commit**

```bash
git add backend/app/services/context_budget.py backend/app/config.py backend/tests/test_context_budget.py
git commit -m "feat(context): derive token budget from provider model metadata"
```

---

### Task 2: The allocator, as a pure function

The core algorithm, with no I/O. Budget and probe scores are parameters, which is what makes the over-budget path testable without a corpus that can reach the real budget.

**Files:**
- Create: `backend/app/services/context_allocator.py`
- Test: `backend/tests/test_context_allocator.py`

**Interfaces:**
- Consumes: `context_budget.chars_to_tokens`
- Produces:
  - `ContextSelection` dataclass with fields `chunks: list[dict]`, `whole_docs: list[str]`, `partial_docs: list[str]`, `excluded_docs: list[str]`, `strategy: str`
  - `CATEGORY_FLOOR: frozenset[str]`
  - `RELEVANCE_FLOOR: float`
  - `allocate(docs: list[DocCandidate], budget: int, scores: dict[str, float] | None) -> ContextSelection`
  - `DocCandidate` dataclass: `doc_id: str`, `filename: str`, `category: str`, `size_chars: int`, `whole_chunks: list[dict]`, `page_chunks: list[dict]`

- [x] **Step 1: Write the failing tests**

```python
# backend/tests/test_context_allocator.py
from app.services.context_allocator import (
    ContextSelection, DocCandidate, allocate, RELEVANCE_FLOOR,
)


def _doc(doc_id, size, category="other", pages=1):
    """size_chars drives allocation; chunks carry proportional content."""
    whole = [{"content": "x" * size, "source_file": f"{doc_id}.pdf",
              "page": 1, "doc_id": doc_id, "score": 1.0, "section_type": "text"}]
    page = [{"content": "x" * (size // 4), "source_file": f"{doc_id}.pdf",
             "page": 1, "doc_id": doc_id, "score": 0.5, "section_type": "text"}]
    return DocCandidate(doc_id=doc_id, filename=f"{doc_id}.pdf", category=category,
                        size_chars=size, whole_chunks=whole, page_chunks=page)


def test_under_budget_sends_everything_whole_and_never_probes():
    docs = [_doc("a", 400), _doc("b", 400)]
    sel = allocate(docs, budget=10_000, scores=None)
    assert sel.strategy == "full_text"
    assert sel.whole_docs == ["a", "b"]
    assert sel.partial_docs == []
    assert sel.excluded_docs == []


def test_over_budget_demotes_lowest_ranked_to_pages():
    # budget 250 tokens = 1000 chars. a(800) whole, b(800) cannot fit whole.
    docs = [_doc("a", 800), _doc("b", 800)]
    sel = allocate(docs, budget=250, scores={"a": 0.9, "b": 0.2})
    assert sel.strategy == "allocated"
    assert sel.whole_docs == ["a"]
    assert sel.partial_docs == ["b"]


def test_below_floor_is_excluded_and_named():
    docs = [_doc("a", 800), _doc("junk", 800)]
    sel = allocate(docs, budget=250, scores={"a": 0.9, "junk": RELEVANCE_FLOOR / 2})
    assert sel.excluded_docs == ["junk"]
    assert all(c["doc_id"] != "junk" for c in sel.chunks)


def test_category_floor_prevents_exclusion_of_governing_documents():
    docs = [_doc("a", 800), _doc("thelpa", 800, category="lpa")]
    sel = allocate(docs, budget=250, scores={"a": 0.9, "thelpa": RELEVANCE_FLOOR / 2})
    assert "thelpa" not in sel.excluded_docs
    assert "thelpa" in sel.partial_docs


def test_rank_one_always_enters_whole_even_if_oversized():
    # single doc larger than the whole budget still goes in whole
    docs = [_doc("huge", 100_000)]
    sel = allocate(docs, budget=250, scores={"huge": 0.9})
    assert sel.whole_docs == ["huge"]


def test_unscored_documents_are_never_excluded_on_absence():
    # "b" is absent from probe results entirely — must not be treated as 0
    docs = [_doc("a", 800), _doc("b", 800)]
    sel = allocate(docs, budget=250, scores={"a": 0.9})
    assert sel.excluded_docs == []
    assert "b" in sel.partial_docs


def test_probe_failure_excludes_nothing():
    docs = [_doc("a", 800), _doc("b", 800)]
    sel = allocate(docs, budget=250, scores=None)
    assert sel.excluded_docs == []
```

- [x] **Step 2: Run tests to verify they fail**

Run: `PYTHONPATH=. .venv/Scripts/python.exe -m pytest tests/test_context_allocator.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.context_allocator'`

- [x] **Step 3: Write the implementation**

```python
# backend/app/services/context_allocator.py
"""Per-document context allocation.

Decides, per question, how much of each document to send: whole while the
budget lasts, retrieved pages when it does not, excluded (and named) below a
relevance floor. Below budget it does nothing at all — every document goes in
whole and no probe is issued, which is byte-for-byte today's behavior.

Pure function: budget and probe scores are parameters, so the over-budget path
is testable without a corpus large enough to reach the real budget.
"""
import logging
from dataclasses import dataclass, field

from app.services.context_budget import chars_to_tokens

logger = logging.getLogger(__name__)

# Documents whose absence would invalidate an answer. They may be demoted to
# retrieved pages, but are never excluded on a weak probe score.
CATEGORY_FLOOR = frozenset({"lpa", "side_letter", "form_adv"})

# Deliberately conservative: the citation eval is saturated at 1.000 and cannot
# distinguish a good floor from a bad one, so this is set low and left alone.
RELEVANCE_FLOOR = 0.15

# Sentinel for documents the probe never returned. Absence is not evidence of
# irrelevance — query_deal returns at most top_k chunks, so on a large corpus
# most documents simply do not appear.
UNSCORED = -1.0


@dataclass(frozen=True)
class DocCandidate:
    doc_id: str
    filename: str
    category: str
    size_chars: int
    whole_chunks: list[dict]
    page_chunks: list[dict]


@dataclass(frozen=True)
class ContextSelection:
    chunks: list[dict] = field(default_factory=list)
    whole_docs: list[str] = field(default_factory=list)
    partial_docs: list[str] = field(default_factory=list)
    excluded_docs: list[str] = field(default_factory=list)
    strategy: str = "full_text"


def allocate(
    docs: list[DocCandidate],
    budget: int,
    scores: dict[str, float] | None,
) -> ContextSelection:
    """Allocate `docs` against a token `budget` using probe `scores`.

    `scores=None` means the probe failed or was not run; nothing is excluded.
    """
    if not docs:
        return ContextSelection()

    total_tokens = chars_to_tokens(sum(d.size_chars for d in docs))
    if total_tokens <= budget:
        # Step 1 guarantee: below the wall nothing new happens.
        return ContextSelection(
            chunks=[c for d in docs for c in d.whole_chunks],
            whole_docs=[d.doc_id for d in docs],
            strategy="full_text",
        )

    probe_failed = scores is None
    scores = scores or {}
    ranked = sorted(
        docs,
        key=lambda d: scores.get(d.doc_id, UNSCORED),
        reverse=True,
    )

    chunks: list[dict] = []
    whole: list[str] = []
    partial: list[str] = []
    excluded: list[str] = []
    remaining = budget

    for rank, doc in enumerate(ranked):
        score = scores.get(doc.doc_id, UNSCORED)
        size = chars_to_tokens(doc.size_chars)

        may_exclude = (
            not probe_failed
            and score != UNSCORED          # absent from probe -> never excluded
            and score < RELEVANCE_FLOOR
            and doc.category not in CATEGORY_FLOOR
        )
        if may_exclude:
            excluded.append(doc.doc_id)
            continue

        # Rank 1 always enters whole: one huge document must never consume the
        # budget by sorting first, and the top-ranked document is the one the
        # question is most likely about.
        if rank == 0 or remaining >= size:
            chunks.extend(doc.whole_chunks)
            whole.append(doc.doc_id)
            remaining -= size
        else:
            chunks.extend(doc.page_chunks)
            partial.append(doc.doc_id)
            remaining -= chars_to_tokens(
                sum(len(c.get("content", "")) for c in doc.page_chunks)
            )

    if excluded:
        logger.warning(
            "Context allocation excluded %d of %d documents: %s",
            len(excluded), len(docs), ", ".join(sorted(excluded)),
        )

    return ContextSelection(
        chunks=chunks,
        whole_docs=whole,
        partial_docs=partial,
        excluded_docs=excluded,
        strategy="allocated",
    )
```

- [x] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/Scripts/python.exe -m pytest tests/test_context_allocator.py -q`
Expected: PASS, 7 passed

- [x] **Step 5: Commit**

```bash
git add backend/app/services/context_allocator.py backend/tests/test_context_allocator.py
git commit -m "feat(context): add per-document context allocator"
```

---

### Task 3: The relevance probe

Wraps `query_deal` into a `{doc_id: score}` map. `query_deal` already returns `doc_id` (the docstring is stale — verify at line ~133 of `vector_store.py`).

**Files:**
- Modify: `backend/app/services/context_allocator.py` (add `probe_scores`)
- Test: `backend/tests/test_context_allocator_probe.py`

**Interfaces:**
- Consumes: `vector_store.query_deal(deal_id, query_text, top_k)`
- Produces: `async probe_scores(deal_id: str, question: str, doc_count: int) -> dict[str, float] | None` — returns `None` on any failure

- [x] **Step 1: Write the failing test**

```python
# backend/tests/test_context_allocator_probe.py
import pytest
from app.services import context_allocator


@pytest.mark.asyncio
async def test_probe_takes_best_score_per_document(monkeypatch):
    async def fake_query_deal(deal_id, query_text, top_k=None):
        return [
            {"doc_id": "a", "score": 0.4, "content": "x"},
            {"doc_id": "a", "score": 0.9, "content": "y"},   # best for a
            {"doc_id": "b", "score": 0.3, "content": "z"},
        ]
    monkeypatch.setattr(context_allocator, "_query_deal", fake_query_deal)
    scores = await context_allocator.probe_scores("d1", "q", doc_count=2)
    assert scores == {"a": 0.9, "b": 0.3}


@pytest.mark.asyncio
async def test_probe_raises_top_k_with_document_count(monkeypatch):
    seen = {}
    async def fake_query_deal(deal_id, query_text, top_k=None):
        seen["top_k"] = top_k
        return []
    monkeypatch.setattr(context_allocator, "_query_deal", fake_query_deal)
    await context_allocator.probe_scores("d1", "q", doc_count=60)
    assert seen["top_k"] >= 300   # 5 * 60


@pytest.mark.asyncio
async def test_probe_returns_none_on_failure(monkeypatch):
    async def boom(deal_id, query_text, top_k=None):
        raise RuntimeError("chroma down")
    monkeypatch.setattr(context_allocator, "_query_deal", boom)
    assert await context_allocator.probe_scores("d1", "q", doc_count=2) is None
```

- [x] **Step 2: Run test to verify it fails**

Run: `PYTHONPATH=. .venv/Scripts/python.exe -m pytest tests/test_context_allocator_probe.py -q`
Expected: FAIL — `AttributeError: module 'app.services.context_allocator' has no attribute 'probe_scores'`

- [x] **Step 3: Write the implementation**

Append to `backend/app/services/context_allocator.py`:

```python
from app.config import settings

PROBE_CHUNKS_PER_DOC = 5


async def _query_deal(deal_id: str, query_text: str, top_k: int | None = None):
    """Indirection so tests can substitute the vector store."""
    from app.services.vector_store import query_deal
    return await query_deal(deal_id, query_text, top_k=top_k)


async def probe_scores(
    deal_id: str, question: str, doc_count: int
) -> dict[str, float] | None:
    """Best-chunk similarity per doc_id. Returns None if the probe fails.

    top_k is raised with the document count: query_deal defaults to 20 chunks,
    several of which typically come from the same document, so on a large
    corpus most documents would never appear at all.
    """
    top_k = max(settings.top_k, PROBE_CHUNKS_PER_DOC * doc_count)
    try:
        rows = await _query_deal(deal_id, question, top_k=top_k)
    except Exception as exc:
        logger.warning(
            "Relevance probe failed for deal %s (%s) — allocating without "
            "ranking; nothing will be excluded", deal_id, exc,
        )
        return None

    best: dict[str, float] = {}
    for row in rows:
        doc_id = row.get("doc_id") or ""
        if not doc_id:
            continue
        score = float(row.get("score", 0.0))
        if score > best.get(doc_id, float("-inf")):
            best[doc_id] = score
    return best
```

- [x] **Step 4: Run test to verify it passes**

Run: `PYTHONPATH=. .venv/Scripts/python.exe -m pytest tests/test_context_allocator_probe.py -q`
Expected: PASS, 3 passed

- [x] **Step 5: Commit**

```bash
git add backend/app/services/context_allocator.py backend/tests/test_context_allocator_probe.py
git commit -m "feat(context): add relevance probe with absence-safe scoring"
```

---

### Task 4: Wire the allocator into `load_deal_context`

Replaces `_FC_HARD_CHAR_BUDGET` truncation in the chat/query/stream path.

**Files:**
- Modify: `backend/app/services/context_provider.py:124-205` (`load_deal_context`), delete `_FC_HARD_CHAR_BUDGET` (line 19) and `last_context_truncated` (line 23)
- Test: `backend/tests/test_context_provider_allocation.py`

**Interfaces:**
- Consumes: `allocate`, `probe_scores`, `DocCandidate`, `budget_tokens`
- Produces: `load_deal_context(deal_id, question) -> list[dict]` (unchanged signature), plus `load_deal_selection(deal_id, question) -> ContextSelection` for callers that want coverage data

- [x] **Step 1: Write the failing test**

```python
# backend/tests/test_context_provider_allocation.py
import pytest
from app.services import context_provider


@pytest.mark.asyncio
async def test_small_deal_returns_every_document_whole(client, seeded_small_deal):
    """Below budget: identical to pre-allocator behavior."""
    sel = await context_provider.load_deal_selection(
        seeded_small_deal, "what is the management fee?"
    )
    assert sel.strategy == "full_text"
    assert sel.excluded_docs == []
    assert sel.partial_docs == []


@pytest.mark.asyncio
async def test_load_deal_context_still_returns_a_chunk_list(client, seeded_small_deal):
    chunks = await context_provider.load_deal_context(seeded_small_deal, "fee?")
    assert isinstance(chunks, list)
    assert all("content" in c and "page" in c for c in chunks)
```

Add to `backend/tests/conftest.py` if not present:

```python
@pytest.fixture
def seeded_small_deal(client):
    """A deal with two small documents, well under any budget."""
    from app.services import deal_store
    from app.models.deal import DealCreate
    from app.models.document import DocumentMetadata
    deal_store.create_deal(DealCreate(deal_id="alloc_small", name="Alloc Small",
                                      description="", stage="Screening", tags=[]))
    for i in (1, 2):
        deal_store.add_document("alloc_small", DocumentMetadata(
            doc_id=f"alloc_doc_{i}", filename=f"doc{i}.pdf", page_count=1,
            chunk_count=1, full_text_md=f"## Page 1\n\nSmall body {i}.",
        ))
    return "alloc_small"
```

- [x] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL="sqlite:///<scratch>/t.db" PYTHONPATH=. .venv/Scripts/python.exe -m pytest tests/test_context_provider_allocation.py -q`
Expected: FAIL — `AttributeError: module 'app.services.context_provider' has no attribute 'load_deal_selection'`

- [x] **Step 3: Replace the truncation block**

In `backend/app/services/context_provider.py`, delete lines 19 (`_FC_HARD_CHAR_BUDGET`) and 21-23 (the `last_context_truncated` comment and assignment). Then replace the body of `load_deal_context` from the `global last_context_truncated` line (167) through the `return kept` / trailing warning block with a call to the new function, and add:

```python
async def load_deal_selection(deal_id: str, question: str) -> "ContextSelection":
    """Deal-level context as a ContextSelection, with coverage information."""
    from app.services.context_allocator import (
        ContextSelection, DocCandidate, allocate, probe_scores,
    )
    from app.services.context_budget import budget_tokens

    from app.services.context_budget import resolved_strategy
    strategy = resolved_strategy()

    if strategy == "retrieval":
        from app.services.vector_store import query_deal
        return ContextSelection(
            chunks=await query_deal(deal_id, question), strategy="retrieval",
        )

    rows = _load_deal_doc_rows(deal_id)          # extracted from lines 134-141
    if not rows:
        return ContextSelection()

    candidates: list[DocCandidate] = []
    for row in rows:
        whole = _full_text_to_chunks(row.full_text_md or "", row.filename, row.doc_id)
        if not whole:
            continue
        candidates.append(DocCandidate(
            doc_id=row.doc_id,
            filename=row.filename,
            category=row.doc_category or "other",
            size_chars=len(row.full_text_md or ""),
            whole_chunks=whole,
            page_chunks=whole,   # replaced with retrieved pages in Task 5
        ))

    budget = budget_tokens(prompt_overhead_chars=len(question) + _SYSTEM_PROMPT_CHARS)
    total = sum(c.size_chars for c in candidates)
    scores = None
    if chars_to_tokens(total) > budget:
        scores = await probe_scores(deal_id, question, doc_count=len(candidates))

    if strategy == "full_text":
        # Explicit override: no ranking, but still name what had to be dropped.
        scores = None

    return allocate(candidates, budget=budget, scores=scores)


async def load_deal_context(deal_id: str, question: str) -> list[dict]:
    """Backwards-compatible chunk list. See load_deal_selection for coverage."""
    return (await load_deal_selection(deal_id, question)).chunks
```

Add near the top: `_SYSTEM_PROMPT_CHARS = 2000  # conservative allowance for the rendered system prompt` and `from app.services.context_budget import chars_to_tokens`.

Extract lines 134-141 into `_load_deal_doc_rows(deal_id) -> list[DocumentRow]`, preserving the `_manager_shared_doc_rows` call exactly — invariant 2 depends on it.

- [x] **Step 4: Run test to verify it passes**

Run: `DATABASE_URL="sqlite:///<scratch>/t.db" PYTHONPATH=. .venv/Scripts/python.exe -m pytest tests/test_context_provider_allocation.py -q`
Expected: PASS, 2 passed

- [x] **Step 5: Run the existing context tests**

Run: `DATABASE_URL="sqlite:///<scratch>/t.db" PYTHONPATH=. .venv/Scripts/python.exe -m pytest tests/test_context_provider.py tests/test_context_budget_guard.py tests/test_query_stream_full_context.py -q`
Expected: PASS. If `test_context_budget_guard.py` asserts on `last_context_truncated`, migrate it to assert on `load_deal_selection(...).excluded_docs` instead.

- [x] **Step 6: Commit**

```bash
git add backend/app/services/context_provider.py backend/tests/
git commit -m "feat(context): allocate deal context instead of truncating"
```

---

### Task 5: Real retrieved pages for demoted documents

Until now `page_chunks` was a placeholder equal to `whole_chunks`. Demotion must actually shrink the payload.

**Files:**
- Modify: `backend/app/services/context_provider.py` (`load_deal_selection`)
- Test: `backend/tests/test_context_allocator_pages.py`

**Interfaces:**
- Consumes: `vector_store.query_document(deal_id, doc_id, query_text, top_k)`
- Produces: no new public names

- [x] **Step 1: Write the failing test**

```python
# backend/tests/test_context_allocator_pages.py
import pytest
from app.services import context_allocator


def _cand(doc_id, size, pages_size):
    whole = [{"content": "w" * size, "source_file": f"{doc_id}.pdf", "page": 1,
              "doc_id": doc_id, "score": 1.0, "section_type": "text"}]
    pages = [{"content": "p" * pages_size, "source_file": f"{doc_id}.pdf", "page": 2,
              "doc_id": doc_id, "score": 0.6, "section_type": "text"}]
    return context_allocator.DocCandidate(
        doc_id=doc_id, filename=f"{doc_id}.pdf", category="other",
        size_chars=size, whole_chunks=whole, page_chunks=pages)


def test_demoted_document_contributes_pages_not_whole_text():
    docs = [_cand("a", 800, 100), _cand("b", 800, 100)]
    sel = context_allocator.allocate(docs, budget=250, scores={"a": 0.9, "b": 0.5})
    assert "b" in sel.partial_docs
    b_chunks = [c for c in sel.chunks if c["doc_id"] == "b"]
    assert b_chunks and all(c["content"].startswith("p") for c in b_chunks)
```

- [x] **Step 2: Run it — this one is expected to PASS**

Run: `PYTHONPATH=. .venv/Scripts/python.exe -m pytest tests/test_context_allocator_pages.py -q`
Expected: PASS. This is deliberate and not a broken TDD cycle: the test pins the allocator's contract (a demoted document contributes `page_chunks`, not `whole_chunks`), which Task 2 already satisfies. The defect is in the *caller*, which currently passes `page_chunks=whole_chunks`, so demotion saves nothing. Step 3 fixes the caller; this test guards the contract it depends on. The behavioral proof that demotion shrinks the payload is the integration test in Task 8.

- [x] **Step 3: Populate `page_chunks` lazily in `load_deal_selection`**

Only demoted documents need retrieved pages, and which ones are demoted is not known until `allocate` runs. Run allocation in two passes: first with `page_chunks=whole_chunks` to learn the shape, then re-fetch pages for the demoted set and allocate once more.

```python
    selection = allocate(candidates, budget=budget, scores=scores)
    if selection.partial_docs:
        from app.services.vector_store import query_document
        by_id = {c.doc_id: c for c in candidates}
        refreshed: list[DocCandidate] = []
        for cand in candidates:
            if cand.doc_id in selection.partial_docs:
                try:
                    pages = await query_document(deal_id, cand.doc_id, question)
                except Exception:
                    logger.warning(
                        "Page retrieval failed for %s — keeping whole document",
                        cand.doc_id,
                    )
                    pages = cand.whole_chunks
                cand = DocCandidate(
                    doc_id=cand.doc_id, filename=cand.filename,
                    category=cand.category, size_chars=cand.size_chars,
                    whole_chunks=cand.whole_chunks,
                    page_chunks=pages or cand.whole_chunks,
                )
            refreshed.append(cand)
        selection = allocate(refreshed, budget=budget, scores=scores)
    return selection
```

Page-retrieval failure keeps the whole document rather than dropping it — the same principle as the probe-failure rule.

- [x] **Step 4: Run tests to verify they pass**

Run: `PYTHONPATH=. .venv/Scripts/python.exe -m pytest tests/test_context_allocator_pages.py tests/test_context_allocator.py -q`
Expected: PASS, 8 passed

- [x] **Step 5: Commit**

```bash
git add backend/app/services/context_provider.py backend/tests/test_context_allocator_pages.py
git commit -m "feat(context): fetch retrieved pages for demoted documents"
```

---

### Task 6: Wire the allocator into the synthesis path

The tabular-run path builds a multi-document corpus by looping `load_doc_context` and truncating locally with its own duplicate budget. This is the highest-volume LLM path in the product.

**Files:**
- Modify: `backend/app/services/workflow_run_executor.py:408-436` (`_select_synthesis_chunks`), delete `_SYNTHESIS_CHAR_BUDGET` (line 35)
- Test: `backend/tests/test_synthesis_context_budget.py` (existing — migrate)

**Interfaces:**
- Consumes: `allocate`, `DocCandidate`, `budget_tokens`
- Produces: `_select_synthesis_chunks(retrieved: list[dict], *, budget: int | None = None) -> list[dict]` — signature gains an optional injected budget for tests

- [x] **Step 1: Write the failing test**

```python
# append to backend/tests/test_synthesis_context_budget.py
from app.services.workflow_run_executor import _select_synthesis_chunks


def test_synthesis_allocates_by_document_instead_of_truncating():
    retrieved = (
        [{"content": "a" * 400, "doc_id": "a", "source_file": "a.pdf",
          "page": i, "score": 1.0, "section_type": "text"} for i in range(1, 3)]
        + [{"content": "b" * 400, "doc_id": "b", "source_file": "b.pdf",
            "page": i, "score": 1.0, "section_type": "text"} for i in range(1, 3)]
    )
    kept = _select_synthesis_chunks(retrieved, budget=250)
    kept_docs = {c["doc_id"] for c in kept}
    # Both documents are represented — allocation does not drop one entirely
    # the way document-order truncation did.
    assert kept_docs == {"a", "b"}
```

- [x] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL="sqlite:///<scratch>/t.db" PYTHONPATH=. .venv/Scripts/python.exe -m pytest tests/test_synthesis_context_budget.py -q`
Expected: FAIL — `TypeError: _select_synthesis_chunks() got an unexpected keyword argument 'budget'`

- [x] **Step 3: Rewrite `_select_synthesis_chunks`**

```python
def _select_synthesis_chunks(
    retrieved: list[dict], *, budget: int | None = None
) -> list[dict]:
    """Pick the context set for a multi_doc_synthesis cell.

    RAG mode: top-K by relevance score (scores are meaningful).
    Otherwise: group the flat chunk list back into documents and allocate,
    so an over-budget corpus degrades the least relevant documents to their
    retrieved pages rather than dropping whichever sorted last.
    """
    from app.services.context_allocator import DocCandidate, allocate
    from app.services.context_budget import budget_tokens, resolved_strategy

    if resolved_strategy() == "retrieval":
        return sorted(
            retrieved, key=lambda chunk: chunk.get("score", 0), reverse=True,
        )[:_TABULAR_SYNTHESIS_MAX_CHUNKS]

    if budget is None:
        budget = budget_tokens(prompt_overhead_chars=_SYNTHESIS_PROMPT_CHARS)

    by_doc: dict[str, list[dict]] = {}
    for chunk in retrieved:
        by_doc.setdefault(chunk.get("doc_id", ""), []).append(chunk)

    candidates = [
        DocCandidate(
            doc_id=doc_id,
            filename=(chunks[0].get("source_file", "") if chunks else ""),
            category="other",
            size_chars=sum(len(c.get("content", "")) for c in chunks),
            whole_chunks=chunks,
            page_chunks=sorted(
                chunks, key=lambda c: c.get("score", 0), reverse=True
            )[:_TABULAR_SYNTHESIS_MAX_CHUNKS],
        )
        for doc_id, chunks in by_doc.items()
    ]
    # Scores here are uniformly 1.0 in full-context mode, so ranking is
    # meaningless — pass None, which also guarantees nothing is excluded.
    return allocate(candidates, budget=budget, scores=None).chunks
```

Add `_SYNTHESIS_PROMPT_CHARS = 4000  # tabular cell prompts are longer than chat questions` near the other module constants, and delete `_SYNTHESIS_CHAR_BUDGET`.

- [x] **Step 4: Run tests to verify they pass**

Run: `DATABASE_URL="sqlite:///<scratch>/t.db" PYTHONPATH=. .venv/Scripts/python.exe -m pytest tests/test_synthesis_context_budget.py -q`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add backend/app/services/workflow_run_executor.py backend/tests/test_synthesis_context_budget.py
git commit -m "feat(context): allocate synthesis context, removing duplicate budget"
```

---

### Task 7: Surface `excluded_docs` in API payloads

The backend must not ship exclusion as silent as the truncation it replaces.

**Files:**
- Modify: `backend/app/models/query.py` (add `excluded_docs` to the answer model)
- Modify: `backend/app/api/routes_query.py:50`, `backend/app/api/routes_stream.py:38`
- Test: `backend/tests/test_excluded_docs_surfaced.py`

**Interfaces:**
- Consumes: `load_deal_selection`
- Produces: response field `excluded_docs: list[str]` (empty list when nothing was excluded)

- [x] **Step 1: Write the failing test**

```python
# backend/tests/test_excluded_docs_surfaced.py
def test_query_response_carries_excluded_docs(client, seeded_small_deal):
    resp = client.post(f"/deals/{seeded_small_deal}/query",
                       json={"question": "what is the fee?"})
    assert resp.status_code == 200
    assert "excluded_docs" in resp.json()
    assert resp.json()["excluded_docs"] == []
```

- [x] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL="sqlite:///<scratch>/t.db" PYTHONPATH=. .venv/Scripts/python.exe -m pytest tests/test_excluded_docs_surfaced.py -q`
Expected: FAIL — `KeyError: 'excluded_docs'` or assertion failure

- [x] **Step 3: Add the field and populate it**

In `backend/app/models/query.py`, add to the answer response model:

```python
    excluded_docs: list[str] = []
```

In `routes_query.py` and `routes_stream.py`, change the `load_deal_context(...)` call to `load_deal_selection(...)`, use `.chunks` where the chunk list was used, and pass `selection.excluded_docs` into the response. For the SSE path in `routes_stream.py`, emit it on the existing metadata/first event rather than inventing a new event type.

- [x] **Step 4: Run test to verify it passes**

Run: `DATABASE_URL="sqlite:///<scratch>/t.db" PYTHONPATH=. .venv/Scripts/python.exe -m pytest tests/test_excluded_docs_surfaced.py -q`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add backend/app/models/query.py backend/app/api/routes_query.py backend/app/api/routes_stream.py backend/tests/test_excluded_docs_surfaced.py
git commit -m "feat(context): surface excluded_docs on query and stream responses"
```

---

### Task 8: Real-corpus integration test and the invariant-2 guard

Proves doc rows, Chroma probes and page chunks flow end to end, and that manager isolation survives allocation.

**Files:**
- Create: `backend/tests/test_context_allocator_integration.py`
- Modify: `backend/tests/test_object_model.py::TestManagerSharedContext`

**Interfaces:**
- Consumes: everything above
- Produces: no new names

- [x] **Step 1: Write the integration test**

```python
# backend/tests/test_context_allocator_integration.py
"""End-to-end allocation over real seeded documents.

Uses an artificially small budget because no corpus in the dev database can
reach the real one (largest deal is 1.4M chars against a 3.2M budget).
"""
import pytest
from app.services import context_provider, context_budget


@pytest.mark.asyncio
async def test_brightwater_allocates_under_a_small_budget(client, monkeypatch,
                                                          seeded_brightwater):
    monkeypatch.setattr(context_budget, "budget_tokens", lambda *a, **k: 2_000)
    sel = await context_provider.load_deal_selection(
        "brightwater_iv", "what is the management fee and fee offset?"
    )
    assert sel.strategy == "allocated"
    # Something was demoted or excluded — the budget is far below the corpus.
    assert sel.partial_docs or sel.excluded_docs
    # The LPA is category-floored: it may be demoted, never excluded.
    lpa_ids = [d for d in sel.excluded_docs if "lpa" in d]
    assert lpa_ids == []


@pytest.mark.asyncio
async def test_every_existing_deal_still_allocates_whole(client, seeded_brightwater):
    """Regression: below budget, behavior is unchanged from before the allocator."""
    for deal_id in ("brightwater_iv", "brightwater_iii"):
        sel = await context_provider.load_deal_selection(deal_id, "summarize")
        assert sel.strategy == "full_text"
        assert sel.excluded_docs == []
```

`seeded_brightwater` must seed the two funds via `app.seed.SAMPLE_DEALS` entries (stores, not the app lifecycle — startup events do not run in tests). If ingesting real PDFs is too slow for the suite, insert `DocumentRow`s directly with `full_text_md` read from `backend/evals/data/*.md`, which are the exact exported texts.

- [x] **Step 2: Run it to verify it fails**

Run: `DATABASE_URL="sqlite:///<scratch>/t.db" PYTHONPATH=. .venv/Scripts/python.exe -m pytest tests/test_context_allocator_integration.py -q`
Expected: FAIL — fixture missing

- [x] **Step 3: Add the fixture, then extend the invariant-2 guard**

In `tests/test_object_model.py::TestManagerSharedContext`, add a case asserting that allocation never pulls a document from a different manager:

```python
    @pytest.mark.asyncio
    async def test_allocation_never_crosses_a_manager_boundary(self, client):
        """Invariant 2 under allocation: manager-shared docs from siblings are
        included; documents from any other manager never are."""
        sel = await context_provider.load_deal_selection(
            "brightwater_iii", "what does the Form ADV disclose?"
        )
        included = set(sel.whole_docs) | set(sel.partial_docs)
        hillpath_docs = {d.doc_id for d in deal_store.list_documents("hillpath_fund_iv")}
        assert included.isdisjoint(hillpath_docs)
```

- [x] **Step 4: Run the full suite**

Run: `DATABASE_URL="sqlite:///<scratch>/t.db" PYTHONPATH=. .venv/Scripts/python.exe -m pytest -q`
Expected: PASS — 314 existing tests plus the ~16 added here. Do **not** pass `ALLOW_INSECURE_DEFAULTS`.

- [x] **Step 5: Commit**

```bash
git add backend/tests/
git commit -m "test(context): integration coverage and manager-isolation guard for allocation"
```

---

## Self-Review Notes

**Spec coverage.** Budget from `min()` of both windows → Task 1. `ContextSelection` → Task 2. Probe + category floor → Tasks 2–3. Absence-safe scoring → Tasks 2–3. Both wiring points → Tasks 4 and 6. Retrieved pages for demoted docs → Task 5. Config enum + shim → Tasks 1 and 4. `excluded_docs` surfacing → Task 7. Injectable-budget testing strategy → Tasks 2, 6, 8. Invariant 2 → Task 8.

**Deliberate gap.** `settings.context_window_tokens` has no value in this plan. Task 1 Step 1 obtains it from the provider. This is the one number that must not be invented — see the spec's configuration section.

**Known rough edge.** Task 5 allocates twice (once to discover the demoted set, once with real pages). This costs one extra pure-function pass, no I/O, and only when a corpus is over budget. Preferred over pre-fetching pages for every document, which would issue a `query_document` call per document on every over-budget question.
