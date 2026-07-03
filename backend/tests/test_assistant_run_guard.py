"""Assistant-run kick-off idempotency (F8).

The docstring always claimed calling kick_off_assistant_run on an active run
is a no-op; before this fix there was no guard, so a double-clicked approve
started two executor loops that could both claim and execute the same stage.
"""
import asyncio

from app.services import workflow_run_executor


async def test_second_kick_is_noop_while_first_active(monkeypatch):
    entered = 0
    release = asyncio.Event()

    async def fake_execute(run_id, deal_id):
        nonlocal entered
        entered += 1
        await release.wait()

    monkeypatch.setattr(
        workflow_run_executor, "execute_assistant_run", fake_execute
    )

    workflow_run_executor.kick_off_assistant_run("guard_run", "deal-1")
    await asyncio.sleep(0)  # let the first task enter
    workflow_run_executor.kick_off_assistant_run("guard_run", "deal-1")
    await asyncio.sleep(0)

    assert entered == 1

    release.set()
    await asyncio.sleep(0.01)  # let the runner finish and clear the guard

    # After completion the run can be kicked again (e.g. next approve).
    workflow_run_executor.kick_off_assistant_run("guard_run", "deal-1")
    await asyncio.sleep(0)
    assert entered == 2

    release.set()
    await asyncio.sleep(0.01)
    assert "guard_run" not in workflow_run_executor._ACTIVE_ASSISTANT_RUNS
