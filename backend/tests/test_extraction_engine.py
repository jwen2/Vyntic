"""Contract tests for the extraction engine.

Every surface (chat, tabular cells, assistant stages, doc matrix, compare)
runs through run_extraction; these tests pin its contract.
"""
from types import SimpleNamespace

from app.services import extraction_engine
from app.services.extraction_engine import run_extraction

CHUNK = {
    "content": "Revenue was $10M in FY2023.",
    "source_file": "cim.pdf",
    "page": 3,
    "doc_id": "doc-1",
    "score": 1.0,
    "section_type": "text",
}


def _fake_stream(tokens):
    async def stream(messages):
        for t in tokens:
            yield SimpleNamespace(content=t)

    return stream


async def test_empty_context_short_circuits_without_llm_call(monkeypatch):
    async def must_not_be_called(messages):
        raise AssertionError("LLM called with empty context")
        yield  # pragma: no cover

    monkeypatch.setattr(extraction_engine, "stream_with_fallback", must_not_be_called)

    result = await run_extraction([], "question?")

    assert result.empty_context is True
    assert result.answer == ""
    assert result.citations == []


async def test_happy_path_extracts_citations_and_streams_tokens(monkeypatch):
    monkeypatch.setattr(
        extraction_engine,
        "stream_with_fallback",
        _fake_stream(["Revenue was ", "**$10M** [Source 1]."]),
    )

    seen_tokens = []

    async def on_token(token):
        seen_tokens.append(token)

    result = await run_extraction(
        [CHUNK], "What was revenue?", deal_id="deal-1", on_token=on_token
    )

    assert seen_tokens == ["Revenue was ", "**$10M** [Source 1]."]
    assert "[Source 1]" in result.answer
    assert result.citations[0] is not None
    assert result.citations[0].source_file == "cim.pdf"
    assert result.citations[0].page == 3
    assert result.citations[0].deal_id == "deal-1"
    assert result.empty_context is False


async def test_hallucinated_sources_are_stripped(monkeypatch):
    monkeypatch.setattr(
        extraction_engine,
        "stream_with_fallback",
        _fake_stream(["Revenue was $10M [Source 7]."]),
    )

    result = await run_extraction([CHUNK], "What was revenue?")

    assert "[Source 7]" not in result.answer
    assert all(c is None for c in result.citations)


async def test_require_citations_blanks_uncited_answer(monkeypatch):
    monkeypatch.setattr(
        extraction_engine,
        "stream_with_fallback",
        _fake_stream(["Revenue was $10M with no citation."]),
    )

    result = await run_extraction([CHUNK], "What was revenue?", require_citations=True)

    assert result.answer == ""
    assert result.citations == []


async def test_uncited_answer_survives_without_require_citations(monkeypatch):
    monkeypatch.setattr(
        extraction_engine,
        "stream_with_fallback",
        _fake_stream(["General narrative answer."]),
    )

    result = await run_extraction([CHUNK], "Summarize.")

    assert result.answer == "General narrative answer."
