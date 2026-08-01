from typing import Literal

from pydantic import BaseModel


class Citation(BaseModel):
    source_file: str
    page: int
    text_snippet: str
    deal_id: str | None = None
    kind: Literal["extracted", "derived"] = "extracted"
    span_label: str | None = None


class QueryRequest(BaseModel):
    question: str


class QueryResponse(BaseModel):
    deal_id: str
    question: str
    answer: str
    citations: list[Citation | None]
    # Documents the allocator left out of the context, by doc_id. Empty
    # whenever the whole corpus fit — which is the normal case.
    excluded_docs: list[str] = []
