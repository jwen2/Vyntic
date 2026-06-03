from app.models.document import DocumentMetadata
from app.services import deal_store


def test_add_document_recomputes_document_count(sample_deal):
    deal_store.add_document(
        sample_deal.deal_id,
        DocumentMetadata(
            doc_id="doc-a",
            deal_id=sample_deal.deal_id,
            filename="a.pdf",
            page_count=3,
            chunk_count=8,
        ),
    )
    deal_store.add_document(
        sample_deal.deal_id,
        DocumentMetadata(
            doc_id="doc-b",
            deal_id=sample_deal.deal_id,
            filename="b.pdf",
            page_count=4,
            chunk_count=10,
        ),
    )

    assert deal_store.get_deal(sample_deal.deal_id).document_count == 2


def test_add_document_is_idempotent_by_filename(sample_deal):
    deal_store.add_document(
        sample_deal.deal_id,
        DocumentMetadata(
            doc_id="old-doc",
            deal_id=sample_deal.deal_id,
            filename="same.pdf",
            page_count=1,
            chunk_count=2,
        ),
    )
    deal_store.add_document(
        sample_deal.deal_id,
        DocumentMetadata(
            doc_id="new-doc",
            deal_id=sample_deal.deal_id,
            filename="same.pdf",
            page_count=5,
            chunk_count=12,
        ),
    )

    docs = deal_store.list_documents(sample_deal.deal_id)
    assert deal_store.get_deal(sample_deal.deal_id).document_count == 1
    assert len(docs) == 1
    assert docs[0].doc_id == "new-doc"
    assert docs[0].page_count == 5
    assert docs[0].chunk_count == 12


def test_add_document_writes_full_text_md(sample_deal):
    from app.models.document import DocumentMetadata
    from app.services import deal_store
    from app.database import SessionLocal, DocumentRow

    deal_store.add_document(
        sample_deal.deal_id,
        DocumentMetadata(
            doc_id="doc-ft",
            deal_id=sample_deal.deal_id,
            filename="report.pdf",
            page_count=3,
            chunk_count=0,
            full_text_md="## Page 1\n\nSome content.",
            parse_tier=1,
        ),
    )

    db = SessionLocal()
    try:
        row = db.query(DocumentRow).filter(DocumentRow.doc_id == "doc-ft").first()
        assert row is not None
        assert row.full_text_md == "## Page 1\n\nSome content."
        assert row.parse_tier == 1
    finally:
        db.close()


def test_add_document_defaults_parse_tier_to_1(sample_deal):
    from app.models.document import DocumentMetadata
    from app.services import deal_store
    from app.database import SessionLocal, DocumentRow

    deal_store.add_document(
        sample_deal.deal_id,
        DocumentMetadata(
            doc_id="doc-def",
            deal_id=sample_deal.deal_id,
            filename="plain.pdf",
            page_count=1,
            chunk_count=0,
        ),
    )

    db = SessionLocal()
    try:
        row = db.query(DocumentRow).filter(DocumentRow.doc_id == "doc-def").first()
        assert row.parse_tier == 1
    finally:
        db.close()
