"""Regression coverage for memory-conscious Docling parsing."""
import asyncio
import json

import pytest

from app.services import parser
from app.models.document import ParsedSection
from app.models.document import Chunk
from app.services.chunker import _chunk_text, chunk_sections
from app.services import vector_store
from app.utils.citations import extract_citations


def test_parse_pdf_path_uses_isolated_docling_worker(monkeypatch, tmp_path):
    pdf_path = tmp_path / "sample.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 test")
    calls = []

    def fake_convert(path, progress_callback=None):
        calls.append(path)
        if progress_callback:
            progress_callback(1.0, "Parsed document")
        return [
            {
                "page_number": 2,
                "text": ["Executive summary"],
                "tables": ["| Metric | Value |\n| --- | --- |\n| ARR | 10 |"],
                "has_table": True,
            }
        ]

    monkeypatch.setattr(parser.settings, "docling_subprocess_enabled", True)
    monkeypatch.setattr(parser, "_convert_pdf_isolated_with_progress", fake_convert)
    monkeypatch.setattr(parser, "_count_pdf_pages", lambda _path: 1)

    metadata, sections = asyncio.run(
        parser.parse_pdf_path(pdf_path, "sample.pdf", "deal_1")
    )

    assert calls == [pdf_path]
    assert metadata.filename == "sample.pdf"
    assert metadata.page_count == 1
    assert sections[0].metadata["page_number"] == 2
    assert sections[0].metadata["section_type"] == "text"
    assert "Executive summary" in sections[0].content
    assert sections[1].metadata["section_type"] == "table"


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


def test_large_pdf_uses_page_batches(monkeypatch, tmp_path):
    pdf_path = tmp_path / "large.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 test")
    calls = []

    def fake_worker(path, page_range=None):
        calls.append(page_range)
        start, end = page_range
        return [
            {
                "page_number": page,
                "text": [f"Page {page}"],
                "tables": [],
                "has_table": False,
            }
            for page in range(start, end + 1)
        ]

    monkeypatch.setattr(parser.settings, "docling_page_batch_size", 10)
    monkeypatch.setattr(parser, "_count_pdf_pages", lambda _path: 25)
    monkeypatch.setattr(parser, "_run_docling_worker", fake_worker)

    pages = parser._convert_pdf_isolated(pdf_path)

    assert calls == [(1, 10), (11, 20), (21, 25)]
    assert [page["page_number"] for page in pages] == list(range(1, 26))


def test_page_batch_retries_split_failed_ranges(monkeypatch, tmp_path):
    pdf_path = tmp_path / "large.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 test")
    calls = []

    def fake_worker(path, page_range=None):
        calls.append(page_range)
        if page_range == (1, 4):
            raise RuntimeError("worker crashed")
        start, end = page_range
        return [
            {
                "page_number": page,
                "text": [f"Page {page}"],
                "tables": [],
                "has_table": False,
            }
            for page in range(start, end + 1)
        ]

    monkeypatch.setattr(parser, "_run_docling_worker", fake_worker)

    pages = parser._convert_pdf_range_with_retries(pdf_path, 1, 4)

    assert calls == [(1, 4), (1, 2), (3, 4)]
    assert [page["page_number"] for page in pages] == [1, 2, 3, 4]


def test_text_chunking_stops_after_final_overlap():
    chunks = _chunk_text("a" * 2500, chunk_size=1000, chunk_overlap=200)

    assert chunks
    assert chunks[-1] == "a" * 900
    assert len(chunks) == 3


def test_text_chunking_uses_twenty_percent_overlap(monkeypatch):
    monkeypatch.setattr(parser.settings, "chunk_size", 1000)
    monkeypatch.setattr(parser.settings, "chunk_overlap_ratio", 0.2)
    monkeypatch.setattr(parser.settings, "chunk_overlap", 0)

    chunks = chunk_sections(
        [
            ParsedSection(
                content="a" * 2500,
                metadata={
                    "source_file": "sample.pdf",
                    "page_number": 1,
                    "section_type": "text",
                },
            )
        ],
        "deal_1",
        "doc_1",
    )

    assert len(chunks) == 3
    assert [len(chunk.content) for chunk in chunks] == [1000, 1000, 900]


def test_overlapping_chunks_keep_page_level_citations_deduped():
    answer, citations = extract_citations(
        "Revenue improved [Source 1][Source 2].",
        [
            {
                "content": "Revenue was $10m in the first half of the paragraph.",
                "source_file": "financebench.pdf",
                "page": 42,
            },
            {
                "content": "The overlapping tail also says revenue was $10m.",
                "source_file": "financebench.pdf",
                "page": 42,
            },
        ],
        deal_id="deal_1",
    )

    assert answer == "Revenue improved [Source 1]."
    assert len([citation for citation in citations if citation]) == 1
    assert citations[0].source_file == "financebench.pdf"
    assert citations[0].page == 42


def test_citation_snippet_repairs_concatenated_financial_table():
    answer, citations = extract_citations(
        "Revenue was $1,234 [Source 1].",
        [
            {
                "content": (
                    "| | For the Three Months Ended June 30, | For the Three Months Ended June 30, | "
                    "For the Six Months Ended June 30, | |----------------------------------------------------|"
                    "---------------------------------------|---------------------------------------|------------------- "
                    "| Revenue | $1,234 | $1,111 |"
                ),
                "source_file": "ACT.pdf",
                "page": 44,
            }
        ],
        deal_id="deal_1",
    )

    assert answer == "Revenue was $1,234 [Source 1]."
    assert citations[0].text_snippet.count("\n") >= 2
    assert "| Revenue | $1,234 | $1,111 |" in citations[0].text_snippet


def test_header_only_citation_snippet_includes_same_page_numeric_context():
    answer, citations = extract_citations(
        "Revenue was $1,234 [Source 1].",
        [
            {
                "content": (
                    "For the Three Months Ended June 30,\tFor the Three Months Ended June 30,\t"
                    "For the Six Months Ended June 30,\tFor the Six Months Ended June 30,"
                ),
                "source_file": "ACT.pdf",
                "page": 30,
            }
        ],
        deal_id="deal_1",
        page_context_chunks=[
            {
                "content": (
                    "For the Three Months Ended June 30,\tFor the Three Months Ended June 30,\t"
                    "For the Six Months Ended June 30,\tFor the Six Months Ended June 30,"
                ),
                "source_file": "ACT.pdf",
                "page": 30,
            },
            {
                "content": "| Metric | 2024 | 2023 |\n| --- | --- | --- |\n| Revenue | $1,234 | $1,111 |",
                "source_file": "ACT.pdf",
                "page": 30,
            },
        ],
    )

    assert answer == "Revenue was $1,234 [Source 1]."
    assert "For the Three Months Ended June 30" in citations[0].text_snippet
    assert "| Revenue | $1,234 | $1,111 |" in citations[0].text_snippet


def test_vector_upsert_embeds_in_bounded_batches(monkeypatch):
    embed_batches = []
    add_batches = []

    async def fake_embed_texts(texts):
        embed_batches.append(list(texts))
        return [[float(i)] for i, _text in enumerate(texts)]

    class FakeCollection:
        def add(self, ids, embeddings, documents, metadatas):
            add_batches.append(
                {
                    "ids": list(ids),
                    "embeddings": list(embeddings),
                    "documents": list(documents),
                    "metadatas": list(metadatas),
                }
            )

    chunks = [
        Chunk(
            chunk_id=f"chunk_{i}",
            deal_id="deal_1",
            doc_id="doc_1",
            chunk_index=i,
            content=f"content {i}",
            source_file="financebench.pdf",
            page=1,
            section_type="text",
        )
        for i in range(7)
    ]

    monkeypatch.setattr(vector_store.settings, "embedding_batch_size", 3)
    monkeypatch.setattr(vector_store, "embed_texts", fake_embed_texts)
    monkeypatch.setattr(vector_store, "_get_collection", lambda _deal_id: FakeCollection())

    total = asyncio.run(vector_store.upsert_chunks("deal_1", chunks))

    assert total == 7
    assert [len(batch) for batch in embed_batches] == [3, 3, 1]
    assert [len(batch["ids"]) for batch in add_batches] == [3, 3, 1]
