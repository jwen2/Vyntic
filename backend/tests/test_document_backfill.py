import asyncio

from app.database import DocumentRow, SessionLocal
from app.models.document import DocumentMetadata
from app.services import deal_store
from app.services.document_backfill import _legacy_chunks_to_full_text, backfill_missing_full_text


def test_legacy_chunks_to_full_text_groups_and_orders_pages():
    chunks = [
        {"page": 2, "chunk_index": 0, "content": "Second page."},
        {"page": 1, "chunk_index": 1, "content": "Continuation."},
        {"page": 1, "chunk_index": 0, "content": "First page."},
    ]
    text = _legacy_chunks_to_full_text(chunks)
    assert text.startswith("## Page 1")
    assert text.index("First page.") < text.index("Continuation.")
    assert text.index("First page.") < text.index("Second page.")
    assert "## Page 2" in text


def test_backfill_repairs_text_without_replacing_document_identity(
    monkeypatch, tmp_path, sample_deal
):
    deal_store.add_document(
        sample_deal.deal_id,
        DocumentMetadata(
            doc_id="stable-doc-id",
            deal_id=sample_deal.deal_id,
            filename="legacy.pdf",
            page_count=1,
            chunk_count=7,
            doc_category="ddq",
            period="2026-Q1",
            scope="manager",
        ),
    )
    upload_dir = tmp_path / sample_deal.deal_id
    upload_dir.mkdir()
    (upload_dir / "legacy.pdf").write_bytes(b"%PDF synthetic")

    async def fake_parse(path, filename, deal_id):
        return (
            DocumentMetadata(
                doc_id="parser-generated-id",
                deal_id=deal_id,
                filename=filename,
                page_count=3,
                full_text_md="## Page 1\n\nRepaired content.",
                parse_tier=2,
            ),
            [],
        )

    monkeypatch.setattr("app.services.document_backfill.settings.uploads_dir", str(tmp_path))
    monkeypatch.setattr("app.services.document_backfill.parse_document_path", fake_parse)
    monkeypatch.setattr("app.services.document_backfill.get_document_chunks", lambda *_: [])

    result = asyncio.run(backfill_missing_full_text(sample_deal.deal_id))
    assert result.repaired == [f"{sample_deal.deal_id}/legacy.pdf"]
    assert result.failed == {}

    db = SessionLocal()
    try:
        row = db.query(DocumentRow).filter(DocumentRow.doc_id == "stable-doc-id").one()
        assert row.full_text_md == "## Page 1\n\nRepaired content."
        assert row.parse_tier == 2
        assert row.page_count == 3
        assert row.chunk_count == 7
        assert row.doc_category == "ddq"
        assert row.period == "2026-Q1"
        assert row.scope == "manager"
    finally:
        db.close()


def test_backfill_is_idempotent(monkeypatch, tmp_path, sample_deal):
    deal_store.add_document(
        sample_deal.deal_id,
        DocumentMetadata(
            doc_id="already-repaired",
            deal_id=sample_deal.deal_id,
            filename="ready.pdf",
            full_text_md="## Page 1\n\nReady.",
        ),
    )
    parse_calls = []

    async def fake_parse(*args):
        parse_calls.append(args)

    monkeypatch.setattr("app.services.document_backfill.settings.uploads_dir", str(tmp_path))
    monkeypatch.setattr("app.services.document_backfill.parse_document_path", fake_parse)
    monkeypatch.setattr("app.services.document_backfill.get_document_chunks", lambda *_: [])

    result = asyncio.run(backfill_missing_full_text(sample_deal.deal_id))
    assert result.repaired == []
    assert parse_calls == []


def test_backfill_reports_missing_original(monkeypatch, sample_deal):
    deal_store.add_document(
        sample_deal.deal_id,
        DocumentMetadata(
            doc_id="missing-file",
            deal_id=sample_deal.deal_id,
            filename="missing.pdf",
        ),
    )

    monkeypatch.setattr("app.services.document_backfill.get_document_chunks", lambda *_: [])
    result = asyncio.run(backfill_missing_full_text(sample_deal.deal_id))
    assert result.missing_files == [f"{sample_deal.deal_id}/missing.pdf"]


def test_backfill_can_reconstruct_when_original_is_missing(monkeypatch, sample_deal):
    deal_store.add_document(
        sample_deal.deal_id,
        DocumentMetadata(
            doc_id="vector-only",
            deal_id=sample_deal.deal_id,
            filename="gone.pdf",
            page_count=2,
        ),
    )
    monkeypatch.setattr(
        "app.services.document_backfill.get_document_chunks",
        lambda *_: [{"page": 2, "chunk_index": 0, "content": "Recovered."}],
    )

    result = asyncio.run(backfill_missing_full_text(sample_deal.deal_id))
    assert result.repaired == [f"{sample_deal.deal_id}/gone.pdf"]
    db = SessionLocal()
    try:
        row = db.query(DocumentRow).filter(DocumentRow.doc_id == "vector-only").one()
        assert row.full_text_md == "## Page 2\n\nRecovered."
    finally:
        db.close()
