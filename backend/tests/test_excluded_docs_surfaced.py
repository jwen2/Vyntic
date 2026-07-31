"""Exclusion must not be as silent as the truncation it replaced.

The allocator can drop a whole document below the relevance floor. Both the
non-streaming answer and the SSE `done` event carry the names of whatever was
dropped, so the UI can tell the user what the answer did not see.
"""
import json
from types import SimpleNamespace

import pytest

from app.services import extraction_engine


@pytest.fixture(autouse=True)
def stub_llm(monkeypatch):
    """No network in the suite — the routes under test only need an answer."""

    async def stream(messages):
        yield SimpleNamespace(content="The management fee is 2% [Source 1].")

    monkeypatch.setattr(extraction_engine, "stream_with_fallback", stream)


def test_query_response_carries_excluded_docs(client, seeded_small_deal):
    resp = client.post(f"/deals/{seeded_small_deal}/query",
                       json={"question": "what is the fee?"})
    assert resp.status_code == 200
    assert "excluded_docs" in resp.json()
    assert resp.json()["excluded_docs"] == []


def test_stream_done_event_carries_excluded_docs(client, seeded_small_deal):
    resp = client.post(f"/deals/{seeded_small_deal}/query/stream",
                       json={"question": "what is the fee?"})
    assert resp.status_code == 200
    events = [json.loads(line[len("data: "):])
              for line in resp.text.splitlines() if line.startswith("data: ")]
    done = [e for e in events if e["type"] == "done"]
    assert done, f"no done event in {events}"
    assert done[-1]["excluded_docs"] == []


def test_excluded_documents_are_named_in_the_response(client, seeded_small_deal,
                                                      monkeypatch):
    """An actually-excluded document appears by id in the payload."""
    from app.services import context_allocator

    real_allocate = context_allocator.allocate

    def drop_the_second(docs, budget, scores):
        sel = real_allocate(docs, budget=budget, scores=scores)
        return context_allocator.ContextSelection(
            chunks=[c for c in sel.chunks if c["doc_id"] != "alloc_doc_2"],
            whole_docs=[d for d in sel.whole_docs if d != "alloc_doc_2"],
            partial_docs=sel.partial_docs,
            excluded_docs=["alloc_doc_2"],
            strategy="allocated",
        )

    # load_deal_selection imports allocate at call time, so patching the
    # module attribute reaches it.
    monkeypatch.setattr(context_allocator, "allocate", drop_the_second)

    resp = client.post(f"/deals/{seeded_small_deal}/query",
                       json={"question": "what is the fee?"})
    assert resp.status_code == 200
    assert resp.json()["excluded_docs"] == ["alloc_doc_2"]
