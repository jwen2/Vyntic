"""Context provider: unified retrieval abstraction for full-context and RAG query paths.

When full_context_mode=True, reads full_text_md from the documents table and returns
all pages as chunk dicts in the same shape the RAG path returned. Downstream citation
logic (build_context_string, extract_citations, CONTEXT_TEMPLATE) is unchanged.

When full_context_mode=False, delegates to the original vector_store functions via
deferred imports so the RAG path is never touched.
"""
import logging
import re

from app.config import settings
from app.database import SessionLocal, DocumentRow

logger = logging.getLogger(__name__)

_FC_TOKEN_WARN_THRESHOLD = 800_000  # ~800K tokens; Gemini Flash limit is 1M


def _full_text_to_chunks(full_text_md: str, filename: str, doc_id: str) -> list[dict]:
    """Split full_text_md on '## Page N' headers into per-page chunk dicts."""
    if not full_text_md or not full_text_md.strip():
        return []

    # Split before each ## Page N header, keeping the header in the segment
    segments = re.split(r"(?=## Page \d+)", full_text_md)
    chunks = []
    for seg in segments:
        seg = seg.strip()
        if not seg:
            continue
        page_match = re.match(r"## Page (\d+)", seg)
        page_num = int(page_match.group(1)) if page_match else 0
        content = re.sub(r"^## Page \d+\n?", "", seg).strip()
        if not content:
            continue
        chunks.append({
            "content": content,
            "source_file": filename,
            "page": page_num,
            "doc_id": doc_id,
            "score": 1.0,
            "section_type": "text",
        })
    return chunks


def _pages_to_chunks_from_null() -> list[dict]:
    """Placeholder for null full_text_md. ChromaDB fallback removed for MVP."""
    return []
