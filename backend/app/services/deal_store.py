"""
Simple in-memory deal registry. For PoC only — swap to SQLite/Postgres for production.
"""
from app.models.deal import Deal, DealCreate, DealUpdate
from app.models.document import DocumentMetadata

_deals: dict[str, Deal] = {}
_documents: dict[str, list[DocumentMetadata]] = {}


def create_deal(data: DealCreate) -> Deal:
    if data.deal_id in _deals:
        raise ValueError(f"Deal '{data.deal_id}' already exists")
    deal = Deal(
        deal_id=data.deal_id,
        name=data.name,
        description=data.description,
        document_count=0,
        stage=data.stage,
        tags=data.tags,
    )
    _deals[data.deal_id] = deal
    return deal


def get_deal(deal_id: str) -> Deal | None:
    return _deals.get(deal_id)


def list_deals() -> list[Deal]:
    return list(_deals.values())


def update_deal(deal_id: str, data: DealUpdate) -> Deal | None:
    deal = _deals.get(deal_id)
    if not deal:
        return None
    if data.name is not None:
        deal.name = data.name
    if data.description is not None:
        deal.description = data.description
    if data.stage is not None:
        deal.stage = data.stage
    if data.tags is not None:
        deal.tags = data.tags
    return deal


def increment_doc_count(deal_id: str, count: int = 1):
    if deal_id in _deals:
        _deals[deal_id].document_count += count


def add_document(deal_id: str, doc: DocumentMetadata):
    _documents.setdefault(deal_id, []).append(doc)


def list_documents(deal_id: str) -> list[DocumentMetadata]:
    return _documents.get(deal_id, [])


def delete_deal(deal_id: str) -> bool:
    _documents.pop(deal_id, None)
    return _deals.pop(deal_id, None) is not None
