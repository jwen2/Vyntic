"""Hard char-budget guard for full-context deal loading (R1-guard).

Before this fix load_deal_context warned on an over-limit corpus and sent
it to Gemini anyway — a hard API error or silent truncation. It must
deterministically cap at a chunk boundary and record that it truncated.
"""
import asyncio
import logging
from unittest.mock import MagicMock, patch

import pytest

from app.services import context_provider
from app.services.context_provider import load_deal_context


def _make_doc_row(doc_id, filename, full_text_md):
    row = MagicMock()
    row.doc_id = doc_id
    row.deal_id = "deal_1"
    row.filename = filename
    row.full_text_md = full_text_md
    return row


def _doc_with_pages(doc_id, filename, n_pages, chars_per_page):
    md = "\n".join(
        f"## Page {p}\n\n" + "x" * chars_per_page for p in range(1, n_pages + 1)
    )
    return _make_doc_row(doc_id, filename, md)


def _run_with_rows(rows):
    db_mock = MagicMock()
    db_mock.query.return_value.filter.return_value.all.return_value = rows
    # The manager-shared-context path looks up the deal row first; no deal
    # means no shared sibling docs, keeping these tests on the budget guard.
    db_mock.query.return_value.filter.return_value.first.return_value = None
    with patch("app.services.context_provider.SessionLocal", return_value=db_mock):
        return asyncio.run(load_deal_context("deal_1", "What is revenue?"))


@pytest.fixture(autouse=True)
def full_context(monkeypatch):
    monkeypatch.setattr(
        "app.services.context_provider.settings.full_context_mode", True
    )


def test_under_budget_returns_everything(monkeypatch):
    monkeypatch.setattr(context_provider, "_FC_HARD_CHAR_BUDGET", 10_000)
    rows = [
        _doc_with_pages("doc_1", "a.pdf", n_pages=3, chars_per_page=100),
        _doc_with_pages("doc_2", "b.pdf", n_pages=3, chars_per_page=100),
    ]
    result = _run_with_rows(rows)
    assert len(result) == 6
    assert context_provider.last_context_truncated is False


def test_over_budget_truncates_at_chunk_boundary(monkeypatch, caplog):
    monkeypatch.setattr(context_provider, "_FC_HARD_CHAR_BUDGET", 500)
    rows = [
        _doc_with_pages("doc_1", "a.pdf", n_pages=4, chars_per_page=200),
        _doc_with_pages("doc_2", "b.pdf", n_pages=4, chars_per_page=200),
    ]
    with caplog.at_level(logging.WARNING):
        result = _run_with_rows(rows)

    # Truncated at a chunk boundary, total within budget
    assert 0 < len(result) < 8
    assert sum(len(c["content"]) for c in result) <= 500
    # Document/page order preserved from the front of the corpus
    assert result[0]["source_file"] == "a.pdf" and result[0]["page"] == 1
    # Truncation is recorded and the dropped doc is named in the log
    assert context_provider.last_context_truncated is True
    assert any("b.pdf" in rec.message for rec in caplog.records)


def test_truncation_marker_resets_on_next_call(monkeypatch):
    monkeypatch.setattr(context_provider, "_FC_HARD_CHAR_BUDGET", 500)
    over = [_doc_with_pages("doc_1", "a.pdf", n_pages=4, chars_per_page=200)]
    _run_with_rows(over)
    assert context_provider.last_context_truncated is True

    under = [_doc_with_pages("doc_1", "a.pdf", n_pages=1, chars_per_page=100)]
    _run_with_rows(under)
    assert context_provider.last_context_truncated is False


def test_first_chunk_kept_even_if_oversized(monkeypatch):
    monkeypatch.setattr(context_provider, "_FC_HARD_CHAR_BUDGET", 500)
    rows = [_doc_with_pages("doc_1", "a.pdf", n_pages=1, chars_per_page=600)]
    result = _run_with_rows(rows)
    assert len(result) == 1
