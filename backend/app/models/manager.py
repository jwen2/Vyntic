"""Pydantic schemas for managers (GP firms) and positions (the LP's
commitment in a fund). Part of the Manager → Fund → Position object model."""
from pydantic import BaseModel


class Manager(BaseModel):
    manager_id: str
    name: str
    description: str = ""
    tags: list[str] = []
    fund_count: int = 0


class ManagerCreate(BaseModel):
    manager_id: str
    name: str
    description: str = ""
    tags: list[str] = []


class ManagerUpdate(BaseModel):
    """Partial update — only provided fields are changed."""
    name: str | None = None
    description: str | None = None
    tags: list[str] | None = None


class Position(BaseModel):
    deal_id: str
    commitment_amount: float | None = None
    currency: str = "USD"
    opening_called: float | None = None
    opening_distributed: float | None = None
    called_amount: float | None = None
    distributed_amount: float | None = None
    nav: float | None = None
    as_of: str | None = None
    status: str = "active"
    # True when at least one confirmed/paid notice exists — the UI then renders
    # called/distributed as computed (opening + notices) rather than editable.
    has_notices: bool = False


class PositionUpsert(BaseModel):
    """Partial upsert — only provided fields are changed."""
    commitment_amount: float | None = None
    currency: str | None = None
    opening_called: float | None = None
    opening_distributed: float | None = None
    called_amount: float | None = None
    distributed_amount: float | None = None
    nav: float | None = None
    as_of: str | None = None
    status: str | None = None
