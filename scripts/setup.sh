#!/bin/bash
# ==============================================================================
# Vyntic Setup Script
# Verifies services are running after docker compose up
# ==============================================================================

set -e

BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║           Vyntic — Setup Verification                   ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Wait for backend to be ready
echo "⏳ Waiting for backend at $BACKEND_URL..."
MAX_RETRIES=30
RETRY=0
until curl -sf "$BACKEND_URL/health" > /dev/null 2>&1; do
    RETRY=$((RETRY + 1))
    if [ $RETRY -ge $MAX_RETRIES ]; then
        echo "✗ Backend not reachable after $MAX_RETRIES attempts."
        echo "  Make sure 'docker compose up' is running."
        echo "  Check that GEMINI_API_KEY is set in .env"
        exit 1
    fi
    echo "  Attempt $RETRY/$MAX_RETRIES..."
    sleep 2
done
echo "✓ Backend is ready!"
echo ""

# Verify deals loaded
echo "📋 Checking sample data..."
DEAL_COUNT=$(curl -sf "$BACKEND_URL/deals" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
echo "✓ $DEAL_COUNT deals loaded"
echo ""

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✓ Setup complete!                                     ║"
echo "║                                                         ║"
echo "║  Frontend:  http://localhost:3100                       ║"
echo "║  Backend:   http://localhost:8000                       ║"
echo "║  API docs:  http://localhost:8000/docs                  ║"
echo "║                                                         ║"
echo "║  LLM:       Gemini 2.0 Flash Lite (Google AI Studio)   ║"
echo "║  Fallback:  Gemma 3 27B (automatic on rate limit)      ║"
echo "║                                                         ║"
echo "║  Next: Run the E2E test:                               ║"
echo "║    cd sample_data && python3 test_e2e.py               ║"
echo "╚══════════════════════════════════════════════════════════╝"
