"""
Embedding service using Google Gemini's text-embedding-004 model.
Falls back to hash-based mock if the Gemini API is unreachable.
"""
import asyncio
import google.generativeai as genai
from app.config import settings

# Configure the Gemini client once at module load
if settings.gemini_api_key:
    genai.configure(api_key=settings.gemini_api_key)

# Timeout per embedding call (seconds)
EMBED_TIMEOUT = 30


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a list of texts using Google Gemini."""
    all_embeddings = []

    for text in texts:
        try:
            # Run sync call in thread pool with timeout
            result = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda t=text: genai.embed_content(
                        model=settings.embedding_model,
                        content=t,
                    ),
                ),
                timeout=EMBED_TIMEOUT,
            )
            all_embeddings.append(result["embedding"])
        except asyncio.TimeoutError:
            print(f"Gemini embedding timeout after {EMBED_TIMEOUT}s, using mock")
            all_embeddings.append(_mock_single(text))
        except Exception as e:
            print(f"Gemini embedding error, using mock: {e}")
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
