#!/usr/bin/env python3
"""
Vyntic End-to-End Test Script
===================================
Tests the full pipeline:
  1. Create deals
  2. Upload documents (CIM PDFs + Financial Excel files)
  3. Single-deal Q&A with citations
  4. Multi-deal matrix comparison
  5. Zero-context-leak verification

Usage:
    python3 test_e2e.py [--base-url http://localhost:8000]
"""
import argparse
import sys
import time
import json
from pathlib import Path

try:
    import requests
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "-q"])
    import requests

BASE_URL = "http://localhost:8000"
SAMPLE_DIR = Path(__file__).parent

DEALS = [
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

# Queries to populate the matrix
MATRIX_QUERIES = [
    "What is the EBITDA and EBITDA margin?",
    "What are the key risks for this investment?",
    "Describe the change of control provisions and their financial impact.",
    "What is the revenue growth rate and trajectory?",
    "What is the customer concentration risk?",
]


class Colors:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    BOLD = "\033[1m"
    END = "\033[0m"


def log(msg, color=None):
    if color:
        print(f"{color}{msg}{Colors.END}")
    else:
        print(msg)


def log_step(step_num, total, msg):
    log(f"\n{'='*60}", Colors.BLUE)
    log(f"  Step {step_num}/{total}: {msg}", Colors.BOLD)
    log(f"{'='*60}", Colors.BLUE)


def check_health():
    """Verify the backend is running."""
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=5)
        r.raise_for_status()
        data = r.json()
        assert data["status"] == "ok"
        log("  ✓ Backend is healthy", Colors.GREEN)
        return True
    except Exception as e:
        log(f"  ✗ Backend not reachable: {e}", Colors.RED)
        log("    Make sure docker-compose is running!", Colors.YELLOW)
        return False


def create_deals():
    """Create all test deals."""
    results = []
    for deal in DEALS:
        r = requests.post(f"{BASE_URL}/deals", json={
            "deal_id": deal["deal_id"],
            "name": deal["name"],
            "description": deal["description"],
        })
        if r.status_code == 200:
            log(f"  ✓ Created deal: {deal['name']}", Colors.GREEN)
            results.append(True)
        elif r.status_code in (400, 409) and "already exists" in r.text:
            log(f"  → Deal already exists: {deal['name']}", Colors.YELLOW)
            results.append(True)
        else:
            log(f"  ✗ Failed to create deal {deal['name']}: {r.status_code} {r.text}", Colors.RED)
            results.append(False)
    return all(results)


def list_deals():
    """List all deals and verify."""
    r = requests.get(f"{BASE_URL}/deals")
    r.raise_for_status()
    deals = r.json()
    log(f"  ✓ Found {len(deals)} deals:", Colors.GREEN)
    for d in deals:
        log(f"    - {d['deal_id']}: {d['name']} ({d['document_count']} docs)")
    return deals


def upload_documents():
    """Upload all sample documents to their respective deals."""
    results = []
    for deal in DEALS:
        for filename in deal["files"]:
            filepath = SAMPLE_DIR / filename
            if not filepath.exists():
                log(f"  ✗ File not found: {filename}", Colors.RED)
                results.append(False)
                continue

            log(f"  ↑ Uploading {filename} to {deal['deal_id']}...", Colors.YELLOW)
            start = time.time()

            with open(filepath, "rb") as f:
                r = requests.post(
                    f"{BASE_URL}/deals/{deal['deal_id']}/documents",
                    files={"file": (filename, f)},
                    timeout=120,
                )

            elapsed = time.time() - start

            if r.status_code == 200:
                data = r.json()
                chunks = data.get("chunks_created", "?")
                log(f"  ✓ Uploaded {filename} → {chunks} chunks ({elapsed:.1f}s)", Colors.GREEN)
                results.append(True)
            else:
                log(f"  ✗ Upload failed: {r.status_code} {r.text[:200]}", Colors.RED)
                results.append(False)

    return all(results)


def test_single_deal_query(deal_id: str, query: str):
    """Query a single deal and display results with citations."""
    log(f"\n  Query: \"{query}\"", Colors.BOLD)
    log(f"  Deal:  {deal_id}")

    start = time.time()
    r = requests.post(
        f"{BASE_URL}/deals/{deal_id}/query",
        json={"question": query},
        timeout=600,
    )
    elapsed = time.time() - start

    if r.status_code != 200:
        log(f"  ✗ Query failed: {r.status_code} {r.text[:200]}", Colors.RED)
        return None

    data = r.json()
    answer = data.get("answer", "")
    citations = data.get("citations", [])

    log(f"  Answer ({elapsed:.1f}s):", Colors.GREEN)
    # Truncate long answers for display
    display = answer[:300] + "..." if len(answer) > 300 else answer
    for line in display.split("\n"):
        log(f"    {line}")

    if citations:
        log(f"  Citations ({len(citations)}):")
        for c in citations[:3]:
            log(f"    📄 {c.get('source_file', '?')} p.{c.get('page', '?')}: \"{c.get('text', '')[:80]}...\"")

    return data


def test_matrix_comparison(deal_ids: list, queries: list):
    """Run a multi-deal matrix comparison."""
    log(f"\n  Deals:   {', '.join(deal_ids)}")
    log(f"  Queries: {len(queries)} questions")

    start = time.time()
    r = requests.post(
        f"{BASE_URL}/matrix/compare",
        json={"deal_ids": deal_ids, "queries": queries},
        timeout=600,
    )
    elapsed = time.time() - start

    if r.status_code != 200:
        log(f"  ✗ Matrix comparison failed: {r.status_code} {r.text[:300]}", Colors.RED)
        return None

    data = r.json()
    cells = data.get("cells", {})

    log(f"  ✓ Matrix populated in {elapsed:.1f}s", Colors.GREEN)

    # Display as a formatted table
    log(f"\n  {'─'*100}")
    header = f"  {'Deal':<22}"
    for q in queries:
        header += f" │ {q[:25]:<25}"
    log(header, Colors.BOLD)
    log(f"  {'─'*100}")

    for deal_id in deal_ids:
        row = f"  {deal_id:<22}"
        deal_cells = cells.get(deal_id, {})
        for q in queries:
            cell = deal_cells.get(q, {})
            answer = cell.get("answer", "N/A")
            # Truncate for table display
            short = answer[:23] + ".." if len(answer) > 25 else answer
            short = short.replace("\n", " ")
            row += f" │ {short:<25}"
        log(row)

    log(f"  {'─'*100}")
    return data


def test_zero_context_leak(cells: dict):
    """Verify that deal-specific data doesn't appear in other deals' answers."""
    log("\n  Running zero-context-leak checks...")

    # Known unique identifiers per deal
    deal_markers = {
        "acme_saas": ["Acme Cloud", "ERP", "118% net revenue retention", "ARR"],
        "pinnacle_health": ["Pinnacle Healthcare", "rehabilitation", "78 clinics", "outpatient"],
        "summit_industrial": ["Summit Precision", "aerospace", "machined components", "ITAR"],
    }

    violations = []
    for deal_id, markers in deal_markers.items():
        other_deals = [d for d in cells.keys() if d != deal_id]
        for other_id in other_deals:
            other_cells = cells.get(other_id, {})
            for query, cell in other_cells.items():
                answer = cell.get("answer", "").lower()
                for marker in markers:
                    if marker.lower() in answer:
                        violations.append({
                            "leaked_from": deal_id,
                            "found_in": other_id,
                            "marker": marker,
                            "query": query,
                        })

    if violations:
        log(f"  ✗ CONTEXT LEAK DETECTED! {len(violations)} violations:", Colors.RED)
        for v in violations:
            log(f"    - '{v['marker']}' from {v['leaked_from']} found in {v['found_in']}'s answer to '{v['query']}'")
        return False
    else:
        log(f"  ✓ Zero context leak verified — no cross-deal data contamination", Colors.GREEN)
        return True


def main():
    parser = argparse.ArgumentParser(description="Vyntic E2E Test")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--skip-upload", action="store_true", help="Skip document upload")
    parser.add_argument("--skip-matrix", action="store_true", help="Skip matrix comparison")
    args = parser.parse_args()

    global BASE_URL
    BASE_URL = args.base_url

    total_steps = 6
    passed = 0
    failed = 0

    print()
    log("╔══════════════════════════════════════════════════════════╗", Colors.BLUE)
    log("║        Vyntic PoC — End-to-End Test Suite          ║", Colors.BLUE)
    log("╚══════════════════════════════════════════════════════════╝", Colors.BLUE)

    # Step 1: Health check
    log_step(1, total_steps, "Health Check")
    if not check_health():
        log("\nAborting: Backend is not running.", Colors.RED)
        sys.exit(1)
    passed += 1

    # Step 2: Create deals
    log_step(2, total_steps, "Create Deals")
    if create_deals():
        passed += 1
    else:
        failed += 1

    deals = list_deals()

    # Step 3: Upload documents
    log_step(3, total_steps, "Upload Documents")
    if args.skip_upload:
        log("  → Skipping upload (--skip-upload)", Colors.YELLOW)
    else:
        if upload_documents():
            passed += 1
        else:
            log("  ⚠ Some uploads failed (may need API keys configured)", Colors.YELLOW)
            failed += 1

    # Refresh deal list to see updated doc counts
    deals = list_deals()

    # Step 4: Single-deal queries
    log_step(4, total_steps, "Single-Deal Q&A")
    single_queries = [
        ("acme_saas", "What is the EBITDA and EBITDA margin for the most recent year?"),
        ("pinnacle_health", "How many clinics does the company operate and what is the geographic breakdown?"),
        ("summit_industrial", "What are the change of control provisions and which contracts are affected?"),
    ]

    single_results = []
    for deal_id, query in single_queries:
        result = test_single_deal_query(deal_id, query)
        single_results.append(result is not None)

    if all(single_results):
        passed += 1
    else:
        failed += 1

    # Step 5: Matrix comparison
    log_step(5, total_steps, "Matrix Comparison (Multi-Deal)")
    if args.skip_matrix:
        log("  → Skipping matrix (--skip-matrix)", Colors.YELLOW)
        matrix_data = None
    else:
        deal_ids = [d["deal_id"] for d in DEALS]
        matrix_data = test_matrix_comparison(deal_ids, MATRIX_QUERIES[:3])  # Use first 3 for speed
        if matrix_data:
            passed += 1
        else:
            failed += 1

    # Step 6: Zero context leak verification
    log_step(6, total_steps, "Zero Context Leak Verification")
    if matrix_data:
        cells = matrix_data.get("cells", {})
        if test_zero_context_leak(cells):
            passed += 1
        else:
            failed += 1
    else:
        log("  → Skipping (no matrix data available)", Colors.YELLOW)

    # Summary
    print()
    log("╔══════════════════════════════════════════════════════════╗", Colors.BLUE)
    log("║                    Test Results Summary                  ║", Colors.BLUE)
    log("╠══════════════════════════════════════════════════════════╣", Colors.BLUE)
    log(f"║  Passed: {passed}/{total_steps}                                          ║",
        Colors.GREEN if failed == 0 else Colors.YELLOW)
    if failed > 0:
        log(f"║  Failed: {failed}/{total_steps}                                          ║", Colors.RED)
    log("╚══════════════════════════════════════════════════════════╝", Colors.BLUE)

    if failed == 0:
        log("\n🎉 All tests passed! Vyntic PoC is working end-to-end.\n", Colors.GREEN)
    else:
        log(f"\n⚠ {failed} test(s) had issues. Check API keys and Pinecone index.\n", Colors.YELLOW)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
