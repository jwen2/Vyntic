from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Google Gemini LLM
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.1-flash-lite-preview"
    gemini_fallback_model: str = "gemini-3-flash-preview"

    # Gemini Embeddings
    embedding_model: str = "models/gemini-embedding-001"
    embedding_dim: int = 3072

    # Database
    database_url: str = "sqlite:///./data/vyntic.db"

    # Authentication
    jwt_secret_key: str = "CHANGE-ME-in-production-use-a-real-secret"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24 hours
    default_admin_email: str = "admin@vyntic.com"
    default_admin_password: str = "admin"

    # File storage
    uploads_dir: str = "./data/uploads"

    # ChromaDB
    chroma_persist_dir: str = "./data/chroma"

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
