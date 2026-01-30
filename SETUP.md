# Quick Setup Guide

## Prerequisites

1. **Python 3.9+** - [Download](https://www.python.org/downloads/)
2. **Node.js 18+** - [Download](https://nodejs.org/)
3. **Redis** - For Celery task queue
   - Windows: Use WSL or Docker, or download from [Memurai](https://www.memurai.com/)
   - Mac: `brew install redis`
   - Linux: `sudo apt-get install redis-server`
4. **FFmpeg** - For video creation
   - Windows: [Download](https://ffmpeg.org/download.html) and add to PATH
   - Mac: `brew install ffmpeg`
   - Linux: `sudo apt-get install ffmpeg`
5. **OpenAI API Key** - Get from [OpenAI Platform](https://platform.openai.com/api-keys)

## Installation Steps

### 1. Backend Setup

```bash
# Install Python dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Edit .env and add your OpenAI API key
# OPENAI_API_KEY=sk-your-key-here
```

### 2. Frontend Setup

```bash
cd frontend
npm install
```

### 3. Start Services

You need **3 terminals** running:

**Terminal 1 - Backend:**
```bash
uvicorn backend.main:app --reload --port 8000
```

**Terminal 2 - Celery Worker:**
```bash
# Make sure Redis is running first!
celery -A backend.celery_worker worker --loglevel=info
```

**Terminal 3 - Frontend:**
```bash
cd frontend
npm run dev
```

### 4. Access the App

Open your browser to: **http://localhost:3000**

## Troubleshooting

### Redis not running
- Error: `Error 111 connecting to localhost:6379`
- Solution: Start Redis server first
  - Windows (WSL): `redis-server`
  - Mac/Linux: `redis-server` or `sudo systemctl start redis`

### FFmpeg not found
- Error: `FFmpeg not found. Please install FFmpeg to create videos.`
- Solution: Install FFmpeg and ensure it's in your PATH
  - Test: Run `ffmpeg -version` in terminal

### OpenAI API errors
- Error: `Invalid API key`
- Solution: Check your `.env` file has the correct `OPENAI_API_KEY`

### Database errors
- If you see database errors, delete `video_creator.db` and restart the backend
- The database will be recreated automatically

## First Run

1. Create a new script
2. Write or paste your content
3. Click "Save Script"
4. Click "Approve & Segment" - this triggers AI scene segmentation
5. Wait a few seconds, then click "View Scenes"
6. Edit scenes if needed, then approve each scene
7. Images will be generated automatically
8. Review images in the gallery, approve or reject
9. Once all scenes have approved images, create the video

## Notes

- Scene segmentation and image generation happen asynchronously
- Check the Celery worker terminal for progress logs
- Images are stored in `storage/images/`
- Videos are stored in `storage/videos/`
- The database file is `video_creator.db` (SQLite)

