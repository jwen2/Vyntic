"""Regression tests for the full-context migration's missed call site.

The streaming agent chat (`routes_query._stream_answer`) must retrieve via
the context provider — not `vector_store.query_deal` directly. In
full-context mode ingest writes nothing to ChromaDB, so a direct vector-store
call returns zero chunks for every newly ingested document and the chat
answers "No relevant documents found".
"""
import inspect

import pytest

from app.api import routes_query
from app.services.context_allocator import ContextSelection


async def test_stream_answer_uses_context_provider(monkeypatch):
    calls = []

    async def fake_load_deal_selection(deal_id, question):
        calls.append((deal_id, question))
        # empty context → early "done" event, no LLM call
        return ContextSelection()

    monkeypatch.setattr(routes_query, "load_deal_selection", fake_load_deal_selection)

    events = [e async for e in routes_query._stream_answer("deal-1", "revenue?")]

    assert calls == [("deal-1", "revenue?")]
    assert events[-1]["type"] == "done"
    assert events[-1]["citations"] == []


async def test_stream_answer_streams_tokens_from_context(monkeypatch):
    async def fake_load_deal_selection(deal_id, question):
        return ContextSelection(chunks=[{
            "content": "Revenue was $10M.",
            "source_file": "cim.pdf",
            "page": 3,
            "doc_id": "doc-1",
            "score": 1.0,
            "section_type": "text",
        }], whole_docs=["doc-1"])

    class FakeChunk:
        def __init__(self, content):
            self.content = content

    async def fake_stream(messages):
        for token in ["Revenue was ", "$10M [Source 1]"]:
            yield FakeChunk(token)

    from app.services import extraction_engine

    monkeypatch.setattr(routes_query, "load_deal_selection", fake_load_deal_selection)
    monkeypatch.setattr(extraction_engine, "stream_with_fallback", fake_stream)

    events = [e async for e in routes_query._stream_answer("deal-1", "revenue?")]

    token_events = [e for e in events if e["type"] == "token"]
    assert [e["token"] for e in token_events] == ["Revenue was ", "$10M [Source 1]"]
    done = events[-1]
    assert done["type"] == "done"
    assert done["citations"][0] is not None
    assert done["citations"][0]["source_file"] == "cim.pdf"


def test_routes_query_does_not_import_vector_store():
    src = inspect.getsource(routes_query)
    assert "vector_store" not in src, (
        "routes_query must retrieve via context_provider so full-context "
        "mode applies to the streaming chat"
    )
