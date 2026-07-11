"""CLI for repairing legacy documents with NULL full_text_md."""

import argparse
import asyncio

from app.services.document_backfill import backfill_missing_full_text


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deal-id", help="Repair only one deal/fund")
    args = parser.parse_args()

    result = await backfill_missing_full_text(deal_id=args.deal_id)
    for key in result.repaired:
        print(f"repaired: {key}")
    for key in result.missing_files:
        print(f"missing original: {key}")
    for key, error in result.failed.items():
        print(f"failed: {key}: {error}")
    print(
        f"summary: repaired={len(result.repaired)} "
        f"missing={len(result.missing_files)} failed={len(result.failed)}"
    )
    return 1 if result.failed else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
