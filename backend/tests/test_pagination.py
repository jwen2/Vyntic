"""
Pagination envelopes (Plan 4 C2, R6).

Every list endpoint takes ?limit=&offset= and returns
{items, total, next_offset} — next_offset is None on the last page.
Defaults keep current UX: one generous page. total/filters respect the
tenant boundary (piggybacks on B3/B4 scoping).
"""
import json

from app.database import SessionLocal, WorkflowRow
from app.models.conversation import ConversationCreate
from app.models.deal import DealCreate
from app.models.document import DocumentMetadata
from app.services import conversation_store, deal_store


def _make_deals(n: int):
    for i in range(n):
        deal_store.create_deal(DealCreate(deal_id=f"pg_{i}", name=f"Deal {i}"))


def test_deals_envelope_and_paging(client, clear_store):
    _make_deals(5)

    page = client.get("/deals?limit=2&offset=2").json()
    assert set(page) == {"items", "total", "next_offset"}
    assert len(page["items"]) == 2
    assert page["total"] == 5
    assert page["next_offset"] == 4

    last = client.get("/deals?limit=2&offset=4").json()
    assert len(last["items"]) == 1
    assert last["next_offset"] is None


def test_deals_default_is_single_page(client, three_deals):
    page = client.get("/deals").json()
    assert len(page["items"]) == 3
    assert page["total"] == 3
    assert page["next_offset"] is None


def test_documents_envelope(client, sample_deal):
    for i in range(3):
        deal_store.add_document(
            sample_deal.deal_id,
            DocumentMetadata(
                doc_id=f"d{i}", deal_id=sample_deal.deal_id,
                filename=f"f{i}.pdf", page_count=1, chunk_count=0,
            ),
        )
    page = client.get(f"/deals/{sample_deal.deal_id}/documents?limit=2").json()
    assert len(page["items"]) == 2
    assert page["total"] == 3
    assert page["next_offset"] == 2


def test_conversations_envelope(client, sample_deal):
    for i in range(3):
        conversation_store.save_entry(
            ConversationCreate(
                deal_id=sample_deal.deal_id, question=f"Q{i}", answer="A"
            )
        )
    page = client.get(
        f"/deals/{sample_deal.deal_id}/conversations?limit=2&offset=1"
    ).json()
    assert len(page["items"]) == 2
    assert page["total"] == 3
    assert page["next_offset"] is None  # 1 + 2 == 3, page ends the list


def test_runs_list_envelope(client, sample_deal):
    db = SessionLocal()
    try:
        db.add(WorkflowRow(id="pgwf", deal_id=sample_deal.deal_id,
                           name="WF", type="tabular"))
        db.commit()
    finally:
        db.close()
    page = client.get(f"/deals/{sample_deal.deal_id}/workflows/pgwf/runs").json()
    assert page == {"items": [], "total": 0, "next_offset": None}


def test_audit_envelope_stays_tenant_scoped(client, sample_deal):
    client.post("/deals", json={"deal_id": "aud_pg", "name": "A"})
    page = client.get("/audit?limit=1").json()
    assert set(page) == {"items", "total", "next_offset"}
    assert len(page["items"]) == 1
    assert page["total"] >= 1
