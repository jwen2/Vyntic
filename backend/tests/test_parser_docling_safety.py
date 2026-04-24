"""Regression coverage for memory-conscious Docling parsing."""
import asyncio
import json

import pytest

from app.services import parser


def test_parse_pdf_path_uses_isolated_docling_worker(monkeypatch, tmp_path):
    pdf_path = tmp_path / "sample.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 test")
    calls = []

    def fake_convert(path):
        calls.append(path)
        return [
            {
                "page_number": 2,
                "text": ["Executive summary"],
                "tables": ["| Metric | Value |\n| --- | --- |\n| ARR | 10 |"],
                "has_table": True,
            }
        ]

    monkeypatch.setattr(parser.settings, "docling_subprocess_enabled", True)
    monkeypatch.setattr(parser, "_convert_pdf_isolated", fake_convert)

    metadata, sections = asyncio.run(
        parser.parse_pdf_path(pdf_path, "sample.pdf", "deal_1")
    )

    assert calls == [pdf_path]
    assert metadata.filename == "sample.pdf"
    assert metadata.page_count == 1
    assert sections[0].metadata["page_number"] == 2
    assert sections[0].metadata["section_type"] == "table"
    assert "Executive summary" in sections[0].content


def test_docling_worker_output_surfaces_child_errors(tmp_path):
    output_path = tmp_path / "docling-output.json"
    output_path.write_text(
        json.dumps({"status": "error", "error": "model failed"}),
        encoding="utf-8",
    )

    with pytest.raises(RuntimeError, match="model failed"):
        parser._read_docling_worker_output(output_path)


def test_docling_worker_output_requires_result_file(tmp_path):
    with pytest.raises(FileNotFoundError, match="produced no parse output"):
        parser._read_docling_worker_output(tmp_path / "missing.json")
