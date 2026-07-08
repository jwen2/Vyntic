"""
Audit logging (Plan 2, S4).

An append-only record of security-relevant actions. These tests pin:
- audited actions write rows (login, deal create/delete, access grant),
- the read API is admin-only with filters + CSV export,
- the log is append-only: no mutation endpoints exist under /audit.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal, AuditLogRow


def _rows(action=None):
    db = SessionLocal()
    try:
        q = db.query(AuditLogRow)
        if action:
            q = q.filter(AuditLogRow.action == action)
        rows = q.order_by(AuditLogRow.id).all()
        for r in rows:
            db.expunge(r)
        return rows
    finally:
        db.close()


def test_login_writes_audit_row(admin_user):
    c = TestClient(app)
    res = c.post("/auth/login", json={"email": "admin@test.com", "password": "pw"})
    assert res.status_code == 200
    rows = _rows("auth.login")
    assert len(rows) == 1
    assert rows[0].user_id == admin_user.id
    assert rows[0].user_email == "admin@test.com"


def test_failed_login_writes_no_success_row(admin_user):
    c = TestClient(app)
    res = c.post("/auth/login", json={"email": "admin@test.com", "password": "wrong"})
    assert res.status_code == 401
    assert _rows("auth.login") == []


def test_deal_create_and_delete_write_rows(client):
    res = client.post(
        "/deals",
        json={"deal_id": "aud_deal", "name": "Audit Deal", "description": ""},
    )
    assert res.status_code == 200
    res = client.delete("/deals/aud_deal")
    assert res.status_code == 200

    created = _rows("deal.create")
    deleted = _rows("deal.delete")
    assert len(created) == 1 and created[0].deal_id == "aud_deal"
    assert len(deleted) == 1 and deleted[0].deal_id == "aud_deal"


def test_access_grant_writes_row(client, analyst_user, sample_deal):
    res = client.post(
        f"/auth/deals/{sample_deal.deal_id}/access",
        json={"email": "analyst@test.com", "role": "analyst"},
    )
    assert res.status_code == 200
    rows = _rows("access.grant")
    assert len(rows) == 1
    assert rows[0].deal_id == sample_deal.deal_id
    assert rows[0].meta["email"] == "analyst@test.com"


def test_audit_read_is_admin_only(analyst_client):
    assert analyst_client.get("/audit").status_code == 403


def test_audit_read_filters(client, sample_deal):
    client.post(
        "/deals", json={"deal_id": "aud_a", "name": "A", "description": ""}
    )
    client.post(
        "/deals", json={"deal_id": "aud_b", "name": "B", "description": ""}
    )
    res = client.get("/audit", params={"deal_id": "aud_a"})
    assert res.status_code == 200
    entries = res.json()
    assert entries and all(e["deal_id"] == "aud_a" for e in entries)


def test_audit_csv_export(client):
    client.post("/deals", json={"deal_id": "aud_csv", "name": "C", "description": ""})
    res = client.get("/audit/export.csv")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    lines = res.text.strip().splitlines()
    assert lines[0].startswith("id,created_at,user_id,user_email,action")
    assert len(lines) >= 2


def test_audit_log_has_no_mutation_endpoints():
    """Append-only: /audit exposes GET only."""
    mutating = {
        (path, method.upper())
        for path, ops in app.openapi()["paths"].items()
        if path.startswith("/audit")
        for method in ops
        if method.upper() != "GET"
    }
    assert not mutating, f"Mutation endpoints on the audit log: {mutating}"
