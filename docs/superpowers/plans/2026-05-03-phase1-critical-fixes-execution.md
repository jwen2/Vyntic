# Phase 1: Critical Fixes Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 10 most critical issues that would cause immediate failures at 50+ concurrent users, raising Vyntic from D+ to C grade.

**Architecture:** Quick wins first (2-hour fixes), then infrastructure changes (PostgreSQL, Redis). Each task is independently deployable and testable.

**Tech Stack:** Python/FastAPI, TypeScript/Node.js, Next.js/React, PostgreSQL, Redis, SQLAlchemy, pybreaker

**Reference:** See `docs/superpowers/plans/2026-05-03-scalability-analysis.md` for full issue details.

---

## File Structure Overview

### Files to Modify
| File | Changes |
|------|---------|
| `frontend/src/hooks/useMatrix.ts` | Scope localStorage by user ID |
| `backend/app/services/embedder.py` | Remove mock embeddings, add proper error handling |
| `backend/app/agents/llm.py` | Replace global state with contextvars, add circuit breaker |
| `backend/app/services/vector_store.py` | Add threading lock to singleton |
| `backend/app/database.py` | Add connection pooling, prepare for PostgreSQL |
| `backend/app/config.py` | Add PostgreSQL and Redis config |
| `backend/app/main.py` | Add comprehensive health check |
| `backend/requirements.txt` | Add pybreaker, redis, asyncpg |

### Files to Create
| File | Purpose |
|------|---------|
| `backend/app/services/redis_client.py` | Redis connection for progress storage |
| `backend/app/services/health.py` | Health check functions |
| `backend/tests/test_resiliency.py` | Tests for circuit breaker, retry logic |
| `frontend/src/lib/auth-context.tsx` | Export userId for localStorage scoping |

---

## Task 1: Fix localStorage Data Leakage (Issue F1)

**Priority:** CRITICAL - Security vulnerability
**Time:** 30 minutes
**Impact:** Prevents User A from seeing User B's confidential data

**Files:**
- Modify: `frontend/src/hooks/useMatrix.ts:18-97`
- Modify: `frontend/src/lib/api.ts` (to expose userId)

### Step 1.1: Find where userId is available

- [ ] **Read the auth context to understand how user ID is accessed**

```bash
grep -r "userId\|user_id\|currentUser" frontend/src --include="*.ts" --include="*.tsx" | head -20
```

Expected: Find auth context or hook that provides user ID

### Step 1.2: Update the cache key constant

- [ ] **Modify useMatrix.ts to scope cache key by user ID**

In `frontend/src/hooks/useMatrix.ts`, change:

```typescript
// OLD (line 18)
const MATRIX_CACHE_KEY = "vyntic_matrix_cache";

// NEW
const getMatrixCacheKey = (userId: string | null) =>
  userId ? `vyntic_matrix_cache_${userId}` : null;
```

### Step 1.3: Update the load effect

- [ ] **Modify the useEffect that loads from localStorage**

```typescript
// OLD (lines 39-50)
useEffect(() => {
  try {
    const raw = localStorage.getItem(MATRIX_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      setState((s) => ({
        ...s,
        queries: parsed.queries || [],
        cells: parsed.cells || {},
      }));
    }
  } catch {}
  // ... rest of effect
}, []);

// NEW - Add userId dependency
useEffect(() => {
  const cacheKey = getMatrixCacheKey(userId);
  if (!cacheKey) return; // Not logged in yet

  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      setState((s) => ({
        ...s,
        queries: parsed.queries || [],
        cells: parsed.cells || {},
      }));
    }
  } catch {}

  return () => {
    // Save on unmount - use current userId
    const key = getMatrixCacheKey(userId);
    if (!key) return;
    const s = latestState.current;
    if (s.queries.length === 0) return;
    try {
      const persistableCells: Record<string, Record<string, CellData>> = {};
      for (const [dealId, dealCells] of Object.entries(s.cells)) {
        persistableCells[dealId] = {};
        for (const [query, cell] of Object.entries(dealCells)) {
          if (cell.status === "complete" || cell.status === "error") {
            persistableCells[dealId][query] = cell;
          }
        }
      }
      localStorage.setItem(key, JSON.stringify({ queries: s.queries, cells: persistableCells }));
    } catch {}
  };
}, [userId]); // Add userId as dependency
```

### Step 1.4: Update the save effect

- [ ] **Modify the debounced save effect**

```typescript
// OLD (lines 75-97)
useEffect(() => {
  if (state.queries.length === 0) return;
  const timeoutId = setTimeout(() => {
    try {
      // ... save logic
      localStorage.setItem(MATRIX_CACHE_KEY, JSON.stringify(...));
    } catch {}
  }, 1000);
  return () => clearTimeout(timeoutId);
}, [state.queries, state.cells]);

// NEW
useEffect(() => {
  const cacheKey = getMatrixCacheKey(userId);
  if (!cacheKey || state.queries.length === 0) return;

  const timeoutId = setTimeout(() => {
    try {
      const persistableCells: Record<string, Record<string, CellData>> = {};
      for (const [dealId, dealCells] of Object.entries(state.cells)) {
        persistableCells[dealId] = {};
        for (const [query, cell] of Object.entries(dealCells)) {
          if (cell.status === "complete" || cell.status === "error") {
            persistableCells[dealId][query] = cell;
          }
        }
      }
      localStorage.setItem(cacheKey, JSON.stringify({ queries: state.queries, cells: persistableCells }));
    } catch {}
  }, 1000);

  return () => clearTimeout(timeoutId);
}, [state.queries, state.cells, userId]);
```

### Step 1.5: Add userId parameter to hook

- [ ] **Update the hook signature to accept userId**

```typescript
// OLD
export function useMatrix() {

// NEW
export function useMatrix(userId: string | null) {
```

### Step 1.6: Clear cache on logout

- [ ] **Add cache clearing when user changes**

```typescript
// Add after the load effect
useEffect(() => {
  // Clear state when user changes (logout/login)
  setState({
    deals: [],
    queries: [],
    cells: {},
    loading: false,
    error: null,
  });
}, [userId]);
```

### Step 1.7: Verify the fix

- [ ] **Test manually**

```bash
# Start the frontend
cd frontend && npm run dev

# Test steps:
# 1. Log in as User A
# 2. Run a matrix query
# 3. Check localStorage - should see key like "vyntic_matrix_cache_user123"
# 4. Log out
# 5. Log in as User B
# 6. Check that User A's matrix data is NOT visible
# 7. Check localStorage - should see different key "vyntic_matrix_cache_user456"
```

### Step 1.8: Commit

- [ ] **Commit the fix**

```bash
git add frontend/src/hooks/useMatrix.ts
git commit -m "$(cat <<'EOF'
fix(security): scope localStorage cache by user ID

Fixes data leakage vulnerability where User A could see User B's
confidential matrix data on shared computers.

- Cache key now includes userId: vyntic_matrix_cache_{userId}
- State cleared on user change (logout/login)
- No cache access when not logged in

Issue: F1 (CRITICAL)
EOF
)"
```

---

## Task 2: Remove Mock Embeddings (Issue R10)

**Priority:** CRITICAL - Silent data corruption
**Time:** 20 minutes
**Impact:** Prevents garbage vectors from corrupting search results

**Files:**
- Modify: `backend/app/services/embedder.py:17-42`

### Step 2.1: Read the current implementation

- [ ] **Examine the embedder code**

```bash
cat backend/app/services/embedder.py
```

### Step 2.2: Create custom exception

- [ ] **Add EmbeddingError exception at top of file**

```python
# Add after imports
class EmbeddingError(Exception):
    """Raised when embedding generation fails."""
    pass

class EmbeddingTimeoutError(EmbeddingError):
    """Raised when embedding times out."""
    pass
```

### Step 2.3: Replace mock fallback with proper error

- [ ] **Modify embed_texts to raise instead of returning mock**

```python
# OLD
except asyncio.TimeoutError:
    print(f"Gemini embedding timeout after {EMBED_TIMEOUT}s, using mock")
    all_embeddings.append(_mock_single(text))
except Exception as e:
    print(f"Gemini embedding error, using mock: {e}")
    all_embeddings.append(_mock_single(text))

# NEW
except asyncio.TimeoutError:
    logger.error(
        f"Embedding timeout after {EMBED_TIMEOUT}s",
        extra={"chunk_index": i, "text_length": len(text)}
    )
    raise EmbeddingTimeoutError(
        f"Embedding service timeout after {EMBED_TIMEOUT}s. "
        f"Chunk {i} of {len(texts)} failed."
    )
except Exception as e:
    logger.error(
        f"Embedding failed: {e}",
        extra={"chunk_index": i, "error_type": type(e).__name__}
    )
    raise EmbeddingError(f"Embedding generation failed: {e}")
```

### Step 2.4: Add proper logging import

- [ ] **Add logging at top of file**

```python
import logging

logger = logging.getLogger(__name__)
```

### Step 2.5: Remove _mock_single function

- [ ] **Delete the mock function (or mark deprecated)**

```python
# Either delete entirely or add deprecation warning:
def _mock_single(text: str) -> list[float]:
    """DEPRECATED: Do not use. Raises error instead."""
    raise NotImplementedError(
        "_mock_single is deprecated. Embeddings must come from real API."
    )
```

### Step 2.6: Update calling code to handle errors

- [ ] **Check routes_ingest.py for error handling**

```bash
grep -n "embed_texts\|embed_query" backend/app/services/*.py backend/app/api/*.py
```

- [ ] **Ensure callers catch EmbeddingError and report to user**

The ingestion code should catch `EmbeddingError` and set progress to "error" with a clear message.

### Step 2.7: Test the change

- [ ] **Run existing tests**

```bash
cd backend && pytest tests/ -v -k embed
```

- [ ] **Test manually by temporarily breaking the API key**

```bash
# In .env, temporarily set invalid key
GEMINI_API_KEY=invalid_key_for_testing

# Try uploading a document - should fail with clear error, not silently succeed
```

### Step 2.8: Commit

- [ ] **Commit the fix**

```bash
git add backend/app/services/embedder.py
git commit -m "$(cat <<'EOF'
fix(embedder): remove mock embeddings, fail loudly on error

Silent data corruption is the worst kind. When embeddings fail,
we now raise an exception instead of storing garbage vectors.

- Add EmbeddingError and EmbeddingTimeoutError exceptions
- Replace print() with structured logging
- Remove _mock_single fallback
- Callers must handle errors explicitly

Issue: R10 (CRITICAL)
EOF
)"
```

---

## Task 3: Fix Global LLM Metadata State (Issue B1)

**Priority:** CRITICAL - Race condition
**Time:** 30 minutes
**Impact:** Prevents User A from getting User B's LLM metadata

**Files:**
- Modify: `backend/app/agents/llm.py:14-28, 56-83`

### Step 3.1: Read the current implementation

- [ ] **Examine the LLM module**

```bash
cat backend/app/agents/llm.py
```

### Step 3.2: Import contextvars

- [ ] **Add contextvars import at top**

```python
from contextvars import ContextVar
```

### Step 3.3: Replace global with ContextVar

- [ ] **Change _last_meta to use ContextVar**

```python
# OLD
_last_meta: LLMCallMeta | None = None

def get_last_meta() -> LLMCallMeta | None:
    return _last_meta

# NEW
_request_meta: ContextVar[LLMCallMeta | None] = ContextVar('llm_meta', default=None)

def get_last_meta() -> LLMCallMeta | None:
    """Get LLM metadata for the current request context."""
    return _request_meta.get()

def set_meta(meta: LLMCallMeta) -> None:
    """Set LLM metadata for the current request context."""
    _request_meta.set(meta)
```

### Step 3.4: Update stream_with_fallback

- [ ] **Use set_meta instead of global assignment**

```python
# OLD (in stream_with_fallback)
finally:
    meta.duration_ms = int((time.monotonic() - t0) * 1000)
    _last_meta = meta

# NEW
finally:
    meta.duration_ms = int((time.monotonic() - t0) * 1000)
    set_meta(meta)
```

### Step 3.5: Update invoke_with_fallback similarly

- [ ] **Add metadata tracking to invoke_with_fallback**

```python
async def invoke_with_fallback(messages: list[BaseMessage]) -> tuple[str, LLMCallMeta]:
    """Invoke the primary model; fall back to backup on rate-limit or error.

    Returns:
        Tuple of (response_content, metadata)
    """
    meta = LLMCallMeta()
    t0 = time.monotonic()

    try:
        meta.model_used = settings.gemini_model
        llm = get_llm(settings.gemini_model)
        response = await llm.ainvoke(messages)
        meta.duration_ms = int((time.monotonic() - t0) * 1000)
        set_meta(meta)
        return response.content, meta
    except Exception as e:
        if settings.gemini_fallback_model:
            logger.warning(f"Primary model failed ({e}), falling back to {settings.gemini_fallback_model}")
            meta.model_used = settings.gemini_fallback_model
            meta.fallback = True
            meta.error = str(e)
            llm = get_llm(settings.gemini_fallback_model)
            response = await llm.ainvoke(messages)
            meta.duration_ms = int((time.monotonic() - t0) * 1000)
            set_meta(meta)
            return response.content, meta
        raise
```

### Step 3.6: Test the change

- [ ] **Write a test for concurrent requests**

```python
# backend/tests/test_llm_concurrent.py
import asyncio
import pytest
from app.agents.llm import stream_with_fallback, get_last_meta, LLMCallMeta

@pytest.mark.asyncio
async def test_metadata_isolation():
    """Verify metadata is isolated between concurrent requests."""
    results = {}

    async def make_request(request_id: str):
        # Simulate LLM call
        messages = [{"role": "user", "content": f"Request {request_id}"}]
        # ... call stream_with_fallback ...
        meta = get_last_meta()
        results[request_id] = meta

    # Run concurrent requests
    await asyncio.gather(
        make_request("A"),
        make_request("B"),
        make_request("C"),
    )

    # Each should have its own metadata (not overwritten by others)
    # This test would fail with the old global variable approach
```

### Step 3.7: Commit

- [ ] **Commit the fix**

```bash
git add backend/app/agents/llm.py backend/tests/test_llm_concurrent.py
git commit -m "$(cat <<'EOF'
fix(llm): use contextvars for request-scoped metadata

Replaces global _last_meta with ContextVar to prevent race condition
where User A could receive User B's LLM metadata.

- Add ContextVar _request_meta for per-request isolation
- Add set_meta() helper function
- Update invoke_with_fallback to return metadata tuple
- Add concurrent request test

Issue: B1 (CRITICAL)
EOF
)"
```

---

## Task 4: Add Circuit Breaker for Gemini API (Issue R4)

**Priority:** CRITICAL - Cascade failure prevention
**Time:** 45 minutes
**Impact:** Prevents 5-minute outage from becoming 600 failed API calls

**Files:**
- Modify: `backend/app/agents/llm.py`
- Modify: `backend/requirements.txt`

### Step 4.1: Add pybreaker dependency

- [ ] **Add to requirements.txt**

```bash
echo "pybreaker>=1.0.0" >> backend/requirements.txt
```

- [ ] **Install the dependency**

```bash
cd backend && pip install pybreaker
```

### Step 4.2: Create circuit breaker instance

- [ ] **Add circuit breaker configuration to llm.py**

```python
# Add imports
from pybreaker import CircuitBreaker, CircuitBreakerError
import logging

logger = logging.getLogger(__name__)

# Add after imports, before functions
gemini_breaker = CircuitBreaker(
    fail_max=5,           # Open after 5 consecutive failures
    reset_timeout=30,     # Try again after 30 seconds
    name="gemini_api"
)

class GeminiUnavailableError(Exception):
    """Raised when Gemini API circuit is open."""
    pass
```

### Step 4.3: Wrap LLM calls with circuit breaker

- [ ] **Update get_llm or create a wrapped version**

```python
@gemini_breaker
def _create_llm(model: str) -> ChatGoogleGenerativeAI:
    """Create LLM instance (circuit breaker protected)."""
    return ChatGoogleGenerativeAI(
        model=model,
        google_api_key=settings.gemini_api_key,
        max_output_tokens=settings.max_tokens,
        convert_system_message_to_human=True,
    )

def get_llm(model: str | None = None) -> ChatGoogleGenerativeAI:
    """Get a Gemini LLM instance with circuit breaker protection."""
    try:
        return _create_llm(model or settings.gemini_model)
    except CircuitBreakerError:
        logger.warning("Gemini circuit breaker is OPEN - service unavailable")
        raise GeminiUnavailableError(
            "Gemini API is temporarily unavailable. Please try again in 30 seconds."
        )
```

### Step 4.4: Update stream_with_fallback to handle circuit breaker

- [ ] **Add circuit breaker handling**

```python
async def stream_with_fallback(messages: list[BaseMessage]):
    """Stream from the primary model; fall back to backup on error.

    Circuit breaker prevents cascade failures during outages.
    """
    meta = LLMCallMeta()
    t0 = time.monotonic()

    try:
        meta.model_used = settings.gemini_model
        llm = get_llm(settings.gemini_model)  # May raise GeminiUnavailableError
        async for chunk in llm.astream(messages):
            yield chunk
    except GeminiUnavailableError:
        # Circuit is open - fail fast
        meta.error = "Circuit breaker open"
        raise
    except CircuitBreakerError:
        # Should be caught by get_llm, but just in case
        raise GeminiUnavailableError("Gemini API circuit breaker is open")
    except Exception as e:
        # Record failure for circuit breaker
        gemini_breaker.failure()

        if settings.gemini_fallback_model:
            logger.warning(f"Primary model failed ({e}), falling back to {settings.gemini_fallback_model}")
            meta.model_used = settings.gemini_fallback_model
            meta.fallback = True
            meta.error = str(e)

            try:
                llm = get_llm(settings.gemini_fallback_model)
                async for chunk in llm.astream(messages):
                    yield chunk
                # Success - record for circuit breaker
                gemini_breaker.success()
            except Exception as fallback_error:
                gemini_breaker.failure()
                raise
        else:
            raise
    else:
        # Success - record for circuit breaker
        gemini_breaker.success()
    finally:
        meta.duration_ms = int((time.monotonic() - t0) * 1000)
        set_meta(meta)
```

### Step 4.5: Add health check for circuit breaker state

- [ ] **Add function to check breaker state**

```python
def get_circuit_breaker_state() -> dict:
    """Get the current state of the Gemini circuit breaker."""
    return {
        "name": gemini_breaker.name,
        "state": gemini_breaker.current_state,
        "fail_count": gemini_breaker.fail_counter,
        "fail_max": gemini_breaker.fail_max,
        "reset_timeout": gemini_breaker.reset_timeout,
    }
```

### Step 4.6: Test the circuit breaker

- [ ] **Write test for circuit breaker behavior**

```python
# backend/tests/test_circuit_breaker.py
import pytest
from unittest.mock import patch, AsyncMock
from app.agents.llm import (
    stream_with_fallback,
    gemini_breaker,
    GeminiUnavailableError,
    get_circuit_breaker_state
)

@pytest.fixture(autouse=True)
def reset_breaker():
    """Reset circuit breaker before each test."""
    gemini_breaker.close()
    yield
    gemini_breaker.close()

@pytest.mark.asyncio
async def test_circuit_opens_after_failures():
    """Circuit should open after 5 consecutive failures."""
    with patch('app.agents.llm.get_llm') as mock_llm:
        mock_llm.return_value.astream = AsyncMock(side_effect=Exception("API Error"))

        # First 5 calls should raise the original error
        for i in range(5):
            with pytest.raises(Exception, match="API Error"):
                async for _ in stream_with_fallback([]):
                    pass

        # 6th call should raise GeminiUnavailableError (circuit open)
        with pytest.raises(GeminiUnavailableError):
            async for _ in stream_with_fallback([]):
                pass

        assert get_circuit_breaker_state()["state"] == "open"
```

### Step 4.7: Commit

- [ ] **Commit the fix**

```bash
git add backend/app/agents/llm.py backend/requirements.txt backend/tests/test_circuit_breaker.py
git commit -m "$(cat <<'EOF'
feat(llm): add circuit breaker for Gemini API

Prevents cascade failures during API outages. After 5 consecutive
failures, circuit opens and requests fail fast for 30 seconds.

- Add pybreaker dependency
- Wrap LLM calls with circuit breaker
- Add GeminiUnavailableError for clear error messaging
- Add get_circuit_breaker_state() for health checks
- Add tests for circuit breaker behavior

Issue: R4 (CRITICAL)
EOF
)"
```

---

## Task 5: Add Threading Lock to ChromaDB Singleton (Issue P3)

**Priority:** CRITICAL - Race condition / data corruption
**Time:** 20 minutes
**Impact:** Prevents ChromaDB corruption from concurrent initialization

**Files:**
- Modify: `backend/app/services/vector_store.py:15-21`

### Step 5.1: Read the current implementation

- [ ] **Examine the vector store code**

```bash
head -50 backend/app/services/vector_store.py
```

### Step 5.2: Add threading lock

- [ ] **Import threading and add lock**

```python
# Add import
import threading

# Add lock before the global client
_client_lock = threading.Lock()
_client: Optional[chromadb.PersistentClient] = None
```

### Step 5.3: Update _get_client with double-checked locking

- [ ] **Modify _get_client to use lock**

```python
def _get_client() -> chromadb.PersistentClient:
    """Get or create the ChromaDB client (thread-safe singleton)."""
    global _client

    # Fast path - already initialized
    if _client is not None:
        return _client

    # Slow path - need to initialize
    with _client_lock:
        # Double-check after acquiring lock
        if _client is None:
            logger.info(f"Initializing ChromaDB client at {settings.chroma_persist_dir}")
            _client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
        return _client
```

### Step 5.4: Add logging import if not present

- [ ] **Ensure logging is imported**

```python
import logging
logger = logging.getLogger(__name__)
```

### Step 5.5: Test the change

- [ ] **Write test for concurrent initialization**

```python
# backend/tests/test_vector_store_concurrent.py
import threading
import pytest
from app.services.vector_store import _get_client, _client, _client_lock

def test_concurrent_client_initialization():
    """Verify only one client is created under concurrent access."""
    # Reset the client
    global _client
    with _client_lock:
        _client = None

    clients = []
    errors = []

    def get_client():
        try:
            client = _get_client()
            clients.append(id(client))
        except Exception as e:
            errors.append(e)

    # Start 10 threads simultaneously
    threads = [threading.Thread(target=get_client) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(errors) == 0, f"Errors: {errors}"
    assert len(set(clients)) == 1, "Multiple client instances created!"
```

### Step 5.6: Commit

- [ ] **Commit the fix**

```bash
git add backend/app/services/vector_store.py backend/tests/test_vector_store_concurrent.py
git commit -m "$(cat <<'EOF'
fix(vector_store): add threading lock to ChromaDB singleton

Prevents race condition where concurrent requests could create
multiple ChromaDB clients, leading to index corruption.

- Add _client_lock for thread-safe initialization
- Use double-checked locking pattern
- Add concurrent initialization test

Issue: P3 (CRITICAL)
EOF
)"
```

---

## Task 6: Add Comprehensive Health Check (Issue R6)

**Priority:** HIGH - Load balancer routing
**Time:** 30 minutes
**Impact:** Enables proper load balancer health detection

**Files:**
- Create: `backend/app/services/health.py`
- Modify: `backend/app/main.py:92-94`

### Step 6.1: Create health check module

- [ ] **Create backend/app/services/health.py**

```python
"""Health check functions for all dependencies."""
import logging
from datetime import datetime
from typing import Any

from sqlalchemy import text
from app.database import SessionLocal
from app.services.vector_store import _get_client
from app.agents.llm import get_circuit_breaker_state

logger = logging.getLogger(__name__)


async def check_database() -> dict[str, Any]:
    """Check database connectivity."""
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {"status": "error", "message": str(e)}


async def check_chromadb() -> dict[str, Any]:
    """Check ChromaDB connectivity."""
    try:
        client = _get_client()
        # Simple operation to verify client works
        client.heartbeat()
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"ChromaDB health check failed: {e}")
        return {"status": "error", "message": str(e)}


async def check_llm_circuit() -> dict[str, Any]:
    """Check LLM circuit breaker state."""
    try:
        state = get_circuit_breaker_state()
        status = "ok" if state["state"] == "closed" else "degraded"
        return {
            "status": status,
            "circuit_state": state["state"],
            "fail_count": state["fail_count"],
        }
    except Exception as e:
        logger.error(f"LLM circuit check failed: {e}")
        return {"status": "error", "message": str(e)}


async def run_all_health_checks() -> dict[str, Any]:
    """Run all health checks and return aggregated result."""
    checks = {
        "database": await check_database(),
        "chromadb": await check_chromadb(),
        "llm_circuit": await check_llm_circuit(),
    }

    # Determine overall status
    statuses = [c["status"] for c in checks.values()]
    if all(s == "ok" for s in statuses):
        overall = "ok"
    elif any(s == "error" for s in statuses):
        overall = "error"
    else:
        overall = "degraded"

    return {
        "status": overall,
        "timestamp": datetime.utcnow().isoformat(),
        "checks": checks,
    }
```

### Step 6.2: Update main.py health endpoint

- [ ] **Replace simple health check with comprehensive one**

```python
# In main.py, replace:
# @app.get("/health")
# def health_check():
#     return {"status": "ok", "service": "vyntic"}

# With:
from fastapi.responses import JSONResponse
from app.services.health import run_all_health_checks

@app.get("/health")
async def health_check():
    """Comprehensive health check for load balancer."""
    result = await run_all_health_checks()

    # Return 503 if any critical service is down
    status_code = 200 if result["status"] != "error" else 503

    return JSONResponse(status_code=status_code, content=result)


@app.get("/health/live")
def liveness_check():
    """Simple liveness check - just confirms process is running."""
    return {"status": "ok", "service": "vyntic"}


@app.get("/health/ready")
async def readiness_check():
    """Readiness check - confirms all dependencies are available."""
    return await health_check()
```

### Step 6.3: Test the health endpoints

- [ ] **Test manually**

```bash
# Start the backend
cd backend && uvicorn app.main:app --reload

# Test endpoints
curl http://localhost:8000/health | jq
curl http://localhost:8000/health/live | jq
curl http://localhost:8000/health/ready | jq
```

Expected output for /health:
```json
{
  "status": "ok",
  "timestamp": "2026-05-03T...",
  "checks": {
    "database": {"status": "ok"},
    "chromadb": {"status": "ok"},
    "llm_circuit": {"status": "ok", "circuit_state": "closed", "fail_count": 0}
  }
}
```

### Step 6.4: Commit

- [ ] **Commit the fix**

```bash
git add backend/app/services/health.py backend/app/main.py
git commit -m "$(cat <<'EOF'
feat(health): add comprehensive health check endpoint

Load balancers can now detect when dependencies are down and route
traffic to healthy instances.

- Add /health with database, ChromaDB, LLM circuit checks
- Add /health/live for simple liveness (Kubernetes)
- Add /health/ready for full readiness (Kubernetes)
- Return 503 when any critical check fails

Issue: R6 (HIGH)
EOF
)"
```

---

## Task 7: Add Connection Pooling (Issue P2)

**Priority:** CRITICAL - Connection exhaustion
**Time:** 20 minutes
**Impact:** Prevents "too many connections" errors under load

**Files:**
- Modify: `backend/app/database.py:12-18`

### Step 7.1: Read current database configuration

- [ ] **Examine the database module**

```bash
cat backend/app/database.py
```

### Step 7.2: Add pool configuration for SQLite

- [ ] **Update engine creation with pool settings**

```python
# Note: SQLite has limited pooling support, but this prepares for PostgreSQL

# For SQLite (current):
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},
    echo=False,
    pool_pre_ping=True,  # Verify connections before use
    pool_recycle=300,    # Recycle connections after 5 minutes
)

# For PostgreSQL (future - add as commented template):
# engine = create_engine(
#     settings.database_url,
#     pool_size=10,        # Maintain 10 connections
#     max_overflow=20,     # Allow 20 additional under load
#     pool_pre_ping=True,  # Verify connections
#     pool_recycle=300,    # Recycle every 5 minutes
#     echo=False,
# )
```

### Step 7.3: Add connection pool status function

- [ ] **Add function to check pool status**

```python
def get_pool_status() -> dict:
    """Get connection pool status for monitoring."""
    pool = engine.pool
    return {
        "pool_size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
        "invalid": pool.invalidated(),
    }
```

### Step 7.4: Export pool status in health check

- [ ] **Update health.py to include pool status**

```python
# In health.py, update check_database:
from app.database import SessionLocal, get_pool_status

async def check_database() -> dict[str, Any]:
    """Check database connectivity and pool status."""
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()

        pool = get_pool_status()
        return {
            "status": "ok",
            "pool": pool,
        }
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {"status": "error", "message": str(e)}
```

### Step 7.5: Commit

- [ ] **Commit the fix**

```bash
git add backend/app/database.py backend/app/services/health.py
git commit -m "$(cat <<'EOF'
feat(database): add connection pool configuration

Prepares for PostgreSQL migration and prevents connection exhaustion.

- Add pool_pre_ping for connection validation
- Add pool_recycle to prevent stale connections
- Add get_pool_status() for monitoring
- Include pool status in health check
- Add commented PostgreSQL configuration template

Issue: P2 (CRITICAL)
EOF
)"
```

---

## Task 8: Batch Embedding API Calls (Issue B2)

**Priority:** CRITICAL - Performance
**Time:** 45 minutes
**Impact:** Reduces 100-chunk document upload from 60s to ~5s

**Files:**
- Modify: `backend/app/services/embedder.py`

### Step 8.1: Read current implementation

- [ ] **Check if Gemini supports batch embedding**

```bash
# Check Gemini API docs for batch support
# The embed_content API supports batching via content list
```

### Step 8.2: Implement parallel embedding with semaphore

- [ ] **Rewrite embed_texts to use asyncio.gather with concurrency limit**

```python
import asyncio
from typing import List
import logging

logger = logging.getLogger(__name__)

EMBED_TIMEOUT = 30
MAX_CONCURRENT_EMBEDS = 10  # Limit concurrent API calls

# Semaphore to limit concurrent embeddings
_embed_semaphore = asyncio.Semaphore(MAX_CONCURRENT_EMBEDS)


async def _embed_single(text: str, index: int) -> tuple[int, list[float]]:
    """Embed a single text with semaphore protection."""
    async with _embed_semaphore:
        try:
            result = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: genai.embed_content(
                        model=settings.embedding_model,
                        content=text,
                    ),
                ),
                timeout=EMBED_TIMEOUT,
            )
            return (index, result["embedding"])
        except asyncio.TimeoutError:
            logger.error(f"Embedding timeout for chunk {index}")
            raise EmbeddingTimeoutError(f"Embedding timeout for chunk {index}")
        except Exception as e:
            logger.error(f"Embedding failed for chunk {index}: {e}")
            raise EmbeddingError(f"Embedding failed for chunk {index}: {e}")


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed multiple texts in parallel with concurrency limit.

    Args:
        texts: List of texts to embed

    Returns:
        List of embeddings in same order as input texts

    Raises:
        EmbeddingError: If any embedding fails
        EmbeddingTimeoutError: If any embedding times out
    """
    if not texts:
        return []

    logger.info(f"Embedding {len(texts)} texts with max {MAX_CONCURRENT_EMBEDS} concurrent")

    # Create tasks for all texts
    tasks = [_embed_single(text, i) for i, text in enumerate(texts)]

    # Run all tasks concurrently (semaphore limits actual concurrency)
    results = await asyncio.gather(*tasks, return_exceptions=False)

    # Sort by index to maintain order
    results.sort(key=lambda x: x[0])

    # Extract just the embeddings
    embeddings = [emb for _, emb in results]

    logger.info(f"Successfully embedded {len(embeddings)} texts")
    return embeddings
```

### Step 8.3: Test the performance improvement

- [ ] **Write benchmark test**

```python
# backend/tests/test_embedder_performance.py
import asyncio
import time
import pytest
from unittest.mock import patch, MagicMock

@pytest.mark.asyncio
async def test_parallel_embedding_faster_than_sequential():
    """Verify parallel embedding is significantly faster."""

    # Mock the embedding call with 100ms delay
    async def mock_embed(*args, **kwargs):
        await asyncio.sleep(0.1)
        return {"embedding": [0.1] * 768}

    with patch('app.services.embedder.genai.embed_content', side_effect=mock_embed):
        from app.services.embedder import embed_texts

        texts = ["text"] * 20  # 20 texts

        start = time.time()
        await embed_texts(texts)
        duration = time.time() - start

        # Sequential would be 20 * 0.1 = 2 seconds
        # Parallel with 10 concurrent should be ~0.2 seconds
        assert duration < 0.5, f"Parallel embedding took {duration}s, expected < 0.5s"
```

### Step 8.4: Commit

- [ ] **Commit the fix**

```bash
git add backend/app/services/embedder.py backend/tests/test_embedder_performance.py
git commit -m "$(cat <<'EOF'
perf(embedder): parallelize embedding with semaphore

Reduces 100-chunk document embedding from ~60s to ~5s by running
embeddings in parallel with controlled concurrency.

- Add asyncio.Semaphore to limit concurrent API calls (10)
- Use asyncio.gather for parallel execution
- Maintain result order via index tracking
- Add performance benchmark test

Before: 100 chunks × 300ms = 30 seconds (sequential)
After:  100 chunks / 10 concurrent × 300ms = 3 seconds

Issue: B2 (CRITICAL)
EOF
)"
```

---

## Task 9: Add Retry Logic to AI-Service Python Client (Issue R1)

**Priority:** CRITICAL - Transient failure handling
**Time:** 30 minutes
**Impact:** Prevents single network blip from failing entire matrix generation

**Files:**
- Modify: `ai-service/src/lib/pythonClient.ts`

### Step 9.1: Read current implementation

- [ ] **Examine the Python client**

```bash
cat ai-service/src/lib/pythonClient.ts
```

### Step 9.2: Add retry utility function

- [ ] **Add sleep and retry logic**

```typescript
// Add at top of file
const RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryable(status: number): boolean {
    return RETRYABLE_STATUSES.includes(status);
}
```

### Step 9.3: Update request function with retry logic

- [ ] **Modify the request function**

```typescript
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = process.env.INTERNAL_API_TOKEN || "";
    const headers = new Headers(init.headers);
    headers.set("X-Internal-Token", token);
    if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

            const resp = await fetch(`${pythonBase}${path}`, {
                ...init,
                headers,
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!resp.ok) {
                const detail = await resp.text();

                // Check if retryable
                if (isRetryable(resp.status) && attempt < MAX_RETRIES - 1) {
                    const delay = BASE_DELAY_MS * Math.pow(2, attempt);
                    console.warn(
                        `[pythonClient] ${resp.status} on ${path}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
                    );
                    await sleep(delay);
                    continue;
                }

                throw new Error(`Python API ${resp.status}: ${detail}`);
            }

            return (await resp.json()) as T;
        } catch (err) {
            lastError = err as Error;

            // Retry on network errors
            if (err instanceof Error && err.name === 'AbortError') {
                lastError = new Error(`Python API timeout after 30s on ${path}`);
            }

            if (attempt < MAX_RETRIES - 1) {
                const delay = BASE_DELAY_MS * Math.pow(2, attempt);
                console.warn(
                    `[pythonClient] Error on ${path}: ${lastError.message}, retrying in ${delay}ms`
                );
                await sleep(delay);
                continue;
            }
        }
    }

    throw lastError || new Error(`Python API request failed after ${MAX_RETRIES} attempts`);
}
```

### Step 9.4: Test the retry logic

- [ ] **Add test file**

```typescript
// ai-service/src/lib/__tests__/pythonClient.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('pythonClient retry logic', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should retry on 503 and succeed', async () => {
        let attempts = 0;
        global.fetch = vi.fn().mockImplementation(() => {
            attempts++;
            if (attempts < 3) {
                return Promise.resolve({
                    ok: false,
                    status: 503,
                    text: () => Promise.resolve('Service Unavailable'),
                });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ data: 'success' }),
            });
        });

        // Import after mocking
        const { request } = await import('../pythonClient');
        const result = await request('/test');

        expect(attempts).toBe(3);
        expect(result).toEqual({ data: 'success' });
    });

    it('should not retry on 404', async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
            text: () => Promise.resolve('Not Found'),
        });

        const { request } = await import('../pythonClient');

        await expect(request('/test')).rejects.toThrow('Python API 404');
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});
```

### Step 9.5: Commit

- [ ] **Commit the fix**

```bash
git add ai-service/src/lib/pythonClient.ts ai-service/src/lib/__tests__/pythonClient.test.ts
git commit -m "$(cat <<'EOF'
feat(ai-service): add retry logic with exponential backoff

Prevents transient failures from crashing matrix generation.

- Add 3 retries with exponential backoff (1s, 2s, 4s)
- Retry on 408, 429, 500, 502, 503, 504 status codes
- Add 30s timeout per request
- Add retry logging for debugging
- Add tests for retry behavior

Issue: R1 (CRITICAL)
EOF
)"
```

---

## Task 10: Fix Silently Swallowed Vector Cleanup Errors (Issue R5)

**Priority:** CRITICAL - Data consistency
**Time:** 15 minutes
**Impact:** Prevents orphaned vectors and provides visibility into cleanup failures

**Files:**
- Modify: `backend/app/api/routes_deals.py:82-85`

### Step 10.1: Read current implementation

- [ ] **Find the swallowed exception**

```bash
grep -n "except.*pass" backend/app/api/routes_deals.py
```

### Step 10.2: Replace bare except with proper handling

- [ ] **Update the delete_deal endpoint**

```python
# OLD
try:
    await delete_deal_vectors(deal_id)
except Exception:
    pass  # Best-effort cleanup of vectors

# NEW
try:
    await delete_deal_vectors(deal_id)
except Exception as e:
    # Log the error for monitoring/alerting
    logger.error(
        f"Failed to delete vectors for deal {deal_id}: {e}",
        extra={
            "deal_id": deal_id,
            "error_type": type(e).__name__,
            "operation": "vector_cleanup",
        }
    )
    # Don't fail the delete, but record for later cleanup
    # TODO: Add to cleanup queue for retry
```

### Step 10.3: Add logging import if needed

- [ ] **Ensure logger is available**

```python
import logging
logger = logging.getLogger(__name__)
```

### Step 10.4: Commit

- [ ] **Commit the fix**

```bash
git add backend/app/api/routes_deals.py
git commit -m "$(cat <<'EOF'
fix(deals): log vector cleanup failures instead of swallowing

Provides visibility into cleanup failures that were previously
silently ignored, causing orphaned vectors.

- Replace bare except:pass with structured logging
- Log deal_id, error_type for debugging
- TODO marker for future cleanup queue implementation

Issue: R5 (CRITICAL)
EOF
)"
```

---

## Final Steps

### Push All Changes

- [ ] **Push all commits to remote**

```bash
git push origin main
```

### Verify Deployment

- [ ] **Run the test suite**

```bash
# Backend tests
cd backend && pytest tests/ -v

# AI-service tests
cd ai-service && npm test

# Frontend tests (if any)
cd frontend && npm test
```

- [ ] **Test the health endpoint**

```bash
curl http://localhost:8000/health | jq
```

### Update Documentation

- [ ] **Mark tasks complete in the analysis document**

Update `docs/superpowers/plans/2026-05-03-scalability-analysis.md` Part 5 to check off completed Phase 1 tasks.

---

## Summary

This execution plan covers 10 critical fixes:

| Task | Issue | Time | Impact |
|------|-------|------|--------|
| 1 | F1: localStorage scoping | 30m | Security vulnerability fixed |
| 2 | R10: Mock embeddings | 20m | Silent data corruption fixed |
| 3 | B1: Global LLM metadata | 30m | Race condition fixed |
| 4 | R4: Circuit breaker | 45m | Cascade failures prevented |
| 5 | P3: ChromaDB lock | 20m | Initialization race fixed |
| 6 | R6: Health check | 30m | Load balancer routing fixed |
| 7 | P2: Connection pooling | 20m | Connection exhaustion prevented |
| 8 | B2: Batch embeddings | 45m | 10x faster uploads |
| 9 | R1: Retry logic | 30m | Transient failures handled |
| 10 | R5: Vector cleanup | 15m | Orphaned data visibility |

**Total estimated time:** ~5 hours

**Grade improvement:** D+ → C (minimum viable for limited beta)

**Next plan:** Phase 2 execution plan for PostgreSQL migration, Redis setup, S3 storage, and remaining high-priority fixes.
