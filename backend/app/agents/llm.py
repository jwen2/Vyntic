"""
Shared LLM helper with automatic fallback from primary to backup model.
"""
import logging
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import BaseMessage
from app.config import settings

logger = logging.getLogger(__name__)


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
    """Stream from the primary model; fall back to backup on error."""
    try:
        llm = get_llm(settings.gemini_model)
        async for chunk in llm.astream(messages):
            yield chunk
    except Exception as e:
        if settings.gemini_fallback_model:
            logger.warning(f"Primary model failed ({e}), falling back to {settings.gemini_fallback_model}")
            llm = get_llm(settings.gemini_fallback_model)
            async for chunk in llm.astream(messages):
                yield chunk
        else:
            raise
