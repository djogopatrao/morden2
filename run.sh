#!/usr/bin/env bash
# Serves this static, dependency-free app and opens it in the browser.
# No build step, no install — see HANDOFF.md §3.
set -euo pipefail

PORT="${PORT:-8765}"
cd "$(dirname "$0")"

if lsof -ti:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Server already running on http://localhost:${PORT}/index.html"
else
  echo "Starting server on http://localhost:${PORT}/index.html"
  python3 -m http.server "$PORT" &
  # Give it a moment to bind before we try to open the browser.
  sleep 1
fi

URL="http://localhost:${PORT}/index.html"
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
elif command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 &
else
  echo "Open $URL in your browser."
fi

wait
