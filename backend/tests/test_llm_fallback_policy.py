"""Fallback policy tests (F7).

Falling back after the primary already streamed tokens restarts the answer
while consumers keep appending — duplicated chat answers, corrupted cell
parses. Fallback is allowed only when the primary failed before its first
token; mid-stream failures must raise.
"""
from types import SimpleNamespace

import pytest

from app.agents import llm


class PreTokenFailLLM:
    async def astream(self, messages):
        raise RuntimeError("rate limited")
        yield  # pragma: no cover — makes this an async generator


class MidStreamFailLLM:
    async def astream(self, messages):
        yield SimpleNamespace(content="partial ")
        raise RuntimeError("connection dropped")


class OkLLM:
    async def astream(self, messages):
        yield SimpleNamespace(content="fallback answer")


async def test_pre_token_failure_falls_back(monkeypatch):
    instances = iter([PreTokenFailLLM(), OkLLM()])
    monkeypatch.setattr(llm, "get_llm", lambda model=None: next(instances))

    tokens = [c.content async for c in llm.stream_with_fallback([])]

    assert tokens == ["fallback answer"]
    meta = llm.get_last_meta()
    assert meta.fallback is True
    assert meta.error == "rate limited"


async def test_mid_stream_failure_raises_instead_of_falling_back(monkeypatch):
    fallback_used = {"value": False}

    def fake_get_llm(model=None):
        if model == llm.settings.gemini_fallback_model:
            fallback_used["value"] = True
            return OkLLM()
        return MidStreamFailLLM()

    monkeypatch.setattr(llm, "get_llm", fake_get_llm)

    received = []
    with pytest.raises(RuntimeError, match="connection dropped"):
        async for chunk in llm.stream_with_fallback([]):
            received.append(chunk.content)

    assert received == ["partial "]
    assert fallback_used["value"] is False
