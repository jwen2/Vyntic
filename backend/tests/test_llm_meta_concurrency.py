"""LLM call metadata must be task-local (F6).

With a module-global `_last_meta`, concurrent streams (4 tabular cells + doc
matrix + chat share one event loop) attribute the wrong model/fallback/
duration to cells. Each task must see the meta of its own call.
"""
import asyncio
from types import SimpleNamespace

from app.agents import llm


class FakeLLM:
    def __init__(self, fail: bool):
        self.fail = fail

    async def astream(self, messages):
        if self.fail:
            raise RuntimeError("primary boom")
        yield SimpleNamespace(content="tok")


async def test_meta_is_task_local(monkeypatch):
    calls = {"n": 0}

    def fake_get_llm(model=None):
        calls["n"] += 1
        # Call 1: task A's primary fails pre-token → A falls back (call 2).
        # Call 3: task B's primary succeeds.
        return FakeLLM(fail=(calls["n"] == 1))

    monkeypatch.setattr(llm, "get_llm", fake_get_llm)

    a_consumed = asyncio.Event()
    b_done = asyncio.Event()

    async def task_a():
        [c async for c in llm.stream_with_fallback([])]
        a_consumed.set()
        # Wait until B has completed its own call (which would overwrite a
        # global) before reading our meta.
        await b_done.wait()
        return llm.get_last_meta()

    async def task_b():
        await a_consumed.wait()
        [c async for c in llm.stream_with_fallback([])]
        b_done.set()
        return llm.get_last_meta()

    meta_a, meta_b = await asyncio.gather(task_a(), task_b())

    assert meta_a is not None and meta_a.fallback is True
    assert meta_b is not None and meta_b.fallback is False
