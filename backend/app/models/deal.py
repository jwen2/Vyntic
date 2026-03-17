from pydantic import BaseModel


DEAL_STAGES = ["Screening", "Due Diligence", "IC Review", "Closed"]

SECTOR_TAGS = [
    "Technology", "Healthcare", "Industrials", "Consumer",
    "Financial Services", "Energy", "Real Estate", "Infrastructure",
]


class Deal(BaseModel):
    deal_id: str
    name: str
    description: str = ""
    document_count: int = 0
    stage: str = "Screening"
    tags: list[str] = []


class DealCreate(BaseModel):
    deal_id: str
    name: str
    description: str = ""
    stage: str = "Screening"
    tags: list[str] = []


class DealUpdate(BaseModel):
    """Partial update — only provided fields are changed."""
    name: str | None = None
    description: str | None = None
    stage: str | None = None
    tags: list[str] | None = None
