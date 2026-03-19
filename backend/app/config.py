from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Google Gemini LLM
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash-lite"
    gemini_fallback_model: str = "gemma-3-27b-it"

    # Gemini Embeddings
    embedding_model: str = "models/gemini-embedding-001"
    embedding_dim: int = 768

    # Database
    database_url: str = "sqlite:///./data/vyntic.db"

    # ChromaDB
    chroma_persist_dir: str = "/app/data/chroma"

    # Chunking
    chunk_size: int = 1000
    chunk_overlap: int = 200

    # Retrieval
    top_k: int = 8

    # LLM
    max_tokens: int = 4096

    # Concurrency
    max_concurrent_llm_calls: int = 3

    class Config:
        env_file = ".env"


settings = Settings()
