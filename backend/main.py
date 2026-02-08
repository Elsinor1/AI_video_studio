"""
FastAPI backend for AI Video Creator workflow
"""
from fastapi import FastAPI, HTTPException, Depends, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import Optional
import os
import re
import shutil
import uuid
from dotenv import load_dotenv

from .database import SessionLocal, engine, Base
from . import models, schemas, crud, ai_services

load_dotenv()

# Create database tables
# Note: create_all() only creates missing tables, it doesn't alter existing ones
# If you get schema errors, reset the database by running: python -m backend.reset_db --force
Base.metadata.create_all(bind=engine)

# Check for common schema issues
try:
    from sqlalchemy import inspect
    inspector = inspect(engine)
    if 'scenes' in inspector.get_table_names():
        columns = [col['name'] for col in inspector.get_columns('scenes')]
        if 'project_id' not in columns:
            print("\n" + "="*60)
            print("WARNING: Database schema mismatch detected!")
            print("The 'scenes' table is missing the 'project_id' column.")
            print("\nTo fix this, run:")
            print("  python -m backend.reset_db --force")
            print("\nWARNING: This will delete all existing data!")
            print("="*60 + "\n")
except Exception:
    pass  # Ignore inspection errors during startup

# Create base storage directories
os.makedirs("storage", exist_ok=True)
os.makedirs("storage/image_references", exist_ok=True)

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


@app.post("/api/generate-script", response_model=schemas.ScriptGenerationResponse)
def generate_script_endpoint(body: schemas.ScriptGenerationRequest, db: Session = Depends(get_db)):
    """Generate a script using AI from title, description, and selected script prompt"""
    script_prompt = crud.get_script_prompt(db=db, prompt_id=body.script_prompt_id)
    if not script_prompt:
        raise HTTPException(status_code=404, detail="Script prompt not found")
    try:
        script_content = ai_services.generate_script(
            title=body.title or "",
            description=body.description,
            script_prompt_instructions=script_prompt.script_description,
        )
        return schemas.ScriptGenerationResponse(script_content=script_content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Script generation failed: {str(e)}")


@app.post("/api/projects/{project_id}/script/iterate", response_model=schemas.ScriptIterateResponse)
def iterate_script(project_id: int, body: schemas.ScriptIterateRequest, db: Session = Depends(get_db)):
    """Revise the project script with user feedback. Uses sliding window of last N feedbacks for context."""
    project = crud.get_project(db=db, project_id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not (body.feedback or body.feedback.strip()):
        raise HTTPException(status_code=400, detail="Feedback is required")
    current_script = project.script_content or ""
    previous_feedbacks = crud.get_last_script_iterations_feedback(
        db=db, project_id=project_id, k=ai_services.SCRIPT_ITERATION_WINDOW_SIZE
    )
    try:
        revised = ai_services.revise_script_with_feedback(
            current_script=current_script,
            previous_feedback_list=previous_feedbacks,
            new_feedback=body.feedback.strip(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Script revision failed: {str(e)}")
    iteration = crud.create_script_iteration(
        db=db, project_id=project_id, user_feedback=body.feedback.strip(), revised_script=revised
    )
    crud.update_project(db=db, project_id=project_id, project=schemas.ProjectUpdate(script_content=revised))
    return schemas.ScriptIterateResponse(script_content=revised, round_number=iteration.round_number)


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


# Segmentation preview: one text with "---" between segments; edit then apply to update scenes
SEGMENT_DELIMITER = "\n---\n"


@app.get("/api/projects/{project_id}/segmentation-preview", response_model=schemas.SegmentationPreviewResponse)
def get_segmentation_preview(project_id: int, db: Session = Depends(get_db)):
    """Get script as single text with segment boundaries (---). If scenes exist, they are joined with ---."""
    project = crud.get_project(db=db, project_id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    scenes = crud.get_scenes_by_project(db=db, project_id=project_id)
    if scenes:
        preview_text = SEGMENT_DELIMITER.join(s.text.strip() for s in scenes)
    else:
        preview_text = (project.script_content or "").strip()
    return schemas.SegmentationPreviewResponse(preview_text=preview_text)


@app.put("/api/projects/{project_id}/segmentation-preview", response_model=list[schemas.Scene])
def update_segmentation_preview(project_id: int, body: schemas.SegmentationPreviewUpdate, db: Session = Depends(get_db)):
    """Parse preview text by '---' (on its own line), replace all scenes for this project."""
    project = crud.get_project(db=db, project_id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    raw = (body.preview_text or "").strip()
    segments = [s.strip() for s in re.split(r"\n---\n", raw) if s.strip()]
    if not segments:
        raise HTTPException(status_code=400, detail="At least one non-empty segment is required (use --- on its own line to separate scenes)")
    crud.delete_scenes_by_project(db=db, project_id=project_id)
    for i, text in enumerate(segments):
        crud.create_scene(
            db=db,
            scene=schemas.SceneCreate(project_id=project_id, text=text, order=i + 1),
        )
    return crud.get_scenes_by_project(db=db, project_id=project_id)


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


@app.post("/api/scenes/{scene_id}/generate-visual-description")
def generate_scene_visual_description(scene_id: int, db: Session = Depends(get_db)):
    """Generate a visual description for a scene using AI"""
    scene = crud.get_scene(db=db, scene_id=scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    
    # Get scene style if available
    scene_style_description = None
    scene_style_params = None
    if scene.scene_style_id:
        scene_style = crud.get_scene_style(db=db, style_id=scene.scene_style_id)
        if scene_style:
            scene_style_description = scene_style.description
            scene_style_params = scene_style.parameters
    
    # Generate visual description using AI with scene style
    from . import ai_services
    visual_description = ai_services.generate_visual_description(
        scene.text, 
        scene_style_description=scene_style_description,
        scene_style_params=scene_style_params
    )
    
    # Save to visual descriptions history
    visual_desc = crud.create_visual_description(
        db=db,
        visual_description=schemas.VisualDescriptionCreate(
            scene_id=scene_id,
            description=visual_description,
            scene_style_id=scene.scene_style_id
        )
    )
    
    # Set as current visual description
    scene.current_visual_description_id = visual_desc.id
    scene.visual_description = visual_description  # Keep backward compatibility
    db.commit()
    db.refresh(scene)
    
    return {"message": "Visual description generated", "visual_description": visual_description, "visual_description_id": visual_desc.id}


@app.get("/api/scenes/{scene_id}/visual-descriptions", response_model=list[schemas.VisualDescription])
def get_scene_visual_descriptions(scene_id: int, db: Session = Depends(get_db)):
    """Get all visual descriptions for a scene"""
    scene = crud.get_scene(db=db, scene_id=scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    return crud.get_visual_descriptions_by_scene(db=db, scene_id=scene_id)


@app.put("/api/scenes/{scene_id}/visual-descriptions/{visual_description_id}/set-current")
def set_current_visual_description(scene_id: int, visual_description_id: int, db: Session = Depends(get_db)):
    """Set a specific visual description as the current one for a scene"""
    updated = crud.update_scene_current_description(db=db, scene_id=scene_id, visual_description_id=visual_description_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Scene or visual description not found")
    return {"message": "Current visual description updated", "visual_description": updated.visual_description}


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


# Scene Style endpoints
@app.post("/api/scene-styles", response_model=schemas.SceneStyle)
def create_scene_style(scene_style: schemas.SceneStyleCreate, db: Session = Depends(get_db)):
    """Create a new scene style"""
    return crud.create_scene_style(db=db, scene_style=scene_style)


@app.get("/api/scene-styles", response_model=list[schemas.SceneStyle])
def list_scene_styles(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List all scene styles"""
    return crud.get_scene_styles(db=db, skip=skip, limit=limit)


@app.get("/api/scene-styles/{style_id}", response_model=schemas.SceneStyle)
def get_scene_style(style_id: int, db: Session = Depends(get_db)):
    """Get a specific scene style"""
    style = crud.get_scene_style(db=db, style_id=style_id)
    if not style:
        raise HTTPException(status_code=404, detail="Scene style not found")
    return style


@app.put("/api/scene-styles/{style_id}", response_model=schemas.SceneStyle)
def update_scene_style(style_id: int, scene_style: schemas.SceneStyleUpdate, db: Session = Depends(get_db)):
    """Update a scene style"""
    updated = crud.update_scene_style(db=db, style_id=style_id, scene_style=scene_style)
    if not updated:
        raise HTTPException(status_code=404, detail="Scene style not found")
    return updated


@app.delete("/api/scene-styles/{style_id}")
def delete_scene_style(style_id: int, db: Session = Depends(get_db)):
    """Delete a scene style"""
    deleted = crud.delete_scene_style(db=db, style_id=style_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Scene style not found")
    return {"message": "Scene style deleted successfully"}


# Script Prompt endpoints
@app.post("/api/script-prompts", response_model=schemas.ScriptPrompt)
def create_script_prompt(script_prompt: schemas.ScriptPromptCreate, db: Session = Depends(get_db)):
    """Create a new script prompt"""
    return crud.create_script_prompt(db=db, script_prompt=script_prompt)


@app.get("/api/script-prompts", response_model=list[schemas.ScriptPrompt])
def list_script_prompts(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List all script prompts"""
    return crud.get_script_prompts(db=db, skip=skip, limit=limit)


@app.get("/api/script-prompts/{prompt_id}", response_model=schemas.ScriptPrompt)
def get_script_prompt(prompt_id: int, db: Session = Depends(get_db)):
    """Get a specific script prompt"""
    prompt = crud.get_script_prompt(db=db, prompt_id=prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Script prompt not found")
    return prompt


@app.put("/api/script-prompts/{prompt_id}", response_model=schemas.ScriptPrompt)
def update_script_prompt(prompt_id: int, script_prompt: schemas.ScriptPromptUpdate, db: Session = Depends(get_db)):
    """Update a script prompt"""
    updated = crud.update_script_prompt(db=db, prompt_id=prompt_id, script_prompt=script_prompt)
    if not updated:
        raise HTTPException(status_code=404, detail="Script prompt not found")
    return updated


@app.delete("/api/script-prompts/{prompt_id}")
def delete_script_prompt(prompt_id: int, db: Session = Depends(get_db)):
    """Delete a script prompt"""
    deleted = crud.delete_script_prompt(db=db, prompt_id=prompt_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Script prompt not found")
    return {"message": "Script prompt deleted successfully"}


# Image Reference endpoints
@app.post("/api/image-references", response_model=schemas.ImageReference)
async def create_image_reference(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Create an image reference by uploading a JPG (or other image) file"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        raise HTTPException(status_code=400, detail="File must be JPG, PNG, or WebP")
    safe_name = "".join(c for c in file.filename if c.isalnum() or c in "._-") or "image"
    stored_name = f"ref_{uuid.uuid4().hex[:12]}_{safe_name}"
    rel_path = f"image_references/{stored_name}"
    full_path = os.path.join("storage", rel_path)
    try:
        contents = await file.read()
        with open(full_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")
    ref = crud.create_image_reference(db=db, name=name, image_path=rel_path, description=description)
    return ref


@app.get("/api/image-references", response_model=list[schemas.ImageReference])
def list_image_references(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """List all image references"""
    return crud.get_image_references(db=db, skip=skip, limit=limit)


@app.get("/api/image-references/{ref_id}", response_model=schemas.ImageReference)
def get_image_reference(ref_id: int, db: Session = Depends(get_db)):
    ref = crud.get_image_reference(db=db, ref_id=ref_id)
    if not ref:
        raise HTTPException(status_code=404, detail="Image reference not found")
    return ref


@app.put("/api/image-references/{ref_id}", response_model=schemas.ImageReference)
def update_image_reference(
    ref_id: int,
    body: schemas.ImageReferenceUpdate,
    db: Session = Depends(get_db),
):
    updated = crud.update_image_reference(db=db, ref_id=ref_id, update=body)
    if not updated:
        raise HTTPException(status_code=404, detail="Image reference not found")
    return updated


@app.delete("/api/image-references/{ref_id}")
def delete_image_reference(ref_id: int, db: Session = Depends(get_db)):
    ref = crud.get_image_reference(db=db, ref_id=ref_id)
    if not ref:
        raise HTTPException(status_code=404, detail="Image reference not found")
    full_path = os.path.join("storage", ref.image_path)
    if os.path.isfile(full_path):
        try:
            os.remove(full_path)
        except Exception:
            pass
    deleted = crud.delete_image_reference(db=db, ref_id=ref_id)
    return {"message": "Image reference deleted successfully"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

