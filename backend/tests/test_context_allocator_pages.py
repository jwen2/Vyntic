import pytest
from app.services import context_allocator


def _cand(doc_id, size, pages_size):
    whole = [{"content": "w" * size, "source_file": f"{doc_id}.pdf", "page": 1,
              "doc_id": doc_id, "score": 1.0, "section_type": "text"}]
    pages = [{"content": "p" * pages_size, "source_file": f"{doc_id}.pdf", "page": 2,
              "doc_id": doc_id, "score": 0.6, "section_type": "text"}]
    return context_allocator.DocCandidate(
        doc_id=doc_id, filename=f"{doc_id}.pdf", category="other",
        size_chars=size, whole_chunks=whole, page_chunks=pages)


def test_demoted_document_contributes_pages_not_whole_text():
    docs = [_cand("a", 800, 100), _cand("b", 800, 100)]
    sel = context_allocator.allocate(docs, budget=250, scores={"a": 0.9, "b": 0.5})
    assert "b" in sel.partial_docs
    b_chunks = [c for c in sel.chunks if c["doc_id"] == "b"]
    assert b_chunks and all(c["content"].startswith("p") for c in b_chunks)
