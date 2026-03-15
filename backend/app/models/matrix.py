from pydantic import BaseModel
from app.models.query import Citation


class CellData(BaseModel):
    answer: str
    citations: list[Citation]
    status: str = "complete"  # pending | loading | complete | error


class MatrixRequest(BaseModel):
    deal_ids: list[str]
    queries: list[str]


class MatrixResponse(BaseModel):
    cells: dict[str, dict[str, CellData]]  # cells[deal_id][query] = CellData
