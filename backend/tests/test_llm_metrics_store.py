"""Per-call token accounting: the baseline for the cost work in Plan B."""
from app.agents.llm import LLMCallContext, LLMCallMeta
from app.services import llm_metrics


def _meta(prompt=100, completion=10, cached=0, model="gemini-3.1-flash-lite", outcome="ok"):
    return LLMCallMeta(
        model_used=model,
        fallback=False,
        duration_ms=250,
        prompt_tokens=prompt,
        completion_tokens=completion,
        cached_tokens=cached,
        outcome=outcome,
    )


def test_record_and_summarize_by_deal(clear_store):
    ctx = LLMCallContext(surface="tabular_cell", deal_id="deal-1", run_id="run-1")
    llm_metrics.record_call(_meta(prompt=100), ctx)
    llm_metrics.record_call(_meta(prompt=250, completion=20), ctx)

    summary = llm_metrics.summarize("deal-1")

    assert summary.call_count == 2
    assert summary.prompt_tokens == 350
    assert summary.completion_tokens == 30
    # tokens, not calls: 100+10 + 250+20
    assert summary.by_surface == {"tabular_cell": 380}
    assert summary.calls_by_surface == {"tabular_cell": 2}


def test_summarize_filters_by_run(clear_store):
    llm_metrics.record_call(
        _meta(prompt=100),
        LLMCallContext(surface="tabular_cell", deal_id="deal-1", run_id="run-1"),
    )
    llm_metrics.record_call(
        _meta(prompt=999),
        LLMCallContext(surface="tabular_cell", deal_id="deal-1", run_id="run-2"),
    )

    summary = llm_metrics.summarize("deal-1", run_id="run-1")

    assert summary.call_count == 1
    assert summary.prompt_tokens == 100


def test_summarize_isolates_deals(clear_store):
    llm_metrics.record_call(
        _meta(prompt=100), LLMCallContext(surface="chat_stream", deal_id="deal-1")
    )
    llm_metrics.record_call(
        _meta(prompt=500), LLMCallContext(surface="chat_stream", deal_id="deal-2")
    )

    assert llm_metrics.summarize("deal-1").prompt_tokens == 100
    assert llm_metrics.summarize("deal-2").prompt_tokens == 500


def test_summarize_groups_multiple_surfaces(clear_store):
    for surface in ("tabular_cell", "tabular_cell", "chat_stream"):
        llm_metrics.record_call(
            _meta(), LLMCallContext(surface=surface, deal_id="deal-1")
        )

    summary = llm_metrics.summarize("deal-1")

    assert summary.calls_by_surface == {"tabular_cell": 2, "chat_stream": 1}
    assert summary.call_count == sum(summary.calls_by_surface.values())


def test_by_surface_reports_tokens_not_calls(clear_store):
    """The measurement this table exists for is the per-surface token
    multiplier. One expensive call must outweigh several cheap ones — a call
    count would rank these backwards."""
    llm_metrics.record_call(
        _meta(prompt=50_000, completion=200),
        LLMCallContext(surface="tabular_cell", deal_id="deal-1"),
    )
    for _ in range(4):
        llm_metrics.record_call(
            _meta(prompt=100, completion=10),
            LLMCallContext(surface="chat_stream", deal_id="deal-1"),
        )

    summary = llm_metrics.summarize("deal-1")

    assert summary.by_surface == {"tabular_cell": 50_200, "chat_stream": 440}
    assert summary.calls_by_surface == {"tabular_cell": 1, "chat_stream": 4}


def test_summarize_groups_outcomes(clear_store):
    """A failed or abandoned call must not be indistinguishable from a billed
    one — call_count alone can't answer 'what did we pay for'."""
    for outcome in ("ok", "ok", "error", "aborted"):
        llm_metrics.record_call(
            _meta(outcome=outcome),
            LLMCallContext(surface="chat_stream", deal_id="deal-1"),
        )

    summary = llm_metrics.summarize("deal-1")

    assert summary.calls_by_outcome == {"ok": 2, "error": 1, "aborted": 1}
    assert summary.call_count == 4


def test_empty_summary_is_zeroed(clear_store):
    summary = llm_metrics.summarize("nonexistent-deal")

    assert summary.call_count == 0
    assert summary.prompt_tokens == 0
    assert summary.by_surface == {}
    assert summary.calls_by_surface == {}
    assert summary.calls_by_outcome == {}


def test_record_never_raises_on_bad_input(clear_store, monkeypatch):
    """A metrics write failure must never fail a diligence answer."""
    def boom():
        raise RuntimeError("db down")

    monkeypatch.setattr(llm_metrics, "SessionLocal", boom)

    llm_metrics.record_call(_meta(), LLMCallContext(surface="chat_stream"))


SURFACES = {
    "tabular_cell",
    "assistant_stage",
    "chat_stream",
    "chat_query",
    "doc_matrix",
    "monitoring",
    # The multi-deal compare fan-out (one isolated per-deal QA call each) and
    # the single cross-deal synthesis paragraph that follows it. Separate
    # labels because their prompt shapes are nothing alike — the fan-out sends
    # whole documents, the synthesis only sends already-extracted answers.
    "compare_cell",
    "compare_synthesis",
}


def test_surface_vocabulary_is_used_in_source():
    """Every surface label must actually be set somewhere in app code.

    Guards against a surface being instrumented with a typo'd label, which
    would silently split its cost across two buckets.
    """
    import pathlib
    import re

    root = pathlib.Path(__file__).resolve().parents[1] / "app"
    source = "\n".join(
        p.read_text(encoding="utf-8") for p in root.rglob("*.py")
    )
    used = set(re.findall(r'llm_call_context\(\s*surface="([a-z_]+)"', source))

    assert used == SURFACES, f"missing={SURFACES - used} unexpected={used - SURFACES}"
