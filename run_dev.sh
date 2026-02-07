#!/bin/bash

# Development startup script
# Run this to start all services

echo "Starting AI Video Creator..."

# Start Redis with Docker (if Docker is available)
if command -v docker &> /dev/null; then
    echo "Checking Redis container..."
    if ! docker ps | grep -q redis; then
        if docker ps -a | grep -q redis; then
            echo "Starting existing Redis container..."
            docker start redis
        else
            echo "Creating and starting Redis container..."
            docker run -d -p 6379:6379 --name redis redis:latest
        fi
        echo "Waiting for Redis to be ready..."
        sleep 2
    else
        echo "Redis container is already running"
    fi
    REDIS_CONTAINER="redis"
else
    echo "Docker not found. Please ensure Redis is running on localhost:6379"
    echo "You can start Redis with: docker run -d -p 6379:6379 --name redis redis:latest"
    REDIS_CONTAINER=""
fi

# Start FastAPI backend
echo "Starting FastAPI backend..."
uvicorn backend.main:app --reload --port 8000 &
BACKEND_PID=$!

# Start Celery worker
echo "Starting Celery worker..."
# Detect Windows - check multiple indicators
IS_WINDOWS=false
if [[ "$OS" == "Windows_NT" ]] || [[ -n "$MSYSTEM" ]] || [[ -n "$WINDIR" ]]; then
    IS_WINDOWS=true
elif command -v uname &> /dev/null; then
    UNAME_OUT=$(uname -s 2>/dev/null || echo "")
    if [[ "$UNAME_OUT" == *"MINGW"* ]] || [[ "$UNAME_OUT" == *"MSYS"* ]] || [[ "$UNAME_OUT" == *"CYGWIN"* ]]; then
        IS_WINDOWS=true
    fi
fi

# Additional check: if Python reports Windows platform
if [[ "$IS_WINDOWS" == "false" ]] && command -v python &> /dev/null; then
    PYTHON_PLATFORM=$(python -c "import sys; print(sys.platform)" 2>/dev/null || echo "")
    if [[ "$PYTHON_PLATFORM" == "win32" ]]; then
        IS_WINDOWS=true
    fi
fi

if [[ "$IS_WINDOWS" == "true" ]]; then
    echo "Detected Windows - using solo pool (Windows doesn't support prefork)"
    celery -A backend.celery_worker worker --loglevel=info --pool=solo &
else
    echo "Detected Unix-like system - using prefork pool with concurrency=2"
    celery -A backend.celery_worker worker --loglevel=info --concurrency=2 &
fi
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

# Cleanup function
cleanup() {
    echo ""
    echo "Stopping services..."
    kill $BACKEND_PID $CELERY_PID $FRONTEND_PID 2>/dev/null
    if [ -n "$REDIS_CONTAINER" ]; then
        echo "Stopping Redis container..."
        docker stop redis 2>/dev/null
    fi
    exit
}

# Wait for interrupt
trap cleanup INT TERM
wait

