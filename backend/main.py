"""
FastAPI backend for AI Video Creator workflow
"""
from fastapi import FastAPI, HTTPException, Depends, File, UploadFile, Form, Body
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

# Check for common schema issues and auto-migrate new columns
try:
    from sqlalchemy import inspect, text as sa_text
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    if 'scenes' in tables:
        columns = [col['name'] for col in inspector.get_columns('scenes')]
        if 'project_id' not in columns:
            print("\n" + "="*60)
            print("WARNING: Database schema mismatch detected!")
            print("The 'scenes' table is missing the 'project_id' column.")
            print("\nTo fix this, run:")
            print("  python -m backend.reset_db --force")
            print("\nWARNING: This will delete all existing data!")
            print("="*60 + "\n")
    if 'videos' in tables:
        vid_cols = [col['name'] for col in inspector.get_columns('videos')]
        if 'voiceover_id' not in vid_cols:
            with engine.begin() as conn:
                conn.execute(sa_text("ALTER TABLE videos ADD COLUMN voiceover_id INTEGER REFERENCES voiceovers(id)"))
            print("[MIGRATE] Added voiceover_id column to videos table")
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


@app.post("/api/projects/{project_id}/scenes/insert", response_model=schemas.Scene)
def insert_scene(project_id: int, body: schemas.InsertSceneRequest, db: Session = Depends(get_db)):
    """Insert a new scene at a specific position (after_order=0 inserts at beginning)"""
    project = crud.get_project(db=db, project_id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    new_scene = crud.insert_scene_at(db=db, project_id=project_id, after_order=body.after_order, text=body.text)
    return new_scene


@app.delete("/api/scenes/{scene_id}")
def delete_scene(scene_id: int, db: Session = Depends(get_db)):
    """Delete a single scene and renumber remaining scenes"""
    scene = crud.get_scene(db=db, scene_id=scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    crud.delete_scene(db=db, scene_id=scene_id)
    return {"message": "Scene deleted successfully"}


@app.put("/api/scenes/{scene_id}", response_model=schemas.Scene)
def update_scene(scene_id: int, scene: schemas.SceneUpdate, db: Session = Depends(get_db)):
    """Update a scene"""
    updated = crud.update_scene(db=db, scene_id=scene_id, scene=scene)
    if not updated:
        raise HTTPException(status_code=404, detail="Scene not found")
    return updated


@app.post("/api/scenes/{scene_id}/generate-visual-description")
def generate_scene_visual_description(scene_id: int, continue_from_previous_scene: bool = False, body: Optional[schemas.GenerateVisualDescriptionRequest] = Body(default=None), db: Session = Depends(get_db)):
    """Generate a scene description for a scene using AI"""
    scene = crud.get_scene(db=db, scene_id=scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    
    instruction = (body.instruction or "").strip() if body else None
    
    # Get scene style if available
    scene_style_description = None
    scene_style_params = None
    if scene.scene_style_id:
        scene_style = crud.get_scene_style(db=db, style_id=scene.scene_style_id)
        if scene_style:
            scene_style_description = scene_style.description
            scene_style_params = scene_style.parameters
    
    # Get previous scene description if continue_from_previous_scene
    previous_scene_description = None
    if continue_from_previous_scene:
        scenes = crud.get_scenes_by_project(db=db, project_id=scene.project_id)
        prev_scene = next((s for s in scenes if s.order == scene.order - 1), None)
        if prev_scene and prev_scene.visual_description:
            previous_scene_description = prev_scene.visual_description
    
    # Generate scene description using AI with scene style
    from . import ai_services
    visual_description = ai_services.generate_scene_description(
        scene.text, 
        scene_style_description=scene_style_description,
        scene_style_params=scene_style_params,
        previous_scene_description=previous_scene_description,
        instruction=instruction
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
    
    return {"message": "Scene description generated", "visual_description": visual_description, "visual_description_id": visual_desc.id}


@app.post("/api/scenes/{scene_id}/iterate-visual-description")
def iterate_scene_visual_description(scene_id: int, body: schemas.VisualDescriptionIterateRequest, db: Session = Depends(get_db)):
    """Iterate on the current scene description using user comments/feedback"""
    scene = crud.get_scene(db=db, scene_id=scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    base_description = (body.current_description or "").strip() or scene.visual_description
    if not base_description:
        raise HTTPException(status_code=400, detail="No scene description to iterate on. Generate one first.")
    if not body.comments.strip():
        raise HTTPException(status_code=400, detail="Please provide comments for the update.")
    from . import ai_services
    updated_description = ai_services.iterate_scene_description(base_description, body.comments.strip())
    visual_desc = crud.create_visual_description(
        db=db,
        visual_description=schemas.VisualDescriptionCreate(
            scene_id=scene_id,
            description=updated_description,
            scene_style_id=scene.scene_style_id
        )
    )
    scene.current_visual_description_id = visual_desc.id
    scene.visual_description = updated_description
    db.commit()
    db.refresh(scene)
    return {"message": "Scene description updated", "visual_description": updated_description, "visual_description_id": visual_desc.id}


@app.get("/api/scenes/{scene_id}/visual-descriptions", response_model=list[schemas.VisualDescription])
def get_scene_visual_descriptions(scene_id: int, db: Session = Depends(get_db)):
    """Get all scene descriptions for a scene"""
    scene = crud.get_scene(db=db, scene_id=scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    return crud.get_visual_descriptions_by_scene(db=db, scene_id=scene_id)


@app.put("/api/scenes/{scene_id}/visual-descriptions/{visual_description_id}")
def update_visual_description_endpoint(scene_id: int, visual_description_id: int, body: schemas.VisualDescriptionUpdate, db: Session = Depends(get_db)):
    """Update a visual description's text (manual edit)"""
    updated = crud.update_visual_description(db=db, scene_id=scene_id, visual_description_id=visual_description_id, description=body.description)
    if not updated:
        raise HTTPException(status_code=404, detail="Scene or scene description not found")
    return {"message": "Scene description updated", "visual_description": updated.description}


@app.put("/api/scenes/{scene_id}/visual-descriptions/{visual_description_id}/set-current")
def set_current_visual_description(scene_id: int, visual_description_id: int, db: Session = Depends(get_db)):
    """Set a specific scene description as the current one for a scene"""
    updated = crud.update_scene_current_description(db=db, scene_id=scene_id, visual_description_id=visual_description_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Scene or scene description not found")
    return {"message": "Current scene description updated", "visual_description": updated.visual_description}


from pydantic import BaseModel


class GenerateImageRequest(BaseModel):
    scene_description: Optional[str] = None  # Currently displayed description; if omitted, uses scene's current
    continue_from_previous_scene: Optional[bool] = False  # If true, use previous scene's image as reference


PROMPT_MAX_CHARS = 1500  # Leonardo API limit per docs


@app.post("/api/scenes/{scene_id}/generate-image")
def generate_scene_image(scene_id: int, visual_style_id: int = None, model_id: str = None, body: Optional[GenerateImageRequest] = Body(default=None), db: Session = Depends(get_db)):
    """Trigger image generation for a scene with optional model selection"""
    print(f"[WORKFLOW] 8. API: generate-image received scene_id={scene_id} visual_style_id={visual_style_id} model_id={model_id} body={body}")
    scene = crud.get_scene(db=db, scene_id=scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    
    scene_description = body.scene_description if body and body.scene_description else None
    print(f"[WORKFLOW] 9. API: scene_description from body={scene_description is not None} (len={len(scene_description) if scene_description else 0})")
    
    # Build prompt to validate length before queuing (Leonardo limit: 1500 chars)
    visual_style_description = None
    visual_style_params = None
    if visual_style_id:
        visual_style = crud.get_visual_style(db=db, style_id=visual_style_id)
        if visual_style:
            visual_style_description = visual_style.description
            visual_style_params = visual_style.parameters
    desc = scene_description or scene.visual_description or scene.text
    prompt = ai_services.generate_image_prompt(desc, visual_style_description, visual_style_params)
    if len(prompt) > PROMPT_MAX_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Prompt exceeds {PROMPT_MAX_CHARS} character limit (Leonardo API). Current length: {len(prompt)}. Please shorten your scene description."
        )
    
    continue_from_previous_scene = bool(body and body.continue_from_previous_scene)
    from .tasks import generate_image_task
    generate_image_task.delay(scene_id, visual_style_id, model_id, scene_description, continue_from_previous_scene)
    print(f"[WORKFLOW] 10. API: Task queued, returning")
    
    return {"message": "Image generation started"}


# Image endpoints
@app.get("/api/scenes/{scene_id}/images", response_model=list[schemas.Image])
def get_images(scene_id: int, db: Session = Depends(get_db)):
    """Get all images for a scene"""
    return crud.get_images_by_scene(db=db, scene_id=scene_id)


@app.post("/api/scenes/{scene_id}/images/upload", response_model=schemas.Image)
async def upload_scene_image(scene_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Add an image to a scene by uploading from device storage"""
    scene = crud.get_scene(db=db, scene_id=scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        raise HTTPException(status_code=400, detail="File must be JPG, PNG, or WebP")
    project_id = scene.project_id
    output_dir = os.path.join("storage", f"project_{project_id}", "images", f"scene_{scene_id}")
    os.makedirs(output_dir, exist_ok=True)
    stored_name = f"uploaded_{uuid.uuid4().hex[:12]}{ext}"
    rel_path = f"project_{project_id}/images/scene_{scene_id}/{stored_name}"
    full_path = os.path.join("storage", rel_path)
    try:
        contents = await file.read()
        with open(full_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")
    image = crud.create_image(db=db, image=schemas.ImageCreate(scene_id=scene_id, prompt="Uploaded image"))
    crud.update_image(db=db, image_id=image.id, file_path=rel_path.replace("\\", "/"), status="pending")
    db.refresh(image)
    image = crud.get_image(db=db, image_id=image.id)
    return image


@app.post("/api/scenes/{scene_id}/images/from-reference", response_model=schemas.Image)
def add_image_from_reference(scene_id: int, body: schemas.AddImageFromReferenceRequest, db: Session = Depends(get_db)):
    """Add an image to a scene from the image references library"""
    scene = crud.get_scene(db=db, scene_id=scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    ref = crud.get_image_reference(db=db, ref_id=body.image_reference_id)
    if not ref:
        raise HTTPException(status_code=404, detail="Image reference not found")
    src_path = os.path.join("storage", ref.image_path.replace("/", os.sep))
    if not os.path.isfile(src_path):
        raise HTTPException(status_code=404, detail="Image reference file not found")
    project_id = scene.project_id
    output_dir = os.path.join("storage", f"project_{project_id}", "images", f"scene_{scene_id}")
    os.makedirs(output_dir, exist_ok=True)
    ext = os.path.splitext(ref.image_path)[1] or ".png"
    stored_name = f"from_ref_{ref.id}_{uuid.uuid4().hex[:8]}{ext}"
    rel_path = f"project_{project_id}/images/scene_{scene_id}/{stored_name}"
    full_path = os.path.join("storage", rel_path)
    try:
        shutil.copy2(src_path, full_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to copy file: {e}")
    image = crud.create_image(db=db, image=schemas.ImageCreate(scene_id=scene_id, prompt=f"From library: {ref.name}"))
    crud.update_image(db=db, image_id=image.id, file_path=rel_path.replace("\\", "/"), status="pending")
    db.refresh(image)
    image = crud.get_image(db=db, image_id=image.id)
    return image


@app.get("/api/projects/{project_id}/images", response_model=list[schemas.Image])
def get_project_images(project_id: int, db: Session = Depends(get_db)):
    """Get all images from all scenes in a project"""
    project = crud.get_project(db=db, project_id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return crud.get_images_by_project(db=db, project_id=project_id)


@app.post("/api/scenes/{scene_id}/images/from-project-image", response_model=schemas.Image)
def add_image_from_project(scene_id: int, body: schemas.AddImageFromProjectRequest, db: Session = Depends(get_db)):
    """Add an image to a scene by copying from another scene in the same project"""
    scene = crud.get_scene(db=db, scene_id=scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    src_image = crud.get_image(db=db, image_id=body.image_id)
    if not src_image:
        raise HTTPException(status_code=404, detail="Image not found")
    src_scene = crud.get_scene(db=db, scene_id=src_image.scene_id)
    if not src_scene or src_scene.project_id != scene.project_id:
        raise HTTPException(status_code=400, detail="Image must be from the same project")
    if not src_image.file_path:
        raise HTTPException(status_code=400, detail="Source image has no file")
    src_path = os.path.join("storage", src_image.file_path.replace("/", os.sep))
    if not os.path.isfile(src_path):
        raise HTTPException(status_code=404, detail="Source image file not found")
    project_id = scene.project_id
    output_dir = os.path.join("storage", f"project_{project_id}", "images", f"scene_{scene_id}")
    os.makedirs(output_dir, exist_ok=True)
    ext = os.path.splitext(src_image.file_path)[1] or ".png"
    stored_name = f"from_project_{src_image.id}_{uuid.uuid4().hex[:8]}{ext}"
    rel_path = f"project_{project_id}/images/scene_{scene_id}/{stored_name}"
    full_path = os.path.join("storage", rel_path)
    try:
        shutil.copy2(src_path, full_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to copy file: {e}")
    image = crud.create_image(db=db, image=schemas.ImageCreate(scene_id=scene_id, prompt=f"From project: Scene {src_scene.order}"))
    crud.update_image(db=db, image_id=image.id, file_path=rel_path.replace("\\", "/"), status="pending")
    db.refresh(image)
    image = crud.get_image(db=db, image_id=image.id)
    return image


@app.post("/api/images/{image_id}/approve")
def approve_image(image_id: int, db: Session = Depends(get_db)):
    """Approve an image and save it as the scene's approved image (used when continuing from previous scene)"""
    image = crud.get_image(db=db, image_id=image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    image.status = "approved"
    # Save approved image to scene so it's used as reference when continuing from previous scene
    scene = crud.get_scene(db=db, scene_id=image.scene_id)
    if scene:
        scene.approved_image_id = image_id
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


# Voiceover endpoints
@app.post("/api/projects/{project_id}/generate-voiceover")
def generate_voiceover(project_id: int, db: Session = Depends(get_db)):
    """Generate voiceover for the full project script"""
    project = crud.get_project(db=db, project_id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    voiceover = crud.create_voiceover(db=db, project_id=project_id)

    from .tasks import generate_voiceover_task
    generate_voiceover_task.delay(project_id, voiceover.id)

    return {"message": "Voiceover generation started", "voiceover_id": voiceover.id}


@app.get("/api/projects/{project_id}/voiceover", response_model=schemas.Voiceover)
def get_project_voiceover(project_id: int, db: Session = Depends(get_db)):
    """Get the latest voiceover for a project"""
    voiceover = crud.get_voiceover_by_project(db=db, project_id=project_id)
    if not voiceover:
        raise HTTPException(status_code=404, detail="No voiceover found")
    return voiceover


@app.put("/api/projects/{project_id}/voiceover/scene-timings")
def update_voiceover_scene_timings(
    project_id: int,
    body: schemas.UpdateSceneTimings,
    db: Session = Depends(get_db),
):
    """Update scene timings from the timeline editor"""
    import json as _json
    voiceover = crud.get_voiceover_by_project(db=db, project_id=project_id)
    if not voiceover:
        raise HTTPException(status_code=404, detail="No voiceover found")

    timings_json = _json.dumps([t.dict() for t in body.scene_timings])
    crud.update_voiceover(db=db, voiceover_id=voiceover.id, scene_timings=timings_json)
    return {"message": "Scene timings updated"}


@app.put("/api/projects/{project_id}/voiceover/caption-settings")
def update_voiceover_caption_settings(
    project_id: int,
    body: schemas.UpdateCaptionSettings,
    db: Session = Depends(get_db),
):
    """Update caption toggle and style"""
    voiceover = crud.get_voiceover_by_project(db=db, project_id=project_id)
    if not voiceover:
        raise HTTPException(status_code=404, detail="No voiceover found")

    crud.update_voiceover(
        db=db,
        voiceover_id=voiceover.id,
        captions_enabled=body.captions_enabled,
        caption_style=body.caption_style,
    )
    return {"message": "Caption settings updated"}


@app.post("/api/projects/{project_id}/render-video")
def render_video(project_id: int, body: schemas.RenderVideoRequest, db: Session = Depends(get_db)):
    """Render final video using voiceover + scene timings + transitions"""
    project = crud.get_project(db=db, project_id=project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    voiceover = crud.get_voiceover(db=db, voiceover_id=body.voiceover_id)
    if not voiceover or voiceover.project_id != project_id:
        raise HTTPException(status_code=404, detail="Voiceover not found")

    from .tasks import render_video_task
    render_video_task.delay(project_id, voiceover.id)

    return {"message": "Video render started"}


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

