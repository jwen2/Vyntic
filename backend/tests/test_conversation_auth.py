"""Conversation route auth tests (S1).

Before this fix the conversation routes had zero auth — any caller could
read/write/delete any deal's Q&A history by deal_id.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import conversation_store

ENTRY = {"deal_id": "conv_deal", "question": "What is revenue?", "answer": "10M"}


@pytest.fixture(autouse=True)
def clear_conversations():
    conversation_store._conversations.clear()
    yield
    conversation_store._conversations.clear()


@pytest.fixture
def deal(client):
    resp = client.post(
        "/deals",
        json={"deal_id": "conv_deal", "name": "Conv Deal", "stage": "Screening"},
    )
    assert resp.status_code == 200
    return resp.json()


class TestUnauthenticated:
    def test_post_requires_token(self, deal):
        anon = TestClient(app)
        resp = anon.post("/deals/conv_deal/conversations", json=ENTRY)
        assert resp.status_code == 401

    def test_get_requires_token(self, deal):
        anon = TestClient(app)
        resp = anon.get("/deals/conv_deal/conversations")
        assert resp.status_code == 401

    def test_delete_requires_token(self, deal):
        anon = TestClient(app)
        resp = anon.delete("/deals/conv_deal/conversations")
        assert resp.status_code == 401


class TestAnalystWithoutAccess:
    def test_post_forbidden(self, deal, analyst_client):
        resp = analyst_client.post("/deals/conv_deal/conversations", json=ENTRY)
        assert resp.status_code == 403

    def test_get_forbidden(self, deal, analyst_client):
        resp = analyst_client.get("/deals/conv_deal/conversations")
        assert resp.status_code == 403

    def test_delete_forbidden(self, deal, analyst_client):
        resp = analyst_client.delete("/deals/conv_deal/conversations")
        assert resp.status_code == 403


class TestAnalystWithAccess:
    def test_full_cycle_allowed(self, deal, analyst_client, grant_analyst_access):
        grant_analyst_access("conv_deal")
        resp = analyst_client.post("/deals/conv_deal/conversations", json=ENTRY)
        assert resp.status_code == 200

        resp = analyst_client.get("/deals/conv_deal/conversations")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

        resp = analyst_client.delete("/deals/conv_deal/conversations")
        assert resp.status_code == 200


class TestAdmin:
    def test_full_cycle_allowed(self, deal, client):
        resp = client.post("/deals/conv_deal/conversations", json=ENTRY)
        assert resp.status_code == 200

        resp = client.get("/deals/conv_deal/conversations")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

        resp = client.delete("/deals/conv_deal/conversations")
        assert resp.status_code == 200
