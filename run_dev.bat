@echo off
REM Windows development startup script
REM Run this to start all services

echo Starting AI Video Creator...
echo.

REM Start Redis with Docker (if Docker is available)
where docker >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo Checking Redis container...
    docker ps | findstr /C:"redis" >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        docker ps -a | findstr /C:"redis" >nul 2>&1
        if %ERRORLEVEL% == 0 (
            echo Starting existing Redis container...
            docker start redis
        ) else (
            echo Creating and starting Redis container...
            docker run -d -p 6379:6379 --name redis redis:latest
        )
        timeout /t 2 /nobreak >nul
    ) else (
        echo Redis container is already running
    )
    set REDIS_CONTAINER=redis
) else (
    echo Docker not found. Please ensure Redis is running on localhost:6379
    echo You can start Redis with: docker run -d -p 6379:6379 --name redis redis:latest
    set REDIS_CONTAINER=
)

echo.
echo Starting FastAPI backend...
start "Backend" cmd /k "uvicorn backend.main:app --reload --port 8000"

echo Starting Celery worker...
start "Celery Worker" cmd /k "celery -A backend.celery_worker worker --loglevel=info --pool=solo"

echo Starting React frontend...
start "Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo All services started!
echo Backend: http://localhost:8000
echo Frontend: http://localhost:3000
echo.
echo Services are running in separate windows.
echo Close those windows to stop the services.
if defined REDIS_CONTAINER (
    echo.
    echo To stop Redis: docker stop redis
)
echo.
pause

