"""Regression tests for synthesis context selection (F2).

In full-context mode every chunk scores 1.0, so the old sort-by-score +
[:32] slice silently truncated multi_doc_synthesis context to the first 32
page-chunks of the corpus. Selection must respect mode: char budget in
full-context, top-K by relevance in RAG.
"""
from app.config import settings
from app.services.workflow_run_executor import (
    _SYNTHESIS_CHAR_BUDGET,
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
    out = _select_synthesis_chunks(chunks)
    assert len(out) == 80  # previously silently truncated to 32
    # Document/page order preserved
    assert out[0]["source_file"] == "a.pdf" and out[0]["page"] == 1
    assert out[-1]["source_file"] == "b.pdf" and out[-1]["page"] == 40


def test_full_context_truncates_at_char_budget(monkeypatch):
    monkeypatch.setattr(settings, "full_context_mode", True)
    per_chunk = _SYNTHESIS_CHAR_BUDGET // 4
    chunks = [_mk("a.pdf", p, content="x" * per_chunk) for p in range(1, 11)]
    out = _select_synthesis_chunks(chunks)
    assert 0 < len(out) < 10  # truncated at a page boundary
    assert out[0]["page"] == 1  # front of corpus kept


def test_full_context_always_keeps_first_chunk_even_if_oversized(monkeypatch):
    monkeypatch.setattr(settings, "full_context_mode", True)
    chunks = [_mk("a.pdf", 1, content="x" * (_SYNTHESIS_CHAR_BUDGET + 100))]
    out = _select_synthesis_chunks(chunks)
    assert len(out) == 1


def test_rag_mode_keeps_topk_by_score(monkeypatch):
    monkeypatch.setattr(settings, "full_context_mode", False)
    chunks = [_mk("a.pdf", p, score=1.0 - p * 0.01) for p in range(1, 60)]
    out = _select_synthesis_chunks(chunks)
    assert len(out) == _TABULAR_SYNTHESIS_MAX_CHUNKS
    scores = [c["score"] for c in out]
    assert scores == sorted(scores, reverse=True)
