"""Helpers for migrating workflow columns to canonical typed-cell formats.

The app still accepts legacy formats, so this helper is intentionally opt-in.
Use dry-run mode first to inspect every planned column update before applying
write mode.
"""
from __future__ import annotations

import logging
from typing import Any

from app.database import current_session, WorkflowColumnRow, WorkflowRow

logger = logging.getLogger(__name__)


LEGACY_FORMAT_MAP: dict[str, str] = {
    "text": "prose",
    "bulleted_list": "list",
    "number": "metric",
    "percentage": "metric",
    "monetary_amount": "metric",
    "currency": "metric",
    "yes_no": "bool",
    "tag": "enum",
}


def canonical_format(fmt: str | None) -> str:
    """Return the canonical typed-cell format for a stored column format."""
    value = (fmt or "text").strip()
    return LEGACY_FORMAT_MAP.get(value, value)


def workflow_format_migration_plan(workflow_ids: list[str] | None = None) -> list[dict[str, Any]]:
    """Preview legacy column-format updates without mutating the database."""
    db, owned = current_session()
    try:
        query = (
            db.query(WorkflowColumnRow, WorkflowRow)
            .join(WorkflowRow, WorkflowColumnRow.workflow_id == WorkflowRow.id)
            .order_by(WorkflowRow.name.asc(), WorkflowColumnRow.order_index.asc())
        )
        if workflow_ids:
            query = query.filter(WorkflowColumnRow.workflow_id.in_(workflow_ids))
        changes: list[dict[str, Any]] = []
        for column, workflow in query.all():
            from_format = column.format or "text"
            to_format = canonical_format(from_format)
            if from_format == to_format:
                continue
            changes.append(
                {
                    "workflow_id": workflow.id,
                    "workflow_name": workflow.name,
                    "column_id": column.id,
                    "column_label": column.label,
                    "order_index": column.order_index,
                    "from_format": from_format,
                    "to_format": to_format,
                    "is_builtin": bool(workflow.is_builtin),
                }
            )
        return changes
    finally:
        if owned:
            db.close()


def migrate_workflow_formats(
    *,
    write: bool = False,
    workflow_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Preview or apply the legacy -> canonical workflow-column migration.

    Returns a JSON-serializable summary. In dry-run mode, `changed_count` is the
    number of rows that would change. In write mode, it is the number updated.
    """
    changes = workflow_format_migration_plan(workflow_ids)
    if not write:
        return {"mode": "dry_run", "changed_count": len(changes), "changes": changes}

    if not changes:
        return {"mode": "write", "changed_count": 0, "changes": []}

    by_column_id = {change["column_id"]: change for change in changes}
    db, owned = current_session()
    try:
        rows = (
            db.query(WorkflowColumnRow)
            .filter(WorkflowColumnRow.id.in_(by_column_id.keys()))
            .all()
        )
        updated: list[dict[str, Any]] = []
        for row in rows:
            change = by_column_id[row.id]
            row.format = change["to_format"]
            updated.append(change)
            logger.info(
                "Migrated workflow column format: workflow=%s column=%s %s->%s",
                change["workflow_id"],
                change["column_id"],
                change["from_format"],
                change["to_format"],
            )
        db.commit()
        return {"mode": "write", "changed_count": len(updated), "changes": updated}
    except Exception:
        db.rollback()
        raise
    finally:
        if owned:
            db.close()
