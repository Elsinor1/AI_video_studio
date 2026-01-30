"""
FastAPI backend for AI Video Creator workflow
"""
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import os
from dotenv import load_dotenv

from .database import SessionLocal, engine, Base
from . import models, schemas, crud, ai_services

load_dotenv()

# Create database tables
Base.metadata.create_all(bind=engine)

# Create storage directories
os.makedirs("storage/images", exist_ok=True)
os.makedirs("storage/videos", exist_ok=True)

app = FastAPI(title="AI Video Creator", version="1.0.0")

# Serve static files (images and videos)
app.mount("/storage", StaticFiles(directory="storage"), name="storage")

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # React dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Script endpoints
@app.post("/api/scripts", response_model=schemas.Script)
def create_script(script: schemas.ScriptCreate, db: Session = Depends(get_db)):
    """Create a new script draft"""
    return crud.create_script(db=db, script=script)


@app.get("/api/scripts", response_model=list[schemas.Script])
def list_scripts(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List all scripts"""
    return crud.get_scripts(db=db, skip=skip, limit=limit)


@app.get("/api/scripts/{script_id}", response_model=schemas.Script)
def get_script(script_id: int, db: Session = Depends(get_db)):
    """Get a specific script"""
    script = crud.get_script(db=db, script_id=script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    return script


@app.put("/api/scripts/{script_id}", response_model=schemas.Script)
def update_script(script_id: int, script: schemas.ScriptUpdate, db: Session = Depends(get_db)):
    """Update a script"""
    updated = crud.update_script(db=db, script_id=script_id, script=script)
    if not updated:
        raise HTTPException(status_code=404, detail="Script not found")
    return updated


@app.post("/api/scripts/{script_id}/approve")
def approve_script(script_id: int, db: Session = Depends(get_db)):
    """Approve script and trigger scene segmentation"""
    script = crud.get_script(db=db, script_id=script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    
    # Update status
    script.status = "approved"
    db.commit()
    
    # Trigger scene segmentation
    from .tasks import segment_script_task
    segment_script_task.delay(script_id)
    
    return {"message": "Script approved, scene segmentation started"}


# Scene endpoints
@app.get("/api/scripts/{script_id}/scenes", response_model=list[schemas.Scene])
def get_scenes(script_id: int, db: Session = Depends(get_db)):
    """Get all scenes for a script"""
    return crud.get_scenes_by_script(db=db, script_id=script_id)


@app.put("/api/scenes/{scene_id}", response_model=schemas.Scene)
def update_scene(scene_id: int, scene: schemas.SceneUpdate, db: Session = Depends(get_db)):
    """Update a scene"""
    updated = crud.update_scene(db=db, scene_id=scene_id, scene=scene)
    if not updated:
        raise HTTPException(status_code=404, detail="Scene not found")
    return updated


@app.post("/api/scenes/{scene_id}/approve")
def approve_scene(scene_id: int, db: Session = Depends(get_db)):
    """Approve scene and trigger image generation"""
    scene = crud.get_scene(db=db, scene_id=scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    
    scene.status = "approved"
    db.commit()
    
    # Trigger image generation
    from .tasks import generate_image_task
    generate_image_task.delay(scene_id)
    
    return {"message": "Scene approved, image generation started"}


# Image endpoints
@app.get("/api/scenes/{scene_id}/images", response_model=list[schemas.Image])
def get_images(scene_id: int, db: Session = Depends(get_db)):
    """Get all images for a scene"""
    return crud.get_images_by_scene(db=db, scene_id=scene_id)


@app.post("/api/images/{image_id}/approve")
def approve_image(image_id: int, db: Session = Depends(get_db)):
    """Approve an image"""
    image = crud.get_image(db=db, image_id=image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    image.status = "approved"
    db.commit()
    
    return {"message": "Image approved"}


@app.post("/api/images/{image_id}/reject")
def reject_image(image_id: int, db: Session = Depends(get_db)):
    """Reject an image and generate a new one"""
    image = crud.get_image(db=db, image_id=image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    image.status = "rejected"
    db.commit()
    
    # Generate new image
    from .tasks import generate_image_task
    generate_image_task.delay(image.scene_id)
    
    return {"message": "Image rejected, generating new one"}


# Video endpoints
@app.post("/api/scripts/{script_id}/create-video")
def create_video(script_id: int, db: Session = Depends(get_db)):
    """Create video from approved images"""
    script = crud.get_script(db=db, script_id=script_id)
    if not script:
        raise HTTPException(status_code=404, detail="Script not found")
    
    # Trigger video creation
    from .tasks import create_video_task
    create_video_task.delay(script_id)
    
    return {"message": "Video creation started"}


@app.get("/api/videos/{video_id}", response_model=schemas.Video)
def get_video(video_id: int, db: Session = Depends(get_db)):
    """Get a video"""
    video = crud.get_video(db=db, video_id=video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video


@app.get("/api/scripts/{script_id}/video", response_model=schemas.Video)
def get_script_video(script_id: int, db: Session = Depends(get_db)):
    """Get video for a script"""
    video = crud.get_video_by_script(db=db, script_id=script_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

