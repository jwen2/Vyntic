"""
SQLite-backed deal and document store using SQLAlchemy.
Replaces the previous in-memory dict implementation so that
deals and documents survive container restarts.
"""
import json
from sqlalchemy.orm import load_only
from app.models.deal import Deal, DealCreate, DealUpdate
from app.models.document import DocumentMetadata
from datetime import datetime

from app.database import current_session, DealRow, DocumentRow, ManagerRow, DEFAULT_TENANT_ID


class LegalHoldError(Exception):
    """Raised when a delete targets a deal under legal hold."""


def create_deal(data: DealCreate, tenant_id: str = DEFAULT_TENANT_ID) -> Deal:
    db, owned = current_session()
    try:
        existing = db.query(DealRow).filter(DealRow.deal_id == data.deal_id).first()
        if existing:
            raise ValueError(f"Deal '{data.deal_id}' already exists")
        row = DealRow(
            deal_id=data.deal_id,
            tenant_id=tenant_id,
            name=data.name,
            description=data.description,
            document_count=0,
            stage=data.stage,
            tags_json=json.dumps(data.tags),
            entity_type=data.entity_type,
            manager_id=data.manager_id,
            vintage=data.vintage,
            strategy=data.strategy,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return _row_to_deal(row, manager_name=_manager_name(db, row.manager_id))
    finally:
        if owned:
            db.close()


def get_deal(deal_id: str) -> Deal | None:
    db, owned = current_session()
    try:
        row = db.query(DealRow).filter(
            DealRow.deal_id == deal_id, DealRow.deleted_at.is_(None)
        ).first()
        if not row:
            return None
        return _row_to_deal(row, manager_name=_manager_name(db, row.manager_id))
    finally:
        if owned:
            db.close()


def list_deals(tenant_id: str | None = None) -> list[Deal]:
    """List deals, filtered to one tenant when given. None (internal/seed
    callers) lists across tenants — routes must always pass the user's
    tenant."""
    db, owned = current_session()
    try:
        q = db.query(DealRow).filter(DealRow.deleted_at.is_(None))
        if tenant_id is not None:
            q = q.filter(DealRow.tenant_id == tenant_id)
        rows = q.all()
        manager_names = dict(db.query(ManagerRow.manager_id, ManagerRow.name).all())
        return [
            _row_to_deal(r, manager_name=manager_names.get(r.manager_id))
            for r in rows
        ]
    finally:
        if owned:
            db.close()


def update_deal(deal_id: str, data: DealUpdate) -> Deal | None:
    db, owned = current_session()
    try:
        row = db.query(DealRow).filter(DealRow.deal_id == deal_id).first()
        if not row:
            return None
        if data.name is not None:
            row.name = data.name
        if data.description is not None:
            row.description = data.description
        if data.stage is not None:
            row.stage = data.stage
        if data.tags is not None:
            row.tags_json = json.dumps(data.tags)
        if data.manager_id is not None:
            row.manager_id = data.manager_id
        if data.vintage is not None:
            row.vintage = data.vintage
        if data.strategy is not None:
            row.strategy = data.strategy
        db.commit()
        db.refresh(row)
        return _row_to_deal(row, manager_name=_manager_name(db, row.manager_id))
    finally:
        if owned:
            db.close()


def increment_doc_count(deal_id: str, count: int = 1):
    db, owned = current_session()
    try:
        row = db.query(DealRow).filter(DealRow.deal_id == deal_id).first()
        if row:
            row.document_count = (row.document_count or 0) + count
            db.commit()
    finally:
        if owned:
            db.close()


def add_document(deal_id: str, doc: DocumentMetadata):
    db, owned = current_session()
    try:
        row = db.query(DocumentRow).filter(
            DocumentRow.deal_id == deal_id,
            DocumentRow.filename == doc.filename,
            DocumentRow.deleted_at.is_(None),
        ).first()
        if row:
            row.doc_id = doc.doc_id
            row.page_count = doc.page_count
            row.chunk_count = doc.chunk_count
            row.full_text_md = doc.full_text_md
            row.parse_tier = doc.parse_tier
            row.doc_category = doc.doc_category
            row.period = doc.period
            row.scope = doc.scope
        else:
            row = DocumentRow(
                doc_id=doc.doc_id,
                deal_id=deal_id,
                filename=doc.filename,
                page_count=doc.page_count,
                chunk_count=doc.chunk_count,
                full_text_md=doc.full_text_md,
                parse_tier=doc.parse_tier,
                doc_category=doc.doc_category,
                period=doc.period,
                scope=doc.scope,
            )
            db.add(row)

        db.flush()
        deal_row = db.query(DealRow).filter(DealRow.deal_id == deal_id).first()
        if deal_row:
            deal_row.document_count = db.query(DocumentRow).filter(
                DocumentRow.deal_id == deal_id,
                DocumentRow.deleted_at.is_(None),
            ).count()
        db.commit()
    finally:
        if owned:
            db.close()


def document_exists(deal_id: str, filename: str) -> bool:
    db, owned = current_session()
    try:
        return db.query(DocumentRow).filter(
            DocumentRow.deal_id == deal_id,
            DocumentRow.filename == filename,
            DocumentRow.deleted_at.is_(None),
        ).first() is not None
    finally:
        if owned:
            db.close()


def list_documents(deal_id: str) -> list[DocumentMetadata]:
    db, owned = current_session()
    try:
        rows = db.query(DocumentRow).options(
            load_only(
                DocumentRow.doc_id,
                DocumentRow.deal_id,
                DocumentRow.filename,
                DocumentRow.page_count,
                DocumentRow.chunk_count,
                DocumentRow.parse_tier,
                DocumentRow.doc_category,
                DocumentRow.period,
                DocumentRow.scope,
            )
        ).filter(
            DocumentRow.deal_id == deal_id, DocumentRow.deleted_at.is_(None)
        ).all()
        return [_doc_row_to_metadata(r) for r in rows]
    finally:
        if owned:
            db.close()


def list_manager_documents(manager_id: str) -> list[DocumentMetadata]:
    """All manager-scoped documents across the manager's funds."""
    db, owned = current_session()
    try:
        rows = (
            db.query(DocumentRow)
            .join(DealRow, DocumentRow.deal_id == DealRow.deal_id)
            .filter(
                DealRow.manager_id == manager_id,
                DealRow.deleted_at.is_(None),
                DocumentRow.scope == "manager",
                DocumentRow.deleted_at.is_(None),
            )
            .all()
        )
        return [_doc_row_to_metadata(r) for r in rows]
    finally:
        if owned:
            db.close()


def update_document_metadata(
    deal_id: str,
    doc_id: str,
    doc_category: str | None = None,
    period: str | None = None,
    scope: str | None = None,
) -> DocumentMetadata | None:
    """Reclassify a document (category / period / scope). Returns None if missing."""
    db, owned = current_session()
    try:
        row = db.query(DocumentRow).filter(
            DocumentRow.doc_id == doc_id,
            DocumentRow.deal_id == deal_id,
        ).first()
        if not row:
            return None
        if doc_category is not None:
            row.doc_category = doc_category
        if period is not None:
            row.period = period or None  # empty string clears the period
        if scope is not None:
            row.scope = scope
        db.commit()
        db.refresh(row)
        return _doc_row_to_metadata(row)
    finally:
        if owned:
            db.close()


def delete_document(deal_id: str, doc_id: str) -> bool:
    """Soft-delete a document (C1). Files and vectors stay for the
    retention window; purge_expired removes them. Refuses when the deal
    is under legal hold."""
    db, owned = current_session()
    try:
        row = db.query(DocumentRow).filter(
            DocumentRow.doc_id == doc_id,
            DocumentRow.deal_id == deal_id,
            DocumentRow.deleted_at.is_(None),
        ).first()
        if not row:
            return False
        deal_row = db.query(DealRow).filter(DealRow.deal_id == deal_id).first()
        if deal_row and deal_row.legal_hold:
            raise LegalHoldError(f"Deal '{deal_id}' is under legal hold")
        row.deleted_at = datetime.utcnow()
        if deal_row:
            deal_row.document_count = max(0, (deal_row.document_count or 0) - 1)
        db.commit()
        return True
    finally:
        if owned:
            db.close()


def delete_deal(deal_id: str) -> bool:
    """Soft-delete a deal (C1). The row, its documents, files, and vectors
    survive until the retention purge. Refuses under legal hold."""
    db, owned = current_session()
    try:
        row = db.query(DealRow).filter(
            DealRow.deal_id == deal_id, DealRow.deleted_at.is_(None)
        ).first()
        if not row:
            return False
        if row.legal_hold:
            raise LegalHoldError(f"Deal '{deal_id}' is under legal hold")
        row.deleted_at = datetime.utcnow()
        db.commit()
        return True
    finally:
        if owned:
            db.close()


def set_legal_hold(deal_id: str, on: bool) -> bool:
    """Set/release the legal hold on a deal. Works on soft-deleted deals
    too (a hold placed after deletion must still block the purge)."""
    db, owned = current_session()
    try:
        row = db.query(DealRow).filter(DealRow.deal_id == deal_id).first()
        if not row:
            return False
        row.legal_hold = on
        db.commit()
        return True
    finally:
        if owned:
            db.close()


def _manager_name(db, manager_id: str | None) -> str | None:
    if not manager_id:
        return None
    row = db.query(ManagerRow.name).filter(ManagerRow.manager_id == manager_id).first()
    return row[0] if row else None


def _row_to_deal(row: DealRow, manager_name: str | None = None) -> Deal:
    return Deal(
        deal_id=row.deal_id,
        name=row.name,
        description=row.description or "",
        document_count=row.document_count or 0,
        stage=row.stage or "Screening",
        tags=json.loads(row.tags_json) if row.tags_json else [],
        entity_type=row.entity_type or "deal",
        manager_id=row.manager_id,
        manager_name=manager_name,
        vintage=row.vintage,
        strategy=row.strategy or "",
    )


def _doc_row_to_metadata(row: DocumentRow) -> DocumentMetadata:
    return DocumentMetadata(
        doc_id=row.doc_id,
        deal_id=row.deal_id,
        filename=row.filename,
        page_count=row.page_count,
        chunk_count=row.chunk_count,
        doc_category=row.doc_category or "other",
        period=row.period,
        scope=row.scope or "entity",
    )
