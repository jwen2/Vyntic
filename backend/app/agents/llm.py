"""
Shared LLM helper with automatic fallback from primary to backup model.
"""
import logging
import os
import time
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

    Measured live against gemini-3.1-flash-lite (two calls: a short reply and
    a ~200-word reply spanning 12 chunks) — usage_metadata is reported as
    PER-CHUNK INCREMENTS, not a cumulative running total:
      - input_tokens (prompt cost) is reported once, on the first
        content-bearing chunk, and is 0 on every subsequent chunk.
      - output_tokens (completion cost) is a small non-cumulative count on
        EVERY content chunk (e.g. 15, 24, 28, 28, 26, ... across 11 chunks)
        and must be SUMMED across the stream to get the true total.
      - The stream's final chunk is an empty-content terminator that also
        carries a usage_metadata dict — but with every value zeroed. That
        dict is truthy (it has keys), so a guard of `if not usage: return`
        does NOT filter it out and it clobbers real values with zeros. The
        guard here checks individual token counts, not dict truthiness.

    prompt_tokens and cached_tokens: last NON-ZERO value wins (each is
    reported once per call; zeros from the terminator or repeat chunks are
    ignored rather than overwriting a real value).
    completion_tokens: accumulated (summed) across every chunk that reports
    a non-zero output_tokens.
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
