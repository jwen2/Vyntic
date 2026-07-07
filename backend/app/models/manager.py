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
    called_amount: float | None = None
    distributed_amount: float | None = None
    nav: float | None = None
    as_of: str | None = None
    status: str = "active"


class PositionUpsert(BaseModel):
    """Partial upsert — only provided fields are changed."""
    commitment_amount: float | None = None
    currency: str | None = None
    called_amount: float | None = None
    distributed_amount: float | None = None
    nav: float | None = None
    as_of: str | None = None
    status: str | None = None
