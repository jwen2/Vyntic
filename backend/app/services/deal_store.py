"""
SQLite-backed deal and document store using SQLAlchemy.
Replaces the previous in-memory dict implementation so that
deals and documents survive container restarts.
"""
import json
from app.models.deal import Deal, DealCreate, DealUpdate
from app.models.document import DocumentMetadata
from app.database import SessionLocal, DealRow, DocumentRow


def create_deal(data: DealCreate) -> Deal:
    db = SessionLocal()
    try:
        existing = db.query(DealRow).filter(DealRow.deal_id == data.deal_id).first()
        if existing:
            raise ValueError(f"Deal '{data.deal_id}' already exists")
        row = DealRow(
            deal_id=data.deal_id,
            name=data.name,
            description=data.description,
            document_count=0,
            stage=data.stage,
            tags_json=json.dumps(data.tags),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return _row_to_deal(row)
    finally:
        db.close()


def get_deal(deal_id: str) -> Deal | None:
    db = SessionLocal()
    try:
        row = db.query(DealRow).filter(DealRow.deal_id == deal_id).first()
        if not row:
            return None
        return _row_to_deal(row)
    finally:
        db.close()


def list_deals() -> list[Deal]:
    db = SessionLocal()
    try:
        rows = db.query(DealRow).all()
        return [_row_to_deal(r) for r in rows]
    finally:
        db.close()


def update_deal(deal_id: str, data: DealUpdate) -> Deal | None:
    db = SessionLocal()
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
        db.commit()
        db.refresh(row)
        return _row_to_deal(row)
    finally:
        db.close()


def increment_doc_count(deal_id: str, count: int = 1):
    db = SessionLocal()
    try:
        row = db.query(DealRow).filter(DealRow.deal_id == deal_id).first()
        if row:
            row.document_count = (row.document_count or 0) + count
            db.commit()
    finally:
        db.close()


def add_document(deal_id: str, doc: DocumentMetadata):
    db = SessionLocal()
    try:
        row = DocumentRow(
            doc_id=doc.doc_id,
            deal_id=deal_id,
            filename=doc.filename,
            page_count=doc.page_count,
            chunk_count=doc.chunk_count,
        )
        db.add(row)
        db.commit()
    finally:
        db.close()


def list_documents(deal_id: str) -> list[DocumentMetadata]:
    db = SessionLocal()
    try:
        rows = db.query(DocumentRow).filter(DocumentRow.deal_id == deal_id).all()
        return [
            DocumentMetadata(
                doc_id=r.doc_id,
                deal_id=r.deal_id,
                filename=r.filename,
                page_count=r.page_count,
                chunk_count=r.chunk_count,
            )
            for r in rows
        ]
    finally:
        db.close()


def delete_document(deal_id: str, doc_id: str) -> bool:
    db = SessionLocal()
    try:
        row = db.query(DocumentRow).filter(
            DocumentRow.doc_id == doc_id,
            DocumentRow.deal_id == deal_id,
        ).first()
        if not row:
            return False
        db.delete(row)
        # Decrement deal doc count
        deal_row = db.query(DealRow).filter(DealRow.deal_id == deal_id).first()
        if deal_row:
            deal_row.document_count = max(0, (deal_row.document_count or 0) - 1)
        db.commit()
        return True
    finally:
        db.close()


def delete_deal(deal_id: str) -> bool:
    db = SessionLocal()
    try:
        row = db.query(DealRow).filter(DealRow.deal_id == deal_id).first()
        if not row:
            return False
        # Documents cascade-deleted via FK relationship
        db.delete(row)
        db.commit()
        return True
    finally:
        db.close()


def _row_to_deal(row: DealRow) -> Deal:
    return Deal(
        deal_id=row.deal_id,
        name=row.name,
        description=row.description or "",
        document_count=row.document_count or 0,
        stage=row.stage or "Screening",
        tags=json.loads(row.tags_json) if row.tags_json else [],
    )
