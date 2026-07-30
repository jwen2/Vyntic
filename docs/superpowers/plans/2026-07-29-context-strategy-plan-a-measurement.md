# Context Strategy Plan A — Measurement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LLM token spend measurable per surface/deal/run, and make extraction citation accuracy measurable against a golden set — so Plans B (cost) and C (capacity) can be decided by data instead of assumption.

**Architecture:** Token counts are captured in the existing `LLMCallMeta` inside `stream_with_fallback`, attributed via a `ContextVar` set at each calling surface (mirroring the existing `_last_meta` ContextVar pattern), and persisted to a new additive `llm_calls` table by a store that follows `deal_store.py`'s shape. The eval harness is a standalone `backend/evals/` package that calls `run_extraction` directly — no HTTP, no app lifecycle — with a pure-function scorer that is unit-tested in `tests/`.

**Tech Stack:** Python 3.11 (local venv) / 3.12 (Docker), FastAPI, SQLAlchemy (sync sessions), SQLite, pytest (`asyncio_mode = auto`), langchain-core >=0.3,<1.0, langchain-google-genai >=2.0.0.

**Spec:** `docs/superpowers/specs/2026-07-29-hybrid-context-strategy-design.md` (Phase 0 + task 1a).

## Global Constraints

- **Schema migrations are additive-only.** No Alembic. New tables are created by `create_all`; never write destructive DDL. (CLAUDE.md invariant 3)
- **One LLM primitive.** Every surface answers through `extraction_engine.run_extraction`. Do not add parallel LLM call paths. (invariant 5)
- **Metrics recording must never fail a diligence answer.** Every persistence call in this plan is wrapped so an exception is logged and swallowed.
- **RBAC default-deny.** New routes need `require_deal_access` for reads; copy the dependency pattern from `routes_deals.py`. (CLAUDE.md conventions)
- **Stores over ORM-in-routes.** Routes call `*_store.py` functions that own their own sessions and return Pydantic models.
- **Test command (Windows/PowerShell), always with the scratch DB override** — the autouse `clear_store` fixture calls `drop_all` on whatever engine `app.database` resolves, which destroys `backend/data/vyntic.db` otherwise:

```powershell
$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest tests/<file> -q
```

Run from `D:\projects\Vyntic\backend`. `backend\data\` must exist. Delete `data\_scratch_test.db` when done.

- **No new dependencies.** Everything in Tasks 1–9 uses libraries already in `requirements.txt`. Task 10 is a spike and may install `google-genai` in a throwaway environment only.

---

## File Structure

**Create:**
- `backend/app/services/llm_metrics.py` — records and aggregates per-call token usage. Owns its own sessions; returns Pydantic models.
- `backend/app/models/metrics.py` — `LLMCallRecord`, `CostSummary` Pydantic models.
- `backend/app/api/routes_metrics.py` — one read route for cost summaries.
- `backend/evals/__init__.py`
- `backend/evals/golden_set.py` — `GoldenQuestion` + JSON loader.
- `backend/evals/scoring.py` — pure scoring functions.
- `backend/evals/run_eval.py` — CLI runner.
- `backend/evals/data/example_lpa.md` — deterministic fixture document.
- `backend/evals/data/example_golden_set.json` — 3-question example set.
- `backend/tests/test_llm_token_accounting.py`
- `backend/tests/test_llm_metrics_store.py`
- `backend/tests/test_metrics_route.py`
- `backend/tests/test_eval_scoring.py`
- `docs/superpowers/spikes/2026-07-29-gemini-context-caching-findings.md`

**Modify:**
- `backend/app/agents/llm.py` — token fields on `LLMCallMeta`, attribution ContextVar, recording hook.
- `backend/app/database.py` — `LLMCallRow`.
- `backend/app/main.py` — register the metrics router.
- `backend/app/services/workflow_run_executor.py` — set attribution context in `execute_cell` and `execute_assistant_stage`.
- `backend/app/api/routes_stream.py`, `routes_query.py`, `routes_doc_matrix.py` — set attribution context.
- `backend/app/services/monitoring_extractor.py` — set attribution context.

**Out of scope for Plan A** (record, do not build): the allocator, `ContextSelection`, lazy embedding, batch embedding in `embedder.py`, any change to `context_provider.py`, the `CONTEXT_STRATEGY` enum.

---

### Task 1: Capture token usage in `LLMCallMeta`

**Files:**
- Modify: `backend/app/agents/llm.py:16-22` (dataclass), `74-108` (`stream_with_fallback`)
- Test: `backend/tests/test_llm_token_accounting.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `LLMCallMeta` gains `prompt_tokens: int`, `completion_tokens: int`, `cached_tokens: int`, all defaulting to `0`. Read via the existing `get_last_meta() -> LLMCallMeta | None`.

**Background:** langchain-core >=0.3 attaches a `usage_metadata` dict to message chunks with keys `input_tokens`, `output_tokens`, `total_tokens`, and optionally `input_token_details` containing `cache_read`.

> **CORRECTED DURING EXECUTION (2026-07-29).** This section originally guessed that "take the last non-empty `usage_metadata`" was safe under all semantics. **It is wrong twice**, and Step 6's live call is what caught it. Measured against `gemini-3.1-flash-lite`:
>
> 1. The stream's final chunk is an **empty-content terminator whose `usage_metadata` dict is present but all-zero**. That dict is truthy — it has keys — so a `if not usage: return` guard does not filter it, and it clobbers the real counts with zeros. The guard must test **token values, not dict truthiness**.
> 2. Semantics are **mixed within one dict**: `output_tokens` is a **per-chunk increment** and must be **summed**; `input_tokens` is a **repeated total** and must use **last-non-zero-wins**. One rule for both under-reports completion tokens on every multi-chunk answer.
>
> `cache_read` → `cached_tokens` remains **unverified** — it was 0 on every chunk in both calibration runs because caching was inactive. Verifying it is part of Task 10. Raw per-chunk evidence is in the task-1 report.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_llm_token_accounting.py`:

```python
"""Token usage must be captured into LLMCallMeta for cost accounting.

Gemini reports usage via langchain's `usage_metadata` on message chunks.
We take the last non-empty one seen, which is correct whether the provider
sends cumulative counts or only a final total.
"""
from types import SimpleNamespace

from app.agents import llm


class FakeLLM:
    def __init__(self, chunks):
        self.chunks = chunks

    async def astream(self, messages):
        for c in self.chunks:
            yield c


def _chunk(content, usage=None):
    return SimpleNamespace(content=content, usage_metadata=usage)


async def test_captures_token_usage_from_final_chunk(monkeypatch):
    monkeypatch.setattr(
        llm,
        "get_llm",
        lambda model=None: FakeLLM([
            _chunk("hello "),
            _chunk("world", {
                "input_tokens": 1200,
                "output_tokens": 40,
                "total_tokens": 1240,
                "input_token_details": {"cache_read": 900},
            }),
        ]),
    )

    [c async for c in llm.stream_with_fallback([])]

    meta = llm.get_last_meta()
    assert meta.prompt_tokens == 1200
    assert meta.completion_tokens == 40
    assert meta.cached_tokens == 900


async def test_missing_usage_metadata_leaves_zeros(monkeypatch):
    monkeypatch.setattr(
        llm, "get_llm", lambda model=None: FakeLLM([_chunk("hi")])
    )

    [c async for c in llm.stream_with_fallback([])]

    meta = llm.get_last_meta()
    assert meta.prompt_tokens == 0
    assert meta.completion_tokens == 0
    assert meta.cached_tokens == 0


async def test_completion_tokens_accumulate_across_content_chunks(monkeypatch):
    """output_tokens is a per-chunk increment, so it sums; input_tokens is a
    repeated total, so it does not."""
    monkeypatch.setattr(
        llm,
        "get_llm",
        lambda model=None: FakeLLM([
            _chunk("a", {"input_tokens": 10, "output_tokens": 1}),
            _chunk("b", {"input_tokens": 10, "output_tokens": 7}),
        ]),
    )

    [c async for c in llm.stream_with_fallback([])]

    meta = llm.get_last_meta()
    assert meta.completion_tokens == 8   # 1 + 7, summed
    assert meta.prompt_tokens == 10      # repeated total, not 20


async def test_zeroed_terminator_chunk_does_not_clobber_real_usage(monkeypatch):
    """The regression test for the bug this plan originally shipped: Gemini's
    final empty-content chunk carries an all-zero-but-present usage_metadata
    dict, which a dict-truthiness guard lets through."""
    monkeypatch.setattr(
        llm,
        "get_llm",
        lambda model=None: FakeLLM([
            _chunk("real answer", {
                "input_tokens": 7,
                "output_tokens": 7,
                "input_token_details": {"cache_read": 0},
            }),
            _chunk("", {
                "input_tokens": 0,
                "output_tokens": 0,
                "input_token_details": {"cache_read": 0},
            }),
        ]),
    )

    [c async for c in llm.stream_with_fallback([])]

    meta = llm.get_last_meta()
    assert meta.prompt_tokens == 7
    assert meta.completion_tokens == 7
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest tests/test_llm_token_accounting.py -q
```

Expected: FAIL with `AttributeError: 'LLMCallMeta' object has no attribute 'prompt_tokens'`.

- [ ] **Step 3: Add the fields**

In `backend/app/agents/llm.py`, replace the `LLMCallMeta` dataclass:

```python
@dataclass
class LLMCallMeta:
    """Metadata about a completed LLM call."""
    model_used: str = ""
    fallback: bool = False
    error: str | None = None
    duration_ms: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cached_tokens: int = 0
```

- [ ] **Step 4: Capture usage in the stream**

In `backend/app/agents/llm.py`, add this helper above `stream_with_fallback`:

This is the **corrected** body (see the CORRECTED note above; the docstring shipped in `llm.py` carries the full measured detail):

```python
def _apply_usage(meta: LLMCallMeta, chunk: object) -> None:
    """Copy langchain usage_metadata off a chunk into meta.

    Guards on token VALUES, not dict truthiness: the stream's final
    terminator chunk carries a present-but-all-zero usage_metadata dict
    that would otherwise clobber the real counts.

    input_tokens  -> prompt_tokens:     repeated total, last-non-zero wins
    output_tokens -> completion_tokens: per-chunk increment, SUMMED
    cache_read    -> cached_tokens:     assumed last-non-zero; UNVERIFIED
    """
    usage = getattr(chunk, "usage_metadata", None)
    if not usage:
        return
    input_tokens = usage.get("input_tokens") or 0
    output_tokens = usage.get("output_tokens") or 0
    cache_read = (usage.get("input_token_details") or {}).get("cache_read") or 0

    if input_tokens:
        meta.prompt_tokens = input_tokens
    if output_tokens:
        meta.completion_tokens += output_tokens
    if cache_read:
        meta.cached_tokens = cache_read
```

Then add `_apply_usage(meta, chunk)` immediately before each `yield chunk` in `stream_with_fallback` — both the primary loop (line ~91-93) and the fallback loop (line ~104-105):

```python
        async for chunk in llm.astream(messages):
            yielded_any = True
            _apply_usage(meta, chunk)
            yield chunk
```

```python
        async for chunk in llm.astream(messages):
            _apply_usage(meta, chunk)
            yield chunk
```

- [ ] **Step 5: Run tests to verify they pass**

```powershell
$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest tests/test_llm_token_accounting.py tests/test_llm_meta_concurrency.py tests/test_llm_fallback_policy.py -q
```

Expected: PASS (3 new + the existing meta/fallback tests still green).

- [ ] **Step 6: Verify the real usage_metadata shape against a live call**

This is the step that validates the assumption above. Requires `GEMINI_API_KEY`.

```powershell
$env:GEMINI_API_KEY="<your key>"; .\.venv\Scripts\python.exe -c @'
import asyncio
from langchain_core.messages import HumanMessage
from app.agents.llm import stream_with_fallback, get_last_meta

async def main():
    async for _ in stream_with_fallback([HumanMessage(content="Say hi in five words.")]):
        pass
    m = get_last_meta()
    print("model:", m.model_used)
    print("prompt/completion/cached:", m.prompt_tokens, m.completion_tokens, m.cached_tokens)

asyncio.run(main())
'@
```

Expected: non-zero `prompt_tokens` and `completion_tokens`.

**If both are zero**, langchain-google-genai is not populating `usage_metadata` for this model. Do not proceed to Task 3 — record the finding in the Task 10 spike doc and raise it, because the whole cost-accounting phase depends on it. A fallback exists (`llm.get_num_tokens_from_messages()`, a local estimate) but it does not report cached tokens, which makes Plan B's caching measurement impossible to verify directly.

- [ ] **Step 7: Commit**

```bash
git add backend/app/agents/llm.py backend/tests/test_llm_token_accounting.py
git commit -m "feat(metrics): capture token usage in LLMCallMeta

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: LLM call attribution ContextVar

**Files:**
- Modify: `backend/app/agents/llm.py`
- Test: `backend/tests/test_llm_token_accounting.py` (append)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `LLMCallContext` frozen dataclass with fields `surface: str = "unknown"`, `deal_id: str | None = None`, `run_id: str | None = None`, `cell_id: str | None = None`.
  - `llm_call_context(*, surface, deal_id=None, run_id=None, cell_id=None)` — a `@contextmanager` that sets and restores the ContextVar.
  - `get_call_context() -> LLMCallContext`.

**Why a ContextVar:** `stream_with_fallback` has no idea which surface called it, and threading four parameters through `run_extraction` and all ~15 `context_provider` call sites would be invasive. `llm.py` already uses this exact pattern for `_last_meta` (line 28) precisely because concurrent cells share an event loop. ContextVars are per-asyncio-task, so concurrent cells cannot stomp each other's attribution.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_llm_token_accounting.py`:

```python
import asyncio


async def test_call_context_defaults_to_unknown():
    assert llm.get_call_context().surface == "unknown"
    assert llm.get_call_context().deal_id is None


async def test_call_context_sets_and_restores():
    with llm.llm_call_context(surface="tabular_cell", deal_id="d1", run_id="r1", cell_id="c1"):
        ctx = llm.get_call_context()
        assert ctx.surface == "tabular_cell"
        assert ctx.deal_id == "d1"
        assert ctx.run_id == "r1"
        assert ctx.cell_id == "c1"
    assert llm.get_call_context().surface == "unknown"


async def test_call_context_is_task_local():
    """Concurrent cells must not see each other's attribution.

    Both contexts are open simultaneously and each task reads while the
    other's is also open — a plain module global would make task_a observe
    task_b's deal_id here. Only a per-task ContextVar passes.
    """
    seen = {}

    async def task_a():
        with llm.llm_call_context(surface="chat_stream", deal_id="deal-a"):
            await asyncio.sleep(0.02)
            seen["a"] = llm.get_call_context().deal_id

    async def task_b():
        await asyncio.sleep(0.005)
        with llm.llm_call_context(surface="tabular_cell", deal_id="deal-b"):
            await asyncio.sleep(0.02)
            seen["b"] = llm.get_call_context().deal_id

    await asyncio.gather(task_a(), task_b())

    assert seen == {"a": "deal-a", "b": "deal-b"}


async def test_call_context_restores_after_exception():
    try:
        with llm.llm_call_context(surface="doc_matrix", deal_id="d1"):
            raise ValueError("boom")
    except ValueError:
        pass
    assert llm.get_call_context().surface == "unknown"
```

> **CORRECTED DURING EXECUTION (2026-07-29).** The original version of `test_call_context_is_task_local` used an `asyncio.Event` to interleave the two tasks and **did not discriminate a ContextVar from a plain module global.** `Event.wait()` returns without suspending when the event is already set, so `task_b` ran start-to-finish inside `task_a`'s `sleep` — strict LIFO nesting, no overlap at any read point, and a save/restore global passed identically. The version above was verified to FAIL against a deliberately-substituted global implementation (`{'a': 'deal-b', 'b': None}`) before passing against the real one.
>
> **Rule for any future task-locality test in this repo:** overlap must come from both tasks sleeping *inside* their own context, not from an Event handoff — and the test must be run against the wrong implementation once, to prove it can fail.

- [ ] **Step 2: Run test to verify it fails**

```powershell
$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest tests/test_llm_token_accounting.py -q
```

Expected: FAIL with `AttributeError: module 'app.agents.llm' has no attribute 'get_call_context'`.

- [ ] **Step 3: Implement**

In `backend/app/agents/llm.py`, add `from contextlib import contextmanager` to the imports, then add below the `_last_meta` ContextVar (after line 28):

```python
@dataclass(frozen=True)
class LLMCallContext:
    """Who is making this LLM call — for cost attribution.

    Set at each calling surface via `llm_call_context`; read at record time.
    Task-local like `_last_meta`, so concurrent cells attribute correctly.
    """
    surface: str = "unknown"
    deal_id: str | None = None
    run_id: str | None = None
    cell_id: str | None = None


_call_context: ContextVar[LLMCallContext] = ContextVar(
    "llm_call_context", default=LLMCallContext()
)


def get_call_context() -> LLMCallContext:
    return _call_context.get()


@contextmanager
def llm_call_context(
    *,
    surface: str,
    deal_id: str | None = None,
    run_id: str | None = None,
    cell_id: str | None = None,
):
    """Attribute every LLM call made inside this block to `surface`."""
    token = _call_context.set(
        LLMCallContext(
            surface=surface, deal_id=deal_id, run_id=run_id, cell_id=cell_id
        )
    )
    try:
        yield
    finally:
        _call_context.reset(token)
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest tests/test_llm_token_accounting.py -q
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/agents/llm.py backend/tests/test_llm_token_accounting.py
git commit -m "feat(metrics): add task-local LLM call attribution context

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `llm_calls` table and metrics store

**Files:**
- Create: `backend/app/models/metrics.py`, `backend/app/services/llm_metrics.py`
- Modify: `backend/app/database.py` (append the model class)
- Test: `backend/tests/test_llm_metrics_store.py`

**Interfaces:**
- Consumes: `LLMCallMeta` (Task 1), `LLMCallContext` (Task 2).
- Produces:
  - `llm_metrics.record_call(meta: LLMCallMeta, ctx: LLMCallContext) -> None` — never raises.
  - `llm_metrics.summarize(deal_id: str, run_id: str | None = None) -> CostSummary`.
  - `CostSummary` Pydantic model with `deal_id`, `run_id`, `call_count`, `prompt_tokens`, `completion_tokens`, `cached_tokens`, `by_surface: dict[str, int]` (call counts per surface). **Superseded during review — this was a defect in the plan.** Specifying `by_surface` as call counts defeats this plan's own goal of a measured per-surface *token* multiplier, since surfaces differ by orders of magnitude in prompt size. As shipped, `by_surface` holds tokens; counts moved to `calls_by_surface`, and `calls_by_outcome` was added alongside.

**Schema note:** `llm_calls` deliberately has **no foreign key** to `deals`. Metrics must survive deal deletion (they are the cost record), and CLAUDE.md invariant 3 warns that SQLite cannot add FK constraints via ALTER anyway. This is a new table, so `create_all` handles it with no migration shim.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_llm_metrics_store.py`:

```python
"""Per-call token accounting: the baseline for the cost work in Plan B."""
from app.agents.llm import LLMCallContext, LLMCallMeta
from app.services import llm_metrics


def _meta(prompt=100, completion=10, cached=0, model="gemini-3.1-flash-lite"):
    return LLMCallMeta(
        model_used=model,
        fallback=False,
        duration_ms=250,
        prompt_tokens=prompt,
        completion_tokens=completion,
        cached_tokens=cached,
    )


def test_record_and_summarize_by_deal(clear_store):
    ctx = LLMCallContext(surface="tabular_cell", deal_id="deal-1", run_id="run-1")
    llm_metrics.record_call(_meta(prompt=100), ctx)
    llm_metrics.record_call(_meta(prompt=250, completion=20), ctx)

    summary = llm_metrics.summarize("deal-1")

    assert summary.call_count == 2
    assert summary.prompt_tokens == 350
    assert summary.completion_tokens == 30
    assert summary.by_surface == {"tabular_cell": 2}


def test_summarize_filters_by_run(clear_store):
    llm_metrics.record_call(
        _meta(prompt=100),
        LLMCallContext(surface="tabular_cell", deal_id="deal-1", run_id="run-1"),
    )
    llm_metrics.record_call(
        _meta(prompt=999),
        LLMCallContext(surface="tabular_cell", deal_id="deal-1", run_id="run-2"),
    )

    summary = llm_metrics.summarize("deal-1", run_id="run-1")

    assert summary.call_count == 1
    assert summary.prompt_tokens == 100


def test_summarize_isolates_deals(clear_store):
    llm_metrics.record_call(
        _meta(prompt=100), LLMCallContext(surface="chat_stream", deal_id="deal-1")
    )
    llm_metrics.record_call(
        _meta(prompt=500), LLMCallContext(surface="chat_stream", deal_id="deal-2")
    )

    assert llm_metrics.summarize("deal-1").prompt_tokens == 100
    assert llm_metrics.summarize("deal-2").prompt_tokens == 500


def test_summarize_groups_multiple_surfaces(clear_store):
    for surface in ("tabular_cell", "tabular_cell", "chat_stream"):
        llm_metrics.record_call(
            _meta(), LLMCallContext(surface=surface, deal_id="deal-1")
        )

    assert llm_metrics.summarize("deal-1").by_surface == {
        "tabular_cell": 2,
        "chat_stream": 1,
    }


def test_empty_summary_is_zeroed(clear_store):
    summary = llm_metrics.summarize("nonexistent-deal")

    assert summary.call_count == 0
    assert summary.prompt_tokens == 0
    assert summary.by_surface == {}


def test_record_never_raises_on_bad_input(clear_store, monkeypatch):
    """A metrics write failure must never fail a diligence answer."""
    def boom():
        raise RuntimeError("db down")

    monkeypatch.setattr(llm_metrics, "SessionLocal", boom)

    llm_metrics.record_call(_meta(), LLMCallContext(surface="chat_stream"))
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest tests/test_llm_metrics_store.py -q
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.llm_metrics'`.

- [ ] **Step 3: Add the table**

Append to `backend/app/database.py`, after the existing model classes:

```python
class LLMCallRow(Base):
    """One row per LLM call, for token/cost accounting.

    Deliberately has no FK to deals: metrics are the cost record and must
    survive deal deletion. New table, so create_all handles it — no
    migration shim needed (invariant 3).
    """
    __tablename__ = "llm_calls"

    id = Column(String, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    surface = Column(String, nullable=False, index=True)
    deal_id = Column(String, nullable=True, index=True)
    run_id = Column(String, nullable=True, index=True)
    cell_id = Column(String, nullable=True)
    model = Column(String, default="")
    fallback = Column(Boolean, default=False)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    cached_tokens = Column(Integer, default=0)
    duration_ms = Column(Integer, default=0)
```

Verify `DateTime`, `Boolean`, `Integer`, `String`, `Column` and `datetime` are already imported at the top of `database.py`; add any that are missing to the existing import lines.

- [ ] **Step 4: Add the Pydantic model**

Create `backend/app/models/metrics.py`:

```python
"""Cost-accounting models."""
from pydantic import BaseModel, Field


class CostSummary(BaseModel):
    """Aggregated token spend for a deal, optionally narrowed to one run."""
    deal_id: str
    run_id: str | None = None
    call_count: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cached_tokens: int = 0
    by_surface: dict[str, int] = Field(default_factory=dict)
```

- [ ] **Step 5: Implement the store**

Create `backend/app/services/llm_metrics.py`:

```python
"""Per-LLM-call token accounting.

Records one row per call so cost can be attributed per surface, deal, and
run. Recording never raises: a metrics failure must not fail a diligence
answer.
"""
import logging
import uuid

from sqlalchemy import func

from app.agents.llm import LLMCallContext, LLMCallMeta
from app.database import LLMCallRow, SessionLocal
from app.models.metrics import CostSummary

logger = logging.getLogger(__name__)


def record_call(meta: LLMCallMeta, ctx: LLMCallContext) -> None:
    """Persist one call's usage. Swallows and logs any failure."""
    try:
        db = SessionLocal()
        try:
            db.add(
                LLMCallRow(
                    id=str(uuid.uuid4()),
                    surface=ctx.surface,
                    deal_id=ctx.deal_id,
                    run_id=ctx.run_id,
                    cell_id=ctx.cell_id,
                    model=meta.model_used,
                    fallback=meta.fallback,
                    prompt_tokens=meta.prompt_tokens,
                    completion_tokens=meta.completion_tokens,
                    cached_tokens=meta.cached_tokens,
                    duration_ms=meta.duration_ms,
                )
            )
            db.commit()
        finally:
            db.close()
    except Exception:
        logger.exception("Failed to record LLM call metrics (surface=%s)", ctx.surface)


def summarize(deal_id: str, run_id: str | None = None) -> CostSummary:
    """Aggregate token spend for a deal, optionally narrowed to one run."""
    db = SessionLocal()
    try:
        q = db.query(LLMCallRow).filter(LLMCallRow.deal_id == deal_id)
        if run_id is not None:
            q = q.filter(LLMCallRow.run_id == run_id)

        totals = q.with_entities(
            func.count(LLMCallRow.id),
            func.coalesce(func.sum(LLMCallRow.prompt_tokens), 0),
            func.coalesce(func.sum(LLMCallRow.completion_tokens), 0),
            func.coalesce(func.sum(LLMCallRow.cached_tokens), 0),
        ).one()

        by_surface = dict(
            q.with_entities(LLMCallRow.surface, func.count(LLMCallRow.id))
            .group_by(LLMCallRow.surface)
            .all()
        )

        return CostSummary(
            deal_id=deal_id,
            run_id=run_id,
            call_count=totals[0],
            prompt_tokens=totals[1],
            completion_tokens=totals[2],
            cached_tokens=totals[3],
            by_surface=by_surface,
        )
    finally:
        db.close()
```

- [ ] **Step 6: Run tests to verify they pass**

```powershell
$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest tests/test_llm_metrics_store.py -q
```

Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/app/database.py backend/app/models/metrics.py backend/app/services/llm_metrics.py backend/tests/test_llm_metrics_store.py
git commit -m "feat(metrics): add llm_calls table and metrics store

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Record every LLM call

**Files:**
- Modify: `backend/app/agents/llm.py` (the `finally` block of `stream_with_fallback`, lines ~106-108; and `invoke_with_fallback`)
- Test: `backend/tests/test_llm_token_accounting.py` (append)

**Interfaces:**
- Consumes: `llm_metrics.record_call` (Task 3), `get_call_context` (Task 2).
- Produces: every completed call through `stream_with_fallback` or `invoke_with_fallback` writes one `llm_calls` row.

**Import-cycle note:** `llm_metrics` imports from `app.agents.llm`, so `llm.py` must import `llm_metrics` **inside the function**, not at module scope. This mirrors the deferred-import pattern `context_provider.py` already uses for `vector_store`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_llm_token_accounting.py`:

```python
from app.services import llm_metrics


async def test_stream_records_a_metrics_row(monkeypatch, clear_store):
    monkeypatch.setattr(
        llm,
        "get_llm",
        lambda model=None: FakeLLM([
            _chunk("hi", {"input_tokens": 500, "output_tokens": 12}),
        ]),
    )

    with llm.llm_call_context(surface="chat_stream", deal_id="deal-9", run_id="run-9"):
        [c async for c in llm.stream_with_fallback([])]

    summary = llm_metrics.summarize("deal-9")
    assert summary.call_count == 1
    assert summary.prompt_tokens == 500
    assert summary.completion_tokens == 12
    assert summary.by_surface == {"chat_stream": 1}


async def test_recording_failure_does_not_break_the_stream(monkeypatch, clear_store):
    monkeypatch.setattr(llm, "get_llm", lambda model=None: FakeLLM([_chunk("ok")]))

    def boom(meta, ctx):
        raise RuntimeError("metrics exploded")

    monkeypatch.setattr(llm_metrics, "record_call", boom)

    tokens = [c.content async for c in llm.stream_with_fallback([])]

    assert tokens == ["ok"]
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest tests/test_llm_token_accounting.py -q
```

Expected: FAIL — `test_stream_records_a_metrics_row` asserts `call_count == 1` but gets `0`.

- [ ] **Step 3: Implement**

In `backend/app/agents/llm.py`, add this helper above `stream_with_fallback`:

```python
def _record(meta: LLMCallMeta) -> None:
    """Persist this call's usage. Deferred import breaks the llm <-> metrics cycle."""
    try:
        from app.services import llm_metrics

        llm_metrics.record_call(meta, _call_context.get())
    except Exception:
        logger.exception("LLM metrics recording failed")
```

Replace the `finally` block of `stream_with_fallback`:

```python
    finally:
        meta.duration_ms = int((time.monotonic() - t0) * 1000)
        _last_meta.set(meta)
        _record(meta)
```

Then instrument `invoke_with_fallback` so non-streaming calls are also counted. Replace its body:

```python
async def invoke_with_fallback(messages: list[BaseMessage]) -> str:
    """Invoke the primary model; fall back to backup on rate-limit or error."""
    meta = LLMCallMeta()
    t0 = time.monotonic()
    try:
        try:
            meta.model_used = settings.gemini_model
            llm = get_llm(settings.gemini_model)
            response = await llm.ainvoke(messages)
        except LLMConfigurationError:
            raise
        except Exception as e:
            if not settings.gemini_fallback_model:
                raise
            logger.warning(f"Primary model failed ({e}), falling back to {settings.gemini_fallback_model}")
            meta.model_used = settings.gemini_fallback_model
            meta.fallback = True
            meta.error = str(e)
            llm = get_llm(settings.gemini_fallback_model)
            response = await llm.ainvoke(messages)
        _apply_usage(meta, response)
        return response.content
    finally:
        meta.duration_ms = int((time.monotonic() - t0) * 1000)
        _record(meta)
```

Note: `invoke_with_fallback` deliberately does **not** call `_last_meta.set(meta)` — `get_last_meta()` is the streaming path's contract and `test_llm_meta_concurrency.py` pins it. Only recording is added here.

- [ ] **Step 4: Run tests to verify they pass**

```powershell
$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest tests/test_llm_token_accounting.py tests/test_llm_meta_concurrency.py tests/test_llm_fallback_policy.py tests/test_llm_config.py -q
```

Expected: PASS, all files.

- [ ] **Step 5: Run the full suite for regressions**

```powershell
$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest -q
```

Expected: PASS (~131 existing tests + the new ones). Takes 5–6 minutes. Then delete `data\_scratch_test.db`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/agents/llm.py backend/tests/test_llm_token_accounting.py
git commit -m "feat(metrics): record token usage for every LLM call

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Attribute calls at each surface

**Files:**
- Modify: `backend/app/services/workflow_run_executor.py` (in `execute_cell` ~line 255, and `execute_assistant_stage` ~line 719)
- Modify: `backend/app/api/routes_stream.py:37`, `backend/app/api/routes_query.py:47`, `backend/app/api/routes_doc_matrix.py:33`
- Modify: `backend/app/services/monitoring_extractor.py` (lines ~70, ~113, ~176)
- Test: `backend/tests/test_llm_metrics_store.py` (append)

**Interfaces:**
- Consumes: `llm_call_context` (Task 2).
- Produces: the surface label vocabulary, used by `CostSummary.by_surface` and the eval report:
  `"tabular_cell"`, `"assistant_stage"`, `"chat_stream"`, `"chat_query"`, `"doc_matrix"`, `"monitoring"`.

**Placement rule:** wrap the block that calls `run_extraction`, not the whole function. The context must be active when the LLM call happens; wrapping wider is harmless but wrapping narrower silently loses attribution.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_llm_metrics_store.py`:

```python
SURFACES = {
    "tabular_cell",
    "assistant_stage",
    "chat_stream",
    "chat_query",
    "doc_matrix",
    "monitoring",
}


def test_surface_vocabulary_is_used_in_source():
    """Every surface label must actually be set somewhere in app code.

    Guards against a surface being instrumented with a typo'd label, which
    would silently split its cost across two buckets.
    """
    import pathlib
    import re

    root = pathlib.Path(__file__).resolve().parents[1] / "app"
    source = "\n".join(
        p.read_text(encoding="utf-8") for p in root.rglob("*.py")
    )
    used = set(re.findall(r'llm_call_context\(\s*surface="([a-z_]+)"', source))

    assert used == SURFACES, f"missing={SURFACES - used} unexpected={used - SURFACES}"
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest tests/test_llm_metrics_store.py::test_surface_vocabulary_is_used_in_source -q
```

Expected: FAIL with `missing={'tabular_cell', 'assistant_stage', ...} unexpected=set()`.

- [ ] **Step 3: Instrument `workflow_run_executor.py`**

Add to the imports at the top:

```python
from app.agents.llm import llm_call_context
```

In `execute_cell`, wrap the `try:` block that begins at line ~320 (`if is_synthesis:`) — put the context manager immediately inside the existing `try:`:

```python
    try:
        with llm_call_context(
            surface="tabular_cell",
            deal_id=deal_id,
            run_id=run_id,
            cell_id=cell_id,
        ):
            if is_synthesis:
                ...  # existing body, indented one level
```

In `execute_assistant_stage`, wrap the equivalent block that calls `run_extraction` (~line 756 onward):

```python
        with llm_call_context(surface="assistant_stage", deal_id=deal_id, run_id=run_id):
            ...  # existing run_extraction call, indented one level
```

- [ ] **Step 4: Instrument the routes**

In `backend/app/api/routes_stream.py`, add `from app.agents.llm import llm_call_context` and wrap the block containing `load_deal_context` (line 37) through the `stream_extraction`/`run_extraction` call:

```python
        with llm_call_context(surface="chat_stream", deal_id=deal_id):
            retrieved = await load_deal_context(deal_id, question)
            ...  # existing body, indented one level
```

Apply the same shape to:
- `backend/app/api/routes_query.py` around line 47 — `surface="chat_query"`
- `backend/app/api/routes_doc_matrix.py` around line 33 — `surface="doc_matrix"`

- [ ] **Step 5: Instrument `monitoring_extractor.py`**

Add `from app.agents.llm import llm_call_context` and wrap each of the three extraction blocks (near lines 70, 113, 176):

```python
    with llm_call_context(surface="monitoring", deal_id=deal_id):
        chunks = await context_provider.load_doc_context(deal_id, doc_id, _CALL_PROMPT)
        ...  # existing body, indented one level
```

- [ ] **Step 6: Run tests to verify they pass**

```powershell
$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest tests/test_llm_metrics_store.py -q
```

Expected: PASS (7 tests).

- [ ] **Step 7: Run the full suite — indentation changes are the risk here**

```powershell
$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest -q
```

Expected: PASS. Five files gained an indentation level inside existing blocks; this run is what catches a mis-indented branch. Delete `data\_scratch_test.db` afterwards.

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/workflow_run_executor.py backend/app/api/routes_stream.py backend/app/api/routes_query.py backend/app/api/routes_doc_matrix.py backend/app/services/monitoring_extractor.py backend/tests/test_llm_metrics_store.py
git commit -m "feat(metrics): attribute LLM calls to their calling surface

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Cost summary read route

**Files:**
- Create: `backend/app/api/routes_metrics.py`
- Modify: `backend/app/main.py` (register the router)
- Test: `backend/tests/test_metrics_route.py`

**Interfaces:**
- Consumes: `llm_metrics.summarize` (Task 3), `CostSummary` (Task 3).
- Produces: `GET /deals/{deal_id}/cost?run_id=<optional>` → `CostSummary` JSON. Read access, so `require_deal_access` — not `require_admin`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_metrics_route.py`:

```python
"""Cost summary route: read access, default-deny for non-members."""
from app.agents.llm import LLMCallContext, LLMCallMeta
from app.services import llm_metrics


def _record(deal_id, surface="tabular_cell", run_id=None, prompt=100):
    llm_metrics.record_call(
        LLMCallMeta(model_used="m", prompt_tokens=prompt, completion_tokens=5),
        LLMCallContext(surface=surface, deal_id=deal_id, run_id=run_id),
    )


def test_admin_reads_deal_cost(client):
    client.post("/deals", json={"name": "Fund A", "deal_id": "fund-a"})
    _record("fund-a", prompt=300)

    r = client.get("/deals/fund-a/cost")

    assert r.status_code == 200
    body = r.json()
    assert body["call_count"] == 1
    assert body["prompt_tokens"] == 300
    assert body["by_surface"] == {"tabular_cell": 1}


def test_run_id_filter(client):
    client.post("/deals", json={"name": "Fund A", "deal_id": "fund-a"})
    _record("fund-a", run_id="run-1", prompt=100)
    _record("fund-a", run_id="run-2", prompt=900)

    body = client.get("/deals/fund-a/cost?run_id=run-1").json()

    assert body["call_count"] == 1
    assert body["prompt_tokens"] == 100


def test_analyst_without_access_is_denied(client, analyst_client):
    client.post("/deals", json={"name": "Fund A", "deal_id": "fund-a"})
    _record("fund-a")

    r = analyst_client.get("/deals/fund-a/cost")

    assert r.status_code in (403, 404)


def test_unauthenticated_is_denied():
    from fastapi.testclient import TestClient
    from app.main import app

    r = TestClient(app).get("/deals/fund-a/cost")

    assert r.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest tests/test_metrics_route.py -q
```

Expected: FAIL with 404 on `/deals/fund-a/cost` — the route does not exist.

- [ ] **Step 3: Implement the route**

First read `backend/app/api/routes_deals.py` to copy its exact router construction and `require_deal_access` dependency usage — match it rather than the sketch below if they differ.

Create `backend/app/api/routes_metrics.py`:

```python
"""Cost accounting reads.

Read-only, so require_deal_access (not require_admin) per the RBAC
convention in routes_deals.py.
"""
from fastapi import APIRouter, Depends

from app.auth import require_deal_access
from app.models.metrics import CostSummary
from app.services import llm_metrics

router = APIRouter(tags=["metrics"])


@router.get("/deals/{deal_id}/cost", response_model=CostSummary)
async def get_deal_cost(
    deal_id: str,
    run_id: str | None = None,
    _access=Depends(require_deal_access),
) -> CostSummary:
    """Token spend for a deal, optionally narrowed to a single run."""
    return llm_metrics.summarize(deal_id, run_id=run_id)
```

- [ ] **Step 4: Register the router**

In `backend/app/main.py`, add `routes_metrics` to the existing router imports and add the matching `app.include_router(routes_metrics.router)` line alongside the others.

- [ ] **Step 5: Run tests to verify they pass**

```powershell
$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest tests/test_metrics_route.py tests/test_default_deny.py tests/test_rbac.py -q
```

Expected: PASS. `test_default_deny.py` may enumerate routes — if it fails because it does not know about the new one, add `/deals/{deal_id}/cost` to its expected list rather than weakening the test.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/routes_metrics.py backend/app/main.py backend/tests/test_metrics_route.py
git commit -m "feat(metrics): add deal cost summary route

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Golden set schema and example fixture

**Files:**
- Create: `backend/evals/__init__.py`, `backend/evals/golden_set.py`, `backend/evals/data/example_lpa.md`, `backend/evals/data/example_golden_set.json`
- Test: `backend/tests/test_eval_scoring.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `GoldenQuestion` frozen dataclass: `id: str`, `question: str`, `doc_filename: str`, `expected_pages: tuple[int, ...]`, `note: str = ""`.
  - `load_golden_set(path: str | Path) -> list[GoldenQuestion]`.

**Why `evals/` and not `tests/`:** `pytest.ini` sets `testpaths = tests`, so anything under `tests/` runs in CI. The eval runner makes real, billable Gemini calls and must never run in CI. The *scorer* is pure and is tested under `tests/`.

**The example fixture is a real deliverable, not a stand-in:** it proves the harness runs end-to-end deterministically without a database. The production golden set is built from real deal documents — see Task 9 Step 6.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_eval_scoring.py`:

```python
"""Golden-set loading and citation scoring. Pure functions — no API calls."""
import json

from evals.golden_set import GoldenQuestion, load_golden_set


def test_load_golden_set_parses_entries(tmp_path):
    path = tmp_path / "set.json"
    path.write_text(
        json.dumps([
            {
                "id": "fee-1",
                "question": "What is the management fee?",
                "doc_filename": "example_lpa.md",
                "expected_pages": [2],
                "note": "defined in section 3.2",
            }
        ]),
        encoding="utf-8",
    )

    questions = load_golden_set(path)

    assert len(questions) == 1
    assert questions[0] == GoldenQuestion(
        id="fee-1",
        question="What is the management fee?",
        doc_filename="example_lpa.md",
        expected_pages=(2,),
        note="defined in section 3.2",
    )


def test_load_golden_set_defaults_note_to_empty(tmp_path):
    path = tmp_path / "set.json"
    path.write_text(
        json.dumps([{
            "id": "q1",
            "question": "Q?",
            "doc_filename": "d.md",
            "expected_pages": [1, 3],
        }]),
        encoding="utf-8",
    )

    assert load_golden_set(path)[0].note == ""
    assert load_golden_set(path)[0].expected_pages == (1, 3)


def test_shipped_example_set_loads():
    from pathlib import Path

    path = Path(__file__).resolve().parents[1] / "evals" / "data" / "example_golden_set.json"

    questions = load_golden_set(path)

    assert len(questions) == 3
    assert all(q.expected_pages for q in questions)
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest tests/test_eval_scoring.py -q
```

Expected: FAIL with `ModuleNotFoundError: No module named 'evals'`.

- [ ] **Step 3: Create the package and loader**

Create `backend/evals/__init__.py` (empty file).

Create `backend/evals/golden_set.py`:

```python
"""Golden-set definitions for extraction quality evaluation.

A golden question pins a fact to the page(s) that actually contain it, so
citation accuracy can be scored without a human or an LLM judge.
"""
import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class GoldenQuestion:
    id: str
    question: str
    doc_filename: str
    expected_pages: tuple[int, ...]
    note: str = ""


def load_golden_set(path: str | Path) -> list[GoldenQuestion]:
    """Load a golden set from JSON."""
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return [
        GoldenQuestion(
            id=entry["id"],
            question=entry["question"],
            doc_filename=entry["doc_filename"],
            expected_pages=tuple(entry["expected_pages"]),
            note=entry.get("note", ""),
        )
        for entry in raw
    ]
```

- [ ] **Step 4: Create the fixture document**

Create `backend/evals/data/example_lpa.md`. The `## Page N` headers are required — that is the format `context_provider._full_text_to_chunks` parses, so the fixture exercises the real chunk shape.

```markdown
## Page 1

LIMITED PARTNERSHIP AGREEMENT OF EXAMPLE FUND IV, L.P.

This Agreement is entered into as of January 1, 2026, among the General
Partner and the Limited Partners listed in Schedule A.

## Page 2

SECTION 3.2 — MANAGEMENT FEE.

The Partnership shall pay the General Partner an annual management fee
equal to 2.0% of aggregate Capital Commitments during the Investment
Period, payable quarterly in advance.

## Page 3

SECTION 3.4 — FEE STEP-DOWN.

Following the expiration of the Investment Period, the management fee
shall be reduced to 1.5% of the aggregate acquisition cost of Portfolio
Investments then held by the Partnership.

## Page 4

SECTION 5.1 — PREFERRED RETURN.

Distributions shall be made to the Limited Partners until they have
received a preferred return of 8.0% per annum, compounded annually, on
their unreturned Capital Contributions.

## Page 5

SECTION 5.2 — CARRIED INTEREST.

Thereafter, 80% of distributions shall be made to the Limited Partners
and 20% to the General Partner as carried interest, subject to the
General Partner Clawback in Section 5.6.
```

- [ ] **Step 5: Create the example golden set**

Create `backend/evals/data/example_golden_set.json`:

```json
[
  {
    "id": "mgmt-fee-rate",
    "question": "What is the annual management fee during the investment period?",
    "doc_filename": "example_lpa.md",
    "expected_pages": [2],
    "note": "2.0% of aggregate Capital Commitments, Section 3.2"
  },
  {
    "id": "fee-step-down",
    "question": "How does the management fee change after the investment period ends?",
    "doc_filename": "example_lpa.md",
    "expected_pages": [3],
    "note": "steps down to 1.5% of acquisition cost, Section 3.4"
  },
  {
    "id": "carry-and-pref",
    "question": "What is the preferred return and the carried interest split?",
    "doc_filename": "example_lpa.md",
    "expected_pages": [4, 5],
    "note": "spans two pages — 8% pref on p4, 80/20 split on p5"
  }
]
```

- [ ] **Step 6: Run tests to verify they pass**

```powershell
$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest tests/test_eval_scoring.py -q
```

Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/evals/ backend/tests/test_eval_scoring.py
git commit -m "feat(evals): add golden set schema and example fixture

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Citation accuracy scorer

**Files:**
- Create: `backend/evals/scoring.py`
- Test: `backend/tests/test_eval_scoring.py` (append)

**Interfaces:**
- Consumes: `GoldenQuestion` (Task 7), `Citation` from `app.models.query` (fields: `source_file: str`, `page: int`, `text_snippet: str`).
- Produces:
  - `QuestionScore` frozen dataclass: `id: str`, `hit: bool`, `had_citation: bool`, `cited_pages: tuple[int, ...]`, `expected_pages: tuple[int, ...]`, `precision: float`.
  - `EvalReport` frozen dataclass: `hit_rate: float`, `mean_precision: float`, `no_citation_rate: float`, `scores: tuple[QuestionScore, ...]`.
  - `score_question(golden: GoldenQuestion, citations: list[Citation | None]) -> QuestionScore`
  - `aggregate(scores: list[QuestionScore]) -> EvalReport`

**Metric definitions:**
- **hit** — at least one emitted citation lands on an expected page. "Did it find the fact?"
- **precision** — fraction of emitted citations that are on expected pages. Essential: without it, a model that cites all 200 pages scores a perfect hit rate.
- **no_citation_rate** — fraction of questions that produced no citation at all. Distinguishes "wrong" from "abstained", which are different failures.

`extract_citations` returns a list where unused `[Source N]` positions are `None`; the scorer must filter those out.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_eval_scoring.py`:

```python
from app.models.query import Citation
from evals.scoring import aggregate, score_question

GOLDEN = GoldenQuestion(
    id="q1",
    question="What is the fee?",
    doc_filename="example_lpa.md",
    expected_pages=(2, 3),
)


def _cite(page, source="example_lpa.md"):
    return Citation(source_file=source, page=page, text_snippet="...")


def test_hit_when_one_citation_is_on_an_expected_page():
    score = score_question(GOLDEN, [_cite(2)])

    assert score.hit is True
    assert score.had_citation is True
    assert score.precision == 1.0
    assert score.cited_pages == (2,)


def test_miss_when_all_citations_are_off_target():
    score = score_question(GOLDEN, [_cite(7), _cite(9)])

    assert score.hit is False
    assert score.had_citation is True
    assert score.precision == 0.0


def test_precision_penalizes_shotgun_citing():
    score = score_question(GOLDEN, [_cite(2), _cite(7), _cite(8), _cite(9)])

    assert score.hit is True
    assert score.precision == 0.25


def test_none_entries_are_ignored():
    """extract_citations pads unused [Source N] slots with None."""
    score = score_question(GOLDEN, [None, _cite(3), None])

    assert score.hit is True
    assert score.cited_pages == (3,)
    assert score.precision == 1.0


def test_no_citations_is_a_miss_not_a_crash():
    score = score_question(GOLDEN, [])

    assert score.hit is False
    assert score.had_citation is False
    assert score.precision == 0.0


def test_all_none_is_treated_as_no_citation():
    score = score_question(GOLDEN, [None, None])

    assert score.had_citation is False
    assert score.hit is False


def test_wrong_document_is_a_miss():
    score = score_question(GOLDEN, [_cite(2, source="other.pdf")])

    assert score.hit is False
    assert score.precision == 0.0


def test_aggregate_computes_rates():
    scores = [
        score_question(GOLDEN, [_cite(2)]),
        score_question(GOLDEN, [_cite(9)]),
        score_question(GOLDEN, []),
        score_question(GOLDEN, [_cite(3)]),
    ]

    report = aggregate(scores)

    assert report.hit_rate == 0.5
    assert report.no_citation_rate == 0.25
    assert report.mean_precision == 0.5
    assert len(report.scores) == 4


def test_aggregate_of_empty_is_zeroed():
    report = aggregate([])

    assert report.hit_rate == 0.0
    assert report.mean_precision == 0.0
    assert report.no_citation_rate == 0.0
```

- [ ] **Step 2: Run test to verify it fails**

```powershell
$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest tests/test_eval_scoring.py -q
```

Expected: FAIL with `ModuleNotFoundError: No module named 'evals.scoring'`.

- [ ] **Step 3: Implement**

Create `backend/evals/scoring.py`:

```python
"""Citation accuracy scoring.

Fully automatable: a golden question names the page(s) that contain the
fact, so correctness of the *citation* needs no human and no LLM judge.
This is the product's core promise (CLAUDE.md invariant 6) as a number.
"""
from dataclasses import dataclass

from app.models.query import Citation
from evals.golden_set import GoldenQuestion


@dataclass(frozen=True)
class QuestionScore:
    id: str
    hit: bool
    had_citation: bool
    cited_pages: tuple[int, ...]
    expected_pages: tuple[int, ...]
    precision: float


@dataclass(frozen=True)
class EvalReport:
    hit_rate: float
    mean_precision: float
    no_citation_rate: float
    scores: tuple[QuestionScore, ...]


def score_question(
    golden: GoldenQuestion, citations: list[Citation | None]
) -> QuestionScore:
    """Score one answer's citations against the golden pages.

    hit       — at least one citation lands on an expected page
    precision — fraction of citations that are on expected pages; without
                it, citing every page would score a perfect hit rate
    """
    real = [c for c in citations if c is not None]
    on_target = [
        c
        for c in real
        if c.source_file == golden.doc_filename and c.page in golden.expected_pages
    ]

    return QuestionScore(
        id=golden.id,
        hit=len(on_target) > 0,
        had_citation=len(real) > 0,
        cited_pages=tuple(c.page for c in real),
        expected_pages=golden.expected_pages,
        precision=(len(on_target) / len(real)) if real else 0.0,
    )


def aggregate(scores: list[QuestionScore]) -> EvalReport:
    """Roll individual scores into headline rates."""
    if not scores:
        return EvalReport(
            hit_rate=0.0, mean_precision=0.0, no_citation_rate=0.0, scores=()
        )

    n = len(scores)
    return EvalReport(
        hit_rate=sum(1 for s in scores if s.hit) / n,
        mean_precision=sum(s.precision for s in scores) / n,
        no_citation_rate=sum(1 for s in scores if not s.had_citation) / n,
        scores=tuple(scores),
    )
```

- [ ] **Step 4: Run tests to verify they pass**

```powershell
$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest tests/test_eval_scoring.py -q
```

Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/evals/scoring.py backend/tests/test_eval_scoring.py
git commit -m "feat(evals): add citation accuracy scorer

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Eval runner CLI

**Files:**
- Create: `backend/evals/run_eval.py`
- Modify: none
- Test: manual — this task's verification is a live run (Step 5). The pure logic it composes is already covered by Tasks 7 and 8.

**Interfaces:**
- Consumes: `load_golden_set` (Task 7), `score_question` / `aggregate` (Task 8), `run_extraction` from `app.services.extraction_engine`, `_full_text_to_chunks` from `app.services.context_provider`.
- Produces: `python -m evals.run_eval --golden <path> --docs <dir> [--out <path>]`, run from `backend/`.

**Why it calls `run_extraction` directly:** the spec requires the harness to hit the extraction primitive, not the HTTP surface — no app lifecycle, no auth, no DB. Fixture mode reads the document from disk and builds chunks with the same `_full_text_to_chunks` the real full-context path uses, so the chunk shape under test is the production one.

**Deliberately not included:** a `--strategy` flag. `CONTEXT_STRATEGY` does not exist until Plan C. Adding the flag now would be a placeholder.

- [ ] **Step 1: Implement the runner**

Create `backend/evals/run_eval.py`:

```python
"""Extraction quality eval runner.

Makes real, billable Gemini calls — deliberately outside `tests/` so CI
never runs it (pytest.ini sets testpaths = tests).

Usage, from backend/:
    python -m evals.run_eval --golden evals/data/example_golden_set.json \
                             --docs evals/data
"""
import argparse
import asyncio
import json
from dataclasses import asdict
from pathlib import Path

from app.services.context_provider import _full_text_to_chunks
from app.services.extraction_engine import run_extraction
from evals.golden_set import load_golden_set
from evals.scoring import aggregate, score_question


async def _run_one(question, docs_dir: Path):
    doc_path = docs_dir / question.doc_filename
    chunks = _full_text_to_chunks(
        doc_path.read_text(encoding="utf-8"),
        question.doc_filename,
        f"eval-{question.doc_filename}",
    )
    result = await run_extraction(
        chunks, question.question, require_citations=True
    )
    return score_question(question, result.citations), result


async def main_async(golden_path: Path, docs_dir: Path, out_path: Path | None):
    questions = load_golden_set(golden_path)
    scores = []

    for q in questions:
        score, result = await _run_one(q, docs_dir)
        scores.append(score)
        mark = "HIT " if score.hit else "MISS"
        print(
            f"{mark} {q.id:<20} expected={list(score.expected_pages)} "
            f"cited={list(score.cited_pages)} precision={score.precision:.2f}"
        )
        if not score.hit:
            print(f"       answer: {result.answer[:200]}")

    report = aggregate(scores)
    print()
    print(f"hit_rate         {report.hit_rate:.3f}")
    print(f"mean_precision   {report.mean_precision:.3f}")
    print(f"no_citation_rate {report.no_citation_rate:.3f}")
    print(f"questions        {len(report.scores)}")

    if out_path:
        out_path.write_text(
            json.dumps(
                {
                    "hit_rate": report.hit_rate,
                    "mean_precision": report.mean_precision,
                    "no_citation_rate": report.no_citation_rate,
                    "scores": [asdict(s) for s in report.scores],
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"\nwrote {out_path}")


def main():
    parser = argparse.ArgumentParser(description="Run the extraction quality eval.")
    parser.add_argument("--golden", required=True, type=Path)
    parser.add_argument("--docs", required=True, type=Path)
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    asyncio.run(main_async(args.golden, args.docs, args.out))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify the runner imports cleanly**

```powershell
.\.venv\Scripts\python.exe -c "import evals.run_eval; print('ok')"
```

Expected: `ok`.

- [ ] **Step 3: Verify the CLI parses**

```powershell
.\.venv\Scripts\python.exe -m evals.run_eval --help
```

Expected: usage text listing `--golden`, `--docs`, `--out`.

- [ ] **Step 4: Run against the example set (live, billable)**

Requires `GEMINI_API_KEY`. Three calls against a five-page fixture — cost is negligible.

```powershell
$env:GEMINI_API_KEY="<your key>"; .\.venv\Scripts\python.exe -m evals.run_eval --golden evals/data/example_golden_set.json --docs evals/data --out evals/example_report.json
```

Expected: three `HIT`/`MISS` lines followed by the summary block, and `evals/example_report.json` written.

**Interpretation:** the fixture facts are unambiguous and on distinct pages, so `hit_rate` should be at or near `1.000`. A low score here means the *harness* is broken (wrong chunk shape, citations not parsing), not that the model is bad — debug the harness before trusting any real run.

- [ ] **Step 5: Add the report artifact to .gitignore**

Append to `backend/.gitignore` (create the file if absent):

```
evals/example_report.json
evals/reports/
```

- [ ] **Step 6: Document how to build the real golden set**

Create `backend/evals/README.md`:

```markdown
# Extraction quality evals

Measures whether answers cite the page that actually contains the fact —
the product promise (CLAUDE.md invariant 6) expressed as a number.

## Running

    python -m evals.run_eval --golden evals/data/<set>.json --docs <dir>

Makes real Gemini calls. Never run from CI.

## Metrics

- `hit_rate` — fraction of questions where some citation landed on an
  expected page. "Did it find the fact?"
- `mean_precision` — fraction of emitted citations that were on target.
  Without this, citing every page would score a perfect hit rate.
- `no_citation_rate` — fraction that produced no citation at all.
  Distinguishes "wrong" from "abstained".

## Building the production golden set

The shipped `example_golden_set.json` proves the harness works. It is not
a quality measurement — the fixture is synthetic and trivially easy.

To build a real set (target: 30–50 questions over 3–4 real documents):

1. Pick documents already ingested in a dev deal — an LPA, a DDQ, a
   quarterly report, and an audited financial statement give good spread.
2. Export each one's `full_text_md` to `evals/data/<name>.md`:

       sqlite3 data/vyntic.db \
         "SELECT full_text_md FROM documents WHERE doc_id='<id>';" \
         > evals/data/<name>.md

3. For each question, read the document and record the page number(s)
   where the answer actually appears. **Page numbers come from the
   `## Page N` headers in the exported markdown**, not the PDF's printed
   page numbers — they differ whenever the PDF has unnumbered front matter.
4. Bias question selection toward the failures that matter: facts that
   are defined in one place and modified in another (a fee set in the LPA
   and waived in a side letter), and facts stated with vocabulary that
   differs from how an analyst would ask.
5. Keep the documents out of git if they contain real client data — add
   `evals/data/*.md` to `.gitignore` and keep the JSON sets, which contain
   only questions and page numbers.
```

- [ ] **Step 7: Commit**

```bash
git add backend/evals/run_eval.py backend/evals/README.md backend/.gitignore
git commit -m "feat(evals): add eval runner CLI

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Gemini context caching spike

**Files:**
- Create: `docs/superpowers/spikes/2026-07-29-gemini-context-caching-findings.md`
- Modify: none — **this task writes no production code.**

**Interfaces:**
- Consumes: `stream_with_fallback` (`llm.py:74`), `get_last_meta` token fields (Task 1).
- Produces: a findings document answering three questions, which decides the shape of Plan B.

**The three questions:**
1. Does `langchain-google-genai` (installed version, `>=2.0.0`) expose Gemini's explicit `CachedContent` API through `ChatGoogleGenerativeAI`?
2. Does `gemini-3.1-flash-lite` perform *implicit* prefix caching automatically?
3. What is the minimum cacheable token count, and what does cache storage cost per hour?

**Why this blocks Plan B:** if the answer to (1) and (2) is both no, caching requires a native `google-genai` client path inside `stream_with_fallback` — which must also reimplement the two-tier fallback logic. That is a materially larger Plan B than "pass a cache handle", and it should be sized before it is committed to.

- [ ] **Step 1: Record the installed version**

```powershell
.\.venv\Scripts\python.exe -m pip show langchain-google-genai | Select-String "Version"
```

- [ ] **Step 2: Probe for explicit cache support**

```powershell
.\.venv\Scripts\python.exe -c @'
import inspect
from langchain_google_genai import ChatGoogleGenerativeAI as C
fields = set(getattr(C, "model_fields", {}))
print("cached_content field:", "cached_content" in fields)
print("cache-ish fields:", sorted(f for f in fields if "cach" in f.lower()))
print("cache-ish methods:", sorted(m for m in dir(C) if "cach" in m.lower()))
'@
```

Record the exact output. `cached_content: True` answers question 1 affirmatively and makes Plan B small.

- [ ] **Step 3: Probe for implicit caching (live, billable)**

Sends the same ~4,000-token prefix twice. If implicit caching is active, the second call reports non-zero `cached_tokens` — which works only because Task 1 wired `input_token_details.cache_read` through.

```powershell
$env:GEMINI_API_KEY="<your key>"; .\.venv\Scripts\python.exe -c @'
import asyncio
from langchain_core.messages import HumanMessage, SystemMessage
from app.agents.llm import stream_with_fallback, get_last_meta

PREFIX = ("Section 3.2. The management fee is 2.0% of commitments. " * 400)

async def one(label):
    msgs = [SystemMessage(content=PREFIX), HumanMessage(content="What is the fee?")]
    async for _ in stream_with_fallback(msgs):
        pass
    m = get_last_meta()
    print(f"{label}: prompt={m.prompt_tokens} cached={m.cached_tokens}")

async def main():
    await one("call-1")
    await one("call-2")

asyncio.run(main())
'@
```

Record both lines. `cached > 0` on call-2 answers question 2 affirmatively.

- [ ] **Step 4: Look up pricing and cache limits**

Check Google's live pricing and caching documentation for `gemini-3.1-flash-lite`: input price per 1M tokens, cached-input price per 1M tokens, cache storage price per 1M tokens per hour, and the minimum token count for an explicit cache. **Do not carry over the estimates from the design spec — they are explicitly flagged as unverified there.**

- [ ] **Step 5: Write the findings document**

Create `docs/superpowers/spikes/2026-07-29-gemini-context-caching-findings.md` with this exact structure, filled from Steps 1–4:

```markdown
# Spike — Gemini context caching feasibility

**Date:** 2026-07-29
**Question:** Can Vyntic cache the document prefix across repeated LLM calls,
and through which client?
**Feeds:** Plan B of `docs/superpowers/specs/2026-07-29-hybrid-context-strategy-design.md`

## Environment

- langchain-google-genai: <version from Step 1>
- Model: gemini-3.1-flash-lite

## Q1 — Explicit CachedContent via langchain?

<paste Step 2 output>

**Answer:** yes / no

## Q2 — Implicit prefix caching?

<paste Step 3 output>

**Answer:** yes / no

## Q3 — Pricing and limits

| | |
|---|---|
| Input / 1M tokens | |
| Cached input / 1M tokens | |
| Cache storage / 1M tokens / hour | |
| Minimum explicit cache size | |

Source: <URL, with date accessed>

## Recommendation for Plan B

One of:

- **Implicit caching suffices** — no client change; Plan B is measurement
  plus prompt-ordering work to keep the document prefix byte-stable across
  calls (stable prefix is what makes implicit caching hit).
- **Explicit caching via langchain** — Plan B threads a cache handle
  through `get_llm`; moderate size.
- **Native SDK required** — Plan B adds a `google-genai` path inside
  `stream_with_fallback` *including* a reimplementation of the two-tier
  pre-token fallback. Largest option; size it explicitly before committing.

## Residual risk

<anything that could not be determined, and what would resolve it>
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/spikes/2026-07-29-gemini-context-caching-findings.md
git commit -m "docs: Gemini context caching spike findings

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Definition of done

- [ ] `GET /deals/{deal_id}/cost` returns real token counts after a workflow run, broken down by surface.
- [ ] A live run of a multi-column workflow shows the measured column multiplier — replacing the design spec's estimate.
- [ ] `python -m evals.run_eval` scores the example set end-to-end with `hit_rate` at or near 1.000.
- [ ] `backend/evals/README.md` documents building a real golden set.
- [ ] The caching spike findings document answers all three questions with a sized Plan B recommendation.
- [ ] Full suite green: `$env:DATABASE_URL="sqlite:///./data/_scratch_test.db"; .\.venv\Scripts\python.exe -m pytest -q`
- [ ] `data\_scratch_test.db` deleted; `backend/data/vyntic.db` intact.

## Follow-ups this plan deliberately does not do

- **Answer-correctness scoring.** The spec's 0b names two scores; this plan builds only citation accuracy. The spec calls correctness "noisier, secondary", and it needs either a human pass or an LLM judge — the latter being a new LLM call path, which invariant 5 makes a design decision rather than a detail. Citation accuracy alone is sufficient to gate Plans B and C: caching must not change it at all, and the allocator must not degrade it. Revisit if a real golden set shows answers that cite correctly but reason wrongly.
- **Cost in currency.** Everything is in tokens. Converting to dollars needs the verified pricing from Task 10 and a rate table; deferred to Plan B so there is one source of truth.
- **Frontend surfacing.** The cost route has no UI. Deliberate — the audience for Plan A is the team deciding Plans B and C.
- **`comparison_graph.py`.** Not audited for LLM calls outside `stream_with_fallback` / `invoke_with_fallback`. If it calls a model directly it will not be counted; check during Task 5 and note it if so.
- **Retention.** `llm_calls` grows unbounded. Fine at pilot volume; needs a retention policy before production.
