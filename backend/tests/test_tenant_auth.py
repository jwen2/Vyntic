"""
Tenant-scoped auth (Plan 4, B3).

The tenant boundary must hold at the auth layer before RLS (B2) backstops
it at the DB layer. Pins:
- Users bind to a tenant at creation; public registration lands in the
  default tenant (beta decision) until invite flows exist.
- verify_deal_access refuses cross-tenant deals for everyone — including
  admins (admin means tenant-admin) and analysts holding a stale
  deal_access row. Same 403 as a plain access miss, so responses do not
  leak whether a deal exists in another tenant.
- Deal listing and creation are tenant-scoped end-to-end via the API.
"""
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import create_access_token, create_user, grant_deal_access, verify_deal_access
from app.database import SessionLocal, TenantRow, DEFAULT_TENANT_ID
from app.main import app
from app.models.deal import DealCreate
from app.services import deal_store

OTHER_TENANT = "acme_lp"


@pytest.fixture
def other_tenant(clear_store):
    db = SessionLocal()
    try:
        db.merge(TenantRow(tenant_id=OTHER_TENANT, name="Acme LP"))
        db.commit()
    finally:
        db.close()
    return OTHER_TENANT


@pytest.fixture
def other_admin(other_tenant):
    return create_user(
        email="admin@acme.com", password="pw", full_name="Acme Admin",
        is_admin=True, tenant_id=other_tenant,
    )


@pytest.fixture
def other_client(other_admin):
    token = create_access_token({"sub": str(other_admin.id)})
    c = TestClient(app)
    c.headers.update({"Authorization": f"Bearer {token}"})
    return c


def test_create_user_binds_tenant(other_tenant):
    bound = create_user(email="a@acme.com", password="pw", tenant_id=other_tenant)
    assert bound.tenant_id == other_tenant
    defaulted = create_user(email="b@x.com", password="pw")
    assert defaulted.tenant_id == DEFAULT_TENANT_ID


def test_register_lands_in_default_tenant(client):
    res = client.post(
        "/auth/register",
        json={"email": "new@x.com", "password": "pw12345", "full_name": "New"},
    )
    assert res.status_code == 200
    db = SessionLocal()
    try:
        from app.database import UserRow

        row = db.query(UserRow).filter(UserRow.email == "new@x.com").first()
        assert row.tenant_id == DEFAULT_TENANT_ID
    finally:
        db.close()


def test_admin_cannot_cross_tenant(sample_deal, other_admin):
    # sample_deal is in the default tenant; other_admin is tenant-admin of
    # acme_lp. Admin bypass must stop at the tenant boundary.
    with pytest.raises(HTTPException) as exc:
        verify_deal_access(other_admin, sample_deal.deal_id)
    assert exc.value.status_code == 403


def test_stale_access_row_cannot_cross_tenant(sample_deal, other_tenant):
    analyst = create_user(email="an@acme.com", password="pw", tenant_id=other_tenant)
    # Simulate a stale/buggy grant pointing at another tenant's deal.
    grant_deal_access(analyst.id, sample_deal.deal_id, role="analyst")
    with pytest.raises(HTTPException) as exc:
        verify_deal_access(analyst, sample_deal.deal_id)
    assert exc.value.status_code == 403


def test_deal_list_is_tenant_scoped(client, other_client, sample_deal):
    res = other_client.post(
        "/deals",
        json={"deal_id": "acme_deal", "name": "Acme Deal"},
    )
    assert res.status_code == 200

    default_ids = {d["deal_id"] for d in client.get("/deals").json()}
    acme_ids = {d["deal_id"] for d in other_client.get("/deals").json()}
    assert sample_deal.deal_id in default_ids
    assert "acme_deal" not in default_ids
    assert acme_ids == {"acme_deal"}


def test_deal_detail_cross_tenant_is_403(other_client, sample_deal):
    res = other_client.get(f"/deals/{sample_deal.deal_id}")
    assert res.status_code == 403


def test_created_deal_stamped_with_creator_tenant(other_client, other_tenant):
    res = other_client.post(
        "/deals",
        json={"deal_id": "stamped", "name": "Stamped"},
    )
    assert res.status_code == 200
    db = SessionLocal()
    try:
        from app.database import DealRow

        row = db.query(DealRow).filter(DealRow.deal_id == "stamped").first()
        assert row.tenant_id == other_tenant
    finally:
        db.close()
