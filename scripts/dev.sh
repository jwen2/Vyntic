#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  local pids
  pids="$(jobs -p)"
  if [ -n "$pids" ]; then
    kill $pids
  fi
}
trap cleanup EXIT

(
  cd "$ROOT_DIR/backend"
  uvicorn app.main:app --reload --port 8000
) &

(
  cd "$ROOT_DIR/frontend"
  npm run dev
) &

wait
