# Rearchitect: Correctness Fixes + Extraction Engine Consolidation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Branch:** `fable-rearchitect` (already checked out). Commit per task.

**Goal:** Fix the verified correctness bugs introduced or exposed by the full-context migration, make workflow-run lifecycle (cancel / restart / retry) behave as documented, harden the LLM call layer, then consolidate the five duplicated extraction paths into one engine and delete dead code (ai-service, LangGraph). Finish with authz alignment, CI, and a README truth pass.

**Architecture:** All product surfaces (agent chat, tabular cells, assistant stages, doc matrix, multi-deal compare) perform the same primitive: *load context → build numbered context string → SINGLE_DEAL_SYSTEM → stream with fallback → extract citations*. Today this is implemented five times; the full-context migration missed one call site and broke the streaming chat. Phases 0–2 fix bugs in place (small, shippable diffs). Phase 3 extracts the primitive into `extraction_engine.py` and repoints every call site so this class of bug cannot recur. RAG code (vector_store / embedder / chunker) stays in the repo behind `context_provider` as the future retrieval-strategy seam — do not delete it.

**Tech stack:** Python 3.12, FastAPI, SQLAlchemy 2, Pydantic v2, langchain-google-genai, pytest. Frontend: Vite 5 + React 18 + TypeScript.

---

## Context: verified findings driving this plan

Line-by-line verified on 2026-07-02 (all references current on `main` @ 36a65b1):

| # | Finding | Where | Severity |
|---|---|---|---|
| F1 | Streaming agent chat calls `vector_store.query_deal` directly; full-context ingest embeds nothing → new docs get "No relevant documents found" in chat | `routes_query.py:21,51`; `routes_ingest.py:164-207` | P0 — broken surface |
| F2 | Synthesis cells sort by score (all `1.0` in full-context) then slice `[:32]` → all synthesis templates (Financial/Commercial/Operational/Legal DD, Risk Scorecard, Proactive Scan → Brief/Findings) see only ~the first 32 pages, then confidently report "Not found" | `workflow_run_executor.py:312-316`; `context_provider.py:43` | P0 — silent wrong answers |
| F3 | SQLite FK enforcement is off (no `PRAGMA foreign_keys`); `ondelete="CASCADE"` is inert → deal delete orphans workflows/runs/cells/conversations/access rows | `database.py` (unused `event` import at :7) | High — data corruption |
| F4 | No startup recovery: runs interrupted by a backend restart stay `running` forever | `workflow_run_executor.py:85-90`; `main.py` startup | High |
| F5 | Cancel doesn't cancel tabular runs: executor snapshot keeps executing, `mark_cell_running` flips cancelled cells back to running, finalization overwrites run status `cancelled` → `complete`. Assistant cancel ends run as `error` | `routes_workflow_runs.py:172-185`; `workflow_run_store.py:287-299,407-422` | High |
| F6 | `_last_meta` is a module global (comment claims "per-task") → concurrent calls attribute wrong model/fallback/duration to cells | `llm.py:24-25` | Medium |
| F7 | Mid-stream fallback restarts the answer while consumers keep appending → duplicated/corrupted answers on mid-stream primary failure | `llm.py:88-96` | Medium |
| F8 | `kick_off_assistant_run` docstring claims idempotency; no guard exists → double-clicked approve can double-execute a stage | `workflow_run_executor.py:169-176`; `workflow_run_store.py:559-576` | Medium |
| F9 | Formula `eval()` char-whitelist admits `**` → `=9**9**9` computes a huge int synchronously on the event loop (backend freeze) | `workflow_run_executor.py:578-590` | Medium |
| F10 | `convert_system_message_to_human=True` demotes the engineered system prompt into the user turn; modern Gemini supports system instructions natively | `llm.py:51` | Medium — quality |
| F11 | No admin gating anywhere in deal routes despite README claiming create/delete/upload/stage are admin-only; any analyst with deal access can delete the deal + files + vectors | `routes_deals.py:20-103`; `routes_ingest.py` | High — authz |
| F12 | `ai-service/` (Express sidecar) is orphaned: not in docker-compose, never called by the frontend; `routes_internal.py` + `internal_api_token` exist only to serve it. Divergent duplicate citation/prompt logic | `ai-service/*`; `routes_internal.py`; `config.py:21` | Medium — dead weight |
| F13 | LangGraph is decorative: 2-node linear graph; fan-out is `asyncio.gather` inside one node | `comparison_graph.py` | Low |
| F14 | No CI; README describes Next.js 14 (frontend is Vite), a frontend test suite that doesn't exist, and a docker-compose frontend service with no Dockerfile/start-prod.sh | `.github/` absent; `README.md`; `docker-compose.yml:21-56` | Medium |
| F15 | Dead constant `_TABULAR_DOC_TOP_K = 12`; default secrets (`jwt_secret_key`, admin password) with no production guard | `workflow_run_executor.py:33`; `config.py:18-23` | Low |

**Intentional decisions (do not "fix"):** full-context mode stays the default; RAG code stays in-repo behind `context_provider` as a strategy seam; SQLite stays for now; Vite stays.

---

## File Map

**Phase 0 — P0 correctness**

| File | Action | Responsibility |
|---|---|---|
| `backend/app/api/routes_query.py` | Modify | F1: route streaming chat through `load_deal_context` |
| `backend/app/services/workflow_run_executor.py` | Modify | F2: full-context synthesis uses char budget, not score-sort + `[:32]` |
| `backend/app/database.py` | Modify | F3: SQLite `foreign_keys=ON` + WAL via connect listener |
| `backend/app/services/workflow_run_store.py` | Modify | F4: `reconcile_interrupted_runs()` |
| `backend/app/main.py` | Modify | F4: call reconciler on startup |
| `backend/tests/test_query_stream_full_context.py` | Create | Regression test for F1 |
| `backend/tests/test_synthesis_context_budget.py` | Create | Regression test for F2 |
| `backend/tests/test_database_fk.py` | Create | Cascade test for F3 |
| `backend/tests/test_run_reconciler.py` | Create | Test for F4 |

**Phase 1 — Run lifecycle correctness**

| File | Action | Responsibility |
|---|---|---|
| `backend/app/services/workflow_run_store.py` | Modify | F5/F8: atomic claim in `mark_cell_running` / `mark_stage_running`; cancelled-aware terminal check |
| `backend/app/services/workflow_run_executor.py` | Modify | F5/F8: skip unclaimed cells, `_finalize_run_status` helper that never overwrites `cancelled`, active-assistant-run guard |
| `backend/tests/test_run_cancel.py` | Create | Cancel actually cancels; status preserved |
| `backend/tests/test_assistant_run_guard.py` | Create | Double-approve doesn't double-execute |

**Phase 2 — LLM gateway hardening**

| File | Action | Responsibility |
|---|---|---|
| `backend/app/agents/llm.py` | Modify | F6: `ContextVar` meta. F7: no fallback after first token. F10: native system messages |
| `backend/app/services/workflow_run_executor.py` | Modify | F9: reject `**` and oversized formula expressions; delete `_TABULAR_DOC_TOP_K` |
| `backend/tests/test_llm_meta_concurrency.py` | Create | F6 regression |
| `backend/tests/test_llm_fallback_policy.py` | Create | F7 regression |
| `backend/tests/test_formula_hardening.py` | Create | F9 regression |

**Phase 3 — Extraction engine consolidation + dead code removal**

| File | Action | Responsibility |
|---|---|---|
| `backend/app/services/extraction_engine.py` | Create | The one primitive: context → prompt → stream → citations |
| `backend/tests/test_extraction_engine.py` | Create | Engine contract tests |
| `backend/app/agents/single_deal_qa.py` | Modify | Repoint to engine |
| `backend/app/api/routes_query.py` | Modify | Repoint to engine |
| `backend/app/api/routes_stream.py` | Modify | Repoint to engine |
| `backend/app/api/routes_doc_matrix.py` | Modify | Repoint to engine |
| `backend/app/services/workflow_run_executor.py` | Modify | Repoint cell + assistant-stage execution to engine |
| `backend/app/agents/comparison_graph.py` | Rewrite | F13: plain async function, drop LangGraph |
| `backend/requirements.txt` | Modify | Remove `langgraph` |
| `ai-service/` (whole dir) | Delete | F12 |
| `backend/app/api/routes_internal.py` | Delete | F12 |
| `backend/app/main.py` | Modify | Remove internal router |
| `backend/app/config.py` | Modify | Remove `internal_api_token` |

**Phase 4 — AuthZ alignment + secrets guard**

| File | Action | Responsibility |
|---|---|---|
| `backend/app/auth.py` | Modify | `require_admin` dependency |
| `backend/app/api/routes_deals.py` | Modify | F11: admin-gate create/delete/stage per README |
| `backend/app/api/routes_ingest.py` | Modify | F11: admin-gate upload/delete documents |
| `backend/app/config.py` + `backend/app/main.py` | Modify | F15: `environment` setting; refuse prod boot with default secrets |
| `backend/tests/test_rbac.py` | Create | 403 tests for analyst on admin-only routes |

**Phase 5 — CI, compose, README truth**

| File | Action | Responsibility |
|---|---|---|
| `.github/workflows/ci.yml` | Create | pytest + frontend typecheck/build on PR |
| `frontend/Dockerfile` | Create | F14: build + serve the Vite app |
| `frontend/vite.config.ts` | Modify | Env-driven proxy target |
| `docker-compose.yml` | Modify | Fix frontend services (drop `NEXT_*`, fix commands) |
| `README.md` | Modify | Truth pass |

---

## Phase 0 — P0 correctness

### Task 0.1: Fix streaming agent chat (F1)

The full-context migration plan (`2026-06-03-full-context-migration.md`) migrated `routes_stream.py`, `routes_doc_matrix.py`, `single_deal_qa.py`, and the executor — but the chat SSE generator had moved into `routes_query.py` (PR #80) and was missed.

**Files:**
- Modify: `backend/app/api/routes_query.py`
- Create: `backend/tests/test_query_stream_full_context.py`

- [ ] **Step 1: Write the failing regression test**

Create `backend/tests/test_query_stream_full_context.py`. Test `_stream_answer` retrieves via the context provider, not the vector store:

```python
import pytest
from app.api import routes_query


@pytest.mark.asyncio
async def test_stream_answer_uses_context_provider(monkeypatch):
    calls = []

    async def fake_load_deal_context(deal_id, question):
        calls.append((deal_id, question))
        return []  # empty → early "done" event, no LLM call

    monkeypatch.setattr(routes_query, "load_deal_context", fake_load_deal_context)

    events = [e async for e in routes_query._stream_answer("deal-1", "revenue?")]

    assert calls == [("deal-1", "revenue?")]
    assert events[-1]["type"] == "done"


def test_routes_query_does_not_import_vector_store():
    import inspect
    src = inspect.getsource(routes_query)
    assert "vector_store" not in src
```

Run: `cd backend && pytest tests/test_query_stream_full_context.py -v` — both must fail (the module still imports `query_deal` from `vector_store`).

- [ ] **Step 2: Fix the import and call site**

In `backend/app/api/routes_query.py`:
- Line 21: replace `from app.services.vector_store import query_deal` with `from app.services.context_provider import load_deal_context`
- Line 51: replace `retrieved = await query_deal(deal_id, question)` with `retrieved = await load_deal_context(deal_id, question)`

- [ ] **Step 3: Verify**

```bash
cd backend && pytest tests/test_query_stream_full_context.py tests/test_context_provider.py -v
```

- [ ] **Step 4: Commit** — `fix(chat): route streaming agent chat through context provider (full-context migration missed call site)`

---

### Task 0.2: Fix synthesis context truncation (F2)

In full-context mode every chunk scores `1.0`, so `sorted(..., reverse=True)[:32]` (stable sort) keeps the **first 32 page-chunks** of the corpus. The `[:32]` cap is a RAG-mode concept ("top 32 most relevant"); in full-context mode replace it with a character budget so synthesis sees the whole corpus up to the model's context limit. Note assistant stages already send the full corpus with no cap — this makes tabular synthesis consistent with them.

**Files:**
- Modify: `backend/app/services/workflow_run_executor.py`
- Create: `backend/tests/test_synthesis_context_budget.py`

- [ ] **Step 1: Write failing tests**

Test the new helper directly (extract the selection logic so it's testable without a run):

```python
from app.services.workflow_run_executor import _select_synthesis_chunks

def _mk(doc, page, content="x" * 1000, score=1.0):
    return {"content": content, "source_file": doc, "page": page,
            "doc_id": doc, "score": score, "section_type": "text"}

def test_full_context_keeps_all_pages_within_budget(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "full_context_mode", True)
    chunks = [_mk("a.pdf", p) for p in range(1, 41)] + [_mk("b.pdf", p) for p in range(1, 41)]
    out = _select_synthesis_chunks(chunks)
    assert len(out) == 80  # previously silently truncated to 32

def test_full_context_truncates_at_char_budget(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "full_context_mode", True)
    chunks = [_mk("a.pdf", p, content="x" * 500_000) for p in range(1, 11)]  # 5M chars
    out = _select_synthesis_chunks(chunks)
    assert 0 < len(out) < 10  # truncated at page boundary, front of corpus kept

def test_rag_mode_keeps_topk_by_score(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "full_context_mode", False)
    chunks = [_mk("a.pdf", p, score=1.0 - p * 0.01) for p in range(1, 60)]
    out = _select_synthesis_chunks(chunks)
    assert len(out) == 32
    assert out == sorted(out, key=lambda c: c["score"], reverse=True)
```

- [ ] **Step 2: Implement `_select_synthesis_chunks`**

In `workflow_run_executor.py`, add near the constants:

```python
# ~800K tokens at ~4 chars/token. Keep in sync with
# context_provider._FC_TOKEN_WARN_THRESHOLD.
_SYNTHESIS_CHAR_BUDGET = 3_200_000


def _select_synthesis_chunks(retrieved: list[dict]) -> list[dict]:
    """Pick the context set for a multi_doc_synthesis cell.

    RAG mode: top-K by relevance score (scores are meaningful).
    Full-context mode: scores are uniformly 1.0, so sorting is meaningless —
    keep document/page order and truncate at a page boundary once the char
    budget is exhausted, logging what was dropped.
    """
    if not settings.full_context_mode:
        return sorted(retrieved, key=lambda c: c.get("score", 0), reverse=True)[
            :_TABULAR_SYNTHESIS_MAX_CHUNKS
        ]
    out: list[dict] = []
    total = 0
    for chunk in retrieved:
        total += len(chunk.get("content", ""))
        if out and total > _SYNTHESIS_CHAR_BUDGET:
            logger.warning(
                "Synthesis context truncated at %d of %d chunks (~%dK chars)",
                len(out), len(retrieved), total // 1000,
            )
            break
        out.append(chunk)
    return out
```

Add `from app.config import settings` to the module imports. Replace the sort+slice at lines 312–316 with `retrieved = _select_synthesis_chunks(retrieved)`.

- [ ] **Step 3: Verify** — `pytest tests/test_synthesis_context_budget.py tests/test_workflow_format_typed.py -v`

- [ ] **Step 4: Commit** — `fix(workflows): synthesis cells see full corpus in full-context mode, not first 32 pages`

---

### Task 0.3: Enable SQLite FK enforcement + WAL (F3)

**Files:**
- Modify: `backend/app/database.py`
- Create: `backend/tests/test_database_fk.py`

- [ ] **Step 1: Write failing cascade test**

Using the existing test DB fixture pattern from `tests/conftest.py`: insert a `DealRow`, a deal-scoped `WorkflowRow` and a `WorkflowRunRow` referencing it; delete the deal via `deal_store.delete_deal`; assert the workflow and run rows are gone.

- [ ] **Step 2: Register the connect listener**

In `database.py` (the `event` import at line 7 already exists — it was clearly intended for this):

```python
if engine.dialect.name == "sqlite":
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()
```

Guarding on dialect keeps the Postgres migration path clean.

- [ ] **Step 3: Verify** — full suite: `pytest -v`. Watch specifically for tests that (accidentally) relied on orphan rows surviving.

- [ ] **Step 4: Commit** — `fix(db): enforce SQLite foreign keys + WAL via connect listener`

---

### Task 0.4: Startup reconciler for interrupted runs (F4)

Design decision: mark interrupted work as **errored**, don't auto-resume — auto-resume silently spends tokens on every restart, and per-cell/per-column retry endpoints already exist for recovery. Runs paused at `checkpoint` are left untouched (they resume correctly via approve).

**Files:**
- Modify: `backend/app/services/workflow_run_store.py`, `backend/app/main.py`
- Create: `backend/tests/test_run_reconciler.py`

- [ ] **Step 1: Write failing test** — seed a run with status `running`, one cell `running`, one `queued`, one `complete`; call `reconcile_interrupted_runs()`; assert run is `error`, the running/queued cells are `error` with message `"Interrupted by server restart"`, the complete cell untouched, and a `checkpoint` run is untouched.

- [ ] **Step 2: Implement in `workflow_run_store.py`**

```python
def reconcile_interrupted_runs() -> int:
    """Mark runs stranded by a restart as errored. Returns count reconciled.

    In-process executor tasks die with the process; anything left in
    pending/running was interrupted. Checkpoint runs are legitimately paused
    and resume via the approve endpoint, so they are skipped.
    """
    db = SessionLocal()
    try:
        stranded = (
            db.query(WorkflowRunRow)
            .filter(WorkflowRunRow.status.in_(("pending", "running")))
            .all()
        )
        for run in stranded:
            db.query(TabularCellRow).filter(
                TabularCellRow.run_id == run.id,
                TabularCellRow.status.in_(("queued", "running")),
            ).update({"status": "error", "error_message": "Interrupted by server restart"})
            db.query(AssistantStageOutputRow).filter(
                AssistantStageOutputRow.run_id == run.id,
                AssistantStageOutputRow.status.in_(("queued", "running")),
            ).update({"status": "error", "error_message": "Interrupted by server restart"})
            run.status = "error"
            run.completed_at = datetime.utcnow()
        db.commit()
        return len(stranded)
    finally:
        db.close()
```

- [ ] **Step 3: Call it from startup** in `main.py`, after `init_db()`:

```python
    from app.services.workflow_run_store import reconcile_interrupted_runs
    reconciled = reconcile_interrupted_runs()
    if reconciled:
        logger.info(f"Reconciled {reconciled} run(s) interrupted by restart")
```

- [ ] **Step 4: Verify + commit** — `pytest tests/test_run_reconciler.py -v`; commit `fix(workflows): reconcile runs stranded by backend restart`

---

## Phase 1 — Run lifecycle correctness (cancel, claims, double-execution)

### Task 1.1: Atomic cell/stage claims (F5, F8 foundation)

**Files:**
- Modify: `backend/app/services/workflow_run_store.py`, `backend/app/services/workflow_run_executor.py`

- [ ] **Step 1: Failing tests** (in `backend/tests/test_run_cancel.py`): `mark_cell_running` on a cell whose status is `error` (i.e. cancelled) returns `None`; on a `queued` cell returns the cell; second concurrent claim returns `None`.

- [ ] **Step 2: Convert `mark_cell_running` to an atomic claim**

```python
def mark_cell_running(cell_id: str) -> TabularCell | None:
    """Atomically claim a queued cell. Returns None if the cell is not
    claimable (already running/terminal/cancelled) — callers must skip it."""
    db = SessionLocal()
    try:
        claimed = (
            db.query(TabularCellRow)
            .filter(TabularCellRow.id == cell_id, TabularCellRow.status == "queued")
            .update({"status": "running", "started_at": datetime.utcnow()})
        )
        db.commit()
        if not claimed:
            return None
        row = db.query(TabularCellRow).filter(TabularCellRow.id == cell_id).first()
        return _row_to_cell(row) if row else None
    finally:
        db.close()
```

Mirror the same `WHERE status == "queued"` guard in `mark_stage_running`.

- [ ] **Step 3: Make the executor respect failed claims**

In `execute_cell` (`workflow_run_executor.py:257`): the claim currently happens after the column load — move nothing, but change the handling:

```python
    running = workflow_run_store.mark_cell_running(cell_id)
    if running is None:
        return  # cancelled or already claimed — skip silently
    await run_event_bus.publish(
        run_id, {"type": "cell", "cell": running.model_dump(mode="json")}
    )
```

Same pattern in `execute_formula_cell` and `execute_assistant_stage` (skip stage if claim fails). Note `execute_assistant_run`'s loop must treat a failed stage claim as "stage taken elsewhere" and re-check `next_queued_stage` rather than erroring.

- [ ] **Step 4: Verify + commit** — `fix(workflows): atomic cell/stage claims; cancelled work is never executed`

### Task 1.2: Cancel status is preserved (F5)

**Files:**
- Modify: `backend/app/services/workflow_run_executor.py`, `backend/app/services/workflow_run_store.py`
- Create/extend: `backend/tests/test_run_cancel.py`

- [ ] **Step 1: Failing test** — create a run, `set_run_status(run_id, "cancelled")`, then invoke the executor's finalization; assert run status is still `cancelled`, not `complete`.

- [ ] **Step 2: Add a single finalization helper** in the executor and use it in all four finalization sites (`execute_run` end, `kick_off_cell_retry`, `kick_off_column_retry`, `execute_assistant_run` end):

```python
async def _finalize_run_status(run_id: str, worst: str | None) -> None:
    """Set terminal run status, but never resurrect a cancelled run."""
    run = workflow_run_store.get_run(run_id)
    if run is not None and run.status == "cancelled":
        return
    final_status = worst or "complete"
    workflow_run_store.set_run_status(run_id, final_status)
    await run_event_bus.publish(
        run_id, {"type": "run", "run_id": run_id, "status": final_status}
    )
```

(The retry endpoints intentionally flip `cancelled → running` first via `kick_off_cell_retry`, so retrying a cancelled run still works.)

- [ ] **Step 3: Cancelled-cell messaging** — in `cancel_queued_cells` / `cancel_queued_stages`, keep status `error` (the frontend only knows `queued|running|complete|error`) but set the message to `"Cancelled"` for clarity.

- [ ] **Step 4: Verify + commit** — `pytest tests/test_run_cancel.py -v`; commit `fix(workflows): cancelled runs stay cancelled; cancel actually stops queued cells`

### Task 1.3: Assistant-run concurrency guard (F8)

**Files:**
- Modify: `backend/app/services/workflow_run_executor.py`
- Create: `backend/tests/test_assistant_run_guard.py`

- [ ] **Step 1: Failing test** — call `kick_off_assistant_run` twice for the same run with a stubbed `execute_assistant_run` that records concurrent entries; assert the second kick is a no-op while the first is active.

- [ ] **Step 2: Implement the guard the docstring already promises**

```python
_ACTIVE_ASSISTANT_RUNS: set[str] = set()


def kick_off_assistant_run(run_id: str, deal_id: str) -> None:
    if run_id in _ACTIVE_ASSISTANT_RUNS:
        return  # loop already active; it will pick up newly-queued stages
    _ACTIVE_ASSISTANT_RUNS.add(run_id)

    async def _runner() -> None:
        try:
            await execute_assistant_run(run_id, deal_id)
        finally:
            _ACTIVE_ASSISTANT_RUNS.discard(run_id)

    task = asyncio.create_task(_runner())
    _RUN_TASKS.add(task)
    task.add_done_callback(_RUN_TASKS.discard)
```

The Task 1.1 stage claim is the backstop for the remaining race window.

- [ ] **Step 3: Verify + commit** — `fix(workflows): assistant run kick-off is idempotent as documented`

---

## Phase 2 — LLM gateway hardening

### Task 2.1: Per-task call metadata (F6)

**Files:**
- Modify: `backend/app/agents/llm.py`
- Create: `backend/tests/test_llm_meta_concurrency.py`

- [ ] **Step 1: Failing test** — run two concurrent tasks, each consuming a stubbed `stream_with_fallback` with different durations/models; assert each task's `get_last_meta()` reflects its own call.

- [ ] **Step 2: Replace the global with a `ContextVar`**

```python
from contextvars import ContextVar

_last_meta: ContextVar[LLMCallMeta | None] = ContextVar("llm_last_meta", default=None)


def get_last_meta() -> LLMCallMeta | None:
    return _last_meta.get()
```

In `stream_with_fallback`'s `finally`: `_last_meta.set(meta)`. Every existing consumer awaits its own stream inside its own task, so context isolation is exactly right. Remove the stale "per-task" comment lie.

- [ ] **Step 3: Verify + commit** — run `tests/test_llm_config.py` too; commit `fix(llm): call metadata is task-local, not a shared global`

### Task 2.2: No fallback after first token (F7)

Falling back mid-stream restarts the answer while every consumer keeps appending — duplicated chat answers, corrupted cell parses. Policy: fall back only if the primary failed **before yielding anything**; a mid-stream failure raises, the cell/stage errors cleanly, and existing retry paths handle it.

**Files:**
- Modify: `backend/app/agents/llm.py`
- Create: `backend/tests/test_llm_fallback_policy.py`

- [ ] **Step 1: Failing tests** — stub primary that (a) raises before any chunk → fallback streams, meta.fallback True; (b) yields 2 chunks then raises → exception propagates, no fallback tokens.

- [ ] **Step 2: Implement** — in `stream_with_fallback`, track `yielded_any`; in the `except` branch, `if yielded_any: raise`.

- [ ] **Step 3: Verify + commit** — `fix(llm): never fall back mid-stream; partial answers no longer get duplicated`

### Task 2.3: Native system instructions (F10)

**Files:**
- Modify: `backend/app/agents/llm.py`, possibly `backend/tests/test_llm_config.py`

- [ ] **Step 1:** Remove `convert_system_message_to_human=True` from `get_llm`. Check `tests/test_llm_config.py` for assertions on it and update.
- [ ] **Step 2:** Manual smoke test (needs `GEMINI_API_KEY`): one chat query end-to-end; confirm grounding/citation behavior intact. If the installed `langchain-google-genai` version errors on system messages, pin/upgrade rather than reverting.
- [ ] **Step 3: Commit** — `feat(llm): send system prompt as native system instruction`

### Task 2.4: Formula eval hardening + dead constant (F9, F15)

**Files:**
- Modify: `backend/app/services/workflow_run_executor.py`
- Create: `backend/tests/test_formula_hardening.py`

- [ ] **Step 1: Failing tests** — `_eval_formula("=9**9**9", {})` returns `""` promptly; `_eval_formula("=[A]+[B]", {"A": 1, "B": 2})` still returns `"3"`; an expression over 200 chars returns `""`.
- [ ] **Step 2: Implement** — in `_eval_arithmetic`, after building `replaced`: `if "**" in replaced or len(replaced) > 200: return None`. Delete the unused `_TABULAR_DOC_TOP_K` constant while in the file.
- [ ] **Step 3: Verify + commit** — `fix(workflows): block exponentiation/oversized formula expressions from eval`

---

## Phase 3 — Extraction engine consolidation + dead code removal

### Task 3.1: Create `extraction_engine.py`

One module owns the primitive. Signature covers all six call sites (chat ×2, matrix compare, doc matrix, tabular cell, assistant stage):

**Files:**
- Create: `backend/app/services/extraction_engine.py`
- Create: `backend/tests/test_extraction_engine.py`

- [ ] **Step 1: Contract tests first** — empty chunks → empty result without an LLM call; happy path (stubbed `stream_with_fallback`) → citations extracted, meta captured, tokens forwarded to `on_token`; uncited-answer blanking honored when `require_citations=True`.

- [ ] **Step 2: Implement**

```python
"""The single extraction primitive every surface goes through.

context chunks → numbered context string → SINGLE_DEAL_SYSTEM →
stream_with_fallback → extract_citations. Any grounding/citation/fallback
fix made here applies to chat, tabular cells, assistant stages, the doc
matrix, and multi-deal compare simultaneously.
"""
from dataclasses import dataclass, field
from typing import Awaitable, Callable

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.llm import get_last_meta, stream_with_fallback
from app.agents.prompts import SINGLE_DEAL_SYSTEM
from app.models.query import Citation
from app.utils.citations import build_context_string, extract_citations


@dataclass
class ExtractionResult:
    answer: str = ""
    citations: list[Citation | None] = field(default_factory=list)
    model: str = ""
    fallback: bool = False
    duration_ms: int = 0
    empty_context: bool = False


async def run_extraction(
    chunks: list[dict],
    user_message: str,
    *,
    deal_id: str | None = None,
    page_context_chunks: list[dict] | None = None,
    require_citations: bool = False,
    on_token: Callable[[str], Awaitable[None]] | None = None,
) -> ExtractionResult:
    if not chunks:
        return ExtractionResult(empty_context=True)

    system_prompt = SINGLE_DEAL_SYSTEM.format(context=build_context_string(chunks))
    messages = [SystemMessage(content=system_prompt), HumanMessage(content=user_message)]

    parts: list[str] = []
    async for chunk in stream_with_fallback(messages):
        token = getattr(chunk, "content", "") or ""
        if token:
            parts.append(token)
            if on_token is not None:
                await on_token(token)

    cleaned, citations = extract_citations(
        "".join(parts), chunks, deal_id=deal_id,
        page_context_chunks=page_context_chunks,
    )
    cleaned = cleaned.strip()
    if require_citations and cleaned and not any(c is not None for c in citations):
        cleaned, citations = "", []

    meta = get_last_meta()
    return ExtractionResult(
        answer=cleaned,
        citations=citations,
        model=meta.model_used if meta else "",
        fallback=meta.fallback if meta else False,
        duration_ms=meta.duration_ms if meta else 0,
    )
```

- [ ] **Step 3: Commit** — `feat(engine): single extraction primitive for all surfaces`

### Task 3.2: Migrate call sites (one commit each, behavior-preserving)

Order (least → most coupled). After each migration, run the full backend suite.

- [ ] **3.2a** `single_deal_qa.py` — both functions become: load context → `run_extraction(chunks, question, deal_id=...)` → wrap in `QueryResponse`. (Note: these currently use `invoke_with_fallback`, which never set meta; the engine's streaming path is equivalent output-wise.)
- [ ] **3.2b** `routes_query._stream_answer` — token events via `on_token` callback feeding the SSE queue, `done` event from the result.
- [ ] **3.2c** `routes_stream._stream_deal_answer` — same shape. (`_stream_synthesis` keeps its bespoke `COMPARISON_SYSTEM` prompt and stays on `stream_with_fallback` directly — it is a different primitive: synthesis over answers, not extraction over documents.)
- [ ] **3.2d** `routes_doc_matrix._stream_doc_answer` — same shape; keep `get_doc_page_chunks` enrichment via `page_context_chunks`.
- [ ] **3.2e** `workflow_run_executor.execute_cell` — context selection (per-doc / synthesis budget) stays in the executor; the LLM/citation block collapses to `run_extraction(retrieved, user_message, deal_id=deal_id, page_context_chunks=full_doc_chunks or None, require_citations=True)` then `complete_cell` from the result.
- [ ] **3.2f** `workflow_run_executor.execute_assistant_stage` — prior-approved-stages section stays in the composed `user_message` (it is prompt composition, not engine logic); LLM/citation block → `run_extraction(all_chunks, user_message, deal_id=deal_id, page_context_chunks=page_context_chunks or None)`.
- [ ] **Final step:** grep for remaining direct `stream_with_fallback` consumers — only `_stream_synthesis` should remain outside the engine. Run `pytest -v` (full suite) + a manual smoke: chat one question, run one tabular workflow, one assistant workflow with a checkpoint.

### Task 3.3: Drop LangGraph (F13)

**Files:**
- Rewrite: `backend/app/agents/comparison_graph.py`; Modify: `backend/requirements.txt`; check `backend/app/api/routes_matrix.py` imports

- [ ] **Step 1:** Rewrite `compare_deals` as a plain async function: `asyncio.gather` over `answer_deal_question` per deal (bounded by `settings.max_concurrent_llm_calls`), then the synthesis call — the two graph nodes inlined, identical prompts and return shape. Delete `StateGraph` machinery.
- [ ] **Step 2:** Remove `langgraph>=0.2.60,<1.0` from `requirements.txt`. `grep -r langgraph backend/` must be clean.
- [ ] **Step 3: Verify + commit** — `pytest -v`; exercise `POST /matrix/compare` manually; commit `refactor(compare): replace decorative LangGraph with plain async fan-out`

### Task 3.4: Delete the orphaned sidecar (F12)

⚠️ Destructive — confirm scope with Stanley before executing this task if anything looks referenced.

- [ ] **Step 1: Pre-deletion sweep** — `grep -ri "ai-service\|internal_api_token\|X-Internal-Token\|routes_internal\|:3001" --include="*.{py,ts,tsx,yml,yaml,md,json}" .` — expected hits only inside `ai-service/`, `routes_internal.py`, `config.py`, `main.py`, and docs. Anything else: stop and reassess.
- [ ] **Step 2: Delete** — `git rm -r ai-service backend/app/api/routes_internal.py`; remove the router import + `include_router` from `main.py`; remove `internal_api_token` from `config.py` and `.env.example` if present.
- [ ] **Step 3:** Note for the future (do not implement now): `ai-service` contained two ideas worth porting later — full-text-vs-RAG cascade per document size, and one-call-per-document column batching (NDJSON). Both are captured in Phase 6.
- [ ] **Step 4: Verify + commit** — backend boots (`uvicorn app.main:app` smoke or full pytest); commit `chore: remove orphaned ai-service sidecar and its internal API`

---

## Phase 4 — AuthZ alignment + secrets guard

### Task 4.1: Admin gating per the README contract (F11)

README claims admin-only: create deals, delete deals, upload docs, edit stage. The API enforces none of it.

**Files:**
- Modify: `backend/app/auth.py`, `backend/app/api/routes_deals.py`, `backend/app/api/routes_ingest.py`
- Create: `backend/tests/test_rbac.py`

- [ ] **Step 1: Failing tests** — as a non-admin user with deal access: `POST /deals` → 403, `DELETE /deals/{id}` → 403, `POST /deals/{id}/documents` → 403, `DELETE .../documents/{doc_id}` → 403, `PATCH /deals/{id}` with `stage` → 403, `PATCH` with only `tags` → 200. Admin: all 200.
- [ ] **Step 2:** Add to `auth.py`:

```python
def require_admin(user: UserRow) -> None:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
```

Apply in `routes_deals.py` (`create_deal`, `delete_deal`; in `update_deal` only when `data.stage` is being changed) and in `routes_ingest.py` (single upload, batch upload, document delete). Read endpoints keep `require_deal_access` only.
- [ ] **Step 3: Verify + commit** — `fix(auth): enforce admin-only mutations the README already promises`

### Task 4.2: Refuse production boot with default secrets (F15)

**Files:**
- Modify: `backend/app/config.py`, `backend/app/main.py`

- [ ] **Step 1:** Add `environment: str = "development"` to Settings. In startup, if `settings.environment == "production"` and (`jwt_secret_key` starts with `"CHANGE-ME"` or `default_admin_password == "admin"`): `raise RuntimeError(...)` naming the offending setting.
- [ ] **Step 2: Test** — monkeypatch settings, assert the guard raises in prod and passes in dev.
- [ ] **Step 3: Commit** — `feat(config): refuse production startup with default secrets`

---

## Phase 5 — CI, compose, README truth pass

### Task 5.1: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1:** Workflow on `push` to `main` + all PRs. Two jobs: **backend** — Python 3.12, `pip install -r backend/requirements.txt -r backend/requirements-dev.txt`, `pytest -v` (from `backend/`); **frontend** — Node 20, `npm ci`, `npm run build` (runs `tsc` first, which is the type gate — there is no frontend test framework yet).
- [ ] **Step 2:** Push branch, confirm both jobs green on the PR. Commit — `ci: add pytest + frontend typecheck workflow`

### Task 5.2: Fix the frontend container story (F14)

`docker-compose.yml` references a Dockerfile and `start-prod.sh` that don't exist, and passes `NEXT_PUBLIC_*` env vars Vite never reads. The Vite app hardcodes `/api` and needs a reverse proxy in front of it in any served mode.

**Files:**
- Create: `frontend/Dockerfile`; Modify: `frontend/vite.config.ts`, `docker-compose.yml`

- [ ] **Step 1:** Make the proxy target env-driven in `vite.config.ts` (applies to both `dev` and `preview`, which inherits `server.proxy`):

```ts
const apiTarget = process.env.VITE_API_PROXY_TARGET || "http://localhost:8000";
```

- [ ] **Step 2:** `frontend/Dockerfile`: `node:20-alpine`, `npm ci`, `COPY . .`, `npm run build`, `CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "3000"]`. (`vite preview` is adequate at this stage; swap for nginx when a CDN/prod deploy materializes per SCALING_PLAN.)
- [ ] **Step 3:** `docker-compose.yml`: frontend service — drop the `start-prod.sh` command, set `VITE_API_PROXY_TARGET=http://backend:8000`, drop `NEXT_*` vars and `.next*` volumes; frontend-dev — command `npm run dev -- --host 0.0.0.0`, same env var pointing at `host.docker.internal:8000`, keep ports 3100/3200.
- [ ] **Step 4: Verify** — `docker compose up --build -d`; login at :3100 and :3200; one chat query round-trips. Commit — `fix(docker): frontend containers match the Vite reality`

### Task 5.3: README truth pass (F14)

⚠️ This rewrites existing prose — the changes below are the agreed scope; anything beyond it needs Stanley's sign-off first.

- [ ] **Step 1:** Fix in `README.md`: architecture diagram + stack table say **Vite + React 18 + react-router** (not Next.js 14); retrieval section describes **full-context as the primary path** with RAG/ChromaDB as the optional strategy behind `context_provider` (`full_context_mode=false`); delete the frontend `npm test` section (no test framework exists — say so, or reference `npm run build` as the type gate); remove LangGraph from the stack table; update the troubleshooting rows that reference `.next`/vendor-chunks to the Vite equivalents; document run-cancel and restart-reconciliation semantics in one sentence each.
- [ ] **Step 2:** Sweep `SCALING_PLAN.md`'s "Current PoC Architecture" table for the same Next.js/RAG staleness (one-line fixes only).
- [ ] **Step 3: Commit** — `docs: README matches the actual architecture`

---

## Phase 6 — Deferred (documented, deliberately NOT in this plan)

Captured so the ideas aren't lost; each is its own future plan:

1. **DB-as-queue worker loop** — `status='queued'` rows claimed by a worker loop (Phase 1's atomic claims are the first half of this); enables multi-process scaling and real resume-after-restart.
2. **Column batching per document** — one LLM call per (doc, all-columns) emitting NDJSON lines (port of ai-service's `queryGeminiAllColumns`); ~N× input-token reduction on `one_doc_per_row` runs. Biggest cost lever.
3. **Gemini context caching** for repeated identical document prefixes (retries, chat follow-ups).
4. **Context strategy cascade** — full text under a size threshold, retrieval-guided page expansion above it (port of ai-service's `selectEvidence`), chosen per request in `context_provider`.
5. **Token/cost accounting per cell** — record usage metadata; unit economics per diligence run.
6. **Server-side Brief** — populate from structured `answer_formatted` (skip the markdown → regex round-trip in `DealBriefDashboard.tsx`); move analyst overrides/diffs from localStorage to the DB.
7. **Alembic** — replace `_ensure_document_cache_columns`; prerequisite for the Postgres move.
8. **Session-per-request FastAPI dependency** — replace the ~30 `SessionLocal()/expunge/close` copies; move blocking DB + bcrypt off the event loop.
9. **Generated TS API client** from the FastAPI OpenAPI schema — retire the hand-rolled 668-line `api.ts`.
10. **Frontend god-component carving** (`DealBriefDashboard` 2.4K lines, `TabularRun` 2.3K, `DocMatrixPanel` 1.8K) — opportunistic, when touched.
11. **Short-lived single-purpose tokens** for `?token=` iframe/download/SSE URLs; login rate limiting.

---

## Execution notes

- **Order matters:** Phases 0–2 are independent bug fixes and can ship as they land. Phase 3 depends on 2 (engine wraps the hardened gateway). Phases 4–5 are independent of 3.
- **Definition of done per task:** new tests pass, full `pytest -v` passes, one-line commit as specified.
- **Manual smoke after Phase 3** (needs `GEMINI_API_KEY` + docker): chat question streams with citations; tabular run completes with per-cell model badges; assistant run pauses at checkpoint and resumes on approve; cancel a mid-flight tabular run and confirm it stays cancelled with no further cell completions.
- **Do not** delete vector_store/embedder/chunker, change `full_context_mode`'s default, or restructure the frontend — all out of scope by explicit owner decision.
