"""
Default-deny access control (Plan 2, S1-cross-cutting).

Enumerates every registered route from the OpenAPI schema and asserts that an
unauthenticated request is rejected with 401 unless the route is on the
explicit public allowlist. This is the regression guard: a new route added
without an auth dependency fails this test instead of shipping a data-room
leak.

Behavioral on purpose — it exercises the real dependency chain (auth resolves
before path/body validation, verified empirically) rather than introspecting
FastAPI routing internals, which are private and version-dependent.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app

# The only intentionally public endpoints. /auth/register stays public for
# the beta by explicit decision (2026-07-07); revisit before GA.
PUBLIC_ROUTES = {
    ("/health", "GET"),
    ("/auth/login", "POST"),
    ("/auth/register", "POST"),
}

HTTP_METHODS = {"get", "post", "put", "patch", "delete"}


def _all_routes() -> list[tuple[str, str]]:
    """(path_template, METHOD) for every route in the app."""
    return sorted(
        (path, method.upper())
        for path, ops in app.openapi()["paths"].items()
        for method in ops
        if method in HTTP_METHODS
    )


def _fill_params(path: str) -> str:
    """Substitute path params with dummy values; auth runs before any lookup,
    so nonexistent ids must still yield 401, never 404, when unauthenticated."""
    import re

    return re.sub(r"\{[^}]+\}", "x", path)


def test_every_route_rejects_unauthenticated_requests():
    client = TestClient(app)
    leaks = []
    for path, method in _all_routes():
        if (path, method) in PUBLIC_ROUTES:
            continue
        response = client.request(method, _fill_params(path))
        if response.status_code != 401:
            leaks.append(f"{method} {path} -> {response.status_code}")
    assert not leaks, (
        "Routes reachable without authentication (default-deny violation):\n"
        + "\n".join(leaks)
    )


def test_public_allowlist_is_exact():
    """The allowlist must not accumulate stale entries for routes that no
    longer exist — keeps the list honest as routes evolve."""
    registered = set(_all_routes())
    stale = PUBLIC_ROUTES - registered
    assert not stale, f"PUBLIC_ROUTES entries with no matching route: {stale}"


@pytest.mark.parametrize("path,method", sorted(PUBLIC_ROUTES))
def test_public_routes_do_not_require_auth(path, method):
    """Public endpoints must not 401 on missing credentials (422/200 are
    fine — the point is auth is not the gate)."""
    client = TestClient(app)
    response = client.request(method, path)
    assert response.status_code != 401, f"{method} {path} unexpectedly requires auth"
