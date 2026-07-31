"""Regression tests for synthesis context selection (F2 / context-allocator).

In full-context mode every chunk scores 1.0, so the old sort-by-score +
[:32] slice silently truncated multi_doc_synthesis context to the first 32
page-chunks of the corpus, and the char-budget truncation that replaced it
still dropped whichever document sorted last. `_select_synthesis_chunks` now
groups the flat chunk list back into documents and hands them to
`context_allocator.allocate`, so an over-budget corpus degrades the least
relevant documents to their retrieved pages instead of losing one entirely.
RAG mode (`resolved_strategy() == "retrieval"`) is unchanged: top-K by score.
"""
from app.config import settings
from app.services.workflow_run_executor import (
    _TABULAR_SYNTHESIS_MAX_CHUNKS,
    _select_synthesis_chunks,
)


def _mk(doc, page, content=None, score=1.0):
    return {
        "content": content if content is not None else "x" * 1000,
        "source_file": doc,
        "page": page,
        "doc_id": doc,
        "score": score,
        "section_type": "text",
    }


def test_full_context_keeps_all_pages_within_budget(monkeypatch):
    monkeypatch.setattr(settings, "full_context_mode", True)
    chunks = [_mk("a.pdf", p) for p in range(1, 41)] + [
        _mk("b.pdf", p) for p in range(1, 41)
    ]
    out = _select_synthesis_chunks(chunks, budget=1_000_000)
    assert len(out) == 80  # previously silently truncated to 32
    # Document/page order preserved
    assert out[0]["source_file"] == "a.pdf" and out[0]["page"] == 1
    assert out[-1]["source_file"] == "b.pdf" and out[-1]["page"] == 40


def test_full_context_truncates_at_token_budget(monkeypatch):
    monkeypatch.setattr(settings, "full_context_mode", True)
    # 10 chunks of 400 chars (100 tokens) in a single document: total 1000
    # tokens against a 350-token budget forces the allocator's final size
    # cap to trim at a chunk boundary.
    chunks = [_mk("a.pdf", p, content="x" * 400) for p in range(1, 11)]
    out = _select_synthesis_chunks(chunks, budget=350)
    assert 0 < len(out) < 10  # truncated at a chunk boundary
    assert out[0]["page"] == 1  # front of corpus kept


def test_full_context_always_keeps_first_chunk_even_if_oversized(monkeypatch):
    monkeypatch.setattr(settings, "full_context_mode", True)
    chunks = [_mk("a.pdf", 1, content="x" * 2_000_000)]
    out = _select_synthesis_chunks(chunks, budget=10)
    assert len(out) == 1


def test_rag_mode_keeps_topk_by_score(monkeypatch):
    monkeypatch.setattr(settings, "full_context_mode", False)
    chunks = [_mk("a.pdf", p, score=1.0 - p * 0.01) for p in range(1, 60)]
    out = _select_synthesis_chunks(chunks)
    assert len(out) == _TABULAR_SYNTHESIS_MAX_CHUNKS
    scores = [c["score"] for c in out]
    assert scores == sorted(scores, reverse=True)


def test_synthesis_allocates_by_document_instead_of_truncating():
    retrieved = (
        [{"content": "a" * 400, "doc_id": "a", "source_file": "a.pdf",
          "page": i, "score": 1.0, "section_type": "text"} for i in range(1, 3)]
        + [{"content": "b" * 400, "doc_id": "b", "source_file": "b.pdf",
            "page": i, "score": 1.0, "section_type": "text"} for i in range(1, 3)]
    )
    # budget=350: total content is 400 tokens (1600 chars / 4), over budget,
    # so allocation runs. "a" (200 tokens) enters whole; "b" is demoted to
    # its page_chunks (also 200 tokens here, since both its chunks fit under
    # _TABULAR_SYNTHESIS_MAX_CHUNKS). Combined that's 400 tokens > 350, so
    # the final size cap trims to 3 of the 4 chunks (300 tokens <= 350; a
    # 4th would reach 400) — but that keeps at least one chunk from each
    # document, unlike the old document-order truncation which would have
    # dropped "b" entirely.
    kept = _select_synthesis_chunks(retrieved, budget=350)
    kept_docs = {c["doc_id"] for c in kept}
    # Both documents are represented — allocation does not drop one entirely
    # the way document-order truncation did.
    assert kept_docs == {"a", "b"}
