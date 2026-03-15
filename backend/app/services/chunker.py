"""
Table-aware chunking: keeps tables intact, splits text with overlap.
Preserves structural context (headings) for each chunk.
"""
import re
import uuid

from app.models.document import ParsedSection, Chunk
from app.config import settings


def chunk_sections(sections: list[ParsedSection], deal_id: str, doc_id: str) -> list[Chunk]:
    """Split parsed sections into retrieval-ready chunks, preserving table integrity."""
    chunks = []
    chunk_index = 0

    for section in sections:
        content = section.content
        meta = section.metadata

        if meta.get("section_type") == "table":
            # Keep tables as single chunks (or split by row groups if too large)
            table_chunks = _chunk_table(content, max_tokens=1500)
            for tc in table_chunks:
                chunks.append(Chunk(
                    chunk_id=f"{doc_id}_chunk_{chunk_index}",
                    deal_id=deal_id,
                    doc_id=doc_id,
                    chunk_index=chunk_index,
                    content=tc,
                    source_file=meta.get("source_file", ""),
                    page=meta.get("page_number", 0),
                    section_type="table",
                ))
                chunk_index += 1
        else:
            # Text: recursive character splitting with heading context
            text_chunks = _chunk_text(
                content,
                chunk_size=settings.chunk_size,
                chunk_overlap=settings.chunk_overlap,
            )
            for tc in text_chunks:
                chunks.append(Chunk(
                    chunk_id=f"{doc_id}_chunk_{chunk_index}",
                    deal_id=deal_id,
                    doc_id=doc_id,
                    chunk_index=chunk_index,
                    content=tc,
                    source_file=meta.get("source_file", ""),
                    page=meta.get("page_number", 0),
                    section_type="text",
                ))
                chunk_index += 1

    return chunks


def _chunk_text(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    """Simple recursive character splitter with overlap."""
    if len(text) <= chunk_size:
        return [text] if text.strip() else []

    # Find nearest heading context
    current_heading = ""
    chunks = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))

        # Try to break at paragraph boundary
        if end < len(text):
            last_newline = text.rfind("\n\n", start, end)
            if last_newline > start + chunk_size // 2:
                end = last_newline

        chunk_text = text[start:end].strip()

        # Prepend heading context if chunk doesn't start with one
        if current_heading and not chunk_text.startswith("#"):
            chunk_text = f"{current_heading}\n\n{chunk_text}"

        if chunk_text:
            chunks.append(chunk_text)

        # Track headings for context
        heading_matches = re.findall(r"^(#{1,3}\s+.+)$", text[start:end], re.MULTILINE)
        if heading_matches:
            current_heading = heading_matches[-1]

        start = end - chunk_overlap

    return chunks


def _chunk_table(table_text: str, max_tokens: int = 1500) -> list[str]:
    """Split large tables by row groups while repeating the header."""
    lines = table_text.strip().split("\n")

    # Find header (first two lines: header row + separator)
    header_lines = []
    data_lines = []
    separator_found = False

    for line in lines:
        if not separator_found:
            header_lines.append(line)
            if re.match(r"^\|[\s\-:|]+\|$", line.strip()):
                separator_found = True
        else:
            data_lines.append(line)

    if not header_lines:
        return [table_text] if table_text.strip() else []

    header = "\n".join(header_lines)

    # If whole table fits, return as-is
    if len(table_text) <= max_tokens * 4:  # rough char estimate
        return [table_text]

    # Split data rows into groups
    rows_per_chunk = max(5, len(data_lines) // 3)
    chunks = []

    for i in range(0, len(data_lines), rows_per_chunk):
        group = data_lines[i:i + rows_per_chunk]
        chunk = header + "\n" + "\n".join(group)
        chunks.append(chunk)

    return chunks if chunks else [table_text]
