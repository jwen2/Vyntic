#!/bin/bash
# ==============================================================================
# SpokeMatrix Setup Script
# Pulls required Ollama models after docker-compose up
# ==============================================================================

set -e

OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:11434}"
LLM_MODEL="${LLM_MODEL:-deepseek-r1:8b}"
EMBED_MODEL="${EMBED_MODEL:-nomic-embed-text}"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║           SpokeMatrix — Model Setup                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Wait for Ollama to be ready
echo "⏳ Waiting for Ollama at $OLLAMA_HOST..."
MAX_RETRIES=30
RETRY=0
until curl -sf "$OLLAMA_HOST/api/tags" > /dev/null 2>&1; do
    RETRY=$((RETRY + 1))
    if [ $RETRY -ge $MAX_RETRIES ]; then
        echo "✗ Ollama not reachable after $MAX_RETRIES attempts."
        echo "  Make sure 'docker-compose up' is running."
        exit 1
    fi
    echo "  Attempt $RETRY/$MAX_RETRIES..."
    sleep 2
done
echo "✓ Ollama is ready!"
echo ""

# Pull LLM model
echo "📦 Pulling LLM model: $LLM_MODEL"
echo "   (This may take a few minutes on first run...)"
docker-compose exec ollama ollama pull "$LLM_MODEL"
echo "✓ $LLM_MODEL ready"
echo ""

# Pull embedding model
echo "📦 Pulling embedding model: $EMBED_MODEL"
docker-compose exec ollama ollama pull "$EMBED_MODEL"
echo "✓ $EMBED_MODEL ready"
echo ""

# Verify models
echo "Installed models:"
curl -sf "$OLLAMA_HOST/api/tags" | python3 -m json.tool 2>/dev/null || \
    curl -sf "$OLLAMA_HOST/api/tags"
echo ""

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✓ Setup complete!                                     ║"
echo "║                                                         ║"
echo "║  Frontend:  http://localhost:3000                       ║"
echo "║  Backend:   http://localhost:8000                       ║"
echo "║  API docs:  http://localhost:8000/docs                  ║"
echo "║  Ollama:    http://localhost:11434                      ║"
echo "║                                                         ║"
echo "║  Next: Run the E2E test:                               ║"
echo "║    cd sample_data && python3 test_e2e.py               ║"
echo "╚══════════════════════════════════════════════════════════╝"
