"""Tests for the 3-tier parsing cascade and full-text markdown builder."""
import pytest
from pathlib import Path
from app.services.parser import _pages_to_full_text_md


def test_pages_to_full_text_md_basic():
    pages = [
        {"page_number": 1, "text": ["Revenue was $10m."], "tables": [], "has_table": False},
        {"page_number": 2, "text": ["EBITDA margin was 25%."], "tables": [], "has_table": False},
    ]
    result = _pages_to_full_text_md(pages)

    assert "## Page 1" in result
    assert "Revenue was $10m." in result
    assert "## Page 2" in result
    assert "EBITDA margin was 25%." in result


def test_pages_to_full_text_md_includes_tables():
    pages = [
        {
            "page_number": 3,
            "text": ["Summary"],
            "tables": ["| Metric | Value |\n| --- | --- |\n| ARR | $5m |"],
            "has_table": True,
        }
    ]
    result = _pages_to_full_text_md(pages)

    assert "## Page 3" in result
    assert "| ARR | $5m |" in result


def test_pages_to_full_text_md_skips_empty_pages():
    pages = [
        {"page_number": 1, "text": [], "tables": [], "has_table": False},
        {"page_number": 2, "text": ["Content here."], "tables": [], "has_table": False},
    ]
    result = _pages_to_full_text_md(pages)

    assert "## Page 1" not in result
    assert "## Page 2" in result


def test_pages_to_full_text_md_empty_input():
    assert _pages_to_full_text_md([]) == ""


def test_cascade_falls_back_to_pymupdf_when_docling_produces_short_text(monkeypatch, tmp_path):
    from app.services import parser

    pdf_path = tmp_path / "test.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")

    # Docling returns < 100 chars total
    def fake_docling(path, progress_callback=None):
        return [{"page_number": 1, "text": ["short"], "tables": [], "has_table": False}]

    pymupdf_called = []

    def fake_pymupdf(path):
        pymupdf_called.append(True)
        return [{"page_number": 1, "text": ["Full content from PyMuPDF."], "tables": [], "has_table": False}]

    monkeypatch.setattr(parser, "_convert_pdf_isolated_with_progress", fake_docling)
    monkeypatch.setattr(parser, "_pymupdf_parse_pdf", fake_pymupdf)
    monkeypatch.setattr(parser, "_count_pdf_pages", lambda _: 1)

    pages, tier = parser._parse_with_cascade(pdf_path)

    assert pymupdf_called, "PyMuPDF should have been called as fallback"
    assert tier == 2
    assert pages[0]["text"] == ["Full content from PyMuPDF."]


def test_cascade_uses_docling_when_it_succeeds(monkeypatch, tmp_path):
    from app.services import parser

    pdf_path = tmp_path / "test.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")

    docling_text = "A" * 200  # > 100 chars — success

    def fake_docling(path, progress_callback=None):
        return [{"page_number": 1, "text": [docling_text], "tables": [], "has_table": False}]

    pymupdf_called = []

    def fake_pymupdf(path):
        pymupdf_called.append(True)
        return []

    monkeypatch.setattr(parser, "_convert_pdf_isolated_with_progress", fake_docling)
    monkeypatch.setattr(parser, "_pymupdf_parse_pdf", fake_pymupdf)
    monkeypatch.setattr(parser, "_count_pdf_pages", lambda _: 1)

    pages, tier = parser._parse_with_cascade(pdf_path)

    assert not pymupdf_called, "PyMuPDF should not be called when Docling succeeds"
    assert tier == 1


def test_cascade_falls_back_to_pymupdf_when_docling_raises(monkeypatch, tmp_path):
    from app.services import parser

    pdf_path = tmp_path / "test.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")

    def fake_docling(path, progress_callback=None):
        raise RuntimeError("Docling crashed")

    pymupdf_called = []

    def fake_pymupdf(path):
        pymupdf_called.append(True)
        return [{"page_number": 1, "text": ["PyMuPDF content " * 20], "tables": [], "has_table": False}]

    monkeypatch.setattr(parser, "_convert_pdf_isolated_with_progress", fake_docling)
    monkeypatch.setattr(parser, "_pymupdf_parse_pdf", fake_pymupdf)
    monkeypatch.setattr(parser, "_count_pdf_pages", lambda _: 1)

    pages, tier = parser._parse_with_cascade(pdf_path)

    assert pymupdf_called
    assert tier == 2


def test_cascade_raises_when_all_tiers_fail_and_no_azure_credentials(monkeypatch, tmp_path):
    import os
    from app.services import parser

    pdf_path = tmp_path / "test.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")

    monkeypatch.setattr(parser, "_convert_pdf_isolated_with_progress", lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("Docling down")))
    monkeypatch.setattr(parser, "_pymupdf_parse_pdf", lambda p: (_ for _ in ()).throw(RuntimeError("PyMuPDF down")))
    monkeypatch.delenv("AZURE_DI_ENDPOINT", raising=False)
    monkeypatch.delenv("AZURE_DI_KEY", raising=False)
    monkeypatch.setattr(parser, "_count_pdf_pages", lambda _: 1)

    with pytest.raises(ValueError, match="Azure DI credentials"):
        parser._parse_with_cascade(pdf_path)


def test_parse_pdf_path_sets_full_text_md_on_metadata(monkeypatch, tmp_path):
    import asyncio
    from app.services import parser

    pdf_path = tmp_path / "report.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")

    def fake_cascade(path, progress_callback=None):
        pages = [
            {"page_number": 1, "text": ["Revenue was $10m."], "tables": [], "has_table": False},
        ]
        return pages, 1

    monkeypatch.setattr(parser, "_parse_with_cascade", fake_cascade)
    monkeypatch.setattr(parser, "_count_pdf_pages", lambda _: 1)

    metadata, sections = asyncio.run(
        parser.parse_pdf_path(pdf_path, "report.pdf", "deal_1")
    )

    assert metadata.full_text_md is not None
    assert "## Page 1" in metadata.full_text_md
    assert "Revenue was $10m." in metadata.full_text_md
    assert metadata.parse_tier == 1
