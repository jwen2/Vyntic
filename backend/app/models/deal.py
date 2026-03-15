from pydantic import BaseModel


class Deal(BaseModel):
    deal_id: str
    name: str
    description: str = ""
    document_count: int = 0


class DealCreate(BaseModel):
    deal_id: str
    name: str
    description: str = ""
