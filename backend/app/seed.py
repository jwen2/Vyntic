"""
Auto-seed sample deal data on startup.
Looks for sample files in /app/sample_data (Docker) or ../sample_data (local).
Skips deals that already exist.
"""
import asyncio
import logging
from pathlib import Path

from app.models.deal import DealCreate
from app.services import deal_store
from app.services.parser import parse_document
from app.services.chunker import chunk_sections
from app.services.vector_store import upsert_chunks

logger = logging.getLogger(__name__)

SAMPLE_DEALS = [
    {
        "deal_id": "acme_saas",
        "name": "Acme Cloud Solutions",
        "description": "B2B SaaS ERP platform for mid-market",
        "files": ["acme_saas_cim.pdf", "acme_saas_financials.xlsx"],
    },
    {
        "deal_id": "pinnacle_health",
        "name": "Pinnacle Healthcare Services",
        "description": "Outpatient rehabilitation services",
        "files": ["pinnacle_health_cim.pdf", "pinnacle_health_financials.xlsx"],
    },
    {
        "deal_id": "summit_industrial",
        "name": "Summit Precision Manufacturing",
        "description": "Aerospace & defense components manufacturer",
        "files": ["summit_industrial_cim.pdf", "summit_industrial_financials.xlsx"],
    },
]


def _find_sample_dir() -> Path | None:
    candidates = [
        Path("/app/sample_data"),
        Path(__file__).resolve().parent.parent.parent / "sample_data",
    ]
    for p in candidates:
        if p.is_dir() and any(p.glob("*.pdf")):
            return p
    return None


async def seed_sample_data():
    """Create sample deals and ingest their documents if not already present."""
    sample_dir = _find_sample_dir()
    if not sample_dir:
        logger.info("No sample_data directory found — skipping seed")
        return

    logger.info(f"Seeding sample data from {sample_dir}")

    for deal_info in SAMPLE_DEALS:
        deal_id = deal_info["deal_id"]

        # Skip if deal already exists
        if deal_store.get_deal(deal_id):
            logger.info(f"  Deal '{deal_id}' already exists — skipping")
            continue

        # Create deal
        try:
            deal_store.create_deal(
                DealCreate(
                    deal_id=deal_id,
                    name=deal_info["name"],
                    description=deal_info["description"],
                )
            )
            logger.info(f"  Created deal: {deal_info['name']}")
        except ValueError:
            logger.info(f"  Deal '{deal_id}' already exists — skipping")
            continue

        # Ingest documents
        for filename in deal_info["files"]:
            filepath = sample_dir / filename
            if not filepath.exists():
                logger.warning(f"  File not found: {filepath}")
                continue

            try:
                file_bytes = filepath.read_bytes()
                doc_metadata, sections = await parse_document(
                    file_bytes, filename, deal_id
                )
                chunks = chunk_sections(sections, deal_id, doc_metadata.doc_id)
                doc_metadata.chunk_count = len(chunks)
                await upsert_chunks(deal_id, chunks)
                deal_store.increment_doc_count(deal_id)
                deal_store.add_document(deal_id, doc_metadata)
                logger.info(
                    f"  Ingested {filename} → {len(chunks)} chunks"
                )
            except Exception as e:
                logger.error(f"  Failed to ingest {filename}: {e}")

    logger.info("Sample data seeding complete")
