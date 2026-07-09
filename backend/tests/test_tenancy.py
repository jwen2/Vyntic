"""
Tenant model (Plan 4, Phase B — B1 schema layer).

Option A tenancy: every top-level entity carries tenant_id; deal-scoped
tables inherit tenancy through deal_id. Pins:
- The migration chain creates a `tenants` table and tenant_id columns on
  users / deals / managers (model↔migration sync is guarded separately by
  test_alembic_migrations).
- Upgrading a pre-tenancy database (rev 0001) backfills the default tenant
  and stamps every existing row with it.
- New rows created through the existing stores/auth land in the default
  tenant until tenant-scoped auth (B3) starts binding real tenants.
"""
from alembic import command
from sqlalchemy import create_engine, text

import pytest

from app.auth import create_user
from app.database import SessionLocal, _alembic_config
from app.models.deal import DealCreate
from app.services import deal_store

DEFAULT_TENANT = "default"


@pytest.fixture
def scratch_url(tmp_path):
    return f"sqlite:///{(tmp_path / 'tenancy.db').as_posix()}"


def test_pre_tenancy_db_backfilled_to_default_tenant(scratch_url):
    cfg = _alembic_config(scratch_url)
    command.upgrade(cfg, "0001")  # schema as it was before tenancy

    engine = create_engine(scratch_url)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO users (email, hashed_password, full_name, is_admin)"
                " VALUES ('legacy@x.com', 'h', 'Legacy', 0)"
            )
        )
        conn.execute(
            text("INSERT INTO deals (deal_id, name) VALUES ('legacy_deal', 'Legacy Deal')")
        )
        conn.execute(
            text("INSERT INTO managers (manager_id, name) VALUES ('legacy_mgr', 'Legacy GP')")
        )
    engine.dispose()

    command.upgrade(cfg, "head")

    engine = create_engine(scratch_url)
    try:
        with engine.connect() as conn:
            tenant = conn.execute(
                text("SELECT tenant_id FROM tenants WHERE tenant_id = :t"),
                {"t": DEFAULT_TENANT},
            ).scalar()
            assert tenant == DEFAULT_TENANT
            for table, key, value in [
                ("users", "email", "legacy@x.com"),
                ("deals", "deal_id", "legacy_deal"),
                ("managers", "manager_id", "legacy_mgr"),
            ]:
                row_tenant = conn.execute(
                    text(f"SELECT tenant_id FROM {table} WHERE {key} = :v"),
                    {"v": value},
                ).scalar()
                assert row_tenant == DEFAULT_TENANT, f"{table} not backfilled"
    finally:
        engine.dispose()


def test_new_rows_default_to_default_tenant(clear_store):
    user = create_user(email="t@x.com", password="pw")
    deal = deal_store.create_deal(
        DealCreate(deal_id="tenant_deal", name="Tenant Deal")
    )

    db = SessionLocal()
    try:
        user_tenant = db.execute(
            text("SELECT tenant_id FROM users WHERE id = :i"), {"i": user.id}
        ).scalar()
        deal_tenant = db.execute(
            text("SELECT tenant_id FROM deals WHERE deal_id = 'tenant_deal'")
        ).scalar()
    finally:
        db.close()
    assert user_tenant == DEFAULT_TENANT
    assert deal_tenant == DEFAULT_TENANT
