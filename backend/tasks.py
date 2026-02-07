"""
Celery tasks for async AI operations
"""
from celery import Celery
import os
from dotenv import load_dotenv
from .database import SessionLocal
from . import crud, ai_services, models, schemas

load_dotenv()

# Celery configuration
celery_app = Celery(
    "video_creator",
    broker=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
    backend=os.getenv("REDIS_URL", "redis://localhost:6379/0")
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
)


@celery_app.task
def segment_project_task(project_id: int):
    """Segment a project's script content into scenes"""
    db = SessionLocal()
    try:
        project = crud.get_project(db=db, project_id=project_id)
        if not project:
            return {"error": "Project not found"}
        
        # Segment project's script content
        scenes_data = ai_services.segment_script(project.script_content)
        
        # Create scenes in database
        for scene_data in scenes_data:
            crud.create_scene(
                db=db,
                scene=schemas.SceneCreate(
                    project_id=project_id,
                    text=scene_data["text"],
                    order=scene_data["order"]
                )
            )
        
        return {"message": f"Created {len(scenes_data)} scenes", "project_id": project_id}
    finally:
        db.close()


@celery_app.task
def generate_image_task(scene_id: int, visual_style_id: int = None):
    """Generate image for a scene with optional visual style"""
    db = SessionLocal()
    try:
        scene = crud.get_scene(db=db, scene_id=scene_id)
        if not scene:
            return {"error": "Scene not found"}
        
        # Get project_id from scene
        project_id = scene.project_id
        
        # Get visual style description and parameters if provided
        visual_style_description = None
        visual_style_params = None
        if visual_style_id:
            visual_style = crud.get_visual_style(db=db, style_id=visual_style_id)
            if visual_style:
                visual_style_description = visual_style.description
                visual_style_params = visual_style.parameters
        
        # Generate image prompt with visual style
        prompt = ai_services.generate_image_prompt(scene.text, visual_style_description, visual_style_params)
        
        # Create image record
        image = crud.create_image(
            db=db,
            image=schemas.ImageCreate(
                scene_id=scene_id,
                visual_style_id=visual_style_id,
                prompt=prompt
            )
        )
        
        # Generate image in project-specific folder
        output_dir = os.path.join("storage", f"project_{project_id}", "images", f"scene_{scene_id}")
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"image_{image.id}.png")
        
        try:
            file_path = ai_services.generate_image_with_leonardo(prompt, output_path)
            # Store relative path from storage directory
            relative_path = file_path.replace("storage/", "").replace("storage\\", "")
            crud.update_image(db=db, image_id=image.id, file_path=relative_path, status="pending")
        except Exception as e:
            crud.update_image(db=db, image_id=image.id, status="rejected")
            return {"error": str(e)}
        
        return {"message": "Image generated", "image_id": image.id, "scene_id": scene_id}
    finally:
        db.close()


@celery_app.task
def create_video_task(project_id: int):
    """Create video from approved images"""
    db = SessionLocal()
    try:
        project = crud.get_project(db=db, project_id=project_id)
        if not project:
            return {"error": "Project not found"}
        
        # Get all scenes with approved images
        scenes = crud.get_scenes_by_project(db=db, project_id=project_id)
        image_paths = []
        
        for scene in scenes:
            images = crud.get_images_by_scene(db=db, scene_id=scene.id)
            approved_image = next((img for img in images if img.status == "approved"), None)
            if approved_image and approved_image.file_path:
                # Convert relative path back to full path for FFmpeg
                full_path = os.path.join("storage", approved_image.file_path)
                image_paths.append(full_path)
        
        if not image_paths:
            return {"error": "No approved images found"}
        
        # Create video record
        video = crud.create_video(db=db, project_id=project_id)
        
        # Generate video in project-specific folder
        output_dir = os.path.join("storage", f"project_{project_id}", "videos")
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"video_{video.id}.mp4")
        
        try:
            file_path = ai_services.create_video_from_images(image_paths, output_path)
            # Store relative path from storage directory
            relative_path = file_path.replace("storage/", "").replace("storage\\", "")
            video.file_path = relative_path
            video.status = "approved"
            db.commit()
        except Exception as e:
            video.status = "rejected"
            db.commit()
            return {"error": str(e)}
        
        return {"message": "Video created", "video_id": video.id, "project_id": project_id}
    finally:
        db.close()

