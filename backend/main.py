"""
FastAPI backend for AI Video Creator workflow
"""
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import os
import shutil
from dotenv import load_dotenv

from .database import SessionLocal, engine, Base
from . import models, schemas, crud, ai_services

load_dotenv()

# Create database tables
Base.metadata.create_all(bind=engine)

# Create base storage directory (project-specific folders will be created as needed)
os.makedirs("storage", exist_ok=True)

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


# Project endpoints
@app.post("/api/projects", response_model=schemas.Project)
def create_project(project: schemas.ProjectCreate, db: Session = Depends(get_db)):
    """Create a new project"""
    return crud.create_project(db=db, project=project)


@app.get("/api/projects", response_model=list[schemas.Project])
def list_projects(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List all projects"""
    return crud.get_projects(db=db, skip=skip, limit=limit)


@app.get("/api/projects/{project_id}", response_model=schemas.Project)
def get_project(project_id: int, db: Session = Depends(get_db)):
    """Get a specific project"""
    project = crud.get_project(db=db, project_id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@app.put("/api/projects/{project_id}", response_model=schemas.Project)
def update_project(project_id: int, project: schemas.ProjectUpdate, db: Session = Depends(get_db)):
    """Update a project"""
    updated = crud.update_project(db=db, project_id=project_id, project=project)
    if not updated:
        raise HTTPException(status_code=404, detail="Project not found")
    return updated


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    """Delete a project and all associated data"""
    deleted = crud.delete_project(db=db, project_id=project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Move project's storage folder to removed directory
    project_storage_path = os.path.join("storage", f"project_{project_id}")
    removed_dir = os.path.join("storage", "removed")
    removed_project_path = os.path.join(removed_dir, f"project_{project_id}")
    
    if os.path.exists(project_storage_path):
        try:
            # Create removed directory if it doesn't exist
            os.makedirs(removed_dir, exist_ok=True)
            # Move the folder to removed directory
            if os.path.exists(removed_project_path):
                # If destination already exists, remove it first
                shutil.rmtree(removed_project_path)
            shutil.move(project_storage_path, removed_project_path)
        except Exception as e:
            # Log error but don't fail the deletion
            print(f"Warning: Could not move storage folder for project {project_id}: {e}")
    
    return {"message": "Project deleted successfully"}


@app.post("/api/projects/{project_id}/approve")
def approve_project(project_id: int, db: Session = Depends(get_db)):
    """Approve project script and trigger scene segmentation"""
    project = crud.get_project(db=db, project_id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Update status
    project.status = "approved"
    db.commit()
    
    # Trigger scene segmentation
    from .tasks import segment_project_task
    segment_project_task.delay(project_id)
    
    return {"message": "Project approved, scene segmentation started"}


# Scene endpoints
@app.get("/api/projects/{project_id}/scenes", response_model=list[schemas.Scene])
def get_scenes(project_id: int, db: Session = Depends(get_db)):
    """Get all scenes for a project"""
    return crud.get_scenes_by_project(db=db, project_id=project_id)


@app.put("/api/scenes/{scene_id}", response_model=schemas.Scene)
def update_scene(scene_id: int, scene: schemas.SceneUpdate, db: Session = Depends(get_db)):
    """Update a scene"""
    updated = crud.update_scene(db=db, scene_id=scene_id, scene=scene)
    if not updated:
        raise HTTPException(status_code=404, detail="Scene not found")
    return updated


@app.post("/api/scenes/{scene_id}/approve")
def approve_scene(scene_id: int, visual_style_id: int = None, db: Session = Depends(get_db)):
    """Approve scene and trigger image generation"""
    scene = crud.get_scene(db=db, scene_id=scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    
    scene.status = "approved"
    db.commit()
    
    # Trigger image generation with visual style
    from .tasks import generate_image_task
    generate_image_task.delay(scene_id, visual_style_id)
    
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
def reject_image(image_id: int, visual_style_id: int = None, db: Session = Depends(get_db)):
    """Reject an image and generate a new one"""
    image = crud.get_image(db=db, image_id=image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    image.status = "rejected"
    db.commit()
    
    # Use the same visual style if not specified
    style_id = visual_style_id if visual_style_id else image.visual_style_id
    
    # Generate new image
    from .tasks import generate_image_task
    generate_image_task.delay(image.scene_id, style_id)
    
    return {"message": "Image rejected, generating new one"}


# Video endpoints
@app.post("/api/projects/{project_id}/create-video")
def create_video(project_id: int, db: Session = Depends(get_db)):
    """Create video from approved images"""
    project = crud.get_project(db=db, project_id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Trigger video creation
    from .tasks import create_video_task
    create_video_task.delay(project_id)
    
    return {"message": "Video creation started"}


@app.get("/api/videos/{video_id}", response_model=schemas.Video)
def get_video(video_id: int, db: Session = Depends(get_db)):
    """Get a video"""
    video = crud.get_video(db=db, video_id=video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video


@app.get("/api/projects/{project_id}/video", response_model=schemas.Video)
def get_project_video(project_id: int, db: Session = Depends(get_db)):
    """Get video for a project"""
    video = crud.get_video_by_project(db=db, project_id=project_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video


# Visual Style endpoints
@app.post("/api/visual-styles", response_model=schemas.VisualStyle)
def create_visual_style(visual_style: schemas.VisualStyleCreate, db: Session = Depends(get_db)):
    """Create a new visual style"""
    return crud.create_visual_style(db=db, visual_style=visual_style)


@app.get("/api/visual-styles", response_model=list[schemas.VisualStyle])
def list_visual_styles(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List all visual styles"""
    return crud.get_visual_styles(db=db, skip=skip, limit=limit)


@app.get("/api/visual-styles/{style_id}", response_model=schemas.VisualStyle)
def get_visual_style(style_id: int, db: Session = Depends(get_db)):
    """Get a specific visual style"""
    style = crud.get_visual_style(db=db, style_id=style_id)
    if not style:
        raise HTTPException(status_code=404, detail="Visual style not found")
    return style


@app.put("/api/visual-styles/{style_id}", response_model=schemas.VisualStyle)
def update_visual_style(style_id: int, visual_style: schemas.VisualStyleUpdate, db: Session = Depends(get_db)):
    """Update a visual style"""
    updated = crud.update_visual_style(db=db, style_id=style_id, visual_style=visual_style)
    if not updated:
        raise HTTPException(status_code=404, detail="Visual style not found")
    return updated


@app.delete("/api/visual-styles/{style_id}")
def delete_visual_style(style_id: int, db: Session = Depends(get_db)):
    """Delete a visual style"""
    deleted = crud.delete_visual_style(db=db, style_id=style_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Visual style not found")
    return {"message": "Visual style deleted successfully"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

