"""
Session-per-request (Plan 4, Task A3).

One SQLAlchemy session services an entire request; background work never
shares it. Pins:
- current_session() outside a request hands out fresh, caller-owned sessions
  (worker pools, seeders, and executor tasks keep their old semantics).
- Inside a request, every store call reuses the request session: exactly one
  session is created for an authenticated request, and it is closed by the
  time the response is out.
- An asyncio task spawned *during* a request does not inherit the request
  session (create_task copies contextvars; the owner-task check must reject
  the copy) — it gets an owned fallback session instead.
- The hot auth dependencies are sync (threadpool), not async, so per-request
  DB lookups stay off the event loop.
"""
import asyncio
import inspect

from unittest.mock import patch

from app import database
from app.database import SessionLocal, current_session, request_session


def test_outside_request_sessions_are_owned_and_distinct():
    s1, owned1 = current_session()
    s2, owned2 = current_session()
    try:
        assert owned1 is True and owned2 is True
        assert s1 is not s2
    finally:
        s1.close()
        s2.close()


def test_request_uses_exactly_one_session(client, sample_deal):
    created = []
    real = database.SessionLocal

    def counting(*args, **kwargs):
        s = real(*args, **kwargs)
        created.append(s)
        return s

    with patch.object(database, "SessionLocal", side_effect=counting):
        res = client.get("/deals")
    assert res.status_code == 200
    # auth user lookup + revocation check + deal_store.list_deals all rode
    # the one request session opened by the app-level dependency
    assert len(created) == 1
    # and it was closed when the request finished
    assert not created[0].in_transaction()


def test_spawned_task_does_not_inherit_request_session():
    async def scenario():
        agen = request_session()
        await agen.__anext__()  # simulate request start: session in contextvar
        try:
            shared, owned = current_session()
            assert owned is False  # same task: shared

            async def background():
                s, o = current_session()
                if o:
                    s.close()
                return o

            spawned_owned = await asyncio.create_task(background())
            return spawned_owned
        finally:
            await agen.aclose()

    assert asyncio.run(scenario()) is True


def test_auth_dependencies_are_sync():
    from app.auth import get_current_user, doc_view_query_auth, run_stream_query_auth

    assert not inspect.iscoroutinefunction(get_current_user)
    assert not inspect.iscoroutinefunction(doc_view_query_auth)
    assert not inspect.iscoroutinefunction(run_stream_query_auth)
