"""
Shared test fixtures for Vyntic backend tests.
Uses an in-memory SQLite database for isolation between tests.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import Base, engine, SessionLocal
from app.services import deal_store
from app.models.deal import DealCreate


@pytest.fixture(autouse=True)
def clear_store():
    """Reset the database between tests by dropping and recreating all tables."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


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
