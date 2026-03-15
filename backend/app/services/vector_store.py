"""
Vector store using ChromaDB with collection-per-deal isolation.
Each deal_id maps to a separate ChromaDB collection, ensuring
zero context leak between deals (equivalent to Pinecone namespaces).
"""
from __future__ import annotations
from typing import Optional

import chromadb
from app.config import settings
from app.models.document import Chunk
from app.services.embedder import embed_texts, embed_query

_client: Optional[chromadb.PersistentClient] = None


def _get_client() -> chromadb.PersistentClient:
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
    return _client


def _get_collection(deal_id: str) -> chromadb.Collection:
    """Get or create a collection for a deal. Collection name = deal_id."""
    client = _get_client()
    safe_name = deal_id.replace(" ", "_").lower()
    return client.get_or_create_collection(
        name=safe_name,
        metadata={"hnsw:space": "cosine"},
    )


async def upsert_chunks(deal_id: str, chunks: list[Chunk]) -> int:
    """
    Embed and upsert chunks into the deal's collection.
    ISOLATION: Only writes to the deal_id's collection.
    Returns count upserted.
    """
    if not chunks:
        return 0

    texts = [c.content for c in chunks]
    embeddings = await embed_texts(texts)

    collection = _get_collection(deal_id)

    ids = []
    documents = []
    metadatas = []

    for chunk, embedding in zip(chunks, embeddings):
        ids.append(chunk.chunk_id)
        documents.append(chunk.content)
        metadatas.append({
            "deal_id": chunk.deal_id,
            "doc_id": chunk.doc_id,
            "source_file": chunk.source_file,
            "page": chunk.page,
            "section_type": chunk.section_type,
            "chunk_index": chunk.chunk_index,
        })

    # Upsert in batches of 500 (ChromaDB batch limit)
    batch_size = 500
    total = 0
    for i in range(0, len(ids), batch_size):
        end = i + batch_size
        collection.add(
            ids=ids[i:end],
            embeddings=embeddings[i:end],
            documents=documents[i:end],
            metadatas=metadatas[i:end],
        )
        total += len(ids[i:end])

    return total


async def query_deal(deal_id: str, query_text: str, top_k: int = None) -> list[dict]:
    """
    Query vectors within a single deal's collection.
    Returns list of {content, source_file, page, section_type, score}.
    CRITICAL: collection isolation ensures zero context leak between deals.
    """
    if top_k is None:
        top_k = settings.top_k

    collection = _get_collection(deal_id)

    # Check collection has documents
    if collection.count() == 0:
        return []

    query_embedding = await embed_query(query_text)

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, collection.count()),
        include=["documents", "metadatas", "distances"],
    )

    retrieved = []
    if results and results["documents"] and results["documents"][0]:
        for doc, meta, distance in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            retrieved.append({
                "content": doc,
                "source_file": meta.get("source_file", ""),
                "page": meta.get("page", 0),
                "section_type": meta.get("section_type", "text"),
                "score": 1 - distance,  # Convert distance to similarity
            })

    return retrieved


async def delete_deal_vectors(deal_id: str):
    """Delete all vectors in a deal's collection."""
    client = _get_client()
    safe_name = deal_id.replace(" ", "_").lower()
    try:
        client.delete_collection(name=safe_name)
    except ValueError:
        pass  # Collection doesn't exist
