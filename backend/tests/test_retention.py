"""
Soft-delete, legal hold, retention purge (Plan 4, C1 — S8).

Deletes never hard-remove data at request time. Pins:
- Deleting a deal sets deleted_at; the deal vanishes from every read
  surface but the row (and its files/vectors) survive until purge.
- legal_hold blocks deletion (423) and blocks the retention purge.
- Soft-deleted documents disappear from listings, existence checks, and
  the LLM context assembly.
- purge_expired hard-removes rows soft-deleted longer than the retention
  window (files + upload dirs included), and spares held/recent rows.
"""
import asyncio
import os
from datetime import datetime, timedelta

from sqlalchemy import text

from app.config import settings
from app.database import SessionLocal, DealRow
from app.models.deal import DealCreate
from app.models.document import DocumentMetadata
from app.services import deal_store
from app.services.context_provider import load_deal_context
from app.services.retention import purge_expired


def _mark_deleted(deal_id: str, days_ago: int):
    db = SessionLocal()
    try:
        db.execute(
            text("UPDATE deals SET deleted_at = :ts WHERE deal_id = :d"),
            {"ts": datetime.utcnow() - timedelta(days=days_ago), "d": deal_id},
        )
        db.commit()
    finally:
        db.close()


def _deal_row(deal_id: str) -> DealRow | None:
    db = SessionLocal()
    try:
        row = db.query(DealRow).filter(DealRow.deal_id == deal_id).first()
        if row:
            db.expunge(row)
        return row
    finally:
        db.close()


def test_deal_soft_delete_via_api(client, sample_deal):
    res = client.delete(f"/deals/{sample_deal.deal_id}")
    assert res.status_code == 200

    assert client.get(f"/deals/{sample_deal.deal_id}").status_code == 404
    assert sample_deal.deal_id not in {
        d["deal_id"] for d in client.get("/deals").json()
    }
    row = _deal_row(sample_deal.deal_id)
    assert row is not None, "soft delete must keep the row"
    assert row.deleted_at is not None


def test_legal_hold_blocks_delete(client, sample_deal):
    res = client.patch(
        f"/deals/{sample_deal.deal_id}/legal-hold", json={"legal_hold": True}
    )
    assert res.status_code == 200

    res = client.delete(f"/deals/{sample_deal.deal_id}")
    assert res.status_code == 423
    row = _deal_row(sample_deal.deal_id)
    assert row.deleted_at is None

    # releasing the hold re-enables deletion
    client.patch(f"/deals/{sample_deal.deal_id}/legal-hold", json={"legal_hold": False})
    assert client.delete(f"/deals/{sample_deal.deal_id}").status_code == 200


def test_document_soft_delete_hides_everywhere(clear_store, sample_deal):
    deal_store.add_document(
        sample_deal.deal_id,
        DocumentMetadata(
            doc_id="doc1", deal_id=sample_deal.deal_id, filename="a.pdf",
            page_count=1, chunk_count=1,
            full_text_md="## Page 1\n\nRevenue was $10m.",
        ),
    )
    assert deal_store.delete_document(sample_deal.deal_id, "doc1") is True

    assert deal_store.list_documents(sample_deal.deal_id) == []
    assert deal_store.document_exists(sample_deal.deal_id, "a.pdf") is False
    assert asyncio.run(load_deal_context(sample_deal.deal_id, "revenue?")) == []
    # but the row survives for the retention window
    db = SessionLocal()
    try:
        kept = db.execute(
            text("SELECT deleted_at FROM documents WHERE doc_id = 'doc1'")
        ).scalar()
    finally:
        db.close()
    assert kept is not None


def test_purge_respects_window_and_hold(clear_store, monkeypatch):
    async def _noop(*args, **kwargs):
        return 0

    monkeypatch.setattr("app.services.retention.delete_deal_vectors", _noop)

    for deal_id in ("old_gone", "old_held", "fresh"):
        deal_store.create_deal(DealCreate(deal_id=deal_id, name=deal_id))
    deal_store.set_legal_hold("old_held", True)

    _mark_deleted("old_gone", days_ago=settings.retention_purge_days + 1)
    _mark_deleted("old_held", days_ago=settings.retention_purge_days + 1)
    _mark_deleted("fresh", days_ago=1)

    purged = asyncio.run(purge_expired())

    assert purged >= 1
    assert _deal_row("old_gone") is None
    assert _deal_row("old_held") is not None
    assert _deal_row("fresh") is not None


def test_purge_removes_upload_dir(clear_store, monkeypatch):
    async def _noop(*args, **kwargs):
        return 0

    monkeypatch.setattr("app.services.retention.delete_deal_vectors", _noop)

    deal_store.create_deal(DealCreate(deal_id="purge_files", name="P"))
    upload_dir = os.path.join(settings.uploads_dir, "purge_files")
    os.makedirs(upload_dir, exist_ok=True)
    with open(os.path.join(upload_dir, "f.pdf"), "wb") as f:
        f.write(b"pdf")

    _mark_deleted("purge_files", days_ago=settings.retention_purge_days + 1)
    asyncio.run(purge_expired())

    assert not os.path.isdir(upload_dir)
