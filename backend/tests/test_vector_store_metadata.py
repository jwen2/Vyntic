import pytest

from app.services import vector_store


class FakeCollection:
    def count(self):
        return 2

    def query(self, **_kwargs):
        return {
            "documents": [["first chunk", "second chunk"]],
            "metadatas": [[None, {"doc_id": "doc-1", "source_file": "file.pdf", "page": 7}]],
            "distances": [[0.2, 0.4]],
        }

    def get(self, **_kwargs):
        return {
            "documents": ["first chunk", "second chunk"],
            "metadatas": [None, {"source_file": "file.pdf", "page": 7, "chunk_index": 1}],
        }


@pytest.mark.asyncio
async def test_query_document_tolerates_missing_metadata(monkeypatch):
    monkeypatch.setattr(vector_store, "_get_collection", lambda _deal_id: FakeCollection())

    async def fake_embed_query(_query):
        return [0.1, 0.2]

    monkeypatch.setattr(vector_store, "embed_query", fake_embed_query)

    rows = await vector_store.query_document("deal-1", "doc-1", "query")

    assert rows[0]["content"] == "first chunk"
    assert rows[0]["doc_id"] == "doc-1"
    assert rows[0]["source_file"] == ""
    assert rows[1]["source_file"] == "file.pdf"
    assert rows[1]["page"] == 7


def test_get_document_chunks_tolerates_missing_metadata(monkeypatch):
    monkeypatch.setattr(vector_store, "_get_collection", lambda _deal_id: FakeCollection())

    rows = vector_store.get_document_chunks("deal-1", "doc-1")

    assert rows[0]["content"] == "first chunk"
    assert rows[0]["source_file"] == ""
    assert rows[0]["page"] == 0
    assert rows[1]["source_file"] == "file.pdf"
    assert rows[1]["chunk_index"] == 1
