import pytest

from app.agents import llm


def test_ensure_llm_configured_fails_fast_without_key(monkeypatch):
    monkeypatch.setattr(llm.settings, "gemini_api_key", "")
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)

    with pytest.raises(llm.LLMConfigurationError) as exc:
        llm.ensure_llm_configured()

    assert "GEMINI_API_KEY is not configured" in str(exc.value)


def test_ensure_llm_configured_allows_api_key(monkeypatch):
    monkeypatch.setattr(llm.settings, "gemini_api_key", "test-key")
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS", raising=False)

    llm.ensure_llm_configured()
