@echo off
REM Windows development startup script
REM Run this to start all services (requires separate terminals)

echo Starting AI Video Creator...
echo.
echo Please open 3 separate terminals and run:
echo.
echo Terminal 1 - Backend:
echo   uvicorn backend.main:app --reload --port 8000
echo.
echo Terminal 2 - Celery Worker:
echo   celery -A backend.celery_worker worker --loglevel=info --pool=solo
echo.
echo Terminal 3 - Frontend:
echo   cd frontend
echo   npm run dev
echo.
pause

