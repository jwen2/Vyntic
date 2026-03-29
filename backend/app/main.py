"""
Vyntic — FastAPI Application
AI-powered asset analysis for PE deal comparison.
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_deals import router as deals_router
from app.api.routes_ingest import router as ingest_router
from app.api.routes_query import router as query_router
from app.api.routes_matrix import router as matrix_router
from app.api.routes_stream import router as stream_router
from app.api.routes_workstream import router as workstream_router
from app.api.routes_doc_matrix import router as doc_matrix_router
from app.api.routes_auth import router as auth_router
from app.api.routes_conversation import router as conversation_router

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Vyntic",
    description="AI-powered asset analysis for PE deal comparison",
    version="0.1.0",
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3100",
        "http://localhost:3200",
        "http://localhost:3300",
        "http://localhost:3400",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(deals_router)
app.include_router(ingest_router)
app.include_router(query_router)
app.include_router(matrix_router)
app.include_router(stream_router)
app.include_router(workstream_router)
app.include_router(doc_matrix_router)
app.include_router(conversation_router)


@app.on_event("startup")
async def startup():
    # Initialize database tables
    from app.database import init_db
    init_db()

    # Create default admin user if it doesn't exist
    from app.config import settings
    from app.auth import get_user_by_email, create_user, grant_deal_access
    admin = get_user_by_email(settings.default_admin_email)
    if not admin:
        admin = create_user(
            email=settings.default_admin_email,
            password=settings.default_admin_password,
            full_name="Admin",
            is_admin=True,
        )
        logger.info(f"Created default admin user: {settings.default_admin_email}")

    # Seed sample data (skips deals that already exist in DB)
    from app.seed import seed_sample_data
    await seed_sample_data(admin_user_id=admin.id)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "vyntic"}
