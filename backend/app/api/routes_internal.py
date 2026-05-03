"""Privileged internal API for the TypeScript AI sidecar.

These endpoints are intentionally not user-facing. The sidecar authenticates
with X-Internal-Token and performs user/deal authorization before calling
document or search endpoints.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel

from app.config import settings
from app.database import DealAccessRow, DocumentRow, SessionLocal, UserRow
from app.services import deal_store
from app.services.vector_store import get_document_chunks, query_deal, query_document

router = APIRouter(prefix="/internal", tags=["internal"])


class SearchBody(BaseModel):
    query: str
    k: int = 20


def require_internal_token(x_internal_token: str = Header(...)) -> None:
    if x_internal_token != settings.internal_api_token:
        raise HTTPException(status_code=401, detail="Invalid internal token")


def _file_type(filename: str) -> str:
    suffix = Path(filename).suffix.lower().lstrip(".")
    return suffix or "unknown"


def _get_document_or_404(doc_id: str) -> DocumentRow:
    db = SessionLocal()
    try:
        row = db.query(DocumentRow).filter(DocumentRow.doc_id == doc_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        db.expunge(row)
        return row
    finally:
        db.close()


def _chunks_to_markdown(chunks: list[dict[str, Any]], pages: set[int] | None = None) -> str:
    grouped: dict[int, list[dict[str, Any]]] = {}
    for chunk in chunks:
        page = int(chunk.get("page") or 1)
        if pages is not None and page not in pages:
            continue
        grouped.setdefault(page, []).append(chunk)

    parts: list[str] = []
    for page in sorted(grouped):
        page_chunks = sorted(grouped[page], key=lambda c: int(c.get("chunk_index") or 0))
        content = "\n\n".join(
            str(chunk.get("content") or "").strip()
            for chunk in page_chunks
            if str(chunk.get("content") or "").strip()
        ).strip()
        if content:
            parts.append(f"## Page {page}\n\n{content}")
    return "\n\n".join(parts).strip()


def _parse_pages(raw_pages: list[str]) -> set[int]:
    parsed: set[int] = set()
    for raw in raw_pages:
        for part in str(raw).split(","):
            part = part.strip()
            if not part:
                continue
            try:
                page = int(part)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid page value: {part}")
            if page < 1:
                raise HTTPException(status_code=400, detail="Pages are 1-indexed")
            parsed.add(page)
    if not parsed:
        raise HTTPException(status_code=400, detail="At least one page is required")
    return parsed


def _extract_pages_from_markdown(markdown: str, pages: set[int]) -> str:
    if not markdown:
        return ""
    pattern = re.compile(r"^## Page (\d+)\s*$", re.MULTILINE)
    matches = list(pattern.finditer(markdown))
    if not matches:
        return markdown if 1 in pages else ""

    selected: list[str] = []
    for idx, match in enumerate(matches):
        page = int(match.group(1))
        if page not in pages:
            continue
        start = match.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(markdown)
        selected.append(markdown[start:end].strip())
    return "\n\n".join(selected).strip()


@router.get("/deals/{deal_id}/documents", dependencies=[Depends(require_internal_token)])
async def list_documents_internal(deal_id: str):
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")

    return [
        {
            "doc_id": doc.doc_id,
            "filename": doc.filename,
            "file_type": _file_type(doc.filename),
            "page_count": doc.page_count,
            "chunk_count": doc.chunk_count,
        }
        for doc in deal_store.list_documents(deal_id)
    ]


@router.get("/documents/{doc_id}/full_text", dependencies=[Depends(require_internal_token)])
async def full_text_internal(doc_id: str):
    row = _get_document_or_404(doc_id)
    if row.full_text_md:
        return {"markdown": row.full_text_md, "page_count": row.page_count or 0}

    chunks = get_document_chunks(row.deal_id, doc_id)
    markdown = _chunks_to_markdown(chunks)
    if not markdown:
        raise HTTPException(status_code=404, detail="Parsed document text not found")

    db = SessionLocal()
    try:
        writable = db.query(DocumentRow).filter(DocumentRow.doc_id == doc_id).first()
        if writable:
            writable.full_text_md = markdown
            db.commit()
    finally:
        db.close()

    return {"markdown": markdown, "page_count": row.page_count or 0}


@router.get("/documents/{doc_id}/pages", dependencies=[Depends(require_internal_token)])
async def pages_internal(doc_id: str, pages: list[str] = Query(...)):
    selected_pages = _parse_pages(pages)
    row = _get_document_or_404(doc_id)

    if row.full_text_md:
        return {"markdown": _extract_pages_from_markdown(row.full_text_md, selected_pages)}

    chunks = get_document_chunks(row.deal_id, doc_id)
    return {"markdown": _chunks_to_markdown(chunks, pages=selected_pages)}


@router.post("/deals/{deal_id}/search", dependencies=[Depends(require_internal_token)])
async def search_internal(deal_id: str, body: SearchBody):
    deal = deal_store.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail=f"Deal '{deal_id}' not found")

    rows = await query_deal(deal_id, body.query, max(1, min(body.k, 50)))
    return [
        {
            "doc_id": row.get("doc_id", ""),
            "filename": row.get("source_file", ""),
            "page": row.get("page", 0),
            "snippet": row.get("content", ""),
            "section_type": row.get("section_type", "text"),
            "score": row.get("score", 0),
        }
        for row in rows
    ]


@router.post("/documents/{doc_id}/search", dependencies=[Depends(require_internal_token)])
async def search_document_internal(doc_id: str, body: SearchBody):
    doc = _get_document_or_404(doc_id)
    rows = await query_document(doc.deal_id, doc_id, body.query, max(1, min(body.k, 50)))
    return [
        {
            "doc_id": row.get("doc_id", ""),
            "filename": row.get("source_file", ""),
            "page": row.get("page", 0),
            "snippet": row.get("content", ""),
            "section_type": row.get("section_type", "text"),
            "score": row.get("score", 0),
        }
        for row in rows
    ]


@router.get("/deals/{deal_id}/access", dependencies=[Depends(require_internal_token)])
async def access_internal(deal_id: str, user_id: str):
    db = SessionLocal()
    try:
        user = db.query(UserRow).filter(UserRow.id == int(user_id)).first()
        if not user:
            return {"has_access": False, "role": None}
        if user.is_admin:
            return {"has_access": True, "role": "admin"}
        access = db.query(DealAccessRow).filter(
            DealAccessRow.user_id == user.id,
            DealAccessRow.deal_id == deal_id,
        ).first()
        return {
            "has_access": access is not None,
            "role": access.role if access else None,
        }
    except ValueError:
        return {"has_access": False, "role": None}
    finally:
        db.close()


@router.get("/users/{user_id}", dependencies=[Depends(require_internal_token)])
async def user_internal(user_id: str):
    db = SessionLocal()
    try:
        user = db.query(UserRow).filter(UserRow.id == int(user_id)).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return {"id": str(user.id), "email": user.email, "full_name": user.full_name}
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user id")
    finally:
        db.close()
