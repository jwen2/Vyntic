"""
Vyntic — FastAPI Application
AI-powered asset analysis for PE deal comparison.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_deals import router as deals_router
from app.api.routes_ingest import router as ingest_router
from app.api.routes_query import router as query_router
from app.api.routes_matrix import router as matrix_router
from app.api.routes_stream import router as stream_router

app = FastAPI(
    title="Vyntic",
    description="AI-powered asset analysis for PE deal comparison",
    version="0.1.0",
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3100", "http://localhost:3200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(deals_router)
app.include_router(ingest_router)
app.include_router(query_router)
app.include_router(matrix_router)
app.include_router(stream_router)


@app.on_event("startup")
async def startup():
    # Initialize database tables
    from app.database import init_db
    init_db()

    # Seed sample data (skips deals that already exist in DB)
    from app.seed import seed_sample_data
    await seed_sample_data()


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "vyntic"}
