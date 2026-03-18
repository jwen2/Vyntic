"""
Deal registry backed by SQLite via SQLAlchemy.
Same public API as the previous in-memory version — all callers are unchanged.
Swap database_url to PostgreSQL for production.
"""
from app.models.deal import Deal, DealCreate, DealUpdate
from app.models.document import DocumentMetadata
from app.database import get_db, DealRow, DocumentRow


def create_deal(data: DealCreate) -> Deal:
    db = get_db()
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
        )
        row.tags = data.tags
        db.add(row)
        db.commit()
        db.refresh(row)
        return _row_to_deal(row)
    finally:
        db.close()


def get_deal(deal_id: str) -> Deal | None:
    db = get_db()
    try:
        row = db.query(DealRow).filter(DealRow.deal_id == deal_id).first()
        return _row_to_deal(row) if row else None
    finally:
        db.close()


def list_deals() -> list[Deal]:
    db = get_db()
    try:
        rows = db.query(DealRow).all()
        return [_row_to_deal(r) for r in rows]
    finally:
        db.close()


def update_deal(deal_id: str, data: DealUpdate) -> Deal | None:
    db = get_db()
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
            row.tags = data.tags
        db.commit()
        db.refresh(row)
        return _row_to_deal(row)
    finally:
        db.close()


def increment_doc_count(deal_id: str, count: int = 1):
    db = get_db()
    try:
        row = db.query(DealRow).filter(DealRow.deal_id == deal_id).first()
        if row:
            row.document_count += count
            db.commit()
    finally:
        db.close()


def add_document(deal_id: str, doc: DocumentMetadata):
    db = get_db()
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
    db = get_db()
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


def delete_deal(deal_id: str) -> bool:
    db = get_db()
    try:
        row = db.query(DealRow).filter(DealRow.deal_id == deal_id).first()
        if not row:
            return False
        db.delete(row)  # Cascade deletes documents
        db.commit()
        return True
    finally:
        db.close()


def _row_to_deal(row: DealRow) -> Deal:
    """Convert a SQLAlchemy row to a Pydantic Deal model."""
    return Deal(
        deal_id=row.deal_id,
        name=row.name,
        description=row.description or "",
        document_count=row.document_count or 0,
        stage=row.stage or "Screening",
        tags=row.tags,
    )
