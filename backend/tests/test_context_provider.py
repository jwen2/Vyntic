import pytest
from app.services.context_provider import _full_text_to_chunks, _pages_to_chunks_from_null


def test_full_text_to_chunks_splits_on_page_headers():
    full_text = "## Page 1\n\nRevenue was $10m.\n\n## Page 2\n\nCost of goods sold was $3m."
    chunks = _full_text_to_chunks(full_text, "report.pdf", "doc_abc")

    assert len(chunks) == 2
    assert chunks[0]["page"] == 1
    assert chunks[0]["content"] == "Revenue was $10m."
    assert chunks[0]["source_file"] == "report.pdf"
    assert chunks[0]["doc_id"] == "doc_abc"
    assert chunks[0]["score"] == 1.0
    assert chunks[0]["section_type"] == "text"

    assert chunks[1]["page"] == 2
    assert "Cost of goods sold" in chunks[1]["content"]


def test_full_text_to_chunks_skips_empty_pages():
    full_text = "## Page 1\n\n\n\n## Page 2\n\nSome content."
    chunks = _full_text_to_chunks(full_text, "report.pdf", "doc_abc")

    assert len(chunks) == 1
    assert chunks[0]["page"] == 2


def test_full_text_to_chunks_handles_single_page():
    full_text = "## Page 5\n\nIncome statement."
    chunks = _full_text_to_chunks(full_text, "fin.pdf", "doc_xyz")

    assert len(chunks) == 1
    assert chunks[0]["page"] == 5


def test_full_text_to_chunks_returns_empty_for_blank_input():
    assert _full_text_to_chunks("", "f.pdf", "d") == []
    assert _full_text_to_chunks("   ", "f.pdf", "d") == []


def test_pages_to_chunks_from_null_returns_empty():
    result = _pages_to_chunks_from_null()
    assert result == []


import asyncio
from unittest.mock import MagicMock, patch
from app.services.context_provider import load_doc_context, load_deal_context, get_doc_page_chunks


def _make_doc_row(doc_id, filename, full_text_md):
    row = MagicMock()
    row.doc_id = doc_id
    row.deal_id = "deal_1"
    row.filename = filename
    row.full_text_md = full_text_md
    return row


def test_load_doc_context_returns_chunks_from_full_text(monkeypatch):
    monkeypatch.setattr("app.services.context_provider.settings.full_context_mode", True)
    row = _make_doc_row("doc_1", "report.pdf", "## Page 1\n\nRevenue was $10m.")

    db_mock = MagicMock()
    db_mock.query.return_value.filter.return_value.first.return_value = row

    with patch("app.services.context_provider.SessionLocal", return_value=db_mock):
        result = asyncio.run(load_doc_context("deal_1", "doc_1", "What is revenue?"))

    assert len(result) == 1
    assert result[0]["page"] == 1
    assert "Revenue" in result[0]["content"]


def test_load_doc_context_returns_empty_when_doc_not_found(monkeypatch):
    monkeypatch.setattr("app.services.context_provider.settings.full_context_mode", True)
    db_mock = MagicMock()
    db_mock.query.return_value.filter.return_value.first.return_value = None

    with patch("app.services.context_provider.SessionLocal", return_value=db_mock):
        result = asyncio.run(load_doc_context("deal_1", "missing_doc", "question"))

    assert result == []


def test_load_doc_context_returns_empty_when_full_text_md_null(monkeypatch):
    monkeypatch.setattr("app.services.context_provider.settings.full_context_mode", True)
    row = _make_doc_row("doc_1", "report.pdf", None)
    db_mock = MagicMock()
    db_mock.query.return_value.filter.return_value.first.return_value = row

    with patch("app.services.context_provider.SessionLocal", return_value=db_mock):
        result = asyncio.run(load_doc_context("deal_1", "doc_1", "question"))

    assert result == []


def test_load_deal_context_concatenates_all_docs(monkeypatch):
    monkeypatch.setattr("app.services.context_provider.settings.full_context_mode", True)
    rows = [
        _make_doc_row("doc_1", "cim.pdf", "## Page 1\n\nRevenue was $10m."),
        _make_doc_row("doc_2", "mgmt.pdf", "## Page 1\n\nCEO has 10 years experience."),
    ]
    db_mock = MagicMock()
    db_mock.query.return_value.filter.return_value.all.return_value = rows
    # Deal-row lookup for manager-shared docs finds no deal → no manager sharing.
    db_mock.query.return_value.filter.return_value.first.return_value = None

    with patch("app.services.context_provider.SessionLocal", return_value=db_mock):
        result = asyncio.run(load_deal_context("deal_1", "What is revenue?"))

    assert len(result) == 2
    source_files = {c["source_file"] for c in result}
    assert source_files == {"cim.pdf", "mgmt.pdf"}


def test_get_doc_page_chunks_returns_chunks_from_full_text(monkeypatch):
    monkeypatch.setattr("app.services.context_provider.settings.full_context_mode", True)
    row = _make_doc_row("doc_1", "report.pdf", "## Page 3\n\nSome content.")
    db_mock = MagicMock()
    db_mock.query.return_value.filter.return_value.first.return_value = row

    with patch("app.services.context_provider.SessionLocal", return_value=db_mock):
        chunks = get_doc_page_chunks("deal_1", "doc_1")

    assert len(chunks) == 1
    assert chunks[0]["page"] == 3
