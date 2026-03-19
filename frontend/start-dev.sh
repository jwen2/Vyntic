#!/bin/sh
# Start Next.js dev server in background, then warm up the first page
# so the user doesn't wait for compilation on their first visit.

npm run dev &
DEV_PID=$!

# Wait for Next.js to be ready
echo "Waiting for Next.js dev server..."
until curl -s -o /dev/null http://localhost:3000 2>/dev/null; do
  sleep 1
done
echo "Page compiled and cached — ready for instant loads."

# Keep the dev server in foreground
wait $DEV_PID
