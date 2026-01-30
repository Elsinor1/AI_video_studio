# Workflow Overview

## Complete Video Creation Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                   1. CREATE SCRIPT                          │
│  • Write or paste your script content                       │
│  • Add optional title                                       │
│  • Save script                                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                 2. APPROVE SCRIPT                            │
│  • Review script content                                    │
│  • Click "Approve & Segment"                                │
│  • AI automatically segments script into scenes             │
│  • Status: Script → "approved"                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  3. EDIT SCENES                              │
│  • View auto-generated scenes                               │
│  • Edit scene text if needed                                │
│  • Approve each scene individually                          │
│  • Status: Scene → "approved"                               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│               4. GENERATE IMAGES                            │
│  • AI generates image prompt from scene text                 │
│  • DALL-E 3 creates image                                  │
│  • Image appears in gallery                                 │
│  • Status: Image → "pending"                               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                5. REVIEW IMAGES                              │
│  • View generated images                                    │
│  • Approve images you like                                  │
│  • Reject images to regenerate                              │
│  • Status: Image → "approved" or "rejected"                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                 6. CREATE VIDEO                              │
│  • Once all scenes have approved images                     │
│  • Click "Create Video"                                     │
│  • FFmpeg compiles images into video                        │
│  • Status: Video → "approved"                               │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Database Entities

```
Script (1) ──→ (many) Scene (1) ──→ (many) Image
   │                                      │
   └──────────→ (many) Video ←────────────┘
```

### Status Transitions

**Script:**
- `draft` → `approved` (triggers scene segmentation)

**Scene:**
- `pending` → `approved` (triggers image generation)

**Image:**
- `pending` → `approved` (ready for video)
- `pending` → `rejected` (triggers regeneration)

**Video:**
- `pending` → `approved` (final output)
- `pending` → `rejected` (error occurred)

## AI Services Used

1. **Script Segmentation** (GPT-4)
   - Input: Full script text
   - Output: Array of scene objects with text and order

2. **Image Prompt Generation** (GPT-4)
   - Input: Scene text
   - Output: Detailed image generation prompt

3. **Image Generation** (DALL-E 3)
   - Input: Image prompt
   - Output: PNG image file

4. **Video Compilation** (FFmpeg)
   - Input: Sequence of approved images
   - Output: MP4 video file

## Async Processing

All AI operations run asynchronously via Celery:

- Scene segmentation runs in background after script approval
- Image generation runs in background after scene approval
- Video creation runs in background after "Create Video" click

Check Celery worker logs to see progress.

## File Storage

```
storage/
├── images/
│   └── scene_{scene_id}/
│       └── image_{image_id}.png
└── videos/
    └── video_{video_id}.mp4
```

Database stores relative paths (e.g., `images/scene_1/image_1.png`)

## API Endpoints

### Scripts
- `POST /api/scripts` - Create script
- `GET /api/scripts` - List all scripts
- `GET /api/scripts/{id}` - Get script
- `PUT /api/scripts/{id}` - Update script
- `POST /api/scripts/{id}/approve` - Approve & segment

### Scenes
- `GET /api/scripts/{id}/scenes` - Get scenes
- `PUT /api/scenes/{id}` - Update scene
- `POST /api/scenes/{id}/approve` - Approve & generate image

### Images
- `GET /api/scenes/{id}/images` - Get images
- `POST /api/images/{id}/approve` - Approve image
- `POST /api/images/{id}/reject` - Reject & regenerate

### Videos
- `POST /api/scripts/{id}/create-video` - Create video
- `GET /api/scripts/{id}/video` - Get video
- `GET /api/videos/{id}` - Get video by ID

