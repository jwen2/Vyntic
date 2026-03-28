"""
Pydantic schemas for IC Report generation.
"""
from pydantic import BaseModel


class ReportCitation(BaseModel):
    source_file: str
    page: int
    text_snippet: str


class ReportQuestion(BaseModel):
    label: str
    question: str
    answer: str
    citations: list[ReportCitation]


class ReportWorkstream(BaseModel):
    workstream_id: str  # financial | commercial | operational | legal | risk
    workstream_name: str
    questions: list[ReportQuestion]


class ReportDeal(BaseModel):
    deal_id: str
    name: str
    stage: str = ""
    tags: list[str] = []
    document_count: int = 0
    workstreams: list[ReportWorkstream]


class ICReportRequest(BaseModel):
    title: str = "Investment Committee Report"
    deals: list[ReportDeal]
