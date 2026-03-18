from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Ollama LLM
    ollama_base_url: str = "http://ollama:11434"
    ollama_model: str = "deepseek-r1:8b"

    # Ollama Embeddings
    embedding_model: str = "nomic-embed-text"
    embedding_dim: int = 768

    # Database (SQLite for PoC; swap to postgresql:// for production)
    database_url: str = "sqlite:////app/data/spokematrix.db"

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
