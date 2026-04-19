"""
Persistence layer for diligence investigations and their follow-ups.
Thin CRUD over SQLAlchemy — one session per operation, short-lived.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.database import (
    InvestigationFollowupRow,
    InvestigationRow,
    SessionLocal,
)


def _session() -> Session:
    return SessionLocal()


def _loads(raw: str | None, default: Any) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return default


def create_investigation(
    deal_id: str,
    user_id: int | None,
    goal: str,
) -> str:
    """Insert a new investigation row in 'running' state. Return its id."""
    inv_id = uuid.uuid4().hex
    now = datetime.utcnow()
    db = _session()
    try:
        row = InvestigationRow(
            id=inv_id,
            deal_id=deal_id,
            user_id=user_id,
            goal=(goal or "").strip(),
            status="running",
            memo="",
            findings_json="[]",
            transcript_json="[]",
            evidence_json="[]",
            model="",
            fallback=False,
            duration_ms=0,
            created_at=now,
            updated_at=now,
        )
        db.add(row)
        db.commit()
    finally:
        db.close()
    return inv_id


def finalize_investigation(
    investigation_id: str,
    *,
    status: str,
    memo: str,
    findings: list[dict],
    transcript: list[dict],
    evidence: list[dict],
    model: str,
    fallback: bool,
    duration_ms: int,
) -> None:
    """Persist terminal state for an investigation (complete/stopped/error)."""
    db = _session()
    try:
        row = db.query(InvestigationRow).filter_by(id=investigation_id).first()
        if not row:
            return
        row.status = status
        row.memo = memo or ""
        row.findings_json = json.dumps(findings or [], ensure_ascii=False)
        row.transcript_json = json.dumps(transcript or [], ensure_ascii=False)
        row.evidence_json = json.dumps(evidence or [], ensure_ascii=False)
        row.model = model or ""
        row.fallback = bool(fallback)
        row.duration_ms = int(duration_ms or 0)
        row.updated_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()


def list_investigations(deal_id: str, user_id: int | None = None) -> list[dict]:
    """Return lightweight summaries for a deal, newest first."""
    db = _session()
    try:
        q = db.query(InvestigationRow).filter(InvestigationRow.deal_id == deal_id)
        if user_id is not None:
            q = q.filter(InvestigationRow.user_id == user_id)
        rows = q.order_by(InvestigationRow.created_at.desc()).all()
        return [
            {
                "id": r.id,
                "deal_id": r.deal_id,
                "goal": r.goal or "",
                "status": r.status,
                "finding_count": len(_loads(r.findings_json, [])),
                "followup_count": len(r.followups),
                "model": r.model or "",
                "fallback": bool(r.fallback),
                "duration_ms": int(r.duration_ms or 0),
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in rows
        ]
    finally:
        db.close()


def get_investigation(investigation_id: str) -> dict | None:
    """Full record including findings, transcript, evidence and follow-ups."""
    db = _session()
    try:
        row = db.query(InvestigationRow).filter_by(id=investigation_id).first()
        if not row:
            return None
        return {
            "id": row.id,
            "deal_id": row.deal_id,
            "user_id": row.user_id,
            "goal": row.goal or "",
            "status": row.status,
            "memo": row.memo or "",
            "findings": _loads(row.findings_json, []),
            "transcript": _loads(row.transcript_json, []),
            "evidence": _loads(row.evidence_json, []),
            "model": row.model or "",
            "fallback": bool(row.fallback),
            "duration_ms": int(row.duration_ms or 0),
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            "followups": [
                {
                    "id": f.id,
                    "role": f.role,
                    "content": f.content or "",
                    "model": f.model or "",
                    "fallback": bool(f.fallback),
                    "duration_ms": int(f.duration_ms or 0),
                    "created_at": f.created_at.isoformat() if f.created_at else None,
                }
                for f in row.followups
            ],
        }
    finally:
        db.close()


def delete_investigation(investigation_id: str) -> bool:
    db = _session()
    try:
        row = db.query(InvestigationRow).filter_by(id=investigation_id).first()
        if not row:
            return False
        db.delete(row)
        db.commit()
        return True
    finally:
        db.close()


def append_followup(
    investigation_id: str,
    *,
    role: str,
    content: str,
    model: str = "",
    fallback: bool = False,
    duration_ms: int = 0,
) -> dict | None:
    """Append a follow-up turn. Returns the inserted row as a dict."""
    db = _session()
    try:
        inv = db.query(InvestigationRow).filter_by(id=investigation_id).first()
        if not inv:
            return None
        row = InvestigationFollowupRow(
            investigation_id=investigation_id,
            role=role,
            content=content or "",
            model=model or "",
            fallback=bool(fallback),
            duration_ms=int(duration_ms or 0),
            created_at=datetime.utcnow(),
        )
        db.add(row)
        inv.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
        return {
            "id": row.id,
            "role": row.role,
            "content": row.content or "",
            "model": row.model or "",
            "fallback": bool(row.fallback),
            "duration_ms": int(row.duration_ms or 0),
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
    finally:
        db.close()
