"""SQLite-backed store for brief work-product: findings and field overrides.

One JSON blob per deal for each (see DealFindingRow / BriefOverrideRow). The
contents are opaque — the frontend owns the Finding shape and the override
map; the store just persists and returns them verbatim. Mirrors the plain
SessionLocal pattern in manager_store.
"""
import json
from typing import Any

from app.database import SessionLocal, DealFindingRow, BriefOverrideRow


def get_findings(deal_id: str) -> list[dict[str, Any]]:
    db = SessionLocal()
    try:
        row = db.query(DealFindingRow).filter(DealFindingRow.deal_id == deal_id).first()
        if not row or not row.findings_json:
            return []
        try:
            value = json.loads(row.findings_json)
        except (TypeError, ValueError):
            return []
        return value if isinstance(value, list) else []
    finally:
        db.close()


def put_findings(deal_id: str, findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    db = SessionLocal()
    try:
        row = db.query(DealFindingRow).filter(DealFindingRow.deal_id == deal_id).first()
        if not row:
            row = DealFindingRow(deal_id=deal_id)
            db.add(row)
        row.findings_json = json.dumps(findings)
        db.commit()
        return findings
    finally:
        db.close()


def get_overrides(deal_id: str) -> dict[str, dict[str, str]]:
    db = SessionLocal()
    try:
        row = db.query(BriefOverrideRow).filter(BriefOverrideRow.deal_id == deal_id).first()
        if not row or not row.overrides_json:
            return {}
        try:
            value = json.loads(row.overrides_json)
        except (TypeError, ValueError):
            return {}
        return value if isinstance(value, dict) else {}
    finally:
        db.close()


def put_overrides(deal_id: str, overrides: dict[str, dict[str, str]]) -> dict[str, dict[str, str]]:
    db = SessionLocal()
    try:
        row = db.query(BriefOverrideRow).filter(BriefOverrideRow.deal_id == deal_id).first()
        if not row:
            row = BriefOverrideRow(deal_id=deal_id)
            db.add(row)
        row.overrides_json = json.dumps(overrides)
        db.commit()
        return overrides
    finally:
        db.close()
