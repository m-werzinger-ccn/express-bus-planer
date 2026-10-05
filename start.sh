#!/usr/bin/env bash
# ExpressNetz lokal starten: Backend (FastAPI) liefert API + gebautes Frontend auf http://localhost:8000
set -euo pipefail
cd "$(dirname "$0")"
PY=$(command -v python3.13 || command -v python3.12 || command -v python3.11 || command -v python3.10 || command -v python3)
if [ ! -d .venv ]; then
  echo "Python: $($PY --version)"
  "$PY" -m venv .venv
  .venv/bin/pip install -q -r backend/requirements.txt
fi
if [ ! -d frontend/dist ]; then
  (cd frontend && npm install && npm run build)
fi
echo "→ http://localhost:8000"
cd backend && ../.venv/bin/uvicorn app.main:app --port 8000
