"""
Shared test fixtures for Vyntic backend tests.
Uses a scratch SQLite database, reset between tests.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth import create_access_token, create_user, grant_deal_access
from app.database import Base, engine, SessionLocal, TenantRow, DEFAULT_TENANT_ID
from app.services import deal_store
from app.models.deal import DealCreate


def _seed_default_tenant():
    """create_all builds the schema but not the default tenant row the
    migration inserts — every tenant_id FK needs it."""
    db = SessionLocal()
    try:
        db.merge(TenantRow(tenant_id=DEFAULT_TENANT_ID, name="Default Tenant"))
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def clear_store():
    """Reset the database between tests by dropping and recreating all tables.
    Also resets the in-process rate limiter so auth tests that log in
    repeatedly don't bleed 429s into each other."""
    from app.rate_limit import limiter

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    _seed_default_tenant()
    limiter.reset()
    yield
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    _seed_default_tenant()


def _client_for(user) -> TestClient:
    token = create_access_token({"sub": str(user.id)})
    c = TestClient(app)
    c.headers.update({"Authorization": f"Bearer {token}"})
    return c


@pytest.fixture
def admin_user(clear_store):
    return create_user(
        email="admin@test.com", password="pw", full_name="Admin", is_admin=True
    )


@pytest.fixture
def analyst_user(clear_store):
    return create_user(
        email="analyst@test.com", password="pw", full_name="Analyst", is_admin=False
    )


@pytest.fixture
def client(admin_user):
    """FastAPI test client authenticated as an admin."""
    return _client_for(admin_user)


@pytest.fixture
def analyst_client(analyst_user):
    """FastAPI test client authenticated as a non-admin analyst."""
    return _client_for(analyst_user)


@pytest.fixture
def grant_analyst_access(analyst_user):
    """Grant the analyst fixture access to a deal id."""

    def _grant(deal_id: str):
        grant_deal_access(analyst_user.id, deal_id, role="analyst")

    return _grant


@pytest.fixture
def sample_deal():
    """Create and return a sample deal."""
    data = DealCreate(
        deal_id="test_deal",
        name="Test Deal Corp",
        description="A test deal",
        stage="Screening",
        tags=["Technology"],
    )
    return deal_store.create_deal(data)


@pytest.fixture
def three_deals():
    """Create three sample deals for matrix tests."""
    deals = []
    for i, (name, stage, tag) in enumerate([
        ("Alpha Corp", "Screening", "Technology"),
        ("Beta Health", "Due Diligence", "Healthcare"),
        ("Gamma Mfg", "IC Review", "Industrials"),
    ]):
        d = deal_store.create_deal(DealCreate(
            deal_id=f"deal_{i}",
            name=name,
            description=f"Test deal {i}",
            stage=stage,
            tags=[tag],
        ))
        deals.append(d)
    return deals
