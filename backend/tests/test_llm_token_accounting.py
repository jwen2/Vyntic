"""Token usage must be captured into LLMCallMeta for cost accounting.

Gemini reports usage via langchain's `usage_metadata` on message chunks.
We take the last non-empty one seen, which is correct whether the provider
sends cumulative counts or only a final total.
"""
from types import SimpleNamespace

from app.agents import llm


class FakeLLM:
    def __init__(self, chunks):
        self.chunks = chunks

    async def astream(self, messages):
        for c in self.chunks:
            yield c


def _chunk(content, usage=None):
    return SimpleNamespace(content=content, usage_metadata=usage)


async def test_captures_token_usage_from_final_chunk(monkeypatch):
    monkeypatch.setattr(
        llm,
        "get_llm",
        lambda model=None: FakeLLM([
            _chunk("hello "),
            _chunk("world", {
                "input_tokens": 1200,
                "output_tokens": 40,
                "total_tokens": 1240,
                "input_token_details": {"cache_read": 900},
            }),
        ]),
    )

    [c async for c in llm.stream_with_fallback([])]

    meta = llm.get_last_meta()
    assert meta.prompt_tokens == 1200
    assert meta.completion_tokens == 40
    assert meta.cached_tokens == 900


async def test_missing_usage_metadata_leaves_zeros(monkeypatch):
    monkeypatch.setattr(
        llm, "get_llm", lambda model=None: FakeLLM([_chunk("hi")])
    )

    [c async for c in llm.stream_with_fallback([])]

    meta = llm.get_last_meta()
    assert meta.prompt_tokens == 0
    assert meta.completion_tokens == 0
    assert meta.cached_tokens == 0


async def test_last_usage_wins_when_multiple_chunks_report(monkeypatch):
    monkeypatch.setattr(
        llm,
        "get_llm",
        lambda model=None: FakeLLM([
            _chunk("a", {"input_tokens": 10, "output_tokens": 1}),
            _chunk("b", {"input_tokens": 10, "output_tokens": 7}),
        ]),
    )

    [c async for c in llm.stream_with_fallback([])]

    assert llm.get_last_meta().completion_tokens == 7
