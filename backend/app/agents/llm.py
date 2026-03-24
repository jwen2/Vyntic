"""
Shared LLM helper with automatic fallback from primary to backup model.
"""
import logging
import time
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


# Stores the metadata for the most recent stream call per-task
_last_meta: LLMCallMeta | None = None


def get_last_meta() -> LLMCallMeta | None:
    return _last_meta


def get_llm(model: str | None = None) -> ChatGoogleGenerativeAI:
    """Create a Gemini LLM instance."""
    return ChatGoogleGenerativeAI(
        model=model or settings.gemini_model,
        google_api_key=settings.gemini_api_key,
        max_output_tokens=settings.max_tokens,
        convert_system_message_to_human=True,
    )


async def invoke_with_fallback(messages: list[BaseMessage]) -> str:
    """Invoke the primary model; fall back to backup on rate-limit or error."""
    try:
        llm = get_llm(settings.gemini_model)
        response = await llm.ainvoke(messages)
        return response.content
    except Exception as e:
        if settings.gemini_fallback_model:
            logger.warning(f"Primary model failed ({e}), falling back to {settings.gemini_fallback_model}")
            llm = get_llm(settings.gemini_fallback_model)
            response = await llm.ainvoke(messages)
            return response.content
        raise


async def stream_with_fallback(messages: list[BaseMessage]):
    """Stream from the primary model; fall back to backup on error.

    After iteration completes, call get_last_meta() to get model/timing info.
    """
    global _last_meta
    meta = LLMCallMeta()
    t0 = time.monotonic()

    try:
        meta.model_used = settings.gemini_model
        llm = get_llm(settings.gemini_model)
        async for chunk in llm.astream(messages):
            yield chunk
    except Exception as e:
        if settings.gemini_fallback_model:
            logger.warning(f"Primary model failed ({e}), falling back to {settings.gemini_fallback_model}")
            meta.model_used = settings.gemini_fallback_model
            meta.fallback = True
            meta.error = str(e)
            llm = get_llm(settings.gemini_fallback_model)
            async for chunk in llm.astream(messages):
                yield chunk
        else:
            raise
    finally:
        meta.duration_ms = int((time.monotonic() - t0) * 1000)
        _last_meta = meta
