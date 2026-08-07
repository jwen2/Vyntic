"""The single extraction primitive every surface goes through.

context chunks → numbered context string → SINGLE_DEAL_SYSTEM →
stream_with_fallback → extract_citations. Any grounding/citation/fallback
fix made here applies to chat, tabular cells, assistant stages, the doc
matrix, and multi-deal compare simultaneously.

(The matrix synthesis paragraph in routes_stream is intentionally NOT on
this engine — it synthesizes over already-extracted answers with its own
COMPARISON_SYSTEM prompt, a different primitive.)
"""
import asyncio
from dataclasses import dataclass, field
from typing import Awaitable, Callable

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.llm import get_last_meta, stream_with_fallback
from app.agents.prompts import SINGLE_DEAL_SYSTEM
from app.models.query import Citation
from app.utils.citations import (
    build_context_string,
    extract_citations,
    should_blank_ungrounded,
)


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
    empty_context_placeholder: str | None = None,
    on_token: Callable[[str], Awaitable[None]] | None = None,
) -> ExtractionResult:
    """Answer `user_message` grounded in `chunks`.

    - Empty `chunks` short-circuits without an LLM call (`empty_context=True`)
      unless `empty_context_placeholder` is provided — assistant stages
      legitimately run on prior-stage outputs alone.
    - `page_context_chunks` optionally enriches citation snippets with
      same-page context (header-only Docling tables); it never affects
      [Source N] index mapping.
    - `require_citations=True` blanks a non-empty answer that makes an
      affirmative claim with no valid citation (tabular grounding rule). An
      answer that only reports missing information is kept — it has nothing
      to cite by design.
    - `on_token` receives each streamed token for SSE forwarding.
    """
    if not chunks and empty_context_placeholder is None:
        return ExtractionResult(empty_context=True)

    context_str = build_context_string(chunks) if chunks else empty_context_placeholder
    system_prompt = SINGLE_DEAL_SYSTEM.format(context=context_str)
    messages = [SystemMessage(content=system_prompt), HumanMessage(content=user_message)]

    parts: list[str] = []
    async for chunk in stream_with_fallback(messages):
        token = getattr(chunk, "content", "") or ""
        if token:
            parts.append(token)
            if on_token is not None:
                await on_token(token)

    cleaned, citations = extract_citations(
        "".join(parts),
        chunks,
        deal_id=deal_id,
        page_context_chunks=page_context_chunks,
    )
    cleaned = cleaned.strip()
    if require_citations and should_blank_ungrounded(cleaned, citations):
        cleaned, citations = "", []

    meta = get_last_meta()
    return ExtractionResult(
        answer=cleaned,
        citations=citations,
        model=meta.model_used if meta else "",
        fallback=meta.fallback if meta else False,
        duration_ms=meta.duration_ms if meta else 0,
    )


async def stream_extraction(chunks: list[dict], user_message: str, **kwargs):
    """Async-iterator facade over run_extraction for SSE endpoints.

    Yields ("token", str) for each streamed token, then ("result",
    ExtractionResult) exactly once. Exceptions from the underlying call
    propagate to the consumer.
    """
    queue: asyncio.Queue = asyncio.Queue()
    _done = object()

    async def _on_token(token: str) -> None:
        await queue.put(token)

    async def _runner() -> ExtractionResult:
        try:
            return await run_extraction(
                chunks, user_message, on_token=_on_token, **kwargs
            )
        finally:
            await queue.put(_done)

    task = asyncio.create_task(_runner())
    while True:
        item = await queue.get()
        if item is _done:
            break
        yield ("token", item)
    yield ("result", await task)
