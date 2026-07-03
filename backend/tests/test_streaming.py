"""
Tests for streaming SSE responses.
Tests the /matrix/compare/stream endpoint and SSE event format.

Patch targets follow the current architecture: retrieval via
routes_stream.load_deal_context (context provider), LLM streaming via the
extraction engine's stream_with_fallback.
"""
import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient


def _fake_llm_stream(tokens):
    async def stream(messages):
        for token in tokens:
            msg = MagicMock()
            msg.content = token
            yield msg

    return stream


class TestStreamingEndpoint:
    """Test the SSE streaming compare endpoint."""

    def test_stream_rejects_missing_deals(self, client, sample_deal):
        """Streaming endpoint returns 404 for non-existent deals."""
        resp = client.post("/matrix/compare/stream", json={
            "deal_ids": ["nonexistent_deal"],
            "queries": ["What is the revenue?"],
        })
        assert resp.status_code == 404

    def test_stream_rejects_empty_queries(self, client, sample_deal):
        """Streaming endpoint returns 400 for empty query list."""
        resp = client.post("/matrix/compare/stream", json={
            "deal_ids": [sample_deal.deal_id],
            "queries": [],
        })
        assert resp.status_code == 400

    def test_stream_returns_event_stream_content_type(self, client, sample_deal):
        """Streaming response has text/event-stream content type."""
        with patch("app.api.routes_stream.load_deal_context", new_callable=AsyncMock) as mock_ctx:
            mock_ctx.return_value = []  # No docs → quick "no docs" response

            resp = client.post("/matrix/compare/stream", json={
                "deal_ids": [sample_deal.deal_id],
                "queries": ["test query"],
            })
            assert resp.status_code == 200
            assert "text/event-stream" in resp.headers.get("content-type", "")

    def test_stream_emits_done_event_for_no_docs(self, client, sample_deal):
        """When no docs exist, stream emits a done event with appropriate message."""
        with patch("app.api.routes_stream.load_deal_context", new_callable=AsyncMock) as mock_ctx:
            mock_ctx.return_value = []

            resp = client.post("/matrix/compare/stream", json={
                "deal_ids": [sample_deal.deal_id],
                "queries": ["test query"],
            })

            events = _parse_sse_events(resp.text)
            assert len(events) >= 1

            done_events = [e for e in events if e["type"] == "done"]
            assert len(done_events) == 1
            assert done_events[0]["deal_id"] == sample_deal.deal_id
            assert "No relevant documents" in done_events[0]["answer"]

    def test_stream_emits_token_events(self, client, sample_deal):
        """When docs exist, stream emits token events followed by a done event."""
        mock_chunks = [
            {"content": "Test content", "source_file": "test.pdf", "page": 1,
             "doc_id": "doc-1", "section_type": "text", "score": 0.9}
        ]

        with patch("app.api.routes_stream.load_deal_context", new_callable=AsyncMock) as mock_ctx, \
             patch("app.services.extraction_engine.stream_with_fallback",
                   new=_fake_llm_stream(["Revenue ", "is ", "$10M"])):

            mock_ctx.return_value = mock_chunks

            resp = client.post("/matrix/compare/stream", json={
                "deal_ids": [sample_deal.deal_id],
                "queries": ["What is revenue?"],
            })

            events = _parse_sse_events(resp.text)
            token_events = [e for e in events if e["type"] == "token"]
            done_events = [e for e in events if e["type"] == "done"]

            assert len(token_events) == 3
            assert token_events[0]["token"] == "Revenue "
            assert token_events[1]["token"] == "is "
            assert token_events[2]["token"] == "$10M"
            assert len(done_events) == 1
            assert done_events[0]["answer"] == "Revenue is $10M"

    def test_stream_handles_multiple_deals(self, client, three_deals):
        """Stream handles multiple deals in a single request."""
        with patch("app.api.routes_stream.load_deal_context", new_callable=AsyncMock) as mock_ctx:
            mock_ctx.return_value = []

            deal_ids = [d.deal_id for d in three_deals]
            resp = client.post("/matrix/compare/stream", json={
                "deal_ids": deal_ids,
                "queries": ["test"],
            })

            events = _parse_sse_events(resp.text)
            done_events = [
                e for e in events
                if e["type"] == "done" and e["deal_id"] != "__synthesis__"
            ]
            done_deal_ids = {e["deal_id"] for e in done_events}
            assert done_deal_ids == set(deal_ids)

    def test_stream_error_event_on_exception(self, client, sample_deal):
        """Stream emits error event when retrieval raises an exception."""
        with patch("app.api.routes_stream.load_deal_context", new_callable=AsyncMock) as mock_ctx:
            mock_ctx.side_effect = RuntimeError("LLM connection failed")

            resp = client.post("/matrix/compare/stream", json={
                "deal_ids": [sample_deal.deal_id],
                "queries": ["test"],
            })

            events = _parse_sse_events(resp.text)
            error_events = [e for e in events if e["type"] == "error"]
            assert len(error_events) == 1
            assert "LLM connection failed" in error_events[0]["error"]


def _parse_sse_events(raw: str) -> list[dict]:
    """Parse SSE text into a list of event dicts."""
    events = []
    for block in raw.split("\n\n"):
        block = block.strip()
        if block.startswith("data: "):
            try:
                events.append(json.loads(block[6:]))
            except json.JSONDecodeError:
                pass
    return events
