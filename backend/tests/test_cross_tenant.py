"""
Cross-tenant regression suite (Plan 4, B4) — the durable guard for S2.

An admin of one tenant sweeps every deal-scoped surface of another
tenant's deal and must be refused everywhere (403 via the tenant gate in
verify_deal_access, or 404 where cross-tenant resources are invisible).
The audit log is tenant-scoped: rows are stamped with the acting user's
tenant at write time (denormalized like user_email, so rows survive user
deletion) and reads never cross tenants.

When RLS lands (B2), these same tests prove the app layer and DB layer
agree; here they pin the app layer on SQLite.
"""
import pytest
from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user
from app.database import SessionLocal, TenantRow
from app.main import app

OTHER_TENANT = "acme_lp"


@pytest.fixture
def other_admin_client(clear_store):
    db = SessionLocal()
    try:
        db.merge(TenantRow(tenant_id=OTHER_TENANT, name="Acme LP"))
        db.commit()
    finally:
        db.close()
    admin = create_user(
        email="admin@acme.com", password="pw", full_name="Acme Admin",
        is_admin=True, tenant_id=OTHER_TENANT,
    )
    token = create_access_token({"sub": str(admin.id)})
    c = TestClient(app)
    c.headers.update({"Authorization": f"Bearer {token}"})
    return c


# Every deal-scoped read/mutation reachable with just a deal id. Bodies are
# minimal-valid so requests reach the handler (422 would mean the sweep
# never exercised the tenant gate).
DEAL_SCOPED_REQUESTS = [
    ("GET", "/deals/{deal_id}", None),
    ("PATCH", "/deals/{deal_id}", {"description": "x"}),
    ("DELETE", "/deals/{deal_id}", None),
    ("GET", "/deals/{deal_id}/position", None),
    ("PUT", "/deals/{deal_id}/position", {"commitment_amount": 1.0}),
    ("GET", "/deals/{deal_id}/documents", None),
    ("GET", "/deals/{deal_id}/documents/f.pdf/view-token", None),
    ("GET", "/deals/{deal_id}/workflows", None),
    ("GET", "/deals/{deal_id}/conversations", None),
    ("DELETE", "/deals/{deal_id}/conversations", None),
    ("POST", "/auth/deals/{deal_id}/access", {"email": "admin@acme.com"}),
    ("GET", "/auth/deals/{deal_id}/access", None),
    ("POST", "/deals/{deal_id}/query", {"question": "q"}),
    ("DELETE", "/deals/{deal_id}/documents/some_doc", None),
    ("PATCH", "/deals/{deal_id}/documents/some_doc/metadata", {"doc_category": "other"}),
]


@pytest.mark.parametrize("method,path,body", DEAL_SCOPED_REQUESTS)
def test_cross_tenant_deal_surface_refused(
    other_admin_client, sample_deal, method, path, body
):
    path = path.format(deal_id=sample_deal.deal_id)
    if isinstance(body, dict):
        body = {
            k: (v.format(deal_id=sample_deal.deal_id) if isinstance(v, str) else v)
            for k, v in body.items()
        }
    res = other_admin_client.request(method, path, json=body)
    assert res.status_code == 403, (
        f"{method} {path} returned {res.status_code} for a cross-tenant admin"
    )


def test_cross_tenant_document_upload_refused(other_admin_client, sample_deal):
    # Multipart uploads validate the file part before the handler runs, so
    # these two need real file payloads instead of a sweep entry.
    files = {"file": ("x.txt", b"content", "text/plain")}
    res = other_admin_client.post(
        f"/deals/{sample_deal.deal_id}/documents", files=files
    )
    assert res.status_code == 403
    res = other_admin_client.post(
        f"/deals/{sample_deal.deal_id}/documents/batch",
        files=[("files", ("x.txt", b"content", "text/plain"))],
    )
    assert res.status_code == 403


def test_manager_surface_invisible_cross_tenant(other_admin_client, client):
    res = client.post("/managers", json={"manager_id": "gp1", "name": "GP One"})
    assert res.status_code == 200

    assert other_admin_client.get("/managers").json() == []
    assert other_admin_client.get("/managers/gp1").status_code == 404
    assert (
        other_admin_client.patch("/managers/gp1", json={"name": "X"}).status_code == 404
    )
    assert other_admin_client.delete("/managers/gp1").status_code == 404
    assert other_admin_client.get("/managers/gp1/funds").status_code == 404
    assert other_admin_client.get("/managers/gp1/documents").status_code == 404
    # and the manager is untouched
    assert client.get("/managers/gp1").json()["name"] == "GP One"


def test_grant_cannot_target_cross_tenant_user(client, sample_deal):
    # Default-tenant admin tries to grant its own deal to an acme user:
    # the foreign user must be reported as not found, not enumerated.
    db = SessionLocal()
    try:
        db.merge(TenantRow(tenant_id=OTHER_TENANT, name="Acme LP"))
        db.commit()
    finally:
        db.close()
    create_user(email="user@acme.com", password="pw", tenant_id=OTHER_TENANT)

    res = client.post(
        f"/auth/deals/{sample_deal.deal_id}/access",
        json={"email": "user@acme.com"},
    )
    assert res.status_code == 404


def test_audit_log_reads_are_tenant_scoped(other_admin_client, client, sample_deal):
    # Generate audit rows in both tenants — via the API, since only route
    # handlers write audit entries (deal.create audits; plain GETs do not).
    other_admin_client.post("/deals", json={"deal_id": "acme_d", "name": "Acme D"})
    client.post("/deals", json={"deal_id": "default_d", "name": "Default D"})

    default_rows = client.get("/audit").json()
    acme_rows = other_admin_client.get("/audit").json()
    assert default_rows, "default tenant should see its own audit rows"
    assert acme_rows, "acme should see its own audit rows"
    assert all(r["user_email"].endswith("@test.com") for r in default_rows)
    assert all(r["user_email"].endswith("@acme.com") for r in acme_rows)

    csv_export = other_admin_client.get("/audit/export.csv").text
    assert "@test.com" not in csv_export
    assert sample_deal.deal_id not in csv_export
