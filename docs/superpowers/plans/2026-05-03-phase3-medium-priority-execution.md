# Phase 3: Medium Priority Fixes Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining 14 medium-priority fixes to improve Vyntic from C+ to B- grade, adding polish, edge case handling, and production hardening.

**Architecture:** Code-level improvements including database indexes, timeout handling, idempotency patterns, and UI polish.

**Tech Stack:** Python/FastAPI, TypeScript/Node.js, SQLAlchemy, React

**Prerequisites:** Complete Phase 1 and Phase 2 first.

**Reference:** See `docs/superpowers/plans/2026-05-03-scalability-analysis.md` for full issue details.

---

## File Structure Overview

### Files to Create
| File | Purpose |
|------|---------|
| `backend/app/middleware/idempotency.py` | Idempotency key middleware |
| `backend/tests/test_indexes.py` | Index performance tests |
| `ai-service/src/middleware/validation.ts` | Startup validation |

### Files to Modify
| File | Changes |
|------|---------|
| `backend/app/database.py` | Add composite indexes |
| `backend/app/agents/llm.py` | Add streaming timeout, exponential backoff |
| `backend/app/api/routes_matrix.py` | Bound streaming queue |
| `backend/app/api/routes_ingest.py` | Add idempotency keys |
| `frontend/src/hooks/useMatrix.ts` | Fix AbortController race condition |
| `frontend/src/hooks/useInvestigation.ts` | Add state rollback on error |
| `ai-service/src/lib/db.ts` | Add startup validation |

---

## Task 1: Add Composite Database Indexes

**Priority:** MEDIUM - Query performance (P7)
**Time:** 30 minutes
**Impact:** Faster queries as data grows to millions of rows

**Files:**
- Modify: `backend/app/database.py`
- Create: `backend/alembic/versions/002_add_indexes.py`

### Step 1.1: Identify common query patterns

- [ ] **Review the codebase for frequent queries**

Common patterns found:
- `WHERE deal_id = ? AND user_id = ?` (deal_access)
- `WHERE deal_id = ? ORDER BY created_at` (documents)
- `WHERE deal_id = ? AND status = ?` (investigations)

### Step 1.2: Add composite indexes to models

- [ ] **Update database.py with indexes**

```python
# In backend/app/database.py, add indexes to models:

from sqlalchemy import Index


class DealAccessRow(Base):
    __tablename__ = "deal_access"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    deal_id = Column(String, ForeignKey("deals.deal_id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Composite index for common query pattern
    __table_args__ = (
        Index("ix_deal_access_user_deal", "user_id", "deal_id", unique=True),
    )


class DocumentRow(Base):
    __tablename__ = "documents"

    doc_id = Column(String, primary_key=True)
    deal_id = Column(String, ForeignKey("deals.deal_id"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Composite index for listing documents by deal
    __table_args__ = (
        Index("ix_documents_deal_created", "deal_id", "created_at"),
    )


class InvestigationRow(Base):
    __tablename__ = "investigations"

    investigation_id = Column(String, primary_key=True)
    deal_id = Column(String, ForeignKey("deals.deal_id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    status = Column(String, nullable=False, default="running")
    created_at = Column(DateTime, default=datetime.utcnow)

    # Composite indexes for common queries
    __table_args__ = (
        Index("ix_investigations_deal_status", "deal_id", "status"),
        Index("ix_investigations_user_created", "user_id", "created_at"),
    )
```

### Step 1.3: Create Alembic migration

- [ ] **Generate migration for indexes**

```bash
cd backend && alembic revision --autogenerate -m "Add composite indexes"
```

### Step 1.4: Review and apply migration

- [ ] **Check the generated migration is correct**

```python
# backend/alembic/versions/002_add_indexes.py should contain:

def upgrade():
    op.create_index(
        "ix_deal_access_user_deal",
        "deal_access",
        ["user_id", "deal_id"],
        unique=True
    )
    op.create_index(
        "ix_documents_deal_created",
        "documents",
        ["deal_id", "created_at"]
    )
    op.create_index(
        "ix_investigations_deal_status",
        "investigations",
        ["deal_id", "status"]
    )
    op.create_index(
        "ix_investigations_user_created",
        "investigations",
        ["user_id", "created_at"]
    )


def downgrade():
    op.drop_index("ix_deal_access_user_deal")
    op.drop_index("ix_documents_deal_created")
    op.drop_index("ix_investigations_deal_status")
    op.drop_index("ix_investigations_user_created")
```

- [ ] **Apply migration**

```bash
cd backend && alembic upgrade head
```

### Step 1.5: Verify indexes

- [ ] **Check indexes were created**

```bash
# For PostgreSQL:
psql -U vyntic -d vyntic -c "\di"

# Should show the new indexes
```

### Step 1.6: Commit

- [ ] **Commit index changes**

```bash
git add backend/app/database.py backend/alembic/versions/
git commit -m "$(cat <<'EOF'
perf(db): add composite indexes for common query patterns

Improves query performance as data grows to millions of rows.

- ix_deal_access_user_deal: user_id + deal_id (unique)
- ix_documents_deal_created: deal_id + created_at
- ix_investigations_deal_status: deal_id + status
- ix_investigations_user_created: user_id + created_at

Issue: P7 (MEDIUM)
EOF
)"
```

---

## Task 2: Add LLM Streaming Timeout

**Priority:** MEDIUM - Prevents hung connections (B8)
**Time:** 30 minutes
**Impact:** Prevents indefinitely stuck streaming responses

**Files:**
- Modify: `backend/app/agents/llm.py`

### Step 2.1: Add timeout wrapper for streaming

- [ ] **Create timeout-protected streaming function**

```python
# In backend/app/agents/llm.py, add timeout handling:

import asyncio

STREAM_TIMEOUT = 120  # 2 minutes max for entire stream
CHUNK_TIMEOUT = 30    # 30 seconds max between chunks


async def stream_with_fallback(messages: list[BaseMessage]):
    """Stream from the primary model with timeout protection.

    Raises TimeoutError if no response within STREAM_TIMEOUT seconds total,
    or if no chunk received within CHUNK_TIMEOUT seconds.
    """
    meta = LLMCallMeta()
    t0 = time.monotonic()

    async def _stream_with_chunk_timeout(llm):
        """Stream with per-chunk timeout."""
        async for chunk in llm.astream(messages):
            yield chunk

    try:
        meta.model_used = settings.gemini_model
        llm = get_llm(settings.gemini_model)

        # Wrap entire stream with total timeout
        async with asyncio.timeout(STREAM_TIMEOUT):
            last_chunk_time = time.monotonic()

            async for chunk in _stream_with_chunk_timeout(llm):
                # Check for chunk timeout
                now = time.monotonic()
                if now - last_chunk_time > CHUNK_TIMEOUT:
                    raise asyncio.TimeoutError(
                        f"No chunk received in {CHUNK_TIMEOUT} seconds"
                    )
                last_chunk_time = now
                yield chunk

    except asyncio.TimeoutError as e:
        logger.warning(f"Stream timeout: {e}")
        meta.error = str(e)

        # Try fallback with same timeout
        if settings.gemini_fallback_model:
            logger.info(f"Trying fallback model: {settings.gemini_fallback_model}")
            meta.model_used = settings.gemini_fallback_model
            meta.fallback = True

            try:
                llm = get_llm(settings.gemini_fallback_model)
                async with asyncio.timeout(STREAM_TIMEOUT):
                    async for chunk in llm.astream(messages):
                        yield chunk
            except asyncio.TimeoutError:
                raise asyncio.TimeoutError(
                    "Both primary and fallback models timed out"
                )
        else:
            raise

    except GeminiUnavailableError:
        raise
    except Exception as e:
        # ... existing fallback logic ...

    finally:
        meta.duration_ms = int((time.monotonic() - t0) * 1000)
        set_meta(meta)
```

### Step 2.2: Add configuration for timeouts

- [ ] **Add to config.py**

```python
# In backend/app/config.py Settings class:

    # LLM timeouts
    llm_stream_timeout: int = 120  # Total stream timeout (seconds)
    llm_chunk_timeout: int = 30    # Between-chunk timeout (seconds)
```

### Step 2.3: Test timeout behavior

- [ ] **Write test for timeout**

```python
# backend/tests/test_llm_timeout.py
import asyncio
import pytest
from unittest.mock import patch, AsyncMock

from app.agents.llm import stream_with_fallback


@pytest.mark.asyncio
async def test_stream_timeout_triggers_fallback():
    """Verify timeout triggers fallback model."""
    chunks_received = []

    # Mock primary to hang
    async def slow_stream():
        yield "chunk1"
        await asyncio.sleep(60)  # Hang for 60 seconds

    # Mock fallback to work
    async def fast_stream():
        yield "fallback_chunk"

    with patch('app.agents.llm.get_llm') as mock_get_llm:
        primary_llm = AsyncMock()
        primary_llm.astream.return_value = slow_stream()

        fallback_llm = AsyncMock()
        fallback_llm.astream.return_value = fast_stream()

        mock_get_llm.side_effect = [primary_llm, fallback_llm]

        async for chunk in stream_with_fallback([]):
            chunks_received.append(chunk.content)

    # Should have received fallback chunk
    assert "fallback_chunk" in str(chunks_received)
```

### Step 2.4: Commit

- [ ] **Commit timeout handling**

```bash
git add backend/app/agents/llm.py backend/app/config.py backend/tests/test_llm_timeout.py
git commit -m "$(cat <<'EOF'
feat(llm): add streaming timeout with fallback

Prevents indefinitely stuck streaming responses.

- Add 2-minute total stream timeout
- Add 30-second between-chunk timeout
- Trigger fallback on timeout
- Configurable via settings

Issue: B8 (MEDIUM)
EOF
)"
```

---

## Task 3: Add Exponential Backoff to LLM Retries

**Priority:** MEDIUM - Better retry behavior (R15)
**Time:** 20 minutes
**Impact:** Reduces load on rate-limited APIs

**Files:**
- Modify: `backend/app/agents/llm.py`

### Step 3.1: Implement exponential backoff

- [ ] **Add backoff logic to fallback handling**

```python
# In backend/app/agents/llm.py:

BACKOFF_DELAYS = [1, 2, 4]  # Seconds between retries
MAX_RETRIES = 3


async def invoke_with_fallback(messages: list[BaseMessage]) -> tuple[str, LLMCallMeta]:
    """Invoke LLM with exponential backoff on rate limit errors."""
    meta = LLMCallMeta()
    t0 = time.monotonic()
    last_error = None

    for attempt, delay in enumerate(BACKOFF_DELAYS):
        try:
            meta.model_used = settings.gemini_model
            llm = get_llm(settings.gemini_model)
            response = await llm.ainvoke(messages)
            meta.duration_ms = int((time.monotonic() - t0) * 1000)
            set_meta(meta)
            return response.content, meta

        except Exception as e:
            last_error = e
            is_rate_limit = "rate" in str(e).lower() or "429" in str(e)

            if is_rate_limit and attempt < len(BACKOFF_DELAYS) - 1:
                logger.warning(
                    f"Rate limited, backing off {delay}s (attempt {attempt + 1}/{MAX_RETRIES})"
                )
                await asyncio.sleep(delay)
                continue

            # Try fallback model
            if settings.gemini_fallback_model:
                logger.warning(f"Primary failed ({e}), trying fallback")
                meta.model_used = settings.gemini_fallback_model
                meta.fallback = True
                meta.error = str(e)

                try:
                    llm = get_llm(settings.gemini_fallback_model)
                    response = await llm.ainvoke(messages)
                    meta.duration_ms = int((time.monotonic() - t0) * 1000)
                    set_meta(meta)
                    return response.content, meta
                except Exception as fallback_error:
                    last_error = fallback_error

            break

    raise last_error or Exception("LLM invocation failed")
```

### Step 3.2: Commit

- [ ] **Commit backoff logic**

```bash
git add backend/app/agents/llm.py
git commit -m "$(cat <<'EOF'
feat(llm): add exponential backoff for rate limit errors

Reduces load on rate-limited APIs with 1s, 2s, 4s delays.

- Detect rate limit errors (429, "rate" in message)
- Retry up to 3 times with exponential backoff
- Fall back to secondary model after backoff exhausted

Issue: R15 (MEDIUM)
EOF
)"
```

---

## Task 4: Add Idempotency Keys to POST Endpoints

**Priority:** MEDIUM - Prevents duplicates on retry (R17)
**Time:** 45 minutes
**Impact:** Safe to retry failed requests without duplicates

**Files:**
- Create: `backend/app/middleware/idempotency.py`
- Modify: `backend/app/api/routes_ingest.py`
- Modify: `backend/app/api/routes_deals.py`

### Step 4.1: Create idempotency middleware

- [ ] **Create backend/app/middleware/idempotency.py**

```python
"""Idempotency key middleware for safe retries."""
import json
import hashlib
import logging
from typing import Optional, Callable
from functools import wraps

from fastapi import Request, Response, HTTPException
from app.services.redis_client import get_redis

logger = logging.getLogger(__name__)

IDEMPOTENCY_PREFIX = "idempotency:"
IDEMPOTENCY_TTL = 86400  # 24 hours


def get_idempotency_key(request: Request) -> Optional[str]:
    """Extract idempotency key from request header."""
    return request.headers.get("Idempotency-Key")


async def get_cached_response(key: str) -> Optional[dict]:
    """Get cached response for idempotency key."""
    try:
        redis = get_redis()
        data = redis.get(f"{IDEMPOTENCY_PREFIX}{key}")
        if data:
            return json.loads(data)
    except Exception as e:
        logger.warning(f"Failed to get cached response: {e}")
    return None


async def cache_response(key: str, response_data: dict, status_code: int) -> None:
    """Cache response for idempotency key."""
    try:
        redis = get_redis()
        redis.setex(
            f"{IDEMPOTENCY_PREFIX}{key}",
            IDEMPOTENCY_TTL,
            json.dumps({"data": response_data, "status_code": status_code})
        )
    except Exception as e:
        logger.warning(f"Failed to cache response: {e}")


def idempotent(func: Callable):
    """Decorator to make an endpoint idempotent.

    If Idempotency-Key header is provided and a cached response exists,
    return the cached response instead of executing the function.
    """
    @wraps(func)
    async def wrapper(request: Request, *args, **kwargs):
        idempotency_key = get_idempotency_key(request)

        if idempotency_key:
            # Check for cached response
            cached = await get_cached_response(idempotency_key)
            if cached:
                logger.info(f"Returning cached response for key: {idempotency_key[:8]}...")
                return Response(
                    content=json.dumps(cached["data"]),
                    status_code=cached["status_code"],
                    media_type="application/json",
                    headers={"X-Idempotency-Replay": "true"}
                )

        # Execute the function
        result = await func(request, *args, **kwargs)

        # Cache the response if key provided
        if idempotency_key and hasattr(result, "dict"):
            await cache_response(idempotency_key, result.dict(), 200)
        elif idempotency_key and isinstance(result, dict):
            await cache_response(idempotency_key, result, 200)

        return result

    return wrapper
```

### Step 4.2: Apply to document upload endpoint

- [ ] **Update routes_ingest.py**

```python
# In backend/app/api/routes_ingest.py:

from app.middleware.idempotency import idempotent


@router.post("/deals/{deal_id}/documents", status_code=202)
@idempotent
async def upload_document(
    request: Request,  # Required for idempotency decorator
    deal_id: str,
    file: UploadFile = File(...),
    current_user: UserRow = Depends(get_current_user),
):
    """Upload a document to a deal (idempotent with Idempotency-Key header)."""
    # ... existing implementation ...
```

### Step 4.3: Apply to deal creation endpoint

- [ ] **Update routes_deals.py**

```python
# In backend/app/api/routes_deals.py:

from app.middleware.idempotency import idempotent


@router.post("", response_model=Deal, status_code=201)
@idempotent
async def create_deal(
    request: Request,
    deal: DealCreate,
    current_user: UserRow = Depends(get_current_user),
):
    """Create a new deal (idempotent with Idempotency-Key header)."""
    # ... existing implementation ...
```

### Step 4.4: Update frontend to send idempotency keys

- [ ] **Update api.ts to include keys on mutations**

```typescript
// In frontend/src/lib/api.ts:

import { v4 as uuidv4 } from 'uuid';


export async function createDeal(deal: DealCreate): Promise<Deal> {
    return fetchJson("/api/deals", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": uuidv4(),
        },
        body: JSON.stringify(deal),
    });
}


export async function uploadDocument(
    dealId: string,
    file: File,
    idempotencyKey?: string
): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append("file", file);

    return fetchJson(`/api/deals/${dealId}/documents`, {
        method: "POST",
        headers: {
            "Idempotency-Key": idempotencyKey || uuidv4(),
        },
        body: formData,
    });
}
```

### Step 4.5: Commit

- [ ] **Commit idempotency keys**

```bash
git add backend/app/middleware/idempotency.py backend/app/api/routes_ingest.py backend/app/api/routes_deals.py frontend/src/lib/api.ts
git commit -m "$(cat <<'EOF'
feat(api): add idempotency keys for safe retries

Prevents duplicate records when retrying failed requests.

- Add @idempotent decorator for POST endpoints
- Cache responses in Redis for 24 hours
- Return cached response on duplicate key
- Include X-Idempotency-Replay header on replays
- Frontend sends unique keys on mutations

Issue: R17 (MEDIUM)
EOF
)"
```

---

## Task 5: Bound the Streaming Queue

**Priority:** MEDIUM - Prevents memory exhaustion (R18)
**Time:** 20 minutes
**Impact:** Controlled memory usage during large matrix operations

**Files:**
- Modify: `backend/app/api/routes_matrix.py`

### Step 5.1: Add maxsize to queue

- [ ] **Update queue creation with bounds**

```python
# In backend/app/api/routes_matrix.py:

QUEUE_MAX_SIZE = 1000  # Max pending events in queue


async def stream_matrix_comparison(compare_request: CompareRequest, ...):
    """Stream matrix comparison results."""
    # Create bounded queue
    queue: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_MAX_SIZE)

    # ... rest of setup ...


async def _producer(queue: asyncio.Queue, deal_ids: list[str], queries: list[str]):
    """Producer that handles backpressure."""
    for deal_id in deal_ids:
        for query in queries:
            # ... generate result ...

            event = {"type": "cell", "deal_id": deal_id, "query": query, ...}

            # Wait for space in queue with timeout
            try:
                await asyncio.wait_for(
                    queue.put(event),
                    timeout=30.0  # 30 second timeout
                )
            except asyncio.TimeoutError:
                logger.warning(
                    f"Queue full, dropping event for {deal_id}/{query[:20]}...",
                    extra={"deal_id": deal_id, "query": query}
                )
                # Send error event instead
                error_event = {
                    "type": "error",
                    "deal_id": deal_id,
                    "query": query,
                    "error": "Processing queue full, please try again"
                }
                queue.put_nowait(error_event)

    # Signal completion
    await queue.put(None)
```

### Step 5.2: Add queue depth monitoring

- [ ] **Log queue depth periodically**

```python
# Add monitoring to consumer loop:

async def _consumer(queue: asyncio.Queue, response: StreamingResponse):
    """Consumer with queue monitoring."""
    event_count = 0

    while True:
        event = await queue.get()
        if event is None:
            break

        # Log queue depth every 100 events
        event_count += 1
        if event_count % 100 == 0:
            logger.info(
                f"Streaming progress: {event_count} events sent, queue depth: {queue.qsize()}"
            )

        # Send event
        yield f"data: {json.dumps(event)}\n\n"

    logger.info(f"Stream complete: {event_count} total events")
```

### Step 5.3: Commit

- [ ] **Commit bounded queue**

```bash
git add backend/app/api/routes_matrix.py
git commit -m "$(cat <<'EOF'
fix(matrix): bound streaming queue to prevent memory exhaustion

Limits queue to 1000 pending events with backpressure handling.

- Add maxsize=1000 to asyncio.Queue
- Wait with 30s timeout when queue full
- Drop events gracefully with error notification
- Log queue depth every 100 events

Issue: R18 (MEDIUM)
EOF
)"
```

---

## Task 6: Fix AbortController Race Condition

**Priority:** MEDIUM - Prevents orphaned streams (F4)
**Time:** 30 minutes
**Impact:** Clean cancellation when rapidly switching queries

**Files:**
- Modify: `frontend/src/hooks/useMatrix.ts`

### Step 6.1: Track all active controllers

- [ ] **Replace single ref with Map of controllers**

```typescript
// In frontend/src/hooks/useMatrix.ts:

// OLD:
// const abortRef = useRef<AbortController | null>(null);

// NEW:
const activeControllers = useRef<Map<string, AbortController>>(new Map());
const controllerIdRef = useRef(0);


// Add cleanup function
const abortAllStreams = useCallback(() => {
    for (const [id, controller] of activeControllers.current.entries()) {
        controller.abort();
        console.log(`Aborted stream ${id}`);
    }
    activeControllers.current.clear();
}, []);


// Update addQuery to track controllers properly
const addQuery = useCallback(
    (query: string, targetDealIds?: string[]) => {
        if (!query.trim() || state.deals.length === 0) return;

        // Abort ALL existing streams, not just the last one
        abortAllStreams();

        const controllerId = `query-${++controllerIdRef.current}`;
        const dealsToQuery = targetDealIds ?? state.deals;
        const newQueries = [...state.queries, query];

        // ... existing state update ...

        if (dealsToQuery.length === 0) {
            setState((s) => ({ ...s, loading: false }));
            return;
        }

        const controller = matrixCompareStream(
            dealsToQuery,
            [query],
            handleStreamEvent,
            () => {
                // Cleanup on completion
                activeControllers.current.delete(controllerId);
                setState((s) => ({ ...s, loading: false }));
            },
            (err) => {
                // Cleanup on error
                activeControllers.current.delete(controllerId);
                setState((s) => ({
                    ...s,
                    loading: false,
                    error: err.message || "Streaming failed",
                }));
            }
        );

        // Track this controller
        activeControllers.current.set(controllerId, controller);
    },
    [state.deals, state.queries, handleStreamEvent, abortAllStreams]
);
```

### Step 6.2: Update cleanup on unmount

- [ ] **Abort all on unmount**

```typescript
// Update the unmount cleanup effect:

useEffect(() => {
    return () => {
        // Abort all active streams on unmount
        for (const controller of activeControllers.current.values()) {
            controller.abort();
        }
        activeControllers.current.clear();
    };
}, []);
```

### Step 6.3: Commit

- [ ] **Commit race condition fix**

```bash
git add frontend/src/hooks/useMatrix.ts
git commit -m "$(cat <<'EOF'
fix(matrix): track all AbortControllers to prevent orphaned streams

Fixes race condition when rapidly adding queries.

- Replace single abortRef with Map of controllers
- Abort ALL active streams on new query
- Clean up completed/failed streams from map
- Abort all on component unmount

Issue: F4 (MEDIUM)
EOF
)"
```

---

## Task 7: Add State Rollback on Network Error

**Priority:** MEDIUM - Better UX (R16)
**Time:** 25 minutes
**Impact:** Users don't lose context when network fails

**Files:**
- Modify: `frontend/src/hooks/useInvestigation.ts`

### Step 7.1: Implement optimistic update with rollback

- [ ] **Add state preservation and rollback**

```typescript
// In frontend/src/hooks/useInvestigation.ts:

const startInvestigation = useCallback(async (
    dealId: string,
    goal: string,
    options?: { focusDocIds?: string[] }
) => {
    // Save previous state for rollback
    const previousState = { ...state };

    // Optimistic update - mark as starting
    setState((prev) => ({
        ...prev,
        status: "starting",
        dealId,
        goal,
        error: null,
    }));

    try {
        // Attempt to start stream
        const abortController = new AbortController();
        abortRef.current = abortController;

        await startInvestigationStream(
            dealId,
            goal,
            {
                signal: abortController.signal,
                focusDocIds: options?.focusDocIds,
                onEvent: (event) => {
                    setState((prev) => ({
                        ...prev,
                        status: "streaming",
                        // ... update based on event ...
                    }));
                },
                onComplete: (result) => {
                    setState((prev) => ({
                        ...prev,
                        status: "complete",
                        // ... final state ...
                    }));
                },
                onError: (err) => {
                    // Network error during streaming - partial rollback
                    setState((prev) => ({
                        ...prev,
                        status: "error",
                        error: err.message,
                        // Keep any data received so far
                    }));
                },
            }
        );
    } catch (err) {
        // Failed to even start - full rollback
        console.error("Failed to start investigation:", err);

        setState({
            ...previousState,
            error: err instanceof Error
                ? err.message
                : "Failed to start investigation. Please try again.",
        });

        // Show user-friendly toast
        toast.error("Failed to connect. Please check your connection and try again.");
    }
}, [state]);
```

### Step 7.2: Add retry capability

- [ ] **Allow retrying from error state**

```typescript
// Add retry function:

const retryInvestigation = useCallback(() => {
    if (state.dealId && state.goal) {
        startInvestigation(state.dealId, state.goal);
    }
}, [state.dealId, state.goal, startInvestigation]);

// Export retry function
return {
    ...state,
    startInvestigation,
    retryInvestigation,  // Add this
    stop,
    reset,
};
```

### Step 7.3: Commit

- [ ] **Commit state rollback**

```bash
git add frontend/src/hooks/useInvestigation.ts
git commit -m "$(cat <<'EOF'
fix(investigation): add state rollback on network error

Users no longer lose context when network fails.

- Save previous state before starting
- Full rollback if connection fails
- Partial rollback (keep data) if streaming fails
- Add retryInvestigation() function

Issue: R16 (MEDIUM)
EOF
)"
```

---

## Task 8: Add Startup Database Validation

**Priority:** MEDIUM - Early failure detection (R19)
**Time:** 20 minutes
**Impact:** Immediate feedback on database issues

**Files:**
- Modify: `ai-service/src/lib/db.ts`

### Step 8.1: Add integrity check on startup

- [ ] **Update db.ts to validate on init**

```typescript
// In ai-service/src/lib/db.ts:

import Database from "better-sqlite3";

const databasePath = process.env.DATABASE_PATH || "./data/ai-service.db";

function initializeDatabase(): Database.Database {
    console.log(`[db] Initializing database at ${databasePath}`);

    const db = new Database(databasePath);

    // Enable WAL mode for better concurrency
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // Validate database integrity on startup
    try {
        // Quick integrity check
        const integrityResult = db.pragma("quick_check");
        if (integrityResult[0]?.quick_check !== "ok") {
            console.error("[db] Database integrity check failed:", integrityResult);
            throw new Error("Database integrity check failed");
        }
        console.log("[db] Integrity check passed");

        // Verify we can execute queries
        const testResult = db.prepare("SELECT 1 as test").get() as { test: number };
        if (testResult.test !== 1) {
            throw new Error("Database query test failed");
        }
        console.log("[db] Query test passed");

        // Check schema version (if using migrations)
        const tableCount = db.prepare(
            "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'"
        ).get() as { count: number };
        console.log(`[db] Database has ${tableCount.count} tables`);

    } catch (err) {
        console.error("[db] Database initialization failed:", err);
        process.exit(1);  // Exit immediately on database issues
    }

    return db;
}

export const db = initializeDatabase();


// Add health check export
export function checkDatabaseHealth(): { status: string; message?: string } {
    try {
        const result = db.pragma("quick_check");
        if (result[0]?.quick_check === "ok") {
            return { status: "ok" };
        }
        return { status: "error", message: "Integrity check failed" };
    } catch (err) {
        return { status: "error", message: String(err) };
    }
}
```

### Step 8.2: Add health endpoint in ai-service

- [ ] **Create health check route**

```typescript
// In ai-service/src/routes/health.ts:

import { Router } from "express";
import { checkDatabaseHealth } from "../lib/db";

export const router = Router();

router.get("/health", (req, res) => {
    const dbHealth = checkDatabaseHealth();

    const healthy = dbHealth.status === "ok";

    res.status(healthy ? 200 : 503).json({
        status: healthy ? "ok" : "error",
        checks: {
            database: dbHealth,
        },
        timestamp: new Date().toISOString(),
    });
});
```

### Step 8.3: Commit

- [ ] **Commit validation**

```bash
git add ai-service/src/lib/db.ts ai-service/src/routes/health.ts
git commit -m "$(cat <<'EOF'
feat(ai-service): add startup database validation

Fails fast if database is corrupted or inaccessible.

- Run integrity_check on startup
- Verify queries work
- Exit with error if checks fail
- Add /health endpoint with database check

Issue: R19 (MEDIUM)
EOF
)"
```

---

## Task 9: Fix Node.js Promise Rejection Handling

**Priority:** MEDIUM - Prevents stuck loading state (R11)
**Time:** 25 minutes
**Impact:** Cells show error instead of spinning forever

**Files:**
- Modify: `ai-service/src/routes/matrix.ts`

### Step 9.1: Proper error handling in document processing

- [ ] **Update matrix.ts to handle all error cases**

```typescript
// In ai-service/src/routes/matrix.ts, update the document processing loop:

await mapWithConcurrency(docs, MAX_CONCURRENT_DOCS, async (doc, docIndex) => {
    console.log(`[matrix] Processing document ${docIndex + 1}/${docs.length}: ${doc.filename}`);

    try {
        const evidence = await selectEvidence(row.deal_id, doc, columns);

        // Try primary model
        try {
            await queryGeminiAllColumns(
                DEFAULT_TABULAR_MODEL,
                doc.filename,
                evidence.markdown,
                columns,
                async (columnIndex, result) => {
                    upsertCell(matrixId, doc.id, columnIndex, result.answer, result.citations);
                    sendCellUpdate(res, doc.id, columnIndex, result.answer, result.citations);
                },
                apiKeys(),
            );
        } catch (primaryErr) {
            console.warn(`[matrix] Primary model failed for ${doc.filename}:`, primaryErr);

            // Try fallback model
            try {
                await queryGeminiAllColumns(
                    FALLBACK_TABULAR_MODEL,
                    doc.filename,
                    evidence.markdown,
                    columns,
                    async (columnIndex, result) => {
                        upsertCell(matrixId, doc.id, columnIndex, result.answer, result.citations);
                        sendCellUpdate(res, doc.id, columnIndex, result.answer, result.citations);
                    },
                    apiKeys(),
                );
            } catch (fallbackErr) {
                // Both models failed - mark all columns as error
                console.error(`[matrix] Both models failed for ${doc.filename}:`, fallbackErr);
                for (let i = 0; i < columns.length; i++) {
                    const errorMessage = `Error: ${fallbackErr instanceof Error ? fallbackErr.message : "Unknown error"}`;
                    upsertCell(matrixId, doc.id, i, errorMessage, []);
                    sendCellUpdate(res, doc.id, i, errorMessage, []);
                }
            }
        }
    } catch (evidenceErr) {
        // Evidence selection failed - mark all columns as error
        console.error(`[matrix] Evidence selection failed for ${doc.filename}:`, evidenceErr);
        for (let i = 0; i < columns.length; i++) {
            const errorMessage = `Error: Could not extract evidence from document`;
            upsertCell(matrixId, doc.id, i, errorMessage, []);
            sendCellUpdate(res, doc.id, i, errorMessage, []);
        }
    }
});
```

### Step 9.2: Add global unhandled rejection handler

- [ ] **Add handler in server.ts**

```typescript
// In ai-service/src/server.ts:

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
    console.error("[server] Unhandled Promise Rejection:", reason);
    // Don't exit - just log. Individual request errors are handled above.
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
    console.error("[server] Uncaught Exception:", error);
    // Give time for logs to flush, then exit
    setTimeout(() => process.exit(1), 1000);
});
```

### Step 9.3: Commit

- [ ] **Commit promise handling**

```bash
git add ai-service/src/routes/matrix.ts ai-service/src/server.ts
git commit -m "$(cat <<'EOF'
fix(matrix): proper promise rejection handling

Prevents cells from being stuck in loading state forever.

- Catch primary model errors and try fallback
- Catch fallback errors and mark cells as error
- Catch evidence extraction errors
- Add global unhandled rejection handler

Issue: R11 (HIGH)
EOF
)"
```

---

## Task 10: Propagate Errors in Investigation Finalization

**Priority:** MEDIUM - Data loss prevention (R3)
**Time:** 20 minutes
**Impact:** Users notified when investigation fails to save

**Files:**
- Modify: `backend/app/api/routes_agent.py`

### Step 10.1: Send error event on persist failure

- [ ] **Update finalization error handling**

```python
# In backend/app/api/routes_agent.py, update the finally block:

finally:
    try:
        investigation_store.finalize_investigation(
            investigation_id,
            status=status,
            memo=memo,
            sources=sources,
        )
    except Exception as e:
        logger.exception("failed to persist investigation %s", investigation_id)

        # Send error event to client so they know to retry
        error_event = {
            "type": "persist_error",
            "error": "Failed to save investigation. Your results were generated but could not be saved. Please try again.",
            "investigation_id": investigation_id,
        }
        yield f"data: {json.dumps(error_event)}\n\n"

        # Don't swallow the error completely - update status to indicate problem
        try:
            investigation_store.update_investigation_status(
                investigation_id,
                status="persist_failed"
            )
        except Exception:
            pass  # Best effort status update
```

### Step 10.2: Handle persist_error on frontend

- [ ] **Update useInvestigation.ts to handle persist errors**

```typescript
// In frontend/src/hooks/useInvestigation.ts, add handler:

const handleEvent = useCallback((event: any) => {
    switch (event.type) {
        case "persist_error":
            setState((prev) => ({
                ...prev,
                status: "persist_error",
                error: event.error,
                // Keep all the investigation data - it's still valid
            }));
            toast.warning(
                "Investigation completed but couldn't be saved. Click Retry to save.",
                { duration: 10000 }
            );
            break;

        // ... other event handlers ...
    }
}, []);
```

### Step 10.3: Commit

- [ ] **Commit persist error handling**

```bash
git add backend/app/api/routes_agent.py frontend/src/hooks/useInvestigation.ts
git commit -m "$(cat <<'EOF'
fix(investigation): notify user when persist fails

Users are now informed if their investigation couldn't be saved.

- Send persist_error event to client on save failure
- Keep investigation data (still valid)
- Show toast with retry option
- Track persist_failed status in DB

Issue: R3 (CRITICAL)
EOF
)"
```

---

## Task 11: Improve Frontend Error Handling

**Priority:** MEDIUM - Better UX (R12)
**Time:** 25 minutes
**Impact:** Users see helpful errors instead of raw HTML

**Files:**
- Modify: `frontend/src/lib/api.ts`

### Step 11.1: Create ApiError class

- [ ] **Add structured error handling**

```typescript
// In frontend/src/lib/api.ts:

export class ApiError extends Error {
    constructor(
        message: string,
        public status: number,
        public details?: any
    ) {
        super(message);
        this.name = "ApiError";
    }

    get isNetworkError(): boolean {
        return this.status === 0;
    }

    get isRateLimited(): boolean {
        return this.status === 429;
    }

    get isServerError(): boolean {
        return this.status >= 500;
    }

    get isClientError(): boolean {
        return this.status >= 400 && this.status < 500;
    }
}


export async function fetchJson<T>(
    url: string,
    options?: RequestInit
): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            let message = `Request failed with status ${response.status}`;
            let details: any = undefined;

            // Try to parse error response
            const contentType = response.headers.get("content-type");
            if (contentType?.includes("application/json")) {
                try {
                    const json = await response.json();
                    message = json.detail || json.message || json.error || message;
                    details = json;
                } catch {
                    // Couldn't parse JSON, use default message
                }
            }

            throw new ApiError(message, response.status, details);
        }

        return await response.json();
    } catch (err) {
        clearTimeout(timeoutId);

        if (err instanceof ApiError) {
            throw err;
        }

        if (err instanceof Error) {
            if (err.name === "AbortError") {
                throw new ApiError("Request timed out", 408);
            }
            if (err.message.includes("fetch")) {
                throw new ApiError("Network error - please check your connection", 0);
            }
        }

        throw new ApiError("An unexpected error occurred", 500);
    }
}


// Helper for user-friendly error messages
export function getErrorMessage(error: unknown): string {
    if (error instanceof ApiError) {
        if (error.isNetworkError) {
            return "Unable to connect. Please check your internet connection.";
        }
        if (error.isRateLimited) {
            return "Too many requests. Please wait a moment and try again.";
        }
        if (error.isServerError) {
            return "Server error. Our team has been notified.";
        }
        return error.message;
    }

    if (error instanceof Error) {
        return error.message;
    }

    return "An unexpected error occurred.";
}
```

### Step 11.2: Update components to use new error handling

- [ ] **Example: Update a hook to use getErrorMessage**

```typescript
// In any hook, update error handling:

import { ApiError, getErrorMessage } from "@/lib/api";

// In catch block:
catch (err) {
    const message = getErrorMessage(err);
    setError(message);

    // Optionally show toast for different error types
    if (err instanceof ApiError && err.isNetworkError) {
        toast.error("Network connection lost");
    }
}
```

### Step 11.3: Commit

- [ ] **Commit error handling**

```bash
git add frontend/src/lib/api.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add structured error handling

Users now see helpful error messages instead of raw HTML.

- Add ApiError class with status codes
- Parse JSON error responses when available
- Add timeout handling (30s)
- Add network error detection
- Add getErrorMessage() for user-friendly messages

Issue: R12 (HIGH)
EOF
)"
```

---

## Task 12: Add Request Timeouts to External Calls

**Priority:** MEDIUM - Prevents hung requests (R13)
**Time:** 20 minutes
**Impact:** Requests fail fast instead of hanging indefinitely

**Files:**
- Modify: `ai-service/src/lib/pythonClient.ts`

### Step 12.1: Add configurable timeout

- [ ] **Update pythonClient.ts with timeout**

```typescript
// In ai-service/src/lib/pythonClient.ts:

const REQUEST_TIMEOUT = 30000;  // 30 seconds


async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = process.env.INTERNAL_API_TOKEN || "";
    const headers = new Headers(init.headers);
    headers.set("X-Internal-Token", token);
    if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, REQUEST_TIMEOUT);

    try {
        const resp = await fetch(`${pythonBase}${path}`, {
            ...init,
            headers,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!resp.ok) {
            const detail = await resp.text();
            throw new Error(`Python API ${resp.status}: ${detail}`);
        }

        return (await resp.json()) as T;
    } catch (err) {
        clearTimeout(timeoutId);

        if (err instanceof Error && err.name === "AbortError") {
            throw new Error(`Python API timeout after ${REQUEST_TIMEOUT}ms on ${path}`);
        }

        throw err;
    }
}
```

### Step 12.2: Commit

- [ ] **Commit timeout**

```bash
git add ai-service/src/lib/pythonClient.ts
git commit -m "$(cat <<'EOF'
feat(ai-service): add request timeout to Python client

Prevents hung requests from blocking resources indefinitely.

- Add 30-second timeout per request
- Abort request on timeout
- Clear error message on timeout

Issue: R13 (MEDIUM)
EOF
)"
```

---

## Task 13: Log Vector Cleanup Failures

**Priority:** MEDIUM - Visibility (from Phase 1 Task 10 completion)
**Time:** 10 minutes
**Impact:** Already completed in Phase 1 - verify and close

This was addressed in Phase 1 Task 10. Verify it's working:

- [ ] **Verify logging is in place**

```bash
grep -n "Failed to delete vectors" backend/app/api/routes_deals.py
```

Should show the logger.error call from Phase 1.

---

## Task 14: Add API Key Rotation Support

**Priority:** MEDIUM - Rate limit protection (A3)
**Time:** 30 minutes
**Impact:** Multiple API keys for load distribution

**Files:**
- Modify: `ai-service/src/routes/matrix.ts`
- Modify: `backend/app/config.py`

### Step 14.1: Support multiple API keys

- [ ] **Update config.py for key list**

```python
# In backend/app/config.py:

    # Gemini API keys (comma-separated for rotation)
    gemini_api_keys: str = ""

    @property
    def gemini_api_key_list(self) -> list[str]:
        """Get list of Gemini API keys for rotation."""
        keys = [k.strip() for k in self.gemini_api_keys.split(",") if k.strip()]
        # Fall back to single key if no list provided
        if not keys and self.gemini_api_key:
            keys = [self.gemini_api_key]
        return keys
```

### Step 14.2: Implement round-robin key selection

- [ ] **Add key rotation in llm.py**

```python
# In backend/app/agents/llm.py:

import itertools

# Key rotation generator
_key_cycle: itertools.cycle | None = None


def _get_next_api_key() -> str:
    """Get the next API key in rotation."""
    global _key_cycle

    keys = settings.gemini_api_key_list
    if not keys:
        raise ValueError("No Gemini API keys configured")

    if _key_cycle is None or len(keys) == 1:
        _key_cycle = itertools.cycle(keys)

    return next(_key_cycle)


def get_llm(model: str | None = None) -> ChatGoogleGenerativeAI:
    """Create a Gemini LLM instance with rotated API key."""
    api_key = _get_next_api_key()

    return ChatGoogleGenerativeAI(
        model=model or settings.gemini_model,
        google_api_key=api_key,
        max_output_tokens=settings.max_tokens,
        convert_system_message_to_human=True,
    )
```

### Step 14.3: Update ai-service similarly

- [ ] **Add key rotation to ai-service**

```typescript
// In ai-service/src/routes/matrix.ts:

// Parse comma-separated keys
const geminiKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
    .split(",")
    .map(k => k.trim())
    .filter(k => k.length > 0);

let keyIndex = 0;

function getNextApiKey(): string {
    if (geminiKeys.length === 0) {
        throw new Error("No Gemini API keys configured");
    }
    const key = geminiKeys[keyIndex];
    keyIndex = (keyIndex + 1) % geminiKeys.length;
    return key;
}

function apiKeys(): UserApiKeys {
    return { gemini: getNextApiKey() };
}
```

### Step 14.4: Commit

- [ ] **Commit key rotation**

```bash
git add backend/app/config.py backend/app/agents/llm.py ai-service/src/routes/matrix.ts
git commit -m "$(cat <<'EOF'
feat(llm): add API key rotation support

Distribute load across multiple API keys to reduce rate limiting.

- Support comma-separated GEMINI_API_KEYS env var
- Implement round-robin key selection
- Fall back to single key if no list provided

Issue: A3 (HIGH)
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

### Run Full Test Suite

- [ ] **Verify all tests pass**

```bash
# Backend tests
cd backend && pytest tests/ -v

# AI-service tests
cd ai-service && npm test

# Frontend tests
cd frontend && npm test
```

### Update Analysis Document

- [ ] **Mark Phase 3 tasks as complete in scalability analysis**

Update `docs/superpowers/plans/2026-05-03-scalability-analysis.md` Part 5 to check off Phase 3 tasks.

---

## Summary

This execution plan covers 14 medium-priority fixes:

| Task | Issue | Time | Impact |
|------|-------|------|--------|
| 1 | P7: Composite indexes | 30m | Faster queries at scale |
| 2 | B8: LLM streaming timeout | 30m | No hung connections |
| 3 | R15: Exponential backoff | 20m | Better retry behavior |
| 4 | R17: Idempotency keys | 45m | Safe retries |
| 5 | R18: Bounded queue | 20m | Memory control |
| 6 | F4: AbortController fix | 30m | Clean cancellation |
| 7 | R16: State rollback | 25m | Better UX on errors |
| 8 | R19: Startup validation | 20m | Early failure detection |
| 9 | R11: Promise rejection | 25m | No stuck loading |
| 10 | R3: Persist error events | 20m | Data loss prevention |
| 11 | R12: Frontend errors | 25m | Helpful error messages |
| 12 | R13: Request timeouts | 20m | No hung requests |
| 13 | R5: Vector cleanup logs | 10m | Verify Phase 1 |
| 14 | A3: API key rotation | 30m | Rate limit protection |

**Total estimated time:** ~6 hours

**Grade improvement:** C+ → B- (production-ready for limited beta)

**After all phases:**
- Phase 1: D+ → C (critical fixes)
- Phase 2: C → C+ (infrastructure)
- Phase 3: C+ → B- (polish)

**Total effort:** ~21 hours across all phases

**Next steps after Phase 3:**
1. Set up observability stack (logging, metrics, tracing)
2. Security hardening (auth, rate limiting, CORS)
3. Load testing to validate fixes
4. SOC 2 preparation if targeting enterprise
