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


def _normalize_source_patterns(answer: str) -> str:
    """Normalize all non-standard source citation patterns into [Source N] format.

    Handles:
      - Ranges: [Source 1-8] → [Source 1][Source 2]...[Source 8]
      - Comma lists: [Source 1, Source 2, Source 3] → [Source 1][Source 2][Source 3]
      - Compact lists: [Source 1, 2, 3] → [Source 1][Source 2][Source 3]
    """
    # 1. Expand ranges: [Source 1-8]
    def _expand_range(m: re.Match) -> str:
        start, end = int(m.group(1)), int(m.group(2))
        if end < start or end - start > 20:
            return ""
        return "".join(f"[Source {i}]" for i in range(start, end + 1))

    answer = re.sub(r"\[Source\s+(\d+)\s*[-–—]\s*(\d+)\]", _expand_range, answer)

    # 2. Expand comma-separated lists: [Source 1, Source 2, Source 3]
    def _expand_comma_list(m: re.Match) -> str:
        nums = re.findall(r"\d+", m.group(0))
        return "".join(f"[Source {n}]" for n in nums)

    answer = re.sub(
        r"\[Source\s+\d+(?:\s*,\s*(?:Source\s+)?\d+)+\]",
        _expand_comma_list,
        answer,
    )

    return answer


def strip_invalid_sources(answer: str, num_chunks: int) -> str:
    """Remove [Source N] references from the answer where N exceeds available chunks."""
    # Normalize non-standard citation patterns (ranges, comma lists)
    answer = _normalize_source_patterns(answer)

    def _replace(m: re.Match) -> str:
        idx = int(m.group(1)) - 1
        if idx < 0 or idx >= num_chunks:
            return ""  # Strip hallucinated source reference
        return m.group(0)  # Keep valid reference

    return re.sub(r"\[Source\s+(\d+)\]", _replace, answer)


def extract_citations(answer: str, retrieved_chunks: list[dict], deal_id: str | None = None) -> tuple[str, list[Citation]]:
    """Extract [Source N] references from the answer and map to chunk metadata.

    Returns (cleaned_answer, citations) where citations is a list indexed by
    source number (1-indexed in the text, 0-indexed in the list). Unused
    positions are filled with None so that citations[N-1] always corresponds
    to [Source N] in the answer text.
    """
    # First strip any hallucinated source references
    cleaned = strip_invalid_sources(answer, len(retrieved_chunks))

    # Deduplicate: map each source index to a canonical index (first chunk
    # from the same file+page). This collapses e.g. [Source 3] and [Source 7]
    # into a single citation if they reference the same document page.
    canonical: dict[tuple[str, int], int] = {}  # (file, page) -> first source index
    index_remap: dict[int, int] = {}  # original index -> canonical index

    for i, chunk in enumerate(retrieved_chunks):
        key = (chunk["source_file"], chunk["page"])
        if key not in canonical:
            canonical[key] = i
        index_remap[i] = canonical[key]

    # Rewrite source references in the answer to use canonical indices
    def _dedup_replace(m: re.Match) -> str:
        idx = int(m.group(1)) - 1
        if idx < 0 or idx >= len(retrieved_chunks):
            return ""
        canon = index_remap.get(idx, idx)
        return f"[Source {canon + 1}]"

    cleaned = re.sub(r"\[Source\s+(\d+)\]", _dedup_replace, cleaned)

    # Collapse repeated adjacent references: [Source 1][Source 1] → [Source 1]
    cleaned = re.sub(r"(\[Source\s+\d+\])(?:\s*\1)+", r"\1", cleaned)

    # Now extract deduplicated citations
    source_refs = re.findall(r"\[Source\s+(\d+)\]", cleaned)
    seen = set()
    max_idx = -1
    valid_indices: list[int] = []

    for ref in source_refs:
        idx = int(ref) - 1
        if idx < 0 or idx >= len(retrieved_chunks) or idx in seen:
            continue
        seen.add(idx)
        valid_indices.append(idx)
        if idx > max_idx:
            max_idx = idx

    # Create positional citations list (None-padded so index matches source number)
    citations: list[Citation | None] = [None] * (max_idx + 1) if max_idx >= 0 else []
    for idx in valid_indices:
        chunk = retrieved_chunks[idx]
        citations[idx] = Citation(
            source_file=chunk["source_file"],
            page=chunk["page"],
            text_snippet=chunk["content"][:300],
            deal_id=deal_id or chunk.get("deal_id"),
        )

    return cleaned, citations
