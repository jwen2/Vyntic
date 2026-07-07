from pydantic import BaseModel


class DocumentMetadata(BaseModel):
    doc_id: str
    deal_id: str
    filename: str
    page_count: int = 0
    chunk_count: int = 0
    full_text_md: str | None = None
    parse_tier: int = 1
    doc_category: str = "other"
    period: str | None = None
    scope: str = "entity"  # "entity" | "manager" (shared across the manager's funds)


class ParsedSection(BaseModel):
    content: str
    metadata: dict


class Chunk(BaseModel):
    chunk_id: str
    deal_id: str
    doc_id: str
    chunk_index: int
    content: str
    source_file: str
    page: int = 0
    section_type: str = "text"  # "text" or "table"
