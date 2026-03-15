"""
Simple in-memory deal registry. For PoC only — swap to SQLite/Postgres for production.
"""
from app.models.deal import Deal, DealCreate

_deals: dict[str, Deal] = {}


def create_deal(data: DealCreate) -> Deal:
    if data.deal_id in _deals:
        raise ValueError(f"Deal '{data.deal_id}' already exists")
    deal = Deal(
        deal_id=data.deal_id,
        name=data.name,
        description=data.description,
        document_count=0,
    )
    _deals[data.deal_id] = deal
    return deal


def get_deal(deal_id: str) -> Deal | None:
    return _deals.get(deal_id)


def list_deals() -> list[Deal]:
    return list(_deals.values())


def increment_doc_count(deal_id: str, count: int = 1):
    if deal_id in _deals:
        _deals[deal_id].document_count += count


def delete_deal(deal_id: str) -> bool:
    return _deals.pop(deal_id, None) is not None
