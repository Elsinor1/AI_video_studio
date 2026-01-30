#!/bin/bash

# Development startup script
# Run this to start all services

echo "Starting AI Video Creator..."

# Start Redis (if not running)
# redis-server --daemonize yes

# Start FastAPI backend
echo "Starting FastAPI backend..."
uvicorn backend.main:app --reload --port 8000 &
BACKEND_PID=$!

# Start Celery worker
echo "Starting Celery worker..."
celery -A backend.celery_worker worker --loglevel=info --concurrency=2 &
CELERY_PID=$!

# Start frontend
echo "Starting React frontend..."
cd frontend
npm run dev &
FRONTEND_PID=$!

echo "All services started!"
echo "Backend: http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for interrupt
trap "kill $BACKEND_PID $CELERY_PID $FRONTEND_PID; exit" INT
wait

