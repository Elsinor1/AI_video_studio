#!/bin/bash

# Development startup script
# Run this to start all services

echo "Starting AI Video Creator..."

# Use virtual environment Python if it exists (so uvicorn/celery are found)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Add FFmpeg to PATH if installed via winget
FFMPEG_WINGET_DIR="$(ls -d /c/Users/*/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg*/ffmpeg-*/bin 2>/dev/null | head -1)"
if [[ -n "$FFMPEG_WINGET_DIR" ]]; then
    export PATH="$PATH:$FFMPEG_WINGET_DIR"
    echo "Added FFmpeg to PATH from winget: $FFMPEG_WINGET_DIR"
fi

if [[ -d ".venv" ]]; then
    if [[ -f ".venv/Scripts/python" ]]; then
        # Windows
        export PATH="$(pwd)/.venv/Scripts:$PATH"
    elif [[ -f ".venv/bin/python" ]]; then
        # Linux/Mac
        export PATH="$(pwd)/.venv/bin:$PATH"
    fi
    echo "Using virtual environment Python"
fi

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
python -m uvicorn backend.main:app --reload --port 8000 &
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
    python -m celery -A backend.celery_worker worker --loglevel=info --pool=solo &
else
    echo "Detected Unix-like system - using prefork pool with concurrency=2"
    python -m celery -A backend.celery_worker worker --loglevel=info --concurrency=2 &
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

# Cleanup function - stop in reverse order to reduce multiprocessing spawn errors on Windows
# Note: You may see "OSError: [WinError 87] Parametr není správný" when stopping - this is harmless.
# It occurs when uvicorn's --reload spawns a child process that outlives its parent. Safe to ignore.
cleanup() {
    echo ""
    echo "Stopping services..."
    kill -TERM $FRONTEND_PID 2>/dev/null
    kill -TERM $CELERY_PID 2>/dev/null
    kill -TERM $BACKEND_PID 2>/dev/null
    sleep 3
    kill -9 $FRONTEND_PID $CELERY_PID $BACKEND_PID 2>/dev/null
    sleep 2
    if [ -n "$REDIS_CONTAINER" ]; then
        echo "Stopping Redis container..."
        docker stop redis 2>/dev/null || true
    fi
    exit 0
}

# Wait for interrupt
trap cleanup INT TERM
wait

