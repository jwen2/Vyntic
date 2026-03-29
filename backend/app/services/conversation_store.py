"""
In-memory conversation history store. Matches the deal_store.py pattern.
"""
import uuid
from datetime import datetime, timezone

from app.models.conversation import ConversationEntry, ConversationCreate

_conversations: dict[str, list[ConversationEntry]] = {}


def save_entry(data: ConversationCreate) -> ConversationEntry:
    entry = ConversationEntry(
        id=uuid.uuid4().hex,
        deal_id=data.deal_id,
        question=data.question,
        answer=data.answer,
        citations=data.citations,
        workstream=data.workstream,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    _conversations.setdefault(data.deal_id, []).append(entry)
    return entry


def list_entries(deal_id: str, workstream: str | None = None) -> list[ConversationEntry]:
    entries = _conversations.get(deal_id, [])
    if workstream:
        entries = [e for e in entries if e.workstream == workstream]
    return sorted(entries, key=lambda e: e.created_at, reverse=True)


def delete_entries(deal_id: str):
    _conversations.pop(deal_id, None)
