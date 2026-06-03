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
