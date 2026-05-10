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
