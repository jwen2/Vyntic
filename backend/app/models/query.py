from pydantic import BaseModel


class Citation(BaseModel):
    source_file: str
    page: int
    text_snippet: str
    deal_id: str | None = None


class QueryRequest(BaseModel):
    question: str


class QueryResponse(BaseModel):
    deal_id: str
    question: str
    answer: str
    citations: list[Citation]
