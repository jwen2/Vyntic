#!/usr/bin/env python
"""Seed the local Activision sample deal and ingest its sample filings."""
from __future__ import annotations

import asyncio
from pathlib import Path

from app.auth import get_user_by_email, grant_deal_access
from app.config import settings
from app.models.deal import DealCreate
from app.seed import _ingest_pending_files
from app.services import deal_store


DEAL_ID = "activision_blizzard"
FILES = [
    "ACTIVSIONBLIZZARD_2023Q2_10Q.pdf",
    "ACTIVISIONBLIZZARD_2022_10K.pdf",
]


async def main() -> None:
    sample_dir = Path("/app/sample_data")
    if not sample_dir.exists():
        sample_dir = Path(__file__).resolve().parents[2] / "sample_data"

    if deal_store.get_deal(DEAL_ID) is None:
        deal_store.create_deal(
            DealCreate(
                deal_id=DEAL_ID,
                name="Activision Blizzard",
                description="Video game publisher seeded from FinanceBench filings",
                stage="Due Diligence",
                tags=["Technology", "Consumer"],
            )
        )
        admin = get_user_by_email(settings.default_admin_email)
        if admin:
            grant_deal_access(admin.id, DEAL_ID, role="admin")
        print(f"created deal {DEAL_ID}")

    existing = {doc.filename for doc in deal_store.list_documents(DEAL_ID)}
    pending = [filename for filename in FILES if filename not in existing]
    print(f"pending {pending}")
    await _ingest_pending_files(sample_dir, DEAL_ID, pending)


if __name__ == "__main__":
    asyncio.run(main())
