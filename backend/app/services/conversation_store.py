"""
Conversation history store, table-backed (Plan 4 C3). Previously an
in-process dict — lost on restart and not multi-worker safe. Matches the
deal_store session pattern.
"""
import json
import uuid
from datetime import datetime

from app.database import current_session, ConversationRow
from app.models.conversation import ConversationEntry, ConversationCreate


def _row_to_entry(row: ConversationRow) -> ConversationEntry:
    try:
        citations = json.loads(row.citations_json) if row.citations_json else []
    except (TypeError, ValueError):
        citations = []
    return ConversationEntry(
        id=row.id,
        deal_id=row.deal_id,
        question=row.question,
        answer=row.answer or "",
        citations=citations if isinstance(citations, list) else [],
        workstream=row.workstream or "",
        created_at=row.created_at.isoformat() if row.created_at else "",
    )


def save_entry(data: ConversationCreate) -> ConversationEntry:
    db, owned = current_session()
    try:
        row = ConversationRow(
            id=uuid.uuid4().hex,
            deal_id=data.deal_id,
            question=data.question,
            answer=data.answer,
            citations_json=json.dumps(data.citations),
            workstream=data.workstream,
            created_at=datetime.utcnow(),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return _row_to_entry(row)
    finally:
        if owned:
            db.close()


def list_entries(deal_id: str, workstream: str | None = None) -> list[ConversationEntry]:
    db, owned = current_session()
    try:
        q = db.query(ConversationRow).filter(ConversationRow.deal_id == deal_id)
        if workstream:
            q = q.filter(ConversationRow.workstream == workstream)
        rows = q.order_by(
            ConversationRow.created_at.desc(), ConversationRow.id.desc()
        ).all()
        return [_row_to_entry(r) for r in rows]
    finally:
        if owned:
            db.close()


def delete_entries(deal_id: str):
    db, owned = current_session()
    try:
        db.query(ConversationRow).filter(ConversationRow.deal_id == deal_id).delete()
        db.commit()
    finally:
        if owned:
            db.close()
