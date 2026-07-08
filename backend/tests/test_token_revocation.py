"""
Token revocation + scoped download tokens (Plan 2, S5).

Pins:
- POST /auth/logout revokes the current token; revoked tokens are 401
  everywhere afterward.
- The document-view and run-stream ?token= query params accept only
  short-lived, single-purpose scoped tokens — never a full session JWT
  (the S5 leak: 24h JWTs landing in server logs / browser history).
- A scoped token is bound to its resource: the token for one file cannot
  view another.
"""
from datetime import timedelta

from fastapi.testclient import TestClient

from app.main import app
from app.auth import create_access_token, create_scoped_token


def _login(email="admin@test.com", password="pw"):
    c = TestClient(app)
    res = c.post("/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200
    return c, res.json()["access_token"]


def _auth(c: TestClient, token: str) -> TestClient:
    c.headers.update({"Authorization": f"Bearer {token}"})
    return c


# ── Revocation ──

def test_logout_revokes_token(admin_user):
    c, token = _login()
    _auth(c, token)
    assert c.get("/auth/me").status_code == 200
    assert c.post("/auth/logout").status_code == 200
    assert c.get("/auth/me").status_code == 401


def test_other_tokens_survive_logout(admin_user):
    c1, token1 = _login()
    c2, token2 = _login()
    _auth(c1, token1)
    _auth(c2, token2)
    c1.post("/auth/logout")
    assert c1.get("/auth/me").status_code == 401
    assert c2.get("/auth/me").status_code == 200


def test_logout_requires_auth(admin_user):
    c = TestClient(app)
    assert c.post("/auth/logout").status_code == 401


# ── Scoped document-view tokens ──

def test_session_jwt_rejected_on_view_query_param(client, sample_deal, admin_user):
    session_token = create_access_token({"sub": str(admin_user.id)})
    anon = TestClient(app)
    res = anon.get(
        f"/deals/{sample_deal.deal_id}/documents/whatever.pdf/view",
        params={"token": session_token},
    )
    assert res.status_code == 401


def test_scoped_token_authenticates_view(client, sample_deal):
    res = client.get(
        f"/deals/{sample_deal.deal_id}/documents/nofile.pdf/view-token"
    )
    assert res.status_code == 200
    scoped = res.json()["token"]

    anon = TestClient(app)
    res = anon.get(
        f"/deals/{sample_deal.deal_id}/documents/nofile.pdf/view",
        params={"token": scoped},
    )
    # 404 (file missing), not 401 — the scoped token cleared auth.
    assert res.status_code == 404


def test_scoped_token_bound_to_its_file(client, sample_deal):
    res = client.get(
        f"/deals/{sample_deal.deal_id}/documents/file-a.pdf/view-token"
    )
    scoped = res.json()["token"]
    anon = TestClient(app)
    res = anon.get(
        f"/deals/{sample_deal.deal_id}/documents/file-b.pdf/view",
        params={"token": scoped},
    )
    assert res.status_code == 401


def test_expired_scoped_token_rejected(client, sample_deal, admin_user):
    scoped = create_scoped_token(
        "doc-view",
        {"deal_id": sample_deal.deal_id, "filename": "nofile.pdf"},
        user_id=admin_user.id,
        expires_delta=timedelta(minutes=-1),
    )
    anon = TestClient(app)
    res = anon.get(
        f"/deals/{sample_deal.deal_id}/documents/nofile.pdf/view",
        params={"token": scoped},
    )
    assert res.status_code == 401


def test_view_token_requires_deal_access(analyst_client, sample_deal):
    # Analyst without access to the deal cannot mint a view token for it.
    res = analyst_client.get(
        f"/deals/{sample_deal.deal_id}/documents/nofile.pdf/view-token"
    )
    assert res.status_code == 403


def test_scoped_token_rejected_as_session_header(client, sample_deal):
    """A doc-view token must not grant general API access via the
    Authorization header — it is single-purpose by construction."""
    res = client.get(
        f"/deals/{sample_deal.deal_id}/documents/nofile.pdf/view-token"
    )
    scoped = res.json()["token"]
    anon = TestClient(app)
    anon.headers.update({"Authorization": f"Bearer {scoped}"})
    assert anon.get("/auth/me").status_code == 401
    assert anon.get("/deals").status_code == 401


# ── Scoped run-stream tokens ──

def test_session_jwt_rejected_on_stream_query_param(client, admin_user):
    session_token = create_access_token({"sub": str(admin_user.id)})
    anon = TestClient(app)
    res = anon.get("/runs/some-run/stream", params={"token": session_token})
    assert res.status_code == 401


def test_stream_token_mint_404s_on_missing_run(client):
    assert client.get("/runs/does-not-exist/stream-token").status_code == 404
