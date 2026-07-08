"""
Admin-only read API for the audit log (Plan 2, S4).

GET only — the log is append-only; writes happen exclusively through
audit_store.record() inside route handlers.
"""
import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.auth import get_current_user, require_admin
from app.database import UserRow
from app.services import audit_store

router = APIRouter(prefix="/audit", tags=["audit"])

CSV_COLUMNS = [
    "id",
    "created_at",
    "user_id",
    "user_email",
    "action",
    "resource_type",
    "resource_id",
    "deal_id",
    "ip",
    "user_agent",
    "metadata_json",
]


class AuditEntry(BaseModel):
    id: int
    created_at: datetime
    user_id: int | None
    user_email: str
    action: str
    resource_type: str
    resource_id: str
    deal_id: str | None
    ip: str
    user_agent: str
    meta: dict


def _parse_since(since: str | None) -> datetime | None:
    if not since:
        return None
    try:
        return datetime.fromisoformat(since)
    except ValueError:
        raise HTTPException(status_code=422, detail="'since' must be an ISO timestamp")


@router.get("", response_model=list[AuditEntry])
def list_audit_entries(
    deal_id: str | None = None,
    user_id: int | None = None,
    action: str | None = None,
    since: str | None = None,
    limit: int = 100,
    offset: int = 0,
    current_user: UserRow = Depends(get_current_user),
):
    require_admin(current_user)
    rows = audit_store.query(
        deal_id=deal_id,
        user_id=user_id,
        action=action,
        since=_parse_since(since),
        limit=min(limit, 1000),
        offset=offset,
    )
    return [
        AuditEntry(
            id=r.id,
            created_at=r.created_at,
            user_id=r.user_id,
            user_email=r.user_email,
            action=r.action,
            resource_type=r.resource_type,
            resource_id=r.resource_id,
            deal_id=r.deal_id,
            ip=r.ip,
            user_agent=r.user_agent,
            meta=r.meta,
        )
        for r in rows
    ]


@router.get("/export.csv")
def export_audit_csv(
    deal_id: str | None = None,
    user_id: int | None = None,
    action: str | None = None,
    since: str | None = None,
    current_user: UserRow = Depends(get_current_user),
):
    """CSV dump for compliance handoff. Same filters as the list endpoint;
    capped at 10k rows per export."""
    require_admin(current_user)
    rows = audit_store.query(
        deal_id=deal_id,
        user_id=user_id,
        action=action,
        since=_parse_since(since),
        limit=10_000,
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(CSV_COLUMNS)
    for r in rows:
        writer.writerow([
            r.id,
            r.created_at.isoformat() if r.created_at else "",
            r.user_id,
            r.user_email,
            r.action,
            r.resource_type,
            r.resource_id,
            r.deal_id or "",
            r.ip,
            r.user_agent,
            r.metadata_json,
        ])
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=vyntic-audit.csv"},
    )
