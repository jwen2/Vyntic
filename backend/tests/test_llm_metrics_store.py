"""Per-call token accounting: the baseline for the cost work in Plan B."""
from app.agents.llm import LLMCallContext, LLMCallMeta
from app.services import llm_metrics


def _meta(prompt=100, completion=10, cached=0, model="gemini-3.1-flash-lite"):
    return LLMCallMeta(
        model_used=model,
        fallback=False,
        duration_ms=250,
        prompt_tokens=prompt,
        completion_tokens=completion,
        cached_tokens=cached,
    )


def test_record_and_summarize_by_deal(clear_store):
    ctx = LLMCallContext(surface="tabular_cell", deal_id="deal-1", run_id="run-1")
    llm_metrics.record_call(_meta(prompt=100), ctx)
    llm_metrics.record_call(_meta(prompt=250, completion=20), ctx)

    summary = llm_metrics.summarize("deal-1")

    assert summary.call_count == 2
    assert summary.prompt_tokens == 350
    assert summary.completion_tokens == 30
    assert summary.by_surface == {"tabular_cell": 2}


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

    assert llm_metrics.summarize("deal-1").by_surface == {
        "tabular_cell": 2,
        "chat_stream": 1,
    }


def test_empty_summary_is_zeroed(clear_store):
    summary = llm_metrics.summarize("nonexistent-deal")

    assert summary.call_count == 0
    assert summary.prompt_tokens == 0
    assert summary.by_surface == {}


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
