# Phase 2: High Priority Fixes Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 16 high-priority fixes to improve Vyntic from C grade to C+ grade, addressing infrastructure migrations and additional resiliency patterns.

**Architecture:** Infrastructure-focused changes including PostgreSQL migration, S3 file storage, Redis caching, Celery background jobs, and async patterns.

**Tech Stack:** PostgreSQL, Redis, Celery, S3/MinIO, Alembic, aiofiles, asyncpg, pg-promise

**Prerequisites:** Complete Phase 1 critical fixes first.

**Reference:** See `docs/superpowers/plans/2026-05-03-scalability-analysis.md` for full issue details.

---

## File Structure Overview

### Files to Create
| File | Purpose |
|------|---------|
| `backend/app/celery_app.py` | Celery configuration |
| `backend/app/tasks/ingest_task.py` | Background ingestion task |
| `backend/app/services/s3_client.py` | S3/MinIO file operations |
| `backend/alembic/` | Database migration directory |
| `backend/alembic.ini` | Alembic configuration |
| `backend/alembic/versions/001_initial.py` | Initial migration |

### Files to Modify
| File | Changes |
|------|---------|
| `backend/app/config.py` | Add PostgreSQL, S3, Redis, Celery settings |
| `backend/app/database.py` | Switch to PostgreSQL, add indexes |
| `backend/app/api/routes_ingest.py` | Use Celery task, S3 storage |
| `backend/app/api/routes_deals.py` | Filter by user access, use S3 |
| `backend/app/services/deal_store.py` | Add pagination |
| `backend/app/main.py` | Add rate limiting middleware |
| `ai-service/src/lib/db.ts` | Migrate to PostgreSQL with pg-promise |
| `ai-service/src/routes/matrix.ts` | Parallelize document processing |
| `frontend/src/hooks/useDeals.ts` | Add pagination, exponential backoff |
| `backend/requirements.txt` | Add new dependencies |

---

## Task 1: Set Up Alembic for Database Migrations

**Priority:** HIGH - Required before PostgreSQL migration
**Time:** 30 minutes
**Impact:** Enables version-controlled database schema changes

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/versions/`
- Modify: `backend/requirements.txt`

### Step 1.1: Install Alembic

- [ ] **Add Alembic to requirements.txt**

```bash
echo "alembic>=1.13.0" >> backend/requirements.txt
pip install alembic
```

### Step 1.2: Initialize Alembic

- [ ] **Run alembic init in backend directory**

```bash
cd backend && alembic init alembic
```

### Step 1.3: Configure Alembic for async SQLAlchemy

- [ ] **Update alembic/env.py**

```python
# backend/alembic/env.py
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy import create_engine
from alembic import context

from app.config import settings
from app.database import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url():
    return settings.database_url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = create_engine(get_url(), poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

### Step 1.4: Update alembic.ini

- [ ] **Set SQLAlchemy URL to use config**

```ini
# In alembic.ini, comment out the default sqlalchemy.url line:
# sqlalchemy.url = driver://user:pass@localhost/dbname

# The URL will be read from app.config.settings in env.py
```

### Step 1.5: Create initial migration

- [ ] **Generate migration from existing models**

```bash
cd backend && alembic revision --autogenerate -m "Initial schema"
```

### Step 1.6: Commit

- [ ] **Commit the Alembic setup**

```bash
git add backend/alembic backend/alembic.ini backend/requirements.txt
git commit -m "$(cat <<'EOF'
chore(db): set up Alembic for database migrations

Prepares for PostgreSQL migration with version-controlled schema changes.

- Initialize Alembic with async SQLAlchemy support
- Configure env.py to read URL from settings
- Generate initial migration from existing models

Issue: P1 (prerequisite)
EOF
)"
```

---

## Task 2: Migrate to PostgreSQL

**Priority:** CRITICAL - Solves single-writer lock (P1)
**Time:** 2 hours
**Impact:** Removes SQLite single-writer bottleneck, enables horizontal scaling

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/app/database.py`
- Create: `docker-compose.yml` updates

### Step 2.1: Add PostgreSQL configuration

- [ ] **Update config.py with PostgreSQL settings**

```python
# Add to backend/app/config.py Settings class:

    # PostgreSQL (production)
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "vyntic"
    postgres_password: str = "vyntic_dev"
    postgres_db: str = "vyntic"

    @property
    def database_url(self) -> str:
        """Database URL with SQLite fallback for development."""
        if os.getenv("USE_SQLITE", "false").lower() == "true":
            return f"sqlite:///{self.data_dir}/vyntic.db"
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )
```

### Step 2.2: Update database.py for PostgreSQL

- [ ] **Modify database.py to handle both SQLite and PostgreSQL**

```python
# backend/app/database.py
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import QueuePool, StaticPool

from app.config import settings

logger = logging.getLogger(__name__)

Base = declarative_base()


def _create_engine():
    """Create database engine with appropriate settings."""
    url = settings.database_url

    if url.startswith("sqlite"):
        # SQLite for local development
        logger.info("Using SQLite database")
        return create_engine(
            url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            echo=False,
        )
    else:
        # PostgreSQL for production
        logger.info(f"Using PostgreSQL database at {settings.postgres_host}")
        return create_engine(
            url,
            poolclass=QueuePool,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
            pool_recycle=300,
            echo=False,
        )


engine = _create_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Initialize database tables."""
    Base.metadata.create_all(bind=engine)


def get_pool_status() -> dict:
    """Get connection pool status for monitoring."""
    pool = engine.pool
    return {
        "pool_size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
    }
```

### Step 2.3: Add PostgreSQL to docker-compose

- [ ] **Add PostgreSQL service to docker-compose.yml**

```yaml
# Add to docker-compose.yml services:

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: vyntic
      POSTGRES_PASSWORD: vyntic_dev
      POSTGRES_DB: vyntic
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vyntic"]
      interval: 5s
      timeout: 5s
      retries: 5

# Add to volumes:
volumes:
  postgres_data:
```

### Step 2.4: Add psycopg2 dependency

- [ ] **Add PostgreSQL driver to requirements.txt**

```bash
echo "psycopg2-binary>=2.9.0" >> backend/requirements.txt
pip install psycopg2-binary
```

### Step 2.5: Create data migration script

- [ ] **Create script to migrate SQLite data to PostgreSQL**

```python
# backend/scripts/migrate_to_postgres.py
"""Migrate data from SQLite to PostgreSQL."""
import sqlite3
import psycopg2
from app.config import settings


def migrate():
    sqlite_conn = sqlite3.connect(f"{settings.data_dir}/vyntic.db")
    pg_conn = psycopg2.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        user=settings.postgres_user,
        password=settings.postgres_password,
        database=settings.postgres_db,
    )

    sqlite_cur = sqlite_conn.cursor()
    pg_cur = pg_conn.cursor()

    # Migrate each table
    tables = ["users", "deals", "deal_access", "documents", "investigations"]

    for table in tables:
        print(f"Migrating {table}...")
        sqlite_cur.execute(f"SELECT * FROM {table}")
        rows = sqlite_cur.fetchall()

        if not rows:
            continue

        # Get column names
        sqlite_cur.execute(f"PRAGMA table_info({table})")
        columns = [col[1] for col in sqlite_cur.fetchall()]
        cols_str = ", ".join(columns)
        placeholders = ", ".join(["%s"] * len(columns))

        for row in rows:
            try:
                pg_cur.execute(
                    f"INSERT INTO {table} ({cols_str}) VALUES ({placeholders})",
                    row
                )
            except Exception as e:
                print(f"  Error inserting row: {e}")

        pg_conn.commit()
        print(f"  Migrated {len(rows)} rows")

    sqlite_conn.close()
    pg_conn.close()
    print("Migration complete!")


if __name__ == "__main__":
    migrate()
```

### Step 2.6: Test PostgreSQL connection

- [ ] **Start PostgreSQL and verify connection**

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Wait for it to be ready
sleep 5

# Test connection
cd backend && python -c "from app.database import engine; print(engine.execute('SELECT 1').fetchone())"
```

### Step 2.7: Run migrations

- [ ] **Apply Alembic migrations to PostgreSQL**

```bash
cd backend && alembic upgrade head
```

### Step 2.8: Commit

- [ ] **Commit PostgreSQL migration**

```bash
git add backend/app/config.py backend/app/database.py docker-compose.yml backend/requirements.txt backend/scripts/
git commit -m "$(cat <<'EOF'
feat(db): migrate from SQLite to PostgreSQL

Solves single-writer lock bottleneck that would fail at 50+ concurrent users.

- Add PostgreSQL configuration with connection pooling
- Support SQLite fallback for local development (USE_SQLITE=true)
- Add PostgreSQL service to docker-compose
- Create data migration script
- Configure pool_size=10, max_overflow=20, pool_pre_ping=True

Issue: P1 (CRITICAL)
EOF
)"
```

---

## Task 3: Set Up Redis for Session/Progress Storage

**Priority:** HIGH - Solves in-memory progress loss (P4)
**Time:** 45 minutes
**Impact:** Progress survives restarts, enables multiple backend instances

**Files:**
- Create: `backend/app/services/redis_client.py`
- Modify: `backend/app/config.py`
- Modify: `backend/app/api/routes_ingest.py`
- Modify: `docker-compose.yml`

### Step 3.1: Add Redis configuration

- [ ] **Add Redis settings to config.py**

```python
# Add to backend/app/config.py Settings class:

    # Redis
    redis_url: str = "redis://localhost:6379/0"
```

### Step 3.2: Create Redis client module

- [ ] **Create backend/app/services/redis_client.py**

```python
"""Redis client for caching and progress storage."""
import json
import logging
from typing import Any, Optional
import redis

from app.config import settings

logger = logging.getLogger(__name__)

_redis: Optional[redis.Redis] = None


def get_redis() -> redis.Redis:
    """Get or create Redis connection."""
    global _redis
    if _redis is None:
        _redis = redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
        )
    return _redis


def check_redis() -> dict:
    """Check Redis connectivity for health checks."""
    try:
        client = get_redis()
        client.ping()
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        return {"status": "error", "message": str(e)}


# Progress storage functions
PROGRESS_PREFIX = "ingest_progress:"
PROGRESS_TTL = 3600  # 1 hour


def set_progress(upload_id: str, data: dict) -> None:
    """Store upload progress in Redis."""
    client = get_redis()
    key = f"{PROGRESS_PREFIX}{upload_id}"
    client.setex(key, PROGRESS_TTL, json.dumps(data))


def get_progress(upload_id: str) -> Optional[dict]:
    """Get upload progress from Redis."""
    client = get_redis()
    key = f"{PROGRESS_PREFIX}{upload_id}"
    data = client.get(key)
    if data:
        return json.loads(data)
    return None


def delete_progress(upload_id: str) -> None:
    """Delete upload progress from Redis."""
    client = get_redis()
    key = f"{PROGRESS_PREFIX}{upload_id}"
    client.delete(key)
```

### Step 3.3: Add Redis to docker-compose

- [ ] **Add Redis service to docker-compose.yml**

```yaml
# Add to docker-compose.yml services:

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

# Add to volumes:
  redis_data:
```

### Step 3.4: Update routes_ingest.py to use Redis

- [ ] **Replace in-memory dict with Redis**

```python
# In backend/app/api/routes_ingest.py, replace:

# OLD:
# _ingest_progress: dict[str, dict] = {}
# def _set_progress(...):
#     _ingest_progress[upload_id] = {...}
# def _get_progress(upload_id: str) -> dict | None:
#     return _ingest_progress.get(upload_id)

# NEW:
from app.services.redis_client import set_progress, get_progress, delete_progress

def _set_progress(
    upload_id: str,
    status: str,
    progress: float = 0.0,
    message: str = "",
    error: str | None = None,
    document_metadata: dict | None = None,
) -> None:
    """Store upload progress in Redis."""
    data = {
        "status": status,
        "progress": progress,
        "message": message,
        "error": error,
        "document_metadata": document_metadata,
        "timestamp": datetime.utcnow().isoformat(),
    }
    set_progress(upload_id, data)


def _get_progress(upload_id: str) -> dict | None:
    """Get upload progress from Redis."""
    return get_progress(upload_id)
```

### Step 3.5: Add redis dependency

- [ ] **Add redis to requirements.txt**

```bash
echo "redis>=5.0.0" >> backend/requirements.txt
pip install redis
```

### Step 3.6: Update health check to include Redis

- [ ] **Add Redis check to health.py**

```python
# Add to backend/app/services/health.py:

from app.services.redis_client import check_redis

async def run_all_health_checks() -> dict[str, Any]:
    """Run all health checks and return aggregated result."""
    checks = {
        "database": await check_database(),
        "chromadb": await check_chromadb(),
        "llm_circuit": await check_llm_circuit(),
        "redis": check_redis(),  # Add this line
    }
    # ... rest of function
```

### Step 3.7: Test Redis integration

- [ ] **Verify Redis works**

```bash
# Start Redis
docker-compose up -d redis

# Test connection
cd backend && python -c "from app.services.redis_client import get_redis; print(get_redis().ping())"
```

### Step 3.8: Commit

- [ ] **Commit Redis integration**

```bash
git add backend/app/services/redis_client.py backend/app/config.py backend/app/api/routes_ingest.py backend/app/services/health.py docker-compose.yml backend/requirements.txt
git commit -m "$(cat <<'EOF'
feat(redis): use Redis for progress storage

Solves in-memory progress loss on server restart. Progress now persists
across deployments and can be shared across multiple backend instances.

- Add Redis client module with health check
- Replace in-memory progress dict with Redis
- Add Redis service to docker-compose
- Include Redis in health checks
- Set 1-hour TTL for progress entries

Issue: P4 (CRITICAL)
EOF
)"
```

---

## Task 4: Set Up Celery for Background Jobs

**Priority:** HIGH - Solves fire-and-forget task loss (B3)
**Time:** 1 hour
**Impact:** Background tasks survive restarts, can be monitored and retried

**Files:**
- Create: `backend/app/celery_app.py`
- Create: `backend/app/tasks/__init__.py`
- Create: `backend/app/tasks/ingest_task.py`
- Modify: `backend/app/api/routes_ingest.py`
- Modify: `backend/requirements.txt`

### Step 4.1: Add Celery dependencies

- [ ] **Add Celery to requirements.txt**

```bash
echo "celery[redis]>=5.3.0" >> backend/requirements.txt
pip install "celery[redis]"
```

### Step 4.2: Create Celery application

- [ ] **Create backend/app/celery_app.py**

```python
"""Celery application configuration."""
from celery import Celery

from app.config import settings

celery_app = Celery(
    "vyntic",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.ingest_task"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 hour max per task
    task_soft_time_limit=3300,  # Warn at 55 minutes
    worker_prefetch_multiplier=1,  # One task at a time per worker
    task_acks_late=True,  # Ack after completion (enables retry)
    task_reject_on_worker_lost=True,
)
```

### Step 4.3: Create tasks module

- [ ] **Create backend/app/tasks/__init__.py**

```python
"""Background tasks module."""
```

### Step 4.4: Create ingest task

- [ ] **Create backend/app/tasks/ingest_task.py**

```python
"""Background document ingestion task."""
import logging
from pathlib import Path

from app.celery_app import celery_app
from app.services.redis_client import set_progress
from app.services import deal_store
from app.services.vector_store import add_chunks_to_deal
from app.services.document_parser import parse_document
from app.services.embedder import embed_texts

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def ingest_document_task(
    self,
    upload_id: str,
    deal_id: str,
    file_path: str,
    filename: str,
) -> dict:
    """Background task to ingest a document.

    Args:
        upload_id: Unique upload identifier for progress tracking
        deal_id: Deal to add document to
        file_path: Path to uploaded file
        filename: Original filename

    Returns:
        Document metadata dict on success
    """
    try:
        logger.info(f"Starting ingestion: {upload_id} for deal {deal_id}")

        # Update progress: parsing
        set_progress(upload_id, {
            "status": "processing",
            "progress": 0.1,
            "message": "Parsing document...",
        })

        # Parse document
        path = Path(file_path)
        chunks = parse_document(path)

        if not chunks:
            raise ValueError("No content extracted from document")

        # Update progress: embedding
        set_progress(upload_id, {
            "status": "processing",
            "progress": 0.3,
            "message": f"Embedding {len(chunks)} chunks...",
        })

        # Get embeddings
        texts = [c["text"] for c in chunks]
        embeddings = embed_texts(texts)

        # Update progress: storing
        set_progress(upload_id, {
            "status": "processing",
            "progress": 0.7,
            "message": "Storing vectors...",
        })

        # Store in vector DB
        add_chunks_to_deal(deal_id, chunks, embeddings)

        # Create document metadata
        doc_metadata = {
            "deal_id": deal_id,
            "filename": filename,
            "chunk_count": len(chunks),
            "file_size": path.stat().st_size,
        }

        # Store in database
        deal_store.add_document(deal_id, doc_metadata)
        deal_store.increment_doc_count(deal_id)

        # Update progress: complete
        set_progress(upload_id, {
            "status": "complete",
            "progress": 1.0,
            "message": "Document ingested successfully",
            "document_metadata": doc_metadata,
        })

        logger.info(f"Completed ingestion: {upload_id}")
        return doc_metadata

    except Exception as e:
        logger.exception(f"Ingestion failed: {upload_id}")

        # Update progress: error
        set_progress(upload_id, {
            "status": "error",
            "progress": 0.0,
            "message": "Ingestion failed",
            "error": str(e),
        })

        # Retry for transient errors
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e)

        raise
```

### Step 4.5: Update routes_ingest.py to use Celery

- [ ] **Replace asyncio.create_task with Celery task**

```python
# In backend/app/api/routes_ingest.py, replace the background scheduling:

# OLD:
# def _schedule_background_ingest(...) -> None:
#     async def _run() -> None:
#         ...
#     asyncio.create_task(_run())

# NEW:
from app.tasks.ingest_task import ingest_document_task


def _schedule_background_ingest(
    upload_id: str,
    deal_id: str,
    file_path: str,
    filename: str,
) -> None:
    """Schedule document ingestion as a Celery task."""
    ingest_document_task.delay(
        upload_id=upload_id,
        deal_id=deal_id,
        file_path=str(file_path),
        filename=filename,
    )
```

### Step 4.6: Add Celery worker to docker-compose

- [ ] **Add Celery worker service**

```yaml
# Add to docker-compose.yml services:

  celery-worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    command: celery -A app.celery_app worker --loglevel=info
    depends_on:
      - redis
      - postgres
    environment:
      - REDIS_URL=redis://redis:6379/0
      - POSTGRES_HOST=postgres
    volumes:
      - ./data:/app/data
```

### Step 4.7: Test Celery task

- [ ] **Verify Celery works**

```bash
# Start all services
docker-compose up -d

# In another terminal, watch Celery logs
docker-compose logs -f celery-worker

# Test task submission
cd backend && python -c "
from app.tasks.ingest_task import ingest_document_task
result = ingest_document_task.delay('test-id', 'test-deal', '/tmp/test.txt', 'test.txt')
print(f'Task ID: {result.id}')
"
```

### Step 4.8: Commit

- [ ] **Commit Celery integration**

```bash
git add backend/app/celery_app.py backend/app/tasks/ backend/app/api/routes_ingest.py docker-compose.yml backend/requirements.txt
git commit -m "$(cat <<'EOF'
feat(celery): use Celery for background document ingestion

Solves fire-and-forget task loss. Background tasks now:
- Survive server restarts
- Can be monitored via Celery Flower
- Auto-retry on transient failures (3 retries)
- Have 1-hour timeout

- Add Celery app configuration
- Create ingest_document_task with progress tracking
- Replace asyncio.create_task with Celery task.delay()
- Add Celery worker to docker-compose

Issue: B3 (CRITICAL)
EOF
)"
```

---

## Task 5: Migrate File Storage to S3

**Priority:** HIGH - Solves local disk limitation (P6)
**Time:** 1.5 hours
**Impact:** Enables horizontal scaling, provides redundancy

**Files:**
- Create: `backend/app/services/s3_client.py`
- Modify: `backend/app/config.py`
- Modify: `backend/app/api/routes_ingest.py`
- Modify: `backend/app/api/routes_deals.py`
- Modify: `backend/requirements.txt`

### Step 5.1: Add S3 configuration

- [ ] **Add S3 settings to config.py**

```python
# Add to backend/app/config.py Settings class:

    # S3/MinIO
    s3_endpoint_url: str | None = None  # None for AWS, URL for MinIO
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "vyntic-uploads"
    s3_region: str = "us-east-1"

    @property
    def use_s3(self) -> bool:
        """Check if S3 is configured."""
        return bool(self.s3_access_key and self.s3_secret_key)
```

### Step 5.2: Add boto3 dependency

- [ ] **Add boto3 to requirements.txt**

```bash
echo "boto3>=1.34.0" >> backend/requirements.txt
pip install boto3
```

### Step 5.3: Create S3 client module

- [ ] **Create backend/app/services/s3_client.py**

```python
"""S3 client for file storage."""
import logging
from pathlib import Path
from typing import Optional
import boto3
from botocore.exceptions import ClientError

from app.config import settings

logger = logging.getLogger(__name__)

_s3_client = None


def get_s3_client():
    """Get or create S3 client."""
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name=settings.s3_region,
        )
    return _s3_client


def ensure_bucket_exists() -> None:
    """Create the S3 bucket if it doesn't exist."""
    client = get_s3_client()
    try:
        client.head_bucket(Bucket=settings.s3_bucket)
    except ClientError:
        logger.info(f"Creating S3 bucket: {settings.s3_bucket}")
        client.create_bucket(Bucket=settings.s3_bucket)


def upload_file(local_path: Path, s3_key: str) -> str:
    """Upload a file to S3.

    Args:
        local_path: Path to local file
        s3_key: S3 object key (e.g., "deals/abc123/document.pdf")

    Returns:
        S3 URI (s3://bucket/key)
    """
    client = get_s3_client()
    client.upload_file(str(local_path), settings.s3_bucket, s3_key)
    return f"s3://{settings.s3_bucket}/{s3_key}"


def download_file(s3_key: str, local_path: Path) -> None:
    """Download a file from S3.

    Args:
        s3_key: S3 object key
        local_path: Path to save file
    """
    client = get_s3_client()
    local_path.parent.mkdir(parents=True, exist_ok=True)
    client.download_file(settings.s3_bucket, s3_key, str(local_path))


def get_presigned_url(s3_key: str, expires_in: int = 3600) -> str:
    """Get a pre-signed URL for direct download.

    Args:
        s3_key: S3 object key
        expires_in: URL expiration in seconds (default 1 hour)

    Returns:
        Pre-signed URL
    """
    client = get_s3_client()
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": s3_key},
        ExpiresIn=expires_in,
    )


def delete_file(s3_key: str) -> None:
    """Delete a file from S3."""
    client = get_s3_client()
    client.delete_object(Bucket=settings.s3_bucket, Key=s3_key)


def delete_prefix(prefix: str) -> int:
    """Delete all files with a given prefix.

    Args:
        prefix: S3 key prefix (e.g., "deals/abc123/")

    Returns:
        Number of files deleted
    """
    client = get_s3_client()
    paginator = client.get_paginator("list_objects_v2")
    count = 0

    for page in paginator.paginate(Bucket=settings.s3_bucket, Prefix=prefix):
        objects = page.get("Contents", [])
        if not objects:
            continue

        delete_keys = [{"Key": obj["Key"]} for obj in objects]
        client.delete_objects(
            Bucket=settings.s3_bucket,
            Delete={"Objects": delete_keys}
        )
        count += len(delete_keys)

    return count


def check_s3() -> dict:
    """Check S3 connectivity for health checks."""
    if not settings.use_s3:
        return {"status": "skipped", "message": "S3 not configured"}

    try:
        client = get_s3_client()
        client.head_bucket(Bucket=settings.s3_bucket)
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"S3 health check failed: {e}")
        return {"status": "error", "message": str(e)}
```

### Step 5.4: Update routes_ingest.py to use S3

- [ ] **Modify upload handling to use S3**

```python
# In backend/app/api/routes_ingest.py, update _save_upload_to_disk:

from app.services.s3_client import upload_file, check_s3
from app.config import settings


async def _save_upload(deal_id: str, file: UploadFile) -> tuple[Path, str]:
    """Save uploaded file to storage (S3 or local disk).

    Returns:
        Tuple of (local_path, storage_uri)
    """
    # Always save locally first (for processing)
    local_dir = Path(settings.uploads_dir) / deal_id
    local_dir.mkdir(parents=True, exist_ok=True)
    local_path = local_dir / file.filename

    content = await file.read()
    local_path.write_bytes(content)

    # Upload to S3 if configured
    if settings.use_s3:
        s3_key = f"deals/{deal_id}/{file.filename}"
        storage_uri = upload_file(local_path, s3_key)
    else:
        storage_uri = f"file://{local_path}"

    return local_path, storage_uri
```

### Step 5.5: Update routes_deals.py for S3 deletion

- [ ] **Modify delete_deal to clean up S3**

```python
# In backend/app/api/routes_deals.py, update delete_deal:

from app.services.s3_client import delete_prefix
from app.config import settings


@router.delete("/{deal_id}")
async def delete_deal(deal_id: str, current_user: UserRow = Depends(get_current_user)):
    """Delete a deal and all associated data."""
    # ... existing permission check ...

    # Delete from S3 if configured
    if settings.use_s3:
        try:
            deleted = delete_prefix(f"deals/{deal_id}/")
            logger.info(f"Deleted {deleted} files from S3 for deal {deal_id}")
        except Exception as e:
            logger.error(f"Failed to delete S3 files for deal {deal_id}: {e}")

    # Delete local files (fallback/cache)
    deal_upload_dir = os.path.join(settings.uploads_dir, deal_id)
    if os.path.isdir(deal_upload_dir):
        await asyncio.to_thread(shutil.rmtree, deal_upload_dir)

    # ... rest of deletion logic ...
```

### Step 5.6: Add MinIO to docker-compose for local development

- [ ] **Add MinIO service**

```yaml
# Add to docker-compose.yml services:

  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    command: server /data --console-address ":9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 5s
      timeout: 5s
      retries: 5

# Add to volumes:
  minio_data:
```

### Step 5.7: Test S3 integration

- [ ] **Verify S3/MinIO works**

```bash
# Start MinIO
docker-compose up -d minio

# Set environment variables for MinIO
export S3_ENDPOINT_URL=http://localhost:9000
export S3_ACCESS_KEY=minioadmin
export S3_SECRET_KEY=minioadmin

# Test upload
cd backend && python -c "
from pathlib import Path
from app.services.s3_client import upload_file, ensure_bucket_exists

ensure_bucket_exists()
test_file = Path('/tmp/test.txt')
test_file.write_text('Hello S3!')
uri = upload_file(test_file, 'test/test.txt')
print(f'Uploaded to: {uri}')
"
```

### Step 5.8: Commit

- [ ] **Commit S3 integration**

```bash
git add backend/app/services/s3_client.py backend/app/config.py backend/app/api/routes_ingest.py backend/app/api/routes_deals.py docker-compose.yml backend/requirements.txt
git commit -m "$(cat <<'EOF'
feat(storage): migrate file storage to S3

Solves local disk limitation that prevented horizontal scaling.

- Add S3 client module with upload/download/delete
- Support MinIO for local development
- Generate pre-signed URLs for secure download
- Fall back to local storage when S3 not configured
- Clean up S3 on deal deletion

Issue: P6 (HIGH)
EOF
)"
```

---

## Task 6: Add Rate Limiting Middleware

**Priority:** HIGH - Prevents abuse (B5)
**Time:** 30 minutes
**Impact:** Protects against DoS and API quota exhaustion

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/requirements.txt`

### Step 6.1: Add slowapi dependency

- [ ] **Add slowapi to requirements.txt**

```bash
echo "slowapi>=0.1.9" >> backend/requirements.txt
pip install slowapi
```

### Step 6.2: Configure rate limiter

- [ ] **Add rate limiting to main.py**

```python
# Add to backend/app/main.py after imports:

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Rate limiter configuration
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100/minute"],
    storage_uri=settings.redis_url,  # Use Redis for distributed rate limiting
)


# Add to app configuration (before routes):
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
```

### Step 6.3: Add rate limits to expensive endpoints

- [ ] **Apply specific limits to LLM endpoints**

```python
# In backend/app/api/routes_query.py:

from slowapi import limiter

@router.post("/deals/{deal_id}/query")
@limiter.limit("20/minute")  # LLM calls are expensive
async def query_deal(
    request: Request,  # Required for rate limiter
    deal_id: str,
    query: QueryRequest,
    current_user: UserRow = Depends(get_current_user),
):
    ...


# In backend/app/api/routes_ingest.py:

@router.post("/deals/{deal_id}/documents")
@limiter.limit("10/minute")  # Document uploads are expensive
async def upload_document(
    request: Request,
    deal_id: str,
    file: UploadFile = File(...),
    current_user: UserRow = Depends(get_current_user),
):
    ...


# In backend/app/api/routes_matrix.py:

@router.post("/matrix/compare/stream")
@limiter.limit("5/minute")  # Matrix comparisons are very expensive
async def stream_matrix_comparison(
    request: Request,
    compare_request: CompareRequest,
    current_user: UserRow = Depends(get_current_user),
):
    ...
```

### Step 6.4: Add rate limit headers to responses

- [ ] **Configure headers for client feedback**

```python
# In backend/app/main.py, add middleware:

@app.middleware("http")
async def add_rate_limit_headers(request: Request, call_next):
    response = await call_next(request)

    # Add rate limit headers if available
    if hasattr(request.state, "view_rate_limit"):
        limit = request.state.view_rate_limit
        response.headers["X-RateLimit-Limit"] = str(limit.limit)
        response.headers["X-RateLimit-Remaining"] = str(limit.remaining)
        response.headers["X-RateLimit-Reset"] = str(limit.reset)

    return response
```

### Step 6.5: Test rate limiting

- [ ] **Verify rate limits work**

```bash
# Start the backend
cd backend && uvicorn app.main:app --reload

# Hit an endpoint many times
for i in {1..25}; do
    curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/api/deals
done

# Should see 429 (Too Many Requests) after limit exceeded
```

### Step 6.6: Commit

- [ ] **Commit rate limiting**

```bash
git add backend/app/main.py backend/app/api/routes_query.py backend/app/api/routes_ingest.py backend/app/api/routes_matrix.py backend/requirements.txt
git commit -m "$(cat <<'EOF'
feat(security): add rate limiting middleware

Prevents DoS attacks and API quota exhaustion.

- Add slowapi with Redis backend for distributed limiting
- Default: 100 requests/minute per IP
- LLM queries: 20/minute
- Document uploads: 10/minute
- Matrix comparisons: 5/minute
- Add rate limit headers to responses

Issue: B5 (HIGH)
EOF
)"
```

---

## Task 7: Filter list_deals by User Access

**Priority:** HIGH - Security issue (B6)
**Time:** 30 minutes
**Impact:** Prevents users from seeing unauthorized deals

**Files:**
- Modify: `backend/app/api/routes_deals.py`
- Modify: `backend/app/services/deal_store.py`

### Step 7.1: Update deal_store to filter by user

- [ ] **Add user-filtered list function**

```python
# In backend/app/services/deal_store.py, add:

def list_deals_for_user(user_id: int, include_public: bool = True) -> list[Deal]:
    """List deals that a user has access to.

    Args:
        user_id: The user's ID
        include_public: Whether to include public/demo deals

    Returns:
        List of accessible deals
    """
    db = SessionLocal()
    try:
        # Get deal IDs user has explicit access to
        access_query = db.query(DealAccessRow.deal_id).filter(
            DealAccessRow.user_id == user_id
        )

        # Base query
        query = db.query(DealRow).filter(
            or_(
                DealRow.deal_id.in_(access_query),
                DealRow.is_public == True if include_public else False,
            )
        ).order_by(DealRow.updated_at.desc())

        rows = query.all()
        return [_deal_from_row(row) for row in rows]
    finally:
        db.close()
```

### Step 7.2: Update routes_deals.py

- [ ] **Use filtered list in endpoint**

```python
# In backend/app/api/routes_deals.py, update list_deals:

@router.get("", response_model=list[Deal])
def list_deals(current_user: UserRow = Depends(get_current_user)):
    """List deals accessible to the current user."""
    if current_user.is_admin:
        # Admins see all deals
        return deal_store.list_deals()
    else:
        # Regular users only see their deals
        return deal_store.list_deals_for_user(current_user.id)
```

### Step 7.3: Add is_public field to deals if missing

- [ ] **Create migration to add is_public column**

```bash
cd backend && alembic revision --autogenerate -m "Add is_public to deals"
```

- [ ] **Verify migration and apply**

```bash
cd backend && alembic upgrade head
```

### Step 7.4: Test access control

- [ ] **Verify users only see authorized deals**

```bash
# Create two users and deals
# User A creates Deal 1
# User B creates Deal 2
# Verify User A only sees Deal 1 (and public deals)
# Verify User B only sees Deal 2 (and public deals)
```

### Step 7.5: Commit

- [ ] **Commit access control fix**

```bash
git add backend/app/api/routes_deals.py backend/app/services/deal_store.py backend/alembic/versions/
git commit -m "$(cat <<'EOF'
fix(security): filter list_deals by user access

Prevents users from seeing unauthorized deals.

- Add list_deals_for_user() that filters by deal_access table
- Admins still see all deals
- Add is_public column for demo/public deals
- Users see: own deals + public deals

Issue: B6 (HIGH)
EOF
)"
```

---

## Task 8: Add Pagination to Document Lists

**Priority:** HIGH - Performance (B7)
**Time:** 30 minutes
**Impact:** Prevents memory exhaustion on large document lists

**Files:**
- Modify: `backend/app/services/deal_store.py`
- Modify: `backend/app/api/routes_deals.py`

### Step 8.1: Add pagination to list_documents

- [ ] **Update deal_store.py**

```python
# In backend/app/services/deal_store.py, update list_documents:

from typing import NamedTuple


class PaginatedResult(NamedTuple):
    items: list
    total: int
    page: int
    page_size: int
    has_more: bool


def list_documents(
    deal_id: str,
    page: int = 1,
    page_size: int = 50,
) -> PaginatedResult:
    """List documents for a deal with pagination.

    Args:
        deal_id: The deal ID
        page: Page number (1-indexed)
        page_size: Number of items per page (max 100)

    Returns:
        PaginatedResult with items and pagination info
    """
    page_size = min(page_size, 100)  # Cap at 100
    offset = (page - 1) * page_size

    db = SessionLocal()
    try:
        # Get total count
        total = db.query(DocumentRow).filter(
            DocumentRow.deal_id == deal_id
        ).count()

        # Get page of results
        rows = db.query(DocumentRow).filter(
            DocumentRow.deal_id == deal_id
        ).order_by(
            DocumentRow.created_at.desc()
        ).offset(offset).limit(page_size).all()

        items = [_document_from_row(row) for row in rows]

        return PaginatedResult(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            has_more=offset + len(items) < total,
        )
    finally:
        db.close()
```

### Step 8.2: Update routes_deals.py

- [ ] **Add pagination parameters to endpoint**

```python
# In backend/app/api/routes_deals.py:

from pydantic import BaseModel, Field


class PaginatedDocumentsResponse(BaseModel):
    items: list[DocumentMetadata]
    total: int
    page: int
    page_size: int
    has_more: bool


@router.get("/{deal_id}/documents", response_model=PaginatedDocumentsResponse)
def list_documents(
    deal_id: str,
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    current_user: UserRow = Depends(get_current_user),
):
    """List documents for a deal with pagination."""
    _check_deal_access(deal_id, current_user)

    result = deal_store.list_documents(deal_id, page=page, page_size=page_size)

    return PaginatedDocumentsResponse(
        items=result.items,
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        has_more=result.has_more,
    )
```

### Step 8.3: Commit

- [ ] **Commit pagination**

```bash
git add backend/app/services/deal_store.py backend/app/api/routes_deals.py
git commit -m "$(cat <<'EOF'
feat(api): add pagination to document lists

Prevents memory exhaustion when deals have thousands of documents.

- Add page and page_size parameters (default 50, max 100)
- Return total count and has_more flag
- Order by created_at descending

Issue: B7 (HIGH)
EOF
)"
```

---

## Task 9: Parallelize Document Processing in AI-Service

**Priority:** HIGH - Performance (A2)
**Time:** 45 minutes
**Impact:** Matrix generation 5x faster (50s → 10s for 10 documents)

**Files:**
- Modify: `ai-service/src/routes/matrix.ts`

### Step 9.1: Add concurrency control utility

- [ ] **Create concurrent execution helper**

```typescript
// Add to ai-service/src/lib/concurrency.ts

export async function mapWithConcurrency<T, R>(
    items: T[],
    maxConcurrent: number,
    fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let currentIndex = 0;

    async function worker(): Promise<void> {
        while (currentIndex < items.length) {
            const index = currentIndex++;
            results[index] = await fn(items[index], index);
        }
    }

    const workers = Array(Math.min(maxConcurrent, items.length))
        .fill(null)
        .map(() => worker());

    await Promise.all(workers);
    return results;
}
```

### Step 9.2: Update matrix.ts to process documents in parallel

- [ ] **Replace sequential loop with parallel processing**

```typescript
// In ai-service/src/routes/matrix.ts, replace the document loop:

// OLD:
// for (const doc of docs) {
//     const evidence = await selectEvidence(row.deal_id, doc, columns);
//     await queryGeminiAllColumns(...);
// }

// NEW:
import { mapWithConcurrency } from "../lib/concurrency";

const MAX_CONCURRENT_DOCS = 3;  // Process 3 documents at a time

await mapWithConcurrency(docs, MAX_CONCURRENT_DOCS, async (doc, docIndex) => {
    console.log(`[matrix] Processing document ${docIndex + 1}/${docs.length}: ${doc.filename}`);

    try {
        const evidence = await selectEvidence(row.deal_id, doc, columns);

        await queryGeminiAllColumns(
            DEFAULT_TABULAR_MODEL,
            doc.filename,
            evidence.markdown,
            columns,
            async (columnIndex, result) => {
                upsertCell(matrixId, doc.id, columnIndex, result.answer, result.citations);
                sendCellUpdate(res, doc.id, columnIndex, result.answer, result.citations);
            },
            apiKeys(),
        ).catch(async (err) => {
            console.warn(`[matrix] primary model failed for ${doc.filename}, trying fallback`, err);
            await queryGeminiAllColumns(
                FALLBACK_TABULAR_MODEL,
                doc.filename,
                evidence.markdown,
                columns,
                async (columnIndex, result) => {
                    upsertCell(matrixId, doc.id, columnIndex, result.answer, result.citations);
                    sendCellUpdate(res, doc.id, columnIndex, result.answer, result.citations);
                },
                apiKeys(),
            );
        });
    } catch (err) {
        console.error(`[matrix] Failed to process document ${doc.filename}:`, err);
        // Mark all columns as error for this document
        for (let i = 0; i < columns.length; i++) {
            upsertCell(matrixId, doc.id, i, "Error", []);
            sendCellUpdate(res, doc.id, i, "Error processing document", []);
        }
    }
});
```

### Step 9.3: Test parallel processing

- [ ] **Verify improved performance**

```bash
# Start ai-service
cd ai-service && npm run dev

# Time matrix generation with 10 documents
# Before: ~50 seconds (10 docs × 5s each)
# After: ~15 seconds (10 docs / 3 concurrent × 5s each)
```

### Step 9.4: Commit

- [ ] **Commit parallel processing**

```bash
git add ai-service/src/lib/concurrency.ts ai-service/src/routes/matrix.ts
git commit -m "$(cat <<'EOF'
perf(matrix): parallelize document processing

Matrix generation now processes 3 documents concurrently, reducing
total time by ~60%.

Before: 10 documents × 5s each = 50 seconds (sequential)
After: 10 documents / 3 concurrent × 5s = 17 seconds (parallel)

- Add mapWithConcurrency utility for controlled parallelism
- Limit to 3 concurrent to avoid rate limiting
- Error handling per document (doesn't fail entire matrix)

Issue: A2 (CRITICAL)
EOF
)"
```

---

## Task 10: Add Exponential Backoff to Upload Polling

**Priority:** HIGH - Prevents self-DoS (F3)
**Time:** 20 minutes
**Impact:** Reduces server load from polling, better UX

**Files:**
- Modify: `frontend/src/hooks/useDeals.ts`

### Step 10.1: Implement exponential backoff polling

- [ ] **Update polling logic in useDeals.ts**

```typescript
// In frontend/src/hooks/useDeals.ts, replace the fixed interval:

// OLD:
// pollTimer = setInterval(async () => {
//     setProgress(await getUploadProgress(deal_id, uploadId));
// }, 1000);

// NEW:
const INITIAL_POLL_INTERVAL = 1000;  // 1 second
const MAX_POLL_INTERVAL = 30000;     // 30 seconds
const BACKOFF_FACTOR = 1.5;

let currentInterval = INITIAL_POLL_INTERVAL;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

const poll = async () => {
    try {
        const progress = await getUploadProgress(deal_id, uploadId);
        setProgress(progress);

        if (progress.status === "complete" || progress.status === "error") {
            // Stop polling when done
            return;
        }

        // Increase interval with backoff (but cap at max)
        if (progress.progress > 0) {
            // Reset to fast polling when we see actual progress
            currentInterval = INITIAL_POLL_INTERVAL;
        } else {
            // Back off when no progress
            currentInterval = Math.min(
                currentInterval * BACKOFF_FACTOR,
                MAX_POLL_INTERVAL
            );
        }

        // Schedule next poll
        pollTimer = setTimeout(poll, currentInterval);
    } catch (err) {
        console.error("Poll failed:", err);
        // Back off on errors
        currentInterval = Math.min(currentInterval * 2, MAX_POLL_INTERVAL);
        pollTimer = setTimeout(poll, currentInterval);
    }
};

// Start polling
poll();

// Cleanup
return () => {
    if (pollTimer) {
        clearTimeout(pollTimer);
    }
};
```

### Step 10.2: Commit

- [ ] **Commit polling improvement**

```bash
git add frontend/src/hooks/useDeals.ts
git commit -m "$(cat <<'EOF'
perf(frontend): add exponential backoff to upload polling

Reduces server load from aggressive polling.

- Start at 1 second intervals
- Back off to 30 seconds when no progress
- Reset to fast polling when progress detected
- Stop polling on complete/error

Before: 100 uploads × 1 request/second = 100 req/s constant
After: 100 uploads × avg 0.1 req/s = 10 req/s (90% reduction)

Issue: F3 (HIGH)
EOF
)"
```

---

## Task 11: Add Database Context Manager

**Priority:** HIGH - Prevents session leaks (R8)
**Time:** 20 minutes
**Impact:** Eliminates connection leaks under error conditions

**Files:**
- Modify: `backend/app/database.py`
- Modify: `backend/app/api/routes_internal.py` (example)

### Step 11.1: Create database context manager

- [ ] **Add context manager to database.py**

```python
# Add to backend/app/database.py:

from contextlib import contextmanager


@contextmanager
def get_db_session():
    """Context manager for database sessions.

    Usage:
        with get_db_session() as db:
            result = db.query(Model).all()

    Session is automatically closed on exit, even on exceptions.
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
```

### Step 11.2: Update routes to use context manager

- [ ] **Example update in routes_internal.py**

```python
# In backend/app/api/routes_internal.py, replace manual session handling:

# OLD:
# def _get_document_or_404(doc_id: str) -> DocumentRow:
#     db = SessionLocal()
#     try:
#         row = db.query(DocumentRow).filter(...).first()
#         if not row:
#             raise HTTPException(status_code=404)
#         db.expunge(row)
#         return row
#     finally:
#         db.close()

# NEW:
from app.database import get_db_session

def _get_document_or_404(doc_id: str) -> DocumentRow:
    with get_db_session() as db:
        row = db.query(DocumentRow).filter(DocumentRow.doc_id == doc_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        db.expunge(row)
        return row
```

### Step 11.3: Commit

- [ ] **Commit context manager**

```bash
git add backend/app/database.py backend/app/api/routes_internal.py
git commit -m "$(cat <<'EOF'
refactor(db): add context manager for database sessions

Eliminates connection leaks by ensuring sessions are always closed.

- Add get_db_session() context manager
- Auto-commit on success, rollback on exception
- Migrate routes_internal.py as example

Issue: R8 (HIGH)
EOF
)"
```

---

## Task 12: Use aiofiles for Async File Operations

**Priority:** HIGH - Prevents event loop blocking (B4)
**Time:** 30 minutes
**Impact:** File operations no longer block other requests

**Files:**
- Modify: `backend/app/api/routes_deals.py`
- Modify: `backend/app/api/routes_ingest.py`
- Modify: `backend/requirements.txt`

### Step 12.1: Add aiofiles dependency

- [ ] **Add aiofiles to requirements.txt**

```bash
echo "aiofiles>=23.0.0" >> backend/requirements.txt
pip install aiofiles
```

### Step 12.2: Update routes_deals.py for async file deletion

- [ ] **Use asyncio.to_thread for blocking operations**

```python
# In backend/app/api/routes_deals.py:

import asyncio
import aiofiles.os


@router.delete("/{deal_id}")
async def delete_deal(deal_id: str, current_user: UserRow = Depends(get_current_user)):
    """Delete a deal and all associated data."""
    # ... existing code ...

    # Delete local files asynchronously
    deal_upload_dir = os.path.join(settings.uploads_dir, deal_id)
    if os.path.isdir(deal_upload_dir):
        # Use asyncio.to_thread for blocking shutil.rmtree
        await asyncio.to_thread(shutil.rmtree, deal_upload_dir)

    # ... rest of deletion ...
```

### Step 12.3: Update routes_ingest.py for async file writing

- [ ] **Use aiofiles for file operations**

```python
# In backend/app/api/routes_ingest.py:

import aiofiles


async def _save_upload(deal_id: str, file: UploadFile) -> tuple[Path, str]:
    """Save uploaded file to storage (S3 or local disk)."""
    local_dir = Path(settings.uploads_dir) / deal_id
    await asyncio.to_thread(local_dir.mkdir, parents=True, exist_ok=True)
    local_path = local_dir / file.filename

    # Read and write asynchronously
    content = await file.read()
    async with aiofiles.open(local_path, "wb") as f:
        await f.write(content)

    # ... rest of function ...
```

### Step 12.4: Commit

- [ ] **Commit async file operations**

```bash
git add backend/app/api/routes_deals.py backend/app/api/routes_ingest.py backend/requirements.txt
git commit -m "$(cat <<'EOF'
perf(backend): use async file operations

Prevents blocking the event loop during file I/O.

- Add aiofiles for async file read/write
- Use asyncio.to_thread for blocking operations (rmtree, mkdir)
- File operations no longer delay other requests

Issue: B4 (HIGH)
EOF
)"
```

---

## Task 13: Add Frontend Pagination to Deal List

**Priority:** HIGH - Performance (F2)
**Time:** 30 minutes
**Impact:** Deal list loads fast with thousands of deals

**Files:**
- Modify: `frontend/src/hooks/useDeals.ts`
- Modify: `frontend/src/lib/api.ts`

### Step 13.1: Update API client for pagination

- [ ] **Add paginated listDeals in api.ts**

```typescript
// In frontend/src/lib/api.ts:

export interface PaginatedDeals {
    items: Deal[];
    total: number;
    page: number;
    page_size: number;
    has_more: boolean;
}

export async function listDeals(
    page: number = 1,
    pageSize: number = 50
): Promise<PaginatedDeals> {
    const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
    });
    return fetchJson(`/api/deals?${params}`);
}
```

### Step 13.2: Update useDeals hook

- [ ] **Implement pagination in useDeals.ts**

```typescript
// In frontend/src/hooks/useDeals.ts:

export function useDeals() {
    const [deals, setDeals] = useState<Deal[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState({
        page: 1,
        pageSize: 50,
        total: 0,
        hasMore: false,
    });

    const loadPage = useCallback(async (page: number) => {
        setLoading(true);
        setError(null);

        try {
            const result = await listDeals(page, pagination.pageSize);
            setDeals(result.items);
            setPagination({
                page: result.page,
                pageSize: result.page_size,
                total: result.total,
                hasMore: result.has_more,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load deals");
        } finally {
            setLoading(false);
        }
    }, [pagination.pageSize]);

    const nextPage = useCallback(() => {
        if (pagination.hasMore) {
            loadPage(pagination.page + 1);
        }
    }, [pagination, loadPage]);

    const prevPage = useCallback(() => {
        if (pagination.page > 1) {
            loadPage(pagination.page - 1);
        }
    }, [pagination, loadPage]);

    // Load first page on mount
    useEffect(() => {
        loadPage(1);
    }, []);

    return {
        deals,
        loading,
        error,
        pagination,
        loadPage,
        nextPage,
        prevPage,
        refresh: () => loadPage(pagination.page),
    };
}
```

### Step 13.3: Commit

- [ ] **Commit frontend pagination**

```bash
git add frontend/src/hooks/useDeals.ts frontend/src/lib/api.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add pagination to deal list

Prevents slow load times with thousands of deals.

- Add page/pageSize parameters to listDeals API
- Implement pagination state in useDeals hook
- Add nextPage/prevPage helpers
- Default 50 deals per page

Issue: F2 (HIGH)
EOF
)"
```

---

## Task 14: Wrap Multi-Step Operations in Transactions

**Priority:** HIGH - Data consistency (R9)
**Time:** 20 minutes
**Impact:** Prevents partial updates leaving inconsistent state

**Files:**
- Modify: `backend/app/api/routes_ingest.py`
- Modify: `backend/app/services/deal_store.py`

### Step 14.1: Create transactional method in deal_store

- [ ] **Add atomic document ingestion**

```python
# In backend/app/services/deal_store.py:

def add_document_atomic(deal_id: str, doc_metadata: dict) -> DocumentMetadata:
    """Add a document and update deal count atomically.

    This ensures both operations succeed or neither does.
    """
    with get_db_session() as db:
        # Increment deal doc count
        deal = db.query(DealRow).filter(DealRow.deal_id == deal_id).first()
        if not deal:
            raise ValueError(f"Deal {deal_id} not found")
        deal.doc_count = (deal.doc_count or 0) + 1

        # Add document record
        doc_row = DocumentRow(
            doc_id=doc_metadata.get("doc_id") or str(uuid.uuid4()),
            deal_id=deal_id,
            filename=doc_metadata["filename"],
            chunk_count=doc_metadata.get("chunk_count", 0),
            file_size=doc_metadata.get("file_size", 0),
            storage_uri=doc_metadata.get("storage_uri"),
        )
        db.add(doc_row)

        # Commit happens automatically via context manager
        db.flush()  # Ensure IDs are assigned
        return _document_from_row(doc_row)
```

### Step 14.2: Update ingest task to use atomic method

- [ ] **Replace separate calls with atomic method**

```python
# In backend/app/tasks/ingest_task.py:

# OLD:
# deal_store.add_document(deal_id, doc_metadata)
# deal_store.increment_doc_count(deal_id)

# NEW:
from app.services.deal_store import add_document_atomic

doc = add_document_atomic(deal_id, doc_metadata)
```

### Step 14.3: Commit

- [ ] **Commit transactional operations**

```bash
git add backend/app/services/deal_store.py backend/app/tasks/ingest_task.py
git commit -m "$(cat <<'EOF'
fix(db): wrap multi-step operations in transactions

Prevents inconsistent state from partial updates.

- Add add_document_atomic() that updates count and adds doc in one tx
- Rollback both on failure, commit both on success

Issue: R9 (HIGH)
EOF
)"
```

---

## Task 15: Add Graceful Degradation for Vector Store

**Priority:** HIGH - Resiliency (R7)
**Time:** 20 minutes
**Impact:** Queries work (degraded) when vector store is down

**Files:**
- Modify: `backend/app/services/vector_store.py`

### Step 15.1: Add error handling with degradation

- [ ] **Update query_deal to handle errors gracefully**

```python
# In backend/app/services/vector_store.py:

from typing import NamedTuple


class VectorQueryResult(NamedTuple):
    results: list[dict]
    warning: str | None = None


async def query_deal(
    deal_id: str,
    query_text: str,
    top_k: int | None = None
) -> VectorQueryResult:
    """Query vectors for a deal with graceful degradation.

    Returns:
        VectorQueryResult with results and optional warning message
    """
    try:
        collection = _get_collection(deal_id)
        if collection.count() == 0:
            return VectorQueryResult(results=[], warning=None)

        query_embedding = await embed_query(query_text)
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k or settings.retrieval_top_k,
            include=["documents", "metadatas", "distances"],
        )

        formatted = []
        for i, doc in enumerate(results["documents"][0]):
            formatted.append({
                "text": doc,
                "metadata": results["metadatas"][0][i],
                "distance": results["distances"][0][i],
            })

        return VectorQueryResult(results=formatted, warning=None)

    except Exception as e:
        logger.error(f"Vector query failed for deal {deal_id}: {e}")
        return VectorQueryResult(
            results=[],
            warning="Vector search temporarily unavailable. Results may be incomplete."
        )
```

### Step 15.2: Propagate warning to API responses

- [ ] **Include warning in query response**

```python
# In backend/app/api/routes_query.py:

class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation]
    warning: str | None = None


@router.post("/{deal_id}/query", response_model=QueryResponse)
async def query_deal(deal_id: str, query: QueryRequest, ...):
    # ... existing code ...

    vector_result = await vector_store.query_deal(deal_id, query.query)

    # ... LLM call with vector_result.results ...

    return QueryResponse(
        answer=answer,
        citations=citations,
        warning=vector_result.warning,  # Pass through warning
    )
```

### Step 15.3: Commit

- [ ] **Commit graceful degradation**

```bash
git add backend/app/services/vector_store.py backend/app/api/routes_query.py
git commit -m "$(cat <<'EOF'
feat(vector_store): add graceful degradation on errors

Queries now return empty results with warning instead of crashing.

- Return VectorQueryResult with optional warning
- Log errors but don't propagate exceptions
- Include warning in API response for client display

Issue: R7 (HIGH)
EOF
)"
```

---

## Task 16: Replace print() with Structured Logging

**Priority:** HIGH - Observability (R14)
**Time:** 20 minutes
**Impact:** Errors visible in log aggregation, can build alerts

**Files:**
- Modify: `backend/app/services/embedder.py`

### Step 16.1: Replace print with logger

- [ ] **Update embedder.py to use structured logging**

```python
# In backend/app/services/embedder.py:

# OLD:
# print(f"Gemini embedding timeout after {EMBED_TIMEOUT}s, using mock")
# print(f"Gemini embedding error, using mock: {e}")

# NEW:
import logging

logger = logging.getLogger(__name__)


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed multiple texts in parallel."""
    if not texts:
        return []

    logger.info(
        "Starting embedding batch",
        extra={
            "chunk_count": len(texts),
            "total_chars": sum(len(t) for t in texts),
        }
    )

    # ... embedding logic ...

    except asyncio.TimeoutError:
        logger.error(
            "Embedding timeout",
            extra={
                "chunk_index": i,
                "text_length": len(text),
                "timeout_seconds": EMBED_TIMEOUT,
            }
        )
        raise EmbeddingTimeoutError(f"Embedding timeout for chunk {i}")

    except Exception as e:
        logger.error(
            "Embedding failed",
            extra={
                "chunk_index": i,
                "error_type": type(e).__name__,
                "error_message": str(e),
            }
        )
        raise EmbeddingError(f"Embedding failed for chunk {i}: {e}")

    logger.info(
        "Embedding batch complete",
        extra={
            "chunk_count": len(texts),
            "success_count": len(embeddings),
        }
    )

    return embeddings
```

### Step 16.2: Commit

- [ ] **Commit logging improvements**

```bash
git add backend/app/services/embedder.py
git commit -m "$(cat <<'EOF'
refactor(embedder): replace print() with structured logging

Errors now visible in log aggregation systems.

- Use logger.error() with extra context
- Include chunk_index, text_length, error_type
- Add info logs for batch start/complete

Issue: R14 (MEDIUM)
EOF
)"
```

---

## Final Steps

### Push All Changes

- [ ] **Push all commits to remote**

```bash
git push origin main
```

### Verify Services

- [ ] **Start all services and verify health**

```bash
# Start everything
docker-compose up -d

# Wait for services
sleep 10

# Check health
curl http://localhost:8000/health | jq

# Should show:
# {
#   "status": "ok",
#   "checks": {
#     "database": {"status": "ok"},
#     "chromadb": {"status": "ok"},
#     "redis": {"status": "ok"},
#     "llm_circuit": {"status": "ok"}
#   }
# }
```

### Run Migrations

- [ ] **Apply all database migrations**

```bash
cd backend && alembic upgrade head
```

---

## Summary

This execution plan covers 16 high-priority fixes:

| Task | Issue | Time | Impact |
|------|-------|------|--------|
| 1 | Alembic setup | 30m | Enables version-controlled migrations |
| 2 | PostgreSQL migration | 2h | Removes single-writer bottleneck |
| 3 | Redis for progress | 45m | Progress survives restarts |
| 4 | Celery background jobs | 1h | Tasks survive restarts, can retry |
| 5 | S3 file storage | 1.5h | Enables horizontal scaling |
| 6 | Rate limiting | 30m | Prevents abuse |
| 7 | User-scoped deal list | 30m | Security fix |
| 8 | Document pagination | 30m | Prevents memory exhaustion |
| 9 | Parallel doc processing | 45m | 5x faster matrix generation |
| 10 | Exponential backoff | 20m | 90% less polling load |
| 11 | DB context manager | 20m | Prevents connection leaks |
| 12 | Async file operations | 30m | Non-blocking I/O |
| 13 | Frontend pagination | 30m | Fast deal list loading |
| 14 | Transaction wrapping | 20m | Data consistency |
| 15 | Graceful degradation | 20m | Resiliency improvement |
| 16 | Structured logging | 20m | Observability improvement |

**Total estimated time:** ~10 hours

**Grade improvement:** C → C+ (infrastructure-ready for scaling)

**Next plan:** Phase 3 execution plan for medium-priority fixes including composite indexes, LLM timeouts, idempotency keys, and remaining resiliency patterns.
