"""The single extraction primitive every surface goes through.

context chunks → numbered context string → SINGLE_DEAL_SYSTEM →
stream_with_fallback → extract_citations. Any grounding/citation/fallback
fix made here applies to chat, tabular cells, assistant stages, the doc
matrix, and multi-deal compare simultaneously.

(The matrix synthesis paragraph in routes_stream is intentionally NOT on
this engine — it synthesizes over already-extracted answers with its own
COMPARISON_SYSTEM prompt, a different primitive.)
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
    """Answer `user_message` grounded in `chunks`.

    - Empty `chunks` short-circuits without an LLM call (`empty_context=True`).
    - `page_context_chunks` optionally enriches citation snippets with
      same-page context (header-only Docling tables); it never affects
      [Source N] index mapping.
    - `require_citations=True` blanks a non-empty answer that carries no
      valid citation (tabular grounding rule).
    - `on_token` receives each streamed token for SSE forwarding.
    """
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
        "".join(parts),
        chunks,
        deal_id=deal_id,
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
