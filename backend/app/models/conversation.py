from pydantic import BaseModel


class ConversationEntry(BaseModel):
    id: str
    deal_id: str
    question: str
    answer: str
    citations: list[dict | None] = []
    workstream: str = ""
    created_at: str


class ConversationCreate(BaseModel):
    deal_id: str
    question: str
    answer: str
    citations: list[dict | None] = []
    workstream: str = ""
