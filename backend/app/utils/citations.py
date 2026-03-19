"""
Citation extraction and mapping utilities.
"""
import re

from app.models.query import Citation


def build_context_string(retrieved_chunks: list[dict]) -> str:
    """Format retrieved chunks into a numbered context string for the prompt."""
    from app.agents.prompts import CONTEXT_TEMPLATE

    parts = []
    for i, chunk in enumerate(retrieved_chunks, 1):
        parts.append(CONTEXT_TEMPLATE.format(
            index=i,
            source_file=chunk["source_file"],
            page=chunk["page"],
            content=chunk["content"],
        ))
    return "\n".join(parts)


def extract_citations(answer: str, retrieved_chunks: list[dict], deal_id: str | None = None) -> list[Citation]:
    """Extract [Source N] references from the answer and map to chunk metadata."""
    # Find all [Source N] references
    source_refs = re.findall(r"\[Source\s+(\d+)\]", answer)
    seen = set()
    citations = []

    for ref in source_refs:
        idx = int(ref) - 1  # Convert to 0-indexed
        if idx < 0 or idx >= len(retrieved_chunks) or idx in seen:
            continue
        seen.add(idx)

        chunk = retrieved_chunks[idx]
        citations.append(Citation(
            source_file=chunk["source_file"],
            page=chunk["page"],
            text_snippet=chunk["content"][:300],
            deal_id=deal_id or chunk.get("deal_id"),
        ))

    return citations
