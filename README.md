# AI Video Creator

A web application for creating AI-generated YouTube videos with a complete workflow: Script → Scenes → Images → Video.

## Features

- **Script Management**: Create, edit, and approve scripts
- **AI Scene Segmentation**: Automatically break scripts into video scenes
- **Scene Editing**: Review and edit individual scenes
- **AI Image Generation**: Generate visuals for each scene using DALL-E
- **Image Approval**: Review and approve/reject generated images
- **Video Compilation**: Create final video from approved images

## Architecture

- **Backend**: FastAPI (Python)
- **Frontend**: React + Vite
- **Database**: SQLite (dev) / PostgreSQL (production)
- **Task Queue**: Celery + Redis
- **AI Services**: OpenAI (GPT-4 for segmentation, DALL-E 3 for images)

## Setup

### Prerequisites

- Python 3.9+
- Node.js 18+
- Redis (for Celery)
- FFmpeg (for video creation)

### Installation

1. **Clone and setup backend**:
```bash
# Install Python dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env

# Edit .env and add your OPENAI_API_KEY
```

2. **Setup frontend**:
```bash
cd frontend
npm install
```

3. **Start Redis** (required for Celery):
```bash
# Windows (using WSL or Docker)
# Or install Redis for Windows

# Linux/Mac
redis-server
```

## Running the Application

### Development Mode

1. **Start the backend**:
```bash
# Terminal 1: FastAPI server
uvicorn backend.main:app --reload --port 8000
```

2. **Start Celery worker** (for async AI tasks):
```bash
# Terminal 2: Celery worker
celery -A backend.celery_worker worker --loglevel=info --concurrency=2
```

3. **Start the frontend**:
```bash
# Terminal 3: React dev server
cd frontend
npm run dev
```

4. **Open browser**: http://localhost:3000

## Workflow

1. **Create Script**: Write or paste your script
2. **Approve Script**: Approve to trigger AI scene segmentation
3. **Edit Scenes**: Review and edit individual scenes
4. **Approve Scenes**: Approve scenes to generate images
5. **Review Images**: Approve or reject generated images
6. **Create Video**: Compile approved images into final video

## Project Structure

```
.
├── backend/
│   ├── main.py              # FastAPI app
│   ├── database.py          # DB configuration
│   ├── models.py            # SQLAlchemy models
│   ├── schemas.py           # Pydantic schemas
│   ├── crud.py              # Database operations
│   ├── ai_services.py       # AI integrations
│   ├── tasks.py             # Celery tasks
│   └── celery_worker.py     # Celery entry point
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Main app component
│   │   └── components/      # React components
│   └── package.json
├── storage/                 # Generated files (images, videos)
├── requirements.txt
└── README.md
```

## Configuration

### Environment Variables

- `OPENAI_API_KEY`: Required for AI features
- `DATABASE_URL`: Database connection string
- `REDIS_URL`: Redis connection for Celery

### AI Services

Currently uses:
- **OpenAI GPT-4**: Script segmentation
- **DALL-E 3**: Image generation
- **FFmpeg**: Video compilation

You can extend `ai_services.py` to add:
- Stability AI
- Runway ML
- Other image/video generation APIs

## Storage

- **Database**: Scripts, scenes, images, videos metadata
- **File System**: Generated images and videos in `storage/` directory
- **Future**: Can migrate to S3/MinIO for cloud storage

## Development Notes

- SQLite is used by default for easy development
- Switch to PostgreSQL for production
- Images are stored locally in `storage/images/`
- Videos are stored in `storage/videos/`
- Celery tasks run asynchronously - check worker logs for progress

## Next Steps

- Add user authentication
- Support multiple video formats
- Add TTS (text-to-speech) integration
- Background music support
- Video transitions and effects
- Cloud storage integration (S3)
- Multi-user support

## License

MIT

