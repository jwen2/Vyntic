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
    internal_api_token: str = "CHANGE-ME-in-production-use-a-random-internal-token"
    default_admin_email: str = "admin@vyntic.com"
    default_admin_password: str = "admin"

    # File storage
    uploads_dir: str = "./data/uploads"

    # Docling parsing
    docling_subprocess_enabled: bool = True
    docling_timeout_seconds: int = 180
    docling_num_threads: int = 1
    docling_device: str = "cpu"
    docling_ocr_enabled: bool = False
    docling_page_batch_size: int = 10
    docling_queue_max_size: int = 2
    docling_worker_grace_seconds: int = 30
    docling_max_concurrent_jobs: int = 1
    ingest_background_min_pages: int = 25

    # ChromaDB
    chroma_persist_dir: str = "./data/chroma"

    # Embeddings
    embedding_batch_size: int = 64

    # Chunking
    chunk_size: int = 1000
    chunk_overlap_ratio: float = 0.2
    chunk_overlap: int = 200

    # Retrieval
    top_k: int = 20

    # LLM
    max_tokens: int = 4096

    # Concurrency
    max_concurrent_llm_calls: int = 3

    # Feature flags
    agentic_features: bool = False
    seed_sample_data: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
