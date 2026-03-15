"""
Embedding service using Ollama's local embedding models.
Uses nomic-embed-text by default (768 dimensions).
Falls back to hash-based mock if Ollama is unreachable.
"""
import httpx
from app.config import settings


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a list of texts using Ollama."""
    all_embeddings = []

    async with httpx.AsyncClient(timeout=60.0) as client:
        for text in texts:
            try:
                response = await client.post(
                    f"{settings.ollama_base_url}/api/embed",
                    json={
                        "model": settings.embedding_model,
                        "input": text,
                    },
                )
                response.raise_for_status()
                data = response.json()
                # Ollama returns {"embeddings": [[...]]}
                embedding = data["embeddings"][0]
                all_embeddings.append(embedding)
            except Exception as e:
                print(f"Ollama embedding error, using mock: {e}")
                all_embeddings.append(_mock_single(text))

    return all_embeddings


async def embed_query(query: str) -> list[float]:
    """Generate embedding for a single query."""
    embeddings = await embed_texts([query])
    return embeddings[0]


def _mock_single(text: str, dim: int = None) -> list[float]:
    """Generate a deterministic mock embedding for fallback."""
    import hashlib
    if dim is None:
        dim = settings.embedding_dim
    h = hashlib.sha256(text.encode()).digest()
    values = []
    for i in range(dim):
        byte_val = h[i % len(h)]
        values.append((byte_val / 255.0) * 2 - 1)
    return values
