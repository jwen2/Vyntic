import asyncio
import pytest
from pathlib import Path
from app.models.document import DocumentMetadata


def test_ingest_skips_embed_when_full_context_mode_true(monkeypatch, tmp_path):
    from app.api import routes_ingest
    from app.config import settings
    from app.services import deal_store

    monkeypatch.setattr(settings, "full_context_mode", True)
    monkeypatch.setattr(deal_store, "add_document", lambda deal_id, doc: None)

    pdf_path = tmp_path / "report.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")

    async def fake_parse(path, filename, deal_id, progress_callback=None):
        meta = DocumentMetadata(
            doc_id="doc_abc",
            deal_id=deal_id,
            filename=filename,
            page_count=1,
            full_text_md="## Page 1\nRevenue was $10m.",
            parse_tier=1,
        )
        return meta, []

    embed_called = []

    async def fake_upsert(deal_id, chunks, progress_callback=None):
        embed_called.append(True)

    monkeypatch.setattr(routes_ingest, "parse_document_path", fake_parse)
    monkeypatch.setattr(routes_ingest, "upsert_chunks", fake_upsert)

    meta = asyncio.run(
        routes_ingest._ingest_saved_path(
            "deal_1", pdf_path, "report.pdf"
        )
    )

    assert not embed_called, "upsert_chunks must NOT be called in full_context_mode"
    assert meta.chunk_count == 0


def test_ingest_calls_embed_when_full_context_mode_false(monkeypatch, tmp_path):
    from app.api import routes_ingest
    from app.config import settings
    from app.services import deal_store

    monkeypatch.setattr(settings, "full_context_mode", False)
    monkeypatch.setattr(deal_store, "add_document", lambda deal_id, doc: None)

    pdf_path = tmp_path / "report.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")

    async def fake_parse(path, filename, deal_id, progress_callback=None):
        meta = DocumentMetadata(
            doc_id="doc_abc",
            deal_id=deal_id,
            filename=filename,
            page_count=1,
        )
        from app.models.document import ParsedSection
        section = ParsedSection(
            content="Revenue was $10m.",
            metadata={
                "section_type": "text",
                "source_file": filename,
                "page_number": 1,
            },
        )
        return meta, [section]

    embed_called = []

    async def fake_upsert(deal_id, chunks, progress_callback=None):
        embed_called.append(True)

    monkeypatch.setattr(routes_ingest, "parse_document_path", fake_parse)
    monkeypatch.setattr(routes_ingest, "upsert_chunks", fake_upsert)

    asyncio.run(
        routes_ingest._ingest_saved_path(
            "deal_1", pdf_path, "report.pdf"
        )
    )

    assert embed_called, "upsert_chunks MUST be called when full_context_mode is False"
