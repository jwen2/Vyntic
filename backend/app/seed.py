"""
Auto-seed sample deal data on startup.
Looks for sample files in /app/sample_data (Docker) or ../sample_data (local).
Skips deals that already exist. Ingests files in small batches to avoid
overwhelming Docker with CPU-heavy OCR work.
"""
import asyncio
import logging
import shutil
from pathlib import Path

from app.config import settings
from app.models.deal import DealCreate
from app.services import deal_store
from app.services.parser import parse_document
from app.services.chunker import chunk_sections
from app.services.vector_store import upsert_chunks

logger = logging.getLogger(__name__)

SEED_BATCH_SIZE = 1  # How many files to process at a time
BATCH_PAUSE_SECONDS = 2  # Pause between batches to let CPU cool down

SAMPLE_DEALS = [
    {
        "deal_id": "acme_saas",
        "name": "Acme Cloud Solutions",
        "description": "B2B SaaS ERP platform for mid-market",
        "stage": "Due Diligence",
        "tags": ["Technology"],
        # Only seed 2 lightweight files on startup
        "files": [
            "acme_saas_cim.pdf",
            "acme_saas_financials.xlsx",
        ],
        # All other files are copied to uploads dir for on-demand ingestion
        "store_only_files": [
            "acme_saas_qoe_report.pdf",
            "acme_saas_lbo_model.xlsx",
            "acme_saas_sim.pdf",
            "acme_saas_legal_dd_summary.pdf",
            "acme_saas_detailed_financials.xlsx",
            "acme_saas_operational_review.pdf",
        ],
    },
    {
        "deal_id": "pinnacle_health",
        "name": "Pinnacle Healthcare Services",
        "description": "Outpatient rehabilitation services",
        "stage": "Screening",
        "tags": ["Healthcare"],
        "files": ["pinnacle_health_cim.pdf", "pinnacle_health_financials.xlsx"],
    },
    {
        "deal_id": "summit_industrial",
        "name": "Summit Precision Manufacturing",
        "description": "Aerospace & defense components manufacturer",
        "stage": "IC Review",
        "tags": ["Industrials"],
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


async def _ingest_file(sample_dir: Path, deal_id: str, filename: str) -> bool:
    """Parse, chunk, and embed a single file. Returns True on success."""
    filepath = sample_dir / filename
    if not filepath.exists():
        logger.warning(f"  File not found: {filepath}")
        return False

    try:
        file_bytes = filepath.read_bytes()

        # Persist original file for document viewer
        deal_upload_dir = Path(settings.uploads_dir) / deal_id
        deal_upload_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(filepath, deal_upload_dir / filename)

        doc_metadata, sections = await parse_document(
            file_bytes, filename, deal_id
        )
        chunks = chunk_sections(sections, deal_id, doc_metadata.doc_id)
        doc_metadata.chunk_count = len(chunks)
        await upsert_chunks(deal_id, chunks)
        deal_store.increment_doc_count(deal_id)
        deal_store.add_document(deal_id, doc_metadata)
        logger.info(f"  Ingested {filename} → {len(chunks)} chunks")
        return True
    except Exception as e:
        logger.error(f"  Failed to ingest {filename}: {e}")
        return False


async def seed_sample_data():
    """Create sample deals and ingest their documents if not already present."""
    sample_dir = _find_sample_dir()
    if not sample_dir:
        logger.info("No sample_data directory found — skipping seed")
        return

    logger.info(f"Seeding sample data from {sample_dir}")

    for deal_info in SAMPLE_DEALS:
        deal_id = deal_info["deal_id"]
        deal_exists = deal_store.get_deal(deal_id) is not None

        # Create deal if it doesn't exist
        if not deal_exists:
            try:
                deal_store.create_deal(
                    DealCreate(
                        deal_id=deal_id,
                        name=deal_info["name"],
                        description=deal_info["description"],
                        stage=deal_info.get("stage", "Screening"),
                        tags=deal_info.get("tags", []),
                    )
                )
                logger.info(f"  Created deal: {deal_info['name']}")
            except ValueError:
                logger.info(f"  Deal '{deal_id}' already exists — skipping create")

        # Check which documents are already ingested
        existing_docs = {
            d.filename for d in deal_store.list_documents(deal_id)
        } if deal_exists else set()

        # Collect files that still need ingesting
        pending = [
            f for f in deal_info["files"]
            if f not in existing_docs
        ]

        # Ingest in batches of SEED_BATCH_SIZE
        for i in range(0, len(pending), SEED_BATCH_SIZE):
            batch = pending[i : i + SEED_BATCH_SIZE]
            logger.info(
                f"  Batch {i // SEED_BATCH_SIZE + 1}: ingesting {batch}"
            )
            for filename in batch:
                await _ingest_file(sample_dir, deal_id, filename)

            # Pause between batches to reduce peak CPU/memory pressure
            if i + SEED_BATCH_SIZE < len(pending):
                logger.info(
                    f"  Pausing {BATCH_PAUSE_SECONDS}s before next batch..."
                )
                await asyncio.sleep(BATCH_PAUSE_SECONDS)

        # Copy store-only files to uploads dir (no parsing/chunking)
        for filename in deal_info.get("store_only_files", []):
            filepath = sample_dir / filename
            if not filepath.exists():
                continue
            deal_upload_dir = Path(settings.uploads_dir) / deal_id
            deal_upload_dir.mkdir(parents=True, exist_ok=True)
            dest = deal_upload_dir / filename
            if not dest.exists():
                shutil.copy2(filepath, dest)
                logger.info(f"  Stored {filename} (available for on-demand ingestion)")

    logger.info("Sample data seeding complete")
