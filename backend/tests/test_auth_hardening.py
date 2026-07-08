"""
Auth rate limiting (Plan 2, S6 — modified scope).

/auth/register stays PUBLIC for the beta by explicit decision (2026-07-07),
which makes throttling it non-negotiable: both login (credential stuffing)
and register (junk-account flooding) are limited per client IP.

Limits are enforced by slowapi, in-process only — cross-replica limiting
moves to Redis in Plan 5.
"""
from fastapi.testclient import TestClient

from app.main import app


def test_login_rate_limited(admin_user):
    c = TestClient(app)
    codes = []
    for _ in range(11):
        res = c.post(
            "/auth/login", json={"email": "admin@test.com", "password": "wrong"}
        )
        codes.append(res.status_code)
    assert codes[:10] == [401] * 10
    assert codes[10] == 429


def test_register_rate_limited(clear_store):
    c = TestClient(app)
    codes = []
    for i in range(6):
        res = c.post(
            "/auth/register",
            json={"email": f"beta{i}@test.com", "password": "pw", "full_name": ""},
        )
        codes.append(res.status_code)
    assert codes[:5] == [200] * 5
    assert codes[5] == 429


def test_rate_limit_does_not_bleed_across_endpoints(admin_user):
    """Hitting the login limit must not lock out other API surfaces."""
    c = TestClient(app)
    for _ in range(11):
        c.post("/auth/login", json={"email": "admin@test.com", "password": "wrong"})
    # Health stays reachable; login itself is limited.
    assert c.get("/health").status_code == 200
    res = c.post("/auth/login", json={"email": "admin@test.com", "password": "pw"})
    assert res.status_code == 429
