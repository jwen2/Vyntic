import pytest
from app.services import context_allocator


@pytest.mark.asyncio
async def test_probe_takes_best_score_per_document(monkeypatch):
    async def fake_query_deal(deal_id, query_text, top_k=None):
        return [
            {"doc_id": "a", "score": 0.4, "content": "x"},
            {"doc_id": "a", "score": 0.9, "content": "y"},   # best for a
            {"doc_id": "b", "score": 0.3, "content": "z"},
        ]
    monkeypatch.setattr(context_allocator, "_query_deal", fake_query_deal)
    scores = await context_allocator.probe_scores("d1", "q", doc_count=2)
    assert scores == {"a": 0.9, "b": 0.3}


@pytest.mark.asyncio
async def test_probe_raises_top_k_with_document_count(monkeypatch):
    seen = {}
    async def fake_query_deal(deal_id, query_text, top_k=None):
        seen["top_k"] = top_k
        return []
    monkeypatch.setattr(context_allocator, "_query_deal", fake_query_deal)
    await context_allocator.probe_scores("d1", "q", doc_count=60)
    assert seen["top_k"] >= 300   # 5 * 60


@pytest.mark.asyncio
async def test_probe_returns_none_on_failure(monkeypatch):
    async def boom(deal_id, query_text, top_k=None):
        raise RuntimeError("chroma down")
    monkeypatch.setattr(context_allocator, "_query_deal", boom)
    assert await context_allocator.probe_scores("d1", "q", doc_count=2) is None
