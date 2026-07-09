"""
Persistent conversation history (Plan 4, C3).

The store moves from an in-process dict (lost on restart, wrong under
multiple workers) to a deal-scoped table. Pins:
- Entries live in the conversations table, not process memory.
- Listing is newest-first and workstream-filterable, matching the old
  in-memory semantics.
- delete_entries clears exactly one deal's history.
- Deleting a deal takes its conversation rows with it (FK cascade at
  purge; soft-deleted deals just make them unreachable via routes).
"""
from sqlalchemy import text

from app.database import SessionLocal
from app.models.conversation import ConversationCreate
from app.services import conversation_store


def _make(deal_id: str, question: str, workstream: str = "") -> None:
    conversation_store.save_entry(
        ConversationCreate(
            deal_id=deal_id, question=question, answer="A", workstream=workstream,
        )
    )


def test_entries_persist_in_table(clear_store, sample_deal):
    _make(sample_deal.deal_id, "Q1")
    db = SessionLocal()
    try:
        count = db.execute(
            text("SELECT COUNT(*) FROM conversations WHERE deal_id = :d"),
            {"d": sample_deal.deal_id},
        ).scalar()
    finally:
        db.close()
    assert count == 1
    assert not hasattr(conversation_store, "_conversations"), (
        "the in-memory dict must be gone"
    )


def test_list_newest_first_and_workstream_filter(clear_store, sample_deal):
    _make(sample_deal.deal_id, "Q1", workstream="dd")
    _make(sample_deal.deal_id, "Q2")
    _make(sample_deal.deal_id, "Q3", workstream="dd")

    entries = conversation_store.list_entries(sample_deal.deal_id)
    assert [e.question for e in entries] == ["Q3", "Q2", "Q1"]

    dd_only = conversation_store.list_entries(sample_deal.deal_id, workstream="dd")
    assert [e.question for e in dd_only] == ["Q3", "Q1"]


def test_delete_clears_only_one_deal(clear_store, three_deals):
    _make("deal_0", "Q-a")
    _make("deal_1", "Q-b")

    conversation_store.delete_entries("deal_0")

    assert conversation_store.list_entries("deal_0") == []
    assert len(conversation_store.list_entries("deal_1")) == 1


def test_round_trip_preserves_fields(clear_store, sample_deal):
    saved = conversation_store.save_entry(
        ConversationCreate(
            deal_id=sample_deal.deal_id,
            question="What is NAV?",
            answer="About $120m.",
            citations=[{"doc_id": "d1", "page": 3}, None],
            workstream="monitoring",
        )
    )
    (listed,) = conversation_store.list_entries(
        sample_deal.deal_id, workstream="monitoring"
    )
    assert listed.id == saved.id
    assert listed.question == "What is NAV?"
    assert listed.answer == "About $120m."
    assert listed.citations == [{"doc_id": "d1", "page": 3}, None]
    assert listed.created_at  # ISO string, non-empty
