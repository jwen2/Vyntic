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
            yield chunk
    finally:
        meta.duration_ms = int((time.monotonic() - t0) * 1000)
        _last_meta.set(meta)
