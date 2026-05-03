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


def _fix_table_newlines(text: str) -> str:
    """Ensure markdown tables have proper newlines between rows.

    Some LLMs (notably Gemini) sometimes return table rows joined on a single
    line like:  | A | B | | C | D |  instead of separate lines.  This detects
    the pattern and inserts newlines so remark-gfm can parse them.
    """
    text = _repair_concatenated_pipe_tables(text)

    # Pattern: end-of-row pipe followed immediately by start-of-next-row pipe
    # e.g. "| value |\n| next |" is fine, but "| value | | next |" needs fixing.
    # Specifically: " | |" or "| |" at a boundary where a row ends and another begins.
    # We look for: pipe + optional spaces + pipe + space + non-pipe (new row start)
    # More robust: split on "| |" boundaries that look like row transitions

    # If the text doesn't look like it contains a malformed table, skip
    if " | |" not in text and "| |" not in text and "|| " not in text:
        return text

    lines = text.split("\n")
    fixed_lines = []
    for line in lines:
        # Only process lines that look like they contain multiple table rows
        # A well-formed table row starts and ends with |
        # Detect: "| ... | | ... |" or "| ... || ... |"
        if line.count("|") > 6 and re.search(r"\|\s*\|(?:\s*:?-+:?\s*\||\s*\w)", line):
            # Split on the pattern where one row ends and another begins:
            # "| <whitespace> |" where the second | starts a new row
            # We split on " | | " or " || " patterns that indicate row boundaries
            parts = re.split(r"(\|)\s*(\|)(?=\s*(?::?-+:?\s*\||[A-Za-z0-9$+\-*]))", line)
            if len(parts) > 1:
                # Reassemble: join the parts with newlines at row boundaries
                rebuilt = ""
                i = 0
                while i < len(parts):
                    rebuilt += parts[i]
                    if i + 2 < len(parts) and parts[i + 1] == "|" and parts[i + 2] == "|":
                        rebuilt += "|\n|"
                        i += 3
                    else:
                        i += 1
                fixed_lines.append(rebuilt)
            else:
                fixed_lines.append(line)
        else:
            fixed_lines.append(line)
    return "\n".join(fixed_lines)


_TABLE_SEPARATOR_CELL_RE = re.compile(r"^:?-{3,}:?$")


def _is_separator_cell(cell: str) -> bool:
    return bool(_TABLE_SEPARATOR_CELL_RE.match(cell.strip()))


def _format_pipe_row(cells: list[str]) -> str:
    return "| " + " | ".join(c.strip() for c in cells) + " |"


def _repair_concatenated_pipe_tables(text: str) -> str:
    """Repair Docling/LLM table rows glued into one pipe-delimited line.

    Observed failure mode:
        | | Period | Period | |------|------| Revenue | $1,234 |

    Markdown renderers treat that as one malformed row. We detect the embedded
    separator cells, split header/separator/data back into separate rows, and
    pad short trailing rows so the preview remains parseable.
    """
    out: list[str] = []
    for line in text.splitlines():
        if line.count("|") < 4:
            out.append(line)
            continue

        raw_cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        sep_start = next((i for i, cell in enumerate(raw_cells) if _is_separator_cell(cell)), -1)
        if sep_start <= 0:
            out.append(line)
            continue

        sep_end = sep_start
        while sep_end < len(raw_cells) and _is_separator_cell(raw_cells[sep_end]):
            sep_end += 1
        sep_cells = raw_cells[sep_start:sep_end]
        col_count = len(sep_cells)
        if col_count < 2:
            out.append(line)
            continue

        header_cells = raw_cells[:sep_start]
        # A blank cell immediately before the separator usually belongs to the
        # `| |----` row boundary, not to the header row itself.
        if len(header_cells) > col_count and header_cells[-1] == "":
            header_cells = header_cells[:-1]
        if len(header_cells) > col_count:
            header_cells = header_cells[-col_count:]
        if len(header_cells) < col_count:
            header_cells = [""] * (col_count - len(header_cells)) + header_cells

        rebuilt = [_format_pipe_row(header_cells), _format_pipe_row(sep_cells)]
        data_cells = raw_cells[sep_end:]
        for i in range(0, len(data_cells), col_count):
            row = data_cells[i:i + col_count]
            if not any(cell.strip() for cell in row):
                continue
            if len(row) < col_count:
                row = row + [""] * (col_count - len(row))
            rebuilt.append(_format_pipe_row(row))

        out.append("\n".join(rebuilt))
    return "\n".join(out)


# Markers that almost always indicate a sentence describing absent / unavailable
# information rather than an affirmative factual claim. Citations attached to
# such sentences are over-citation per the prompt rules.
_ABSENT_FINDING_MARKERS = (
    "not found",
    "not disclosed",
    "are not disclosed",
    "is not disclosed",
    "do not disclose",
    "does not disclose",
    "did not disclose",
    "do not contain",
    "does not contain",
    "did not contain",
    "no relevant information",
    "no information was found",
    "no specific information",
    "not available",
    "is not available",
    "are not available",
    "n/a",
)


_TABLE_SEPARATOR_RE = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$")


def _split_prose_glued_to_table_header(text: str) -> str:
    """Insert a newline when the LLM glues prose onto a markdown table header.

    Pattern handled:
        Other Key Metrics [Source 2]| Metric | Value |
        | --- | --- |
    becomes:
        Other Key Metrics [Source 2]
        | Metric | Value |
        | --- | --- |

    Detection: a line that starts with non-pipe content, contains a markdown
    table row fragment (3+ pipes), AND is immediately followed by a markdown
    table separator row. The next-line check keeps this conservative so we
    don't split sentences that happen to mention `|`.
    """
    lines = text.split("\n")
    out: list[str] = []
    for i, line in enumerate(lines):
        first_pipe = line.find("|")
        next_line = lines[i + 1] if i + 1 < len(lines) else ""
        if (
            first_pipe > 0
            and line.count("|") >= 3
            and _TABLE_SEPARATOR_RE.match(next_line)
        ):
            prose = line[:first_pipe].rstrip()
            tail = line[first_pipe:].lstrip()
            if prose:
                out.append(prose)
            out.append(tail)
        else:
            out.append(line)
    return "\n".join(out)


def _drop_citations(line: str) -> str:
    """Remove every [Source N] marker from a line and tidy resulting spacing.

    Important: do NOT consume leading whitespace along with the citation. If a
    citation sits between two clauses (e.g. "A. [Source 1]B. ..."), eating the
    leading space would merge the clauses ("A.B."). Instead, we strip only the
    bracket text, then collapse any resulting double spaces and remove the
    space that may now sit before sentence-ending punctuation.
    """
    line = re.sub(r"\[Source\s+\d+\]", "", line)
    # Collapse runs of internal spaces created by the strip.
    line = re.sub(r"  +", " ", line)
    # Remove a space that now precedes sentence-ending punctuation.
    line = re.sub(r" +([.,;:!?])", r"\1", line)
    # Tidy trailing whitespace; preserve any leading indentation.
    return line.rstrip()


def _strip_table_cell_citations(answer: str) -> str:
    """Remove [Source N] markers from inside markdown table rows.

    Per the prompt, table citations belong in the introductory sentence above
    the table, not inside cells. This is a safety net for when the LLM
    over-cites within table cells anyway.
    """
    lines = answer.split("\n")
    out: list[str] = []
    for line in lines:
        stripped = line.lstrip()
        # Markdown table rows begin with `|` and contain at least one more `|`.
        if stripped.startswith("|") and stripped.count("|") >= 2:
            line = _drop_citations(line)
        out.append(line)
    return "\n".join(out)


def _strip_absent_finding_citations(answer: str) -> str:
    """Remove [Source N] from sentences/lines that describe missing information.

    Citations should only support affirmative findings. A sentence saying the
    documents 'do not disclose X' or a value of 'Not found' must not carry a
    [Source N]. We scan line-by-line; if any absent-finding marker appears in
    the line (case-insensitive), we strip every [Source N] from that line.
    """
    lines = answer.split("\n")
    out: list[str] = []
    for line in lines:
        lowered = line.lower()
        if any(marker in lowered for marker in _ABSENT_FINDING_MARKERS):
            line = _drop_citations(line)
        out.append(line)
    return "\n".join(out)


_TABLE_DATA_ROW_RE = re.compile(r"^\|[\s\-:|]+\|$")
_MEANINGFUL_NUMBER_RE = re.compile(
    r"(?:[$€£]\s*\(?-?\d[\d,]*(?:\.\d+)?\)?%?)"
    r"|(?:\(?-?\d{1,3}(?:,\d{3})+(?:\.\d+)?\)?%?)"
    r"|(?:\(?-?\d+(?:\.\d+)?%\)?)"
    r"|(?:\(?-?\d+\.\d+\)?)"
)


def _has_meaningful_number(text: str) -> bool:
    """Return true when text contains financial/metric values, not just dates.

    We intentionally avoid matching bare integers like "30" or "2024" so
    period headers such as "June 30, 2024" don't count as supporting numeric
    evidence. Currency, percentages, comma-formatted values, decimals, and
    parenthesized numeric values do count.
    """
    return bool(_MEANINGFUL_NUMBER_RE.search(text))


def _table_data_row_count(table_block: str) -> int:
    """Count the number of data rows in a markdown table block.

    A "data row" is a line starting with `|` that is not the header separator
    (e.g. `| --- | --- |`). Lines before the first separator are treated as
    header rows and excluded. If no separator is found, returns 0 conservatively
    so single-row blocks aren't mistaken for data.
    """
    pipe_lines = [l for l in table_block.splitlines() if l.lstrip().startswith("|")]
    if not pipe_lines:
        return 0
    sep_idx = next(
        (i for i, l in enumerate(pipe_lines) if _TABLE_DATA_ROW_RE.match(l.strip())),
        None,
    )
    if sep_idx is None:
        return 0
    return sum(
        1
        for l in pipe_lines[sep_idx + 1:]
        if not _TABLE_DATA_ROW_RE.match(l.strip())
    )


def _looks_like_period_header_only(text: str) -> bool:
    lowered = text.lower()
    period_mentions = lowered.count("three months ended") + lowered.count("six months ended")
    return period_mentions >= 2 and not _has_meaningful_number(text)


def _normalize_snippet_markdown(text: str) -> str:
    return _fix_table_newlines(text).strip()


def _clip_table_snippet(table_text: str, max_chars: int = 1800) -> str:
    """Clip wide table snippets while preserving rows with numeric evidence."""
    normalized = _normalize_snippet_markdown(table_text)
    if len(normalized) <= max_chars:
        return normalized

    lines = normalized.splitlines()
    sep_idx = next(
        (i for i, line in enumerate(lines) if _TABLE_DATA_ROW_RE.match(line.strip())),
        -1,
    )
    numeric_idx = next(
        (
            i
            for i, line in enumerate(lines)
            if (sep_idx == -1 or i > sep_idx) and _has_meaningful_number(line)
        ),
        -1,
    )
    if sep_idx >= 0 and numeric_idx >= 0:
        keep_indices = set(range(0, min(sep_idx + 1, len(lines))))
        for i in range(max(sep_idx + 1, numeric_idx - 2), min(len(lines), numeric_idx + 4)):
            keep_indices.add(i)
        clipped = "\n".join(lines[i] for i in sorted(keep_indices))
        return clipped[: max_chars + 600]

    return normalized[:max_chars]


def _select_same_page_numeric_context(extras: str | None, max_chars: int = 1600) -> str:
    if not extras:
        return ""
    parts = [_normalize_snippet_markdown(part) for part in extras.split("\n\n") if part.strip()]
    numeric_parts = [part for part in parts if _has_meaningful_number(part)]
    selected = numeric_parts or parts
    if not selected:
        return ""
    return _clip_table_snippet("\n\n".join(selected[:3]), max_chars=max_chars)


def _snippet_needs_numeric_context(snippet: str) -> bool:
    if _looks_like_period_header_only(snippet):
        return True
    if "|" not in snippet:
        return False
    normalized = _normalize_snippet_markdown(snippet)
    return _table_data_row_count(normalized) == 0 or not _has_meaningful_number(normalized)


def _select_snippet(content: str, same_page_extras: str | None = None) -> str:
    """Pick the most informative span of a chunk for citation display.

    If the chunk contains a markdown table, return from the first table line
    onward (capped at 600 chars) so the panel shows the actual data the LLM
    likely cited. Otherwise fall back to the first 300 chars.

    Docling occasionally exports a financial table where the header is captured
    as a markdown table but the row data ends up in adjacent text on the same
    page. When that happens we get header-only chunks like:
        | Three Months Ended June 30, | ... |
        | --- | --- |
        | 2023 | 2022 |
    with no actual values. If `same_page_extras` is provided (text from other
    chunks on the same source_file+page), we append it after the table so the
    rendered citation includes the missing numbers.
    """
    normalized_content = _normalize_snippet_markdown(content)
    for i, line in enumerate(normalized_content.splitlines()):
        if line.lstrip().startswith("|"):
            tail = "\n".join(normalized_content.splitlines()[i:])
            base = _clip_table_snippet(tail)
            if same_page_extras and _snippet_needs_numeric_context(base):
                # Header-only / malformed table — splice numeric same-page text
                # in after the table block so the source panel contains the
                # actual values used to support the cited claim.
                extras = _select_same_page_numeric_context(same_page_extras)
                if extras:
                    return f"{base}\n\n{extras}"
            return base
    if same_page_extras and _looks_like_period_header_only(normalized_content):
        extras = _select_same_page_numeric_context(same_page_extras)
        if extras:
            return f"{normalized_content[:300]}\n\n{extras}"
    return normalized_content[:300]


def extract_citations(
    answer: str,
    retrieved_chunks: list[dict],
    deal_id: str | None = None,
    page_context_chunks: list[dict] | None = None,
) -> tuple[str, list[Citation]]:
    """Extract [Source N] references from the answer and map to chunk metadata.

    Returns (cleaned_answer, citations) where citations is a list indexed by
    source number (1-indexed in the text, 0-indexed in the list). Unused
    positions are filled with None so that citations[N-1] always corresponds
    to [Source N] in the answer text.

    `page_context_chunks` is an optional broader chunk pool (typically the full
    chunk set for the cited document) used only to enrich citation snippets
    when the cited chunk is a header-only Docling table. It does not affect
    the [Source N] index mapping, which is always based on `retrieved_chunks`.
    """
    # Fix malformed table formatting from LLMs that omit newlines between rows
    answer = _fix_table_newlines(answer)

    # Fix tables where prose is glued to the header row on the same line
    # (e.g. "Other Key Metrics [Source 2]| Metric | Value |\n| --- | --- |").
    # Run before the cell-citation strip so the new header line is recognised.
    answer = _split_prose_glued_to_table_header(answer)

    # Defensive: strip citations from places they should never appear
    # (table cells and sentences describing absent / unavailable info).
    answer = _strip_table_cell_citations(answer)
    answer = _strip_absent_finding_citations(answer)

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

    # Pre-index chunks' content by (source_file, page) so we can rescue
    # header-only Docling tables by attaching surrounding same-page text. We
    # prefer `page_context_chunks` (typically the full doc chunk set) when
    # provided so this works even when same-page text wasn't in the top-k
    # retrieval. Falls back to `retrieved_chunks` otherwise.
    page_pool = page_context_chunks if page_context_chunks is not None else retrieved_chunks
    same_page_index: dict[tuple[str, int], list[str]] = {}
    for ch in page_pool:
        key = (ch.get("source_file", ""), int(ch.get("page", 0) or 0))
        same_page_index.setdefault(key, []).append(ch.get("content", "") or "")

    def _page_extras_for(idx: int) -> str | None:
        chunk = retrieved_chunks[idx]
        key = (chunk.get("source_file", ""), int(chunk.get("page", 0) or 0))
        peers = same_page_index.get(key, [])
        if not peers:
            return None
        cited_content = chunk.get("content", "") or ""
        extras = [c.strip() for c in peers if c.strip() and c != cited_content]
        return "\n\n".join(extras) or None

    # Create positional citations list (None-padded so index matches source number)
    citations: list[Citation | None] = [None] * (max_idx + 1) if max_idx >= 0 else []
    for idx in valid_indices:
        chunk = retrieved_chunks[idx]
        citations[idx] = Citation(
            source_file=chunk["source_file"],
            page=chunk["page"],
            text_snippet=_select_snippet(chunk["content"], _page_extras_for(idx)),
            deal_id=deal_id or chunk.get("deal_id"),
        )

    return cleaned, citations
