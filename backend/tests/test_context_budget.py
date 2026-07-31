import pytest
from app.services import context_budget


def test_window_is_min_of_both_models(monkeypatch):
    monkeypatch.setattr(context_budget, "_fetch_input_limit",
                        lambda name: {"primary": 1_000_000, "fallback": 400_000}[name])
    monkeypatch.setattr(context_budget.settings, "gemini_model", "primary")
    monkeypatch.setattr(context_budget.settings, "gemini_fallback_model", "fallback")
    context_budget.resolve_window.cache_clear()
    assert context_budget.resolve_window() == 400_000


def test_window_falls_back_to_config_when_metadata_fails(monkeypatch):
    def boom(name):
        raise RuntimeError("no network")
    monkeypatch.setattr(context_budget, "_fetch_input_limit", boom)
    monkeypatch.setattr(context_budget.settings, "context_window_tokens", 123_456)
    context_budget.resolve_window.cache_clear()
    assert context_budget.resolve_window() == 123_456


def test_budget_subtracts_overhead_reserve_and_margin(monkeypatch):
    monkeypatch.setattr(context_budget, "resolve_window", lambda: 100_000)
    monkeypatch.setattr(context_budget.settings, "max_tokens", 4_000)
    # overhead 4000 chars -> 1000 tokens; margin 5% of 100_000 = 5_000
    assert context_budget.budget_tokens(4_000) == 100_000 - 1_000 - 4_000 - 5_000


def test_chars_to_tokens_is_conservative():
    # 4.0 chars/token over-estimates tokens vs the measured 4.88 — safe direction
    assert context_budget.chars_to_tokens(4_000) == 1_000


def test_resolved_strategy_prefers_explicit_setting(monkeypatch):
    monkeypatch.setattr(context_budget.settings, "context_strategy", "retrieval")
    monkeypatch.setattr(context_budget.settings, "full_context_mode", True)
    assert context_budget.resolved_strategy() == "retrieval"


def test_resolved_strategy_falls_back_to_the_deprecated_flag(monkeypatch):
    monkeypatch.setattr(context_budget.settings, "context_strategy", "")
    monkeypatch.setattr(context_budget.settings, "full_context_mode", False)
    assert context_budget.resolved_strategy() == "retrieval"


def test_resolved_strategy_auto_falls_back_to_the_deprecated_flag(monkeypatch):
    """"auto" is the default, not an explicit override — a deployment still
    running RAG (full_context_mode=False) must not be silently switched to
    the full-text/allocator path just because context_strategy is unset."""
    monkeypatch.setattr(context_budget.settings, "context_strategy", "auto")
    monkeypatch.setattr(context_budget.settings, "full_context_mode", False)
    assert context_budget.resolved_strategy() == "retrieval"


def test_resolved_strategy_auto_with_full_context_mode_stays_auto(monkeypatch):
    """The default deployment (auto + full_context_mode=True) must keep
    returning "auto", not "full_text" — callers treat "full_text" as an
    explicit override that disables probe-based ranking, so collapsing
    "auto" into "full_text" here would silently turn off ranking for
    every default deployment."""
    monkeypatch.setattr(context_budget.settings, "context_strategy", "auto")
    monkeypatch.setattr(context_budget.settings, "full_context_mode", True)
    assert context_budget.resolved_strategy() == "auto"
