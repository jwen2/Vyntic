"""Token usage must be captured into LLMCallMeta for cost accounting.

Gemini (gemini-3.1-flash-lite) reports usage via langchain's
`usage_metadata` on message chunks as PER-CHUNK INCREMENTS, not a
cumulative running total — measured live via two calls (see
task-1-report.md fix round 1): input_tokens arrives once, on the first
content chunk; output_tokens is a small per-chunk count that must be
summed; and the stream's final (empty-content) terminator chunk carries
a usage_metadata dict too, with every value zeroed, which must not
clobber real values already captured.
"""
import asyncio
from types import SimpleNamespace

from app.agents import llm
from app.services import llm_metrics


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


async def test_completion_tokens_accumulate_across_content_chunks(monkeypatch):
    """Corrected from an earlier 'last wins' assumption, which was wrong: a
    live 200-word call showed output_tokens as a small per-chunk increment
    on every content chunk (not a cumulative total), so completion_tokens
    must be summed. prompt_tokens still uses last-non-zero-wins since
    input_tokens is reported identically on every chunk in this fixture
    (mirroring how the real call reports it once, unchanged)."""
    monkeypatch.setattr(
        llm,
        "get_llm",
        lambda model=None: FakeLLM([
            _chunk("a", {"input_tokens": 10, "output_tokens": 1}),
            _chunk("b", {"input_tokens": 10, "output_tokens": 7}),
        ]),
    )

    [c async for c in llm.stream_with_fallback([])]

    meta = llm.get_last_meta()
    assert meta.completion_tokens == 8
    assert meta.prompt_tokens == 10


async def test_zeroed_terminator_chunk_does_not_clobber_real_usage(monkeypatch):
    """Reproduces the exact shape observed from a live gemini-3.1-flash-lite
    call: a content chunk carrying real non-zero usage, followed by an
    empty-content terminator chunk whose usage_metadata dict is present
    (not None/{}) but every value is zero. A guard of
    `if not usage: return` treats that dict as "present" (it has keys) and
    overwrites the real numbers with zeros — this was the bug found when
    Task 1's original Step 6 live check reported 0/0 despite the provider
    actually sending real counts. This test fails against that guard and
    passes against the values-based guard in `_apply_usage`.
    """
    monkeypatch.setattr(
        llm,
        "get_llm",
        lambda model=None: FakeLLM([
            _chunk("Hello, how are you today?", {
                "input_tokens": 7,
                "output_tokens": 7,
                "total_tokens": 14,
                "input_token_details": {"cache_read": 0},
            }),
            _chunk("", {
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "input_token_details": {"cache_read": 0},
            }),
        ]),
    )

    [c async for c in llm.stream_with_fallback([])]

    meta = llm.get_last_meta()
    assert meta.prompt_tokens == 7
    assert meta.completion_tokens == 7


async def test_call_context_defaults_to_unknown():
    assert llm.get_call_context().surface == "unknown"
    assert llm.get_call_context().deal_id is None


async def test_call_context_sets_and_restores():
    with llm.llm_call_context(surface="tabular_cell", deal_id="d1", run_id="r1", cell_id="c1"):
        ctx = llm.get_call_context()
        assert ctx.surface == "tabular_cell"
        assert ctx.deal_id == "d1"
        assert ctx.run_id == "r1"
        assert ctx.cell_id == "c1"
    assert llm.get_call_context().surface == "unknown"


async def test_call_context_is_task_local():
    """Concurrent cells must not see each other's attribution.

    Both contexts are open simultaneously and each task reads while the
    other's is also open — a plain module global would make task_a observe
    task_b's deal_id here. Only a per-task ContextVar passes.
    """
    seen = {}

    async def task_a():
        with llm.llm_call_context(surface="chat_stream", deal_id="deal-a"):
            await asyncio.sleep(0.02)
            seen["a"] = llm.get_call_context().deal_id

    async def task_b():
        await asyncio.sleep(0.005)
        with llm.llm_call_context(surface="tabular_cell", deal_id="deal-b"):
            await asyncio.sleep(0.02)
            seen["b"] = llm.get_call_context().deal_id

    await asyncio.gather(task_a(), task_b())

    assert seen == {"a": "deal-a", "b": "deal-b"}


async def test_call_context_restores_after_exception():
    try:
        with llm.llm_call_context(surface="doc_matrix", deal_id="d1"):
            raise ValueError("boom")
    except ValueError:
        pass
    assert llm.get_call_context().surface == "unknown"


async def test_stream_records_a_metrics_row(monkeypatch, clear_store):
    monkeypatch.setattr(
        llm,
        "get_llm",
        lambda model=None: FakeLLM([
            _chunk("hi", {"input_tokens": 500, "output_tokens": 12}),
        ]),
    )

    with llm.llm_call_context(surface="chat_stream", deal_id="deal-9", run_id="run-9"):
        [c async for c in llm.stream_with_fallback([])]

    summary = llm_metrics.summarize("deal-9")
    assert summary.call_count == 1
    assert summary.prompt_tokens == 500
    assert summary.completion_tokens == 12
    assert summary.by_surface == {"chat_stream": 1}


async def test_recording_failure_does_not_break_the_stream(monkeypatch, clear_store):
    monkeypatch.setattr(llm, "get_llm", lambda model=None: FakeLLM([_chunk("ok")]))

    def boom(meta, ctx):
        raise RuntimeError("metrics exploded")

    monkeypatch.setattr(llm_metrics, "record_call", boom)

    tokens = [c.content async for c in llm.stream_with_fallback([])]

    assert tokens == ["ok"]
