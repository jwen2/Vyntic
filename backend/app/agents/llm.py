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
    # "were we billed for this?" — NOT the same question as `error`, which is
    # also set on a call that failed over and then SUCCEEDED (see the fallback
    # branch of stream_with_fallback). Defaults pessimistically to "error" so
    # that a call which never reaches its success point — including one that
    # died before any network request — is never counted as a billed call.
    #   "ok"      completed normally (primary or fallback)
    #   "error"   raised, or never got as far as completing
    #   "aborted" consumer abandoned the stream (client disconnect)
    outcome: str = "error"


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
    # Set only where exactly one document is unambiguously in scope (doc
    # matrix, one_doc_per_row tabular cells, single-doc monitoring extraction).
    # Left None for multi-doc and no-doc surfaces — never guessed.
    doc_id: str | None = None


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
    doc_id: str | None = None,
):
    """Attribute every LLM call made inside this block to `surface`."""
    token = _call_context.set(
        LLMCallContext(
            surface=surface,
            deal_id=deal_id,
            run_id=run_id,
            cell_id=cell_id,
            doc_id=doc_id,
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


def _record(meta: LLMCallMeta) -> None:
    """Persist this call's usage. Deferred import breaks the llm <-> metrics cycle."""
    try:
        from app.services import llm_metrics

        llm_metrics.record_call(meta, _call_context.get())
    except Exception:
        logger.exception("LLM metrics recording failed")


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
        meta.outcome = "ok"
        return response.content
    finally:
        meta.duration_ms = int((time.monotonic() - t0) * 1000)
        _record(meta)


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
    - input_token_details.cache_read -> cached_tokens: PARTIALLY MEASURED,
      ACCUMULATION SEMANTICS STILL UNKNOWN. A live cached call has now been
      observed emitting a non-zero cache_read (4076 of 7207 prompt tokens,
      implicit caching, see the Gemini caching spike doc), so the field is
      real and does get populated. But it arrived exactly once, on the FINAL
      chunk of a 3-chunk response — the one position where last-non-zero-wins
      and summing produce identical results. So this code's choice of
      last-non-zero-wins is still unconfirmed: cache_read could equally be a
      per-chunk increment like output_tokens, which would make this
      under-report on a longer cached answer. Resolving it needs a cached
      call whose response streams over many chunks. Until then, Plan B must
      not treat summed cached_tokens as trustworthy.
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
        meta.outcome = "ok"
    except LLMConfigurationError:
        raise
    except GeneratorExit:
        # The consumer abandoned this generator (realistically: an SSE client
        # disconnected), and GeneratorExit is thrown in at the yield above.
        # It is a BaseException, so `except Exception` below does NOT see it —
        # without this clause it would reach `finally` indistinguishable from a
        # call that failed before the provider was ever reached, and a real
        # billed call would be recorded as never-billed. Must re-raise.
        meta.outcome = "aborted"
        raise
    except Exception as e:
        if yielded_any or not settings.gemini_fallback_model:
            raise
        logger.warning(f"Primary model failed ({e}), falling back to {settings.gemini_fallback_model}")
        meta.model_used = settings.gemini_fallback_model
        meta.fallback = True
        meta.error = str(e)
        llm = get_llm(settings.gemini_fallback_model)
        try:
            async for chunk in llm.astream(messages):
                _apply_usage(meta, chunk)
                yield chunk
            meta.outcome = "ok"
        except GeneratorExit:
            # Same abort case, one level in: an exception raised inside an
            # `except` block is not offered to that try's sibling handlers,
            # so the clause above cannot cover the fallback stream.
            meta.outcome = "aborted"
            raise
    finally:
        meta.duration_ms = int((time.monotonic() - t0) * 1000)
        _last_meta.set(meta)
        _record(meta)
