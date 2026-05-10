#!/usr/bin/env python
"""Preview or apply workflow column-format migration.

Examples:
  PYTHONPATH=. python scripts/migrate_workflow_formats.py
  PYTHONPATH=. python scripts/migrate_workflow_formats.py --write
"""
from __future__ import annotations

import argparse
import json

from app.services.workflow_format_migration import migrate_workflow_formats


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate workflow columns to canonical typed-cell formats.")
    parser.add_argument("--write", action="store_true", help="Apply updates instead of dry-running.")
    parser.add_argument("--workflow-id", action="append", dest="workflow_ids", help="Limit migration to one workflow id. Repeatable.")
    args = parser.parse_args()
    result = migrate_workflow_formats(write=args.write, workflow_ids=args.workflow_ids)
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
