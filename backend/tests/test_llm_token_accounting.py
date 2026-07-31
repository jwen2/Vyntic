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
    assert summary.by_surface == {"chat_stream": 512}  # tokens, not calls
    assert summary.calls_by_surface == {"chat_stream": 1}
    assert summary.calls_by_outcome == {"ok": 1}


class _PreTokenFail:
    async def astream(self, messages):
        raise RuntimeError("rate limited")
        yield  # pragma: no cover — makes this an async generator


class _MidStreamFail:
    async def astream(self, messages):
        yield SimpleNamespace(content="partial ", usage_metadata=None)
        raise RuntimeError("connection dropped")


async def test_outcome_is_ok_when_the_fallback_model_succeeds(monkeypatch, clear_store):
    """`outcome` answers "were we billed?", which is NOT what `meta.error`
    answers: error is populated on a call that failed over and then succeeded.
    Deriving outcome from error would mark this billed call as failed."""
    instances = iter([_PreTokenFail(), FakeLLM([_chunk("ok", {"input_tokens": 9, "output_tokens": 2})])])
    monkeypatch.setattr(llm, "get_llm", lambda model=None: next(instances))

    with llm.llm_call_context(surface="chat_stream", deal_id="deal-fb"):
        [c async for c in llm.stream_with_fallback([])]

    assert llm.get_last_meta().error == "rate limited"
    assert llm.get_last_meta().outcome == "ok"
    assert llm_metrics.summarize("deal-fb").calls_by_outcome == {"ok": 1}


async def test_outcome_is_error_when_the_stream_raises(monkeypatch, clear_store):
    monkeypatch.setattr(llm, "get_llm", lambda model=None: _MidStreamFail())

    with llm.llm_call_context(surface="chat_stream", deal_id="deal-err"):
        try:
            async for _ in llm.stream_with_fallback([]):
                pass
        except RuntimeError:
            pass

    assert llm_metrics.summarize("deal-err").calls_by_outcome == {"error": 1}


async def test_outcome_is_aborted_when_the_consumer_abandons_the_stream(
    monkeypatch, clear_store
):
    """A client disconnect throws GeneratorExit in at the yield. That is a
    BaseException, so `except Exception` never sees it and it reaches the
    `finally` looking exactly like a call that died before the provider was
    reached — recording a call we WERE billed for as never-billed."""
    monkeypatch.setattr(
        llm,
        "get_llm",
        lambda model=None: FakeLLM([
            _chunk("first", {"input_tokens": 40, "output_tokens": 1}),
            _chunk("second"),
            _chunk("third"),
        ]),
    )

    with llm.llm_call_context(surface="chat_stream", deal_id="deal-abort"):
        gen = llm.stream_with_fallback([])
        async for _ in gen:
            break  # leaves the generator suspended at its yield
        await gen.aclose()

    summary = llm_metrics.summarize("deal-abort")
    assert summary.calls_by_outcome == {"aborted": 1}
    assert summary.prompt_tokens == 40  # the prompt was sent, so it was billed


async def test_abandoned_nested_generator_finalized_in_another_task(
    monkeypatch, clear_store
):
    """Reproduces the real SSE client-disconnect shape.

    Every streaming surface is a nested async generator: an inner generator
    opens `llm_call_context` and drives `stream_with_fallback`, and an outer
    generator relays it as the StreamingResponse body. Async generators do not
    own a context (PEP 568 was never implemented), so the inner one's `with`
    runs in whichever task drives it. starlette 1.3.1 cancels the response task
    on disconnect WITHOUT aclose()ing the body iterator (responses.py:248-250),
    so both generators are abandoned mid-flight and finalized later by
    asyncio's hook — in a NEW task, with a copied context.

    What this pins: `_call_context.reset(token)` raises `ValueError: token was
    created in a different Context`. That exception displaces the in-flight
    GeneratorExit, is caught by the generator's own `except Exception`, and
    becomes a spurious SSE error frame plus "async generator ignored
    GeneratorExit" — a routine disconnect logged as an LLM failure.

    Note what this does NOT prove. Attribution survives this scenario whether or
    not `_record` snapshots the context, and measurably so: reverting the
    snapshot leaves this test green. That is not a sign the snapshot is
    pointless — it is the reason it exists. Attribution here survives only
    because the *failed* reset leaves the ContextVar still set in the driving
    task, so `create_task` copies a context that happens to carry the right
    value. Correctness resting on a failed cleanup is not correctness. The case
    where that accident does not save us is isolated in the next test.
    """
    monkeypatch.setattr(
        llm,
        "get_llm",
        lambda model=None: FakeLLM([
            _chunk("one", {"input_tokens": 77, "output_tokens": 1}),
            _chunk("two"),
            _chunk("three"),
        ]),
    )

    holder = {}

    async def inner():
        with llm.llm_call_context(surface="compare_synthesis", deal_id="deal-sse"):
            stream = llm.stream_with_fallback([])
            holder["stream"] = stream
            async for chunk in stream:
                yield chunk.content

    inner_gen = inner()

    async def outer():
        async for token in inner_gen:
            yield token

    gen = outer()
    async for _ in gen:
        break  # client disconnects: all three generators left suspended

    # Finalize from DIFFERENT tasks, exactly as asyncio's async-generator
    # finalizer hook does. Each generator must be closed explicitly: closing an
    # outer one only throws GeneratorExit in at ITS OWN yield, which abandons
    # the generator it was iterating rather than finalizing it. The hook reaches
    # each abandoned generator separately, which is what this models — and it is
    # why the `finally` that calls _record runs under a foreign context.
    #
    # Pre-fix, closing inner_gen raised ValueError out of aclose(); and the
    # stream's own finally then recorded surface="unknown"/deal_id=None, so
    # summarize("deal-sse") found nothing.
    await asyncio.create_task(gen.aclose())
    await asyncio.create_task(inner_gen.aclose())
    await asyncio.create_task(holder["stream"].aclose())

    summary = llm_metrics.summarize("deal-sse")
    assert summary.call_count == 1
    assert summary.by_surface == {"compare_synthesis": 78}
    assert summary.calls_by_outcome == {"aborted": 1}


async def test_attribution_survives_finalization_after_the_context_exits(
    monkeypatch, clear_store
):
    """The case the nested-generator test cannot catch: a stream finalized
    after its `llm_call_context` has already exited *cleanly*.

    Here the `with` opens and closes in one task, so `reset` succeeds and the
    ContextVar is genuinely back to its default by the time the abandoned
    stream is finalized in another task. If `_record` read the ContextVar at
    that point it would see surface="unknown"/deal_id=None, and because
    `summarize()` filters on deal_id the row would be written and then be
    unreachable from every read path — spend that vanishes rather than showing
    up wrong. Only the context snapshot taken when the call starts prevents it.

    This shape is not hypothetical: any consumer that stops reading a stream
    early inside a context manager that then exits normally produces it.
    """
    monkeypatch.setattr(
        llm,
        "get_llm",
        lambda model=None: FakeLLM([
            _chunk("one", {"input_tokens": 55, "output_tokens": 3}),
            _chunk("two"),
        ]),
    )

    with llm.llm_call_context(surface="doc_matrix", deal_id="deal-late", doc_id="doc-1"):
        stream = llm.stream_with_fallback([])
        async for _ in stream:
            break  # stop reading, but leave the generator alive

    # The context has exited cleanly; the variable is back to its default.
    assert llm.get_call_context().surface == "unknown"

    await asyncio.create_task(stream.aclose())

    summary = llm_metrics.summarize("deal-late")
    assert summary.call_count == 1, "the row must not be filed under deal_id=None"
    assert summary.by_surface == {"doc_matrix": 58}


async def test_recording_failure_does_not_break_the_stream(monkeypatch, clear_store):
    monkeypatch.setattr(llm, "get_llm", lambda model=None: FakeLLM([_chunk("ok")]))

    def boom(meta, ctx):
        raise RuntimeError("metrics exploded")

    monkeypatch.setattr(llm_metrics, "record_call", boom)

    tokens = [c.content async for c in llm.stream_with_fallback([])]

    assert tokens == ["ok"]
