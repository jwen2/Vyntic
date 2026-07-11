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
from app.models.manager import ManagerCreate
from app.services import deal_store, manager_store
from app.services.parser import parse_document_path
from app.services.chunker import chunk_sections
from app.services.vector_store import upsert_chunks
from app.services.document_backfill import backfill_missing_full_text

logger = logging.getLogger(__name__)

SEED_BATCH_SIZE = 1  # How many files to process at a time
BATCH_PAUSE_SECONDS = 2  # Pause between batches to let CPU cool down
BACKGROUND_SEED_MIN_PAGES = 100
_seed_in_progress: set[tuple[str, str]] = set()

SAMPLE_DEALS = [
    {
        "deal_id": "acme_saas",
        "name": "Acme Cloud Solutions",
        "description": "B2B SaaS ERP platform for mid-market",
        "stage": "Due Diligence",
        "tags": ["Technology"],
        "files": [
            "acme_saas_cim.pdf",
            "acme_saas_financials.xlsx",
            "acme_saas_financial_dd.pdf",
            "acme_saas_legal_dd.pdf",
            "acme_saas_operational_dd.pdf",
            "acme_saas_hr_dd.pdf",
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
    {
        "deal_id": "activision_blizzard",
        "name": "Activision Blizzard",
        "description": "Video game publisher seeded from FinanceBench filings",
        "stage": "Due Diligence",
        "tags": ["Technology", "Consumer"],
        "background_ingest": True,
        "files": [
            "ACTIVSIONBLIZZARD_2023Q2_10Q.pdf",
            "ACTIVISIONBLIZZARD_2022_10K.pdf",
        ],
    },
    {
        "deal_id": "hillpath_fund_iv",
        "name": "Hillpath Fund IV",
        "description": "Synthetic institutional LP diligence demo fund",
        "stage": "Diligence",
        "tags": ["Synthetic QA"],
        "entity_type": "fund",
        "manager": {
            "manager_id": "hillpath_capital",
            "name": "Hillpath Capital",
            "description": "Synthetic lower-middle-market software and services manager",
            "tags": ["Synthetic QA", "Buyout"],
        },
        "vintage": 2026,
        "strategy": "Buyout",
        "files": [
            "hillpath_fund_iv_ddq_ppm.pdf",
            "hillpath_fund_iv_lpa_side_letter.pdf",
            "hillpath_fund_iv_track_record.xlsx",
        ],
        "document_metadata": {
            "hillpath_fund_iv_ddq_ppm.pdf": {"doc_category": "ddq", "scope": "manager"},
            "hillpath_fund_iv_lpa_side_letter.pdf": {"doc_category": "lpa", "scope": "entity"},
            "hillpath_fund_iv_track_record.xlsx": {"doc_category": "track_record", "scope": "entity"},
        },
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
    seed_key = (deal_id, filename)
    if seed_key in _seed_in_progress or deal_store.document_exists(deal_id, filename):
        logger.info(f"  Seed already ingested or in progress: {filename}")
        return False

    filepath = sample_dir / filename
    if not filepath.exists():
        logger.warning(f"  File not found: {filepath}")
        return False

    _seed_in_progress.add(seed_key)
    try:
        # Persist original file for document viewer
        deal_upload_dir = Path(settings.uploads_dir) / deal_id
        deal_upload_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(filepath, deal_upload_dir / filename)

        doc_metadata, sections = await parse_document_path(
            filepath, filename, deal_id
        )
        if deal_store.document_exists(deal_id, filename):
            logger.info(f"  Seed completed by another worker: {filename}")
            return False

        chunks = chunk_sections(sections, deal_id, doc_metadata.doc_id)
        doc_metadata.chunk_count = len(chunks)
        await upsert_chunks(deal_id, chunks)
        deal_store.add_document(deal_id, doc_metadata)
        logger.info(f"  Ingested {filename} → {len(chunks)} chunks")
        return True
    except Exception as e:
        logger.error(f"  Failed to ingest {filename}: {e}")
        return False
    finally:
        _seed_in_progress.discard(seed_key)


def _count_pdf_pages(filepath: Path) -> int | None:
    if filepath.suffix.lower() != ".pdf":
        return None
    try:
        import pypdfium2 as pdfium

        pdf = pdfium.PdfDocument(str(filepath))
        try:
            return len(pdf)
        finally:
            close = getattr(pdf, "close", None)
            if close:
                close()
    except Exception:
        return None


async def _ingest_pending_files(
    sample_dir: Path,
    deal_id: str,
    pending: list[str],
) -> None:
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


def _background_seed(sample_dir: Path, deal_id: str, pending: list[str]) -> None:
    async def _run_in_thread() -> None:
        await asyncio.to_thread(
            lambda: asyncio.run(_ingest_pending_files(sample_dir, deal_id, pending))
        )

    task = asyncio.create_task(_run_in_thread())

    def _log_failure(done: asyncio.Task) -> None:
        try:
            done.result()
        except Exception:
            logger.exception("Background seed ingestion failed")

    task.add_done_callback(_log_failure)


def _background_backfill(deal_id: str, filenames: set[str]) -> None:
    async def _run_in_thread() -> None:
        await asyncio.to_thread(
            lambda: asyncio.run(backfill_missing_full_text(deal_id, filenames))
        )

    task = asyncio.create_task(_run_in_thread())

    def _log_failure(done: asyncio.Task) -> None:
        try:
            done.result()
        except Exception:
            logger.exception("Background full-text backfill failed")

    task.add_done_callback(_log_failure)


async def seed_sample_data(admin_user_id: int | None = None):
    """Create sample deals and ingest their documents if not already present."""
    sample_dir = _find_sample_dir()
    if not sample_dir:
        logger.info("No sample_data directory found — skipping seed")
        return

    logger.info(f"Seeding sample data from {sample_dir}")

    for deal_info in SAMPLE_DEALS:
        deal_id = deal_info["deal_id"]
        deal_exists = deal_store.get_deal(deal_id) is not None

        manager_info = deal_info.get("manager")
        if manager_info and not manager_store.get_manager(manager_info["manager_id"]):
            try:
                manager_store.create_manager(ManagerCreate(**manager_info))
                logger.info("  Created manager: %s", manager_info["name"])
            except ValueError:
                logger.info("  Manager '%s' already exists", manager_info["manager_id"])

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
                        entity_type=deal_info.get("entity_type", "deal"),
                        manager_id=manager_info["manager_id"] if manager_info else None,
                        vintage=deal_info.get("vintage"),
                        strategy=deal_info.get("strategy", ""),
                    )
                )
                logger.info(f"  Created deal: {deal_info['name']}")
                # Grant admin access to seeded deal
                if admin_user_id:
                    from app.auth import grant_deal_access
                    grant_deal_access(admin_user_id, deal_id, role="admin")
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

        # Persisted databases may contain fixtures ingested before
        # full_text_md became the primary context source. Repair those rows
        # from the original uploads instead of skipping them by filename.
        repair_pending = {
            doc.filename for doc in deal_store.list_documents_missing_full_text(deal_id)
            if doc.filename in deal_info["files"]
        }
        foreground_repairs: set[str] = set()
        background_repairs: set[str] = set()
        for filename in repair_pending:
            page_count = _count_pdf_pages(sample_dir / filename)
            if page_count and page_count >= BACKGROUND_SEED_MIN_PAGES:
                background_repairs.add(filename)
            else:
                foreground_repairs.add(filename)

        if foreground_repairs:
            repaired = await backfill_missing_full_text(deal_id, foreground_repairs)
            logger.info(
                "  Full-text repair for %s: %d repaired, %d failed",
                deal_id,
                len(repaired.repaired),
                len(repaired.failed),
            )
        if background_repairs:
            logger.info("  Scheduling background full-text repair: %s", sorted(background_repairs))
            _background_backfill(deal_id, background_repairs)

        if deal_info.get("background_ingest"):
            foreground_pending = []
            background_pending = pending
        else:
            foreground_pending = []
            background_pending = []
            for filename in pending:
                page_count = _count_pdf_pages(sample_dir / filename)
                if page_count and page_count >= BACKGROUND_SEED_MIN_PAGES:
                    background_pending.append(filename)
                else:
                    foreground_pending.append(filename)

        await _ingest_pending_files(sample_dir, deal_id, foreground_pending)

        if background_pending:
            logger.info(
                f"  Scheduling background ingestion for large files: {background_pending}"
            )
            _background_seed(sample_dir, deal_id, background_pending)

        # Apply deterministic LP classifications after foreground ingestion.
        metadata_by_filename = deal_info.get("document_metadata", {})
        if metadata_by_filename:
            for doc in deal_store.list_documents(deal_id):
                metadata = metadata_by_filename.get(doc.filename)
                if metadata:
                    deal_store.update_document_metadata(
                        deal_id,
                        doc.doc_id,
                        doc_category=metadata.get("doc_category"),
                        period=metadata.get("period"),
                        scope=metadata.get("scope"),
                    )

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
