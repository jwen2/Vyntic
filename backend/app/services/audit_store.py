"""
Append-only audit trail (Plan 2, S4).

record() is called from route handlers after a security-relevant action
succeeds. It never raises: an audit-write failure is logged loudly but must
not turn a successful user action into a 500. There is deliberately no
update or delete function in this module — the log is append-only by
construction, and tests/test_audit_log.py asserts the API surface exposes
GET only.
"""
import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import Request

from app.database import SessionLocal, current_session, AuditLogRow, UserRow

logger = logging.getLogger(__name__)


def record(
    user: Optional[UserRow],
    action: str,
    *,
    resource_type: str = "",
    resource_id: str = "",
    deal_id: Optional[str] = None,
    request: Optional[Request] = None,
    **metadata,
) -> None:
    """Append one audit row. `user` may be None for pre-auth events.

    High-value events hooked so far: auth.login, auth.register, access.grant,
    deal.create, deal.delete, document.upload, document.delete, document.view,
    run.start, run.export.
    """
    try:
        ip = ""
        user_agent = ""
        if request is not None:
            if request.client:
                ip = request.client.host or ""
            user_agent = request.headers.get("user-agent", "")

        # Deliberately NOT the shared request session (current_session):
        # the audit write must commit independently of whatever state the
        # request's session is in, and its never-raise guarantee must not
        # risk poisoning that session for the rest of the request.
        db = SessionLocal()
        try:
            db.add(
                AuditLogRow(
                    tenant_id=user.tenant_id if user else None,
                    user_id=user.id if user else None,
                    user_email=user.email if user else "",
                    action=action,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    deal_id=deal_id,
                    ip=ip,
                    user_agent=user_agent,
                    metadata_json=json.dumps(metadata) if metadata else "{}",
                )
            )
            db.commit()
        finally:
            db.close()
    except Exception:
        logger.exception(f"Audit write failed for action={action!r} — event NOT recorded")


def _filtered(db, deal_id, user_id, action, since, tenant_id):
    q = db.query(AuditLogRow)
    if tenant_id is not None:
        q = q.filter(AuditLogRow.tenant_id == tenant_id)
    if deal_id is not None:
        q = q.filter(AuditLogRow.deal_id == deal_id)
    if user_id is not None:
        q = q.filter(AuditLogRow.user_id == user_id)
    if action is not None:
        q = q.filter(AuditLogRow.action == action)
    if since is not None:
        q = q.filter(AuditLogRow.created_at >= since)
    return q


def count(
    deal_id: Optional[str] = None,
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    since: Optional[datetime] = None,
    tenant_id: Optional[str] = None,
) -> int:
    db, owned = current_session()
    try:
        return _filtered(db, deal_id, user_id, action, since, tenant_id).count()
    finally:
        if owned:
            db.close()


def query(
    deal_id: Optional[str] = None,
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    since: Optional[datetime] = None,
    limit: int = 100,
    offset: int = 0,
    tenant_id: Optional[str] = None,
) -> list[AuditLogRow]:
    """Filtered, newest-first page of audit rows (admin read API). With
    tenant_id, only that tenant's rows are visible — NULL-tenant rows
    (pre-auth events) surface on no tenant's read path."""
    db, owned = current_session()
    try:
        q = _filtered(db, deal_id, user_id, action, since, tenant_id)
        rows = (
            q.order_by(AuditLogRow.id.desc()).offset(offset).limit(limit).all()
        )
        for row in rows:
            db.expunge(row)
        return rows
    finally:
        if owned:
            db.close()
