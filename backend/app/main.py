"""
SpokeMatrix PoC — FastAPI Application
Multi-tenant RAG for PE deal comparison in a matrix format.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_deals import router as deals_router
from app.api.routes_ingest import router as ingest_router
from app.api.routes_query import router as query_router
from app.api.routes_matrix import router as matrix_router

app = FastAPI(
    title="SpokeMatrix",
    description="Multi-tenant RAG application for PE deal comparison",
    version="0.1.0",
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3100"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(deals_router)
app.include_router(ingest_router)
app.include_router(query_router)
app.include_router(matrix_router)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "spokematrix"}
