from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Google Gemini LLM
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.1-flash-lite"
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
    seed_sample_data: bool = True
    full_context_mode: bool = True

    # Deployment environment: "development" | "production"
    environment: str = "development"

    # Comma-separated list of allowed browser origins for CORS.
    cors_origins: str = "http://localhost:3100,http://localhost:3200"

    # Explicit dev-only opt-in to run with the shipped default secrets.
    # Production must never set this.
    allow_insecure_defaults: bool = False

    class Config:
        env_file = ".env"


settings = Settings()


def assert_secure_secrets(s: Settings) -> None:
    """Refuse to run with shipped default credentials/secrets in any
    environment, unless ALLOW_INSECURE_DEFAULTS=true is set explicitly
    (local dev only). An unconfigured deploy must fail closed."""
    offenders = []
    if s.jwt_secret_key.startswith("CHANGE-ME"):
        offenders.append("JWT_SECRET_KEY")
    if s.default_admin_password == "admin":
        offenders.append("DEFAULT_ADMIN_PASSWORD")
    if offenders and not s.allow_insecure_defaults:
        raise RuntimeError(
            "Refusing to start with default secrets: "
            + ", ".join(offenders)
            + ". Set real values in the environment, or set "
            "ALLOW_INSECURE_DEFAULTS=true for local development only."
        )
