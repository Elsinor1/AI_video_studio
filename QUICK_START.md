# Quick Start Guide

## How to Run the Application

You need **3 separate terminal windows** running simultaneously:

### Terminal 1: Backend Server
```bash
# Activate virtual environment
source .venv/Scripts/activate

# Start FastAPI backend
uvicorn backend.main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
```

### Terminal 2: Celery Worker (for AI tasks)
```bash
# Activate virtual environment
source .venv/Scripts/activate

# Make sure Redis is running first!
# Then start Celery worker (--concurrency=2 limits to 2 workers)
celery -A backend.celery_worker worker --loglevel=info --concurrency=2
```

**Note:** You need Redis running. If you don't have it:
- Windows: Install via WSL or use Docker
- Or skip Celery for now (AI features won't work, but you can test the UI)

### Terminal 3: Frontend
```bash
cd frontend
npm install  # First time only
npm run dev
```

You should see:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:3000/
```

## Access the App

Open your browser to: **http://localhost:3000**

## Missing Dependencies?

If you see import errors, install remaining packages:

```bash
source .venv/Scripts/activate
pip install openai celery redis pillow --trusted-host pypi.org --trusted-host pypi.python.org --trusted-host files.pythonhosted.org
```

## Troubleshooting

### Redis not running?
- Error: `Error 111 connecting to localhost:6379`
- **Solution:** Start Redis or skip Celery for now (UI will still work)

### Port already in use?
- Change port: `uvicorn backend.main:app --reload --port 8001`
- Update frontend proxy in `frontend/vite.config.js`

### Module not found?
- Make sure virtual environment is activated: `source .venv/Scripts/activate`
- Install missing packages from requirements.txt
