"""Budget guard for full-context deal loading (R1-guard).

Originally: before this fix, load_deal_context warned on an over-limit
corpus and sent it to Gemini anyway. That was replaced by a hard char
truncation (`_FC_HARD_CHAR_BUDGET` / `last_context_truncated`), and this
task (context-allocator wiring) replaces the truncation itself with
`context_allocator.allocate`.

The guarantee this file protects is unchanged: an over-budget corpus is
never sent to Gemini un-triaged, and the outcome is deterministic and
visible to the caller. It's now visible via
`load_deal_selection(...).strategy` / `.excluded_docs` / `.partial_docs`
/ `.whole_docs` instead of the deleted `last_context_truncated` global.
"""
import asyncio
import logging
from unittest.mock import MagicMock, patch

import pytest

from app.services import context_allocator, context_budget
from app.services.context_provider import load_deal_selection


def _make_doc_row(doc_id, filename, full_text_md):
    row = MagicMock()
    row.doc_id = doc_id
    row.deal_id = "deal_1"
    row.filename = filename
    row.full_text_md = full_text_md
    row.doc_category = "other"
    return row


def _doc_with_pages(doc_id, filename, n_pages, chars_per_page):
    md = "\n".join(
        f"## Page {p}\n\n" + "x" * chars_per_page for p in range(1, n_pages + 1)
    )
    return _make_doc_row(doc_id, filename, md)


def _run_with_rows(rows, budget, scores):
    """Run load_deal_selection against mocked rows, with budget_tokens and
    probe_scores pinned to deterministic values (no network calls)."""
    db_mock = MagicMock()
    db_mock.query.return_value.filter.return_value.all.return_value = rows
    # Deal-row lookup for manager-shared docs finds no deal -> no manager sharing.
    db_mock.query.return_value.filter.return_value.first.return_value = None

    async def fake_probe(deal_id, question, doc_count):
        return scores

    with patch("app.services.context_provider.SessionLocal", return_value=db_mock), \
         patch.object(context_budget, "budget_tokens", lambda prompt_overhead_chars: budget), \
         patch.object(context_allocator, "probe_scores", fake_probe):
        return asyncio.run(load_deal_selection("deal_1", "What is revenue?"))


@pytest.fixture(autouse=True)
def full_context(monkeypatch):
    monkeypatch.setattr(
        "app.services.context_provider.settings.full_context_mode", True
    )


def test_under_budget_returns_everything_whole():
    rows = [
        _doc_with_pages("doc_1", "a.pdf", n_pages=3, chars_per_page=100),
        _doc_with_pages("doc_2", "b.pdf", n_pages=3, chars_per_page=100),
    ]
    sel = _run_with_rows(rows, budget=10_000, scores=None)
    assert sel.strategy == "full_text"
    assert len(sel.chunks) == 6
    assert sel.excluded_docs == []
    assert sel.partial_docs == []


def test_over_budget_excludes_low_scoring_doc_and_records_it(caplog):
    rows = [
        _doc_with_pages("doc_1", "a.pdf", n_pages=4, chars_per_page=200),
        _doc_with_pages("doc_2", "b.pdf", n_pages=4, chars_per_page=200),
    ]
    scores = {"doc_1": 0.9, "doc_2": 0.01}
    with caplog.at_level(logging.WARNING):
        sel = _run_with_rows(rows, budget=100, scores=scores)

    # The corpus is over budget: the low-scoring doc is dropped, not sent.
    assert sel.strategy == "allocated"
    assert sel.excluded_docs == ["doc_2"]
    assert sel.whole_docs == ["doc_1"]
    assert all(c["doc_id"] != "doc_2" for c in sel.chunks)
    # The drop is recorded (mirrors the old "dropped doc named in the log").
    assert any("doc_2" in rec.message for rec in caplog.records)


def test_single_oversized_document_still_returned_whole():
    rows = [_doc_with_pages("doc_1", "a.pdf", n_pages=1, chars_per_page=600)]
    sel = _run_with_rows(rows, budget=10, scores={"doc_1": 0.9})
    assert sel.whole_docs == ["doc_1"]
    assert len(sel.chunks) == 1


def test_selection_is_independent_across_calls():
    """No shared module state: an excluded doc from one over-budget call
    must not leak into the next, independent, under-budget call."""
    over_rows = [
        _doc_with_pages("doc_1", "a.pdf", n_pages=4, chars_per_page=200),
        _doc_with_pages("doc_2", "b.pdf", n_pages=4, chars_per_page=200),
    ]
    sel1 = _run_with_rows(over_rows, budget=100, scores={"doc_1": 0.9, "doc_2": 0.01})
    assert sel1.excluded_docs == ["doc_2"]

    under_rows = [_doc_with_pages("doc_1", "a.pdf", n_pages=1, chars_per_page=100)]
    sel2 = _run_with_rows(under_rows, budget=10_000, scores=None)
    assert sel2.excluded_docs == []
    assert sel2.strategy == "full_text"
