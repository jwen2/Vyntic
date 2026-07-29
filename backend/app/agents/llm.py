"""
Shared LLM helper with automatic fallback from primary to backup model.
"""
import logging
import os
import time
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import BaseMessage
from app.config import settings

logger = logging.getLogger(__name__)


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


# Metadata for the most recent stream call, isolated per asyncio task via
# ContextVar — concurrent streams (cells, doc matrix, chat) must not stomp
# each other's model/fallback/duration attribution.
_last_meta: ContextVar[LLMCallMeta | None] = ContextVar("llm_last_meta", default=None)


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


class LLMConfigurationError(RuntimeError):
    """Raised when the backend cannot initialize the configured LLM provider."""


def get_last_meta() -> LLMCallMeta | None:
    return _last_meta.get()


def ensure_llm_configured() -> None:
    if not settings.gemini_api_key and not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
        raise LLMConfigurationError(
            "GEMINI_API_KEY is not configured. Set GEMINI_API_KEY in your shell or .env, "
            "then recreate the backend container before running workflows."
        )


def get_llm(model: str | None = None) -> ChatGoogleGenerativeAI:
    """Create a Gemini LLM instance."""
    ensure_llm_configured()
    return ChatGoogleGenerativeAI(
        model=model or settings.gemini_model,
        google_api_key=settings.gemini_api_key,
        max_output_tokens=settings.max_tokens,
    )


async def invoke_with_fallback(messages: list[BaseMessage]) -> str:
    """Invoke the primary model; fall back to backup on rate-limit or error."""
    try:
        llm = get_llm(settings.gemini_model)
        response = await llm.ainvoke(messages)
        return response.content
    except LLMConfigurationError:
        raise
    except Exception as e:
        if settings.gemini_fallback_model:
            logger.warning(f"Primary model failed ({e}), falling back to {settings.gemini_fallback_model}")
            llm = get_llm(settings.gemini_fallback_model)
            response = await llm.ainvoke(messages)
            return response.content
        raise


def _apply_usage(meta: LLMCallMeta, chunk: object) -> None:
    """Copy langchain usage_metadata off a chunk into meta.

    Measured live against gemini-3.1-flash-lite (see task-1-report.md for
    the raw per-chunk output) — usage_metadata is reported as PER-CHUNK
    INCREMENTS, not a cumulative running total, and the stream's final
    chunk is an empty-content terminator whose usage_metadata dict is
    present but has every value zeroed; that dict is truthy (it has keys),
    so a guard of `if not usage: return` does NOT filter it out and it
    clobbers real values with zeros. The guard here checks individual
    token counts, not dict truthiness.

    - input_tokens -> prompt_tokens: MEASURED (2 live runs). Reported once,
      on the first content-bearing chunk, and 0 on every chunk after.
      Captured as last-non-zero-wins.
    - output_tokens -> completion_tokens: MEASURED (12-chunk run). A small
      non-cumulative count on every content chunk. ACCUMULATED (summed)
      across the stream to get the true total.
    - input_token_details.cache_read -> cached_tokens: NOT MEASURED. Both
      calibration runs had caching inactive, so cache_read was 0 on every
      chunk in both — last-non-zero-wins here is an assumption by analogy
      with input_tokens, not an observation. It could plausibly behave like
      output_tokens (per-chunk increments) instead. Must be verified with
      caching actually enabled before any caching measurement (Plan B)
      relies on this field — that verification is Task 10's job.
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


async def stream_with_fallback(messages: list[BaseMessage]):
    """Stream from the primary model; fall back to backup on pre-token error.

    Fallback only happens if the primary failed BEFORE yielding any token —
    falling back mid-stream would restart the answer while consumers keep
    appending, duplicating content. Mid-stream failures raise; callers'
    existing error/retry paths handle them.

    After iteration completes, call get_last_meta() to get model/timing info.
    """
    meta = LLMCallMeta()
    t0 = time.monotonic()
    yielded_any = False

    try:
        meta.model_used = settings.gemini_model
        llm = get_llm(settings.gemini_model)
        async for chunk in llm.astream(messages):
            yielded_any = True
            _apply_usage(meta, chunk)
            yield chunk
    except LLMConfigurationError:
        raise
    except Exception as e:
        if yielded_any or not settings.gemini_fallback_model:
            raise
        logger.warning(f"Primary model failed ({e}), falling back to {settings.gemini_fallback_model}")
        meta.model_used = settings.gemini_fallback_model
        meta.fallback = True
        meta.error = str(e)
        llm = get_llm(settings.gemini_fallback_model)
        async for chunk in llm.astream(messages):
            _apply_usage(meta, chunk)
            yield chunk
    finally:
        meta.duration_ms = int((time.monotonic() - t0) * 1000)
        _last_meta.set(meta)
