# Redis Setup Guide

## The Problem
Celery requires Redis to work. You're seeing this error:
```
Cannot connect to redis://localhost:6379/0: Error 10061 connecting to localhost:6379
```

## Solutions for Windows

### Option 1: Use WSL (Windows Subsystem for Linux) - Recommended
If you have WSL installed:

```bash
# In WSL terminal
sudo apt-get update
sudo apt-get install redis-server
redis-server
```

Then keep that terminal open. Redis will run in WSL and be accessible from Windows.

### Option 2: Use Docker
If you have Docker Desktop:

```bash
docker run -d -p 6379:6379 --name redis redis:latest
```

To stop: `docker stop redis`
To start again: `docker start redis`

### Option 3: Memurai (Windows Native Redis)
1. Download from: https://www.memurai.com/get-memurai
2. Install and start the service
3. It runs on port 6379 by default

### Option 4: Skip Redis (Limited Functionality)
If you can't install Redis right now, you can:
- Run the backend and frontend (UI will work)
- But AI features (script segmentation, image generation) won't work without Celery/Redis

## Verify Redis is Running

Test connection:
```bash
# If you have redis-cli installed
redis-cli ping
# Should return: PONG
```

Or check if port 6379 is listening:
```bash
netstat -an | findstr 6379
```

## After Redis is Running

Restart Celery with the concurrency limit:
```bash
source .venv/Scripts/activate
celery -A backend.celery_worker worker --loglevel=info --concurrency=2
```
