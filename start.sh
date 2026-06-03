#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Terminate all background jobs when this script is stopped/killed
trap 'kill $(jobs -p) 2>/dev/null || true' EXIT

echo "===================================================="
echo "🚀 Starting Stock Tracker App (React + FastAPI + Supabase)"
echo "===================================================="

# Check if python virtual env exists
if [ ! -d "backend/venv" ]; then
    echo "⚙️ Creating python virtual environment..."
    python3 -m venv backend/venv
    backend/venv/bin/pip install -r backend/requirements.txt
fi

# Run backend in background
echo "📦 Starting FastAPI backend on http://localhost:8000..."
backend/venv/bin/uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000 > backend.log 2>&1 &

# Wait briefly for backend to initialize
sleep 2

# Run frontend in background
echo "💻 Starting React (Vite) frontend..."
cd frontend
npm run dev -- --port 5173 > frontend.log 2>&1 &

echo "===================================================="
echo "✨ Both servers are running!"
echo "   - Backend API: http://localhost:8000"
echo "   - Frontend UI: http://localhost:5173"
echo "   - CSV Database: backend/active_stocks.csv"
echo "===================================================="
echo "Press Ctrl+C to terminate both servers."

# Wait for all background tasks
wait
