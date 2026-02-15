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
        
        # Remove any existing scenes so we don't get duplicates (e.g. if task runs twice or user re-approves)
        crud.delete_scenes_by_project(db=db, project_id=project_id)
        
        # Segment project's script content
        scenes_data = ai_services.segment_script(project.script_content)
        
        # Deduplicate by (text, order) in case the AI returns duplicates
        seen = set()
        unique_scenes_data = []
        for s in scenes_data:
            key = (s.get("text", "").strip(), s.get("order"))
            if key in seen:
                continue
            seen.add(key)
            unique_scenes_data.append(s)
        
        # Create scenes in database
        for scene_data in unique_scenes_data:
            crud.create_scene(
                db=db,
                scene=schemas.SceneCreate(
                    project_id=project_id,
                    text=scene_data["text"],
                    order=scene_data["order"]
                )
            )
        
        return {"message": f"Created {len(unique_scenes_data)} scenes", "project_id": project_id}
    finally:
        db.close()


@celery_app.task
def generate_image_task(scene_id: int, visual_style_id: int = None, model_id: str = None, scene_description: str = None, continue_from_previous_scene: bool = False):
    """Generate image for a scene with optional visual style and model selection"""
    print(f"[WORKFLOW] 11. Task: started scene_id={scene_id} visual_style_id={visual_style_id} model_id={model_id} scene_description={'present' if scene_description else 'None'} (len={len(scene_description or '')})")
    db = SessionLocal()
    try:
        scene = crud.get_scene(db=db, scene_id=scene_id)
        if not scene:
            print(f"[WORKFLOW] Task ERROR: Scene not found")
            return {"error": "Scene not found"}
        
        # Get project_id from scene
        project_id = scene.project_id
        print(f"[WORKFLOW] 12. Task: scene loaded project_id={project_id} scene.visual_description len={len(scene.visual_description or '')} scene.text len={len(scene.text or '')}")
        
        # Get visual style description and parameters if provided
        visual_style_description = None
        visual_style_params = None
        if visual_style_id:
            visual_style = crud.get_visual_style(db=db, style_id=visual_style_id)
            if visual_style:
                visual_style_description = visual_style.description
                visual_style_params = visual_style.parameters
        print(f"[WORKFLOW] 13. Task: visual_style_description={visual_style_description is not None} visual_style_params={visual_style_params is not None}")
        
        # Generate image prompt: use provided scene_description (currently displayed) or fall back to scene's current
        desc = scene_description or scene.visual_description or scene.text
        print(f"[WORKFLOW] 14. Task: desc source={'scene_description param' if scene_description else 'scene.visual_description' if scene.visual_description else 'scene.text'} len={len(desc or '')}")
        prompt = ai_services.generate_image_prompt(desc, visual_style_description, visual_style_params)
        print(f"[WORKFLOW] 15. Task: prompt built len={len(prompt)}")
        
        # Create image record
        image = crud.create_image(
            db=db,
            image=schemas.ImageCreate(
                scene_id=scene_id,
                visual_style_id=visual_style_id,
                prompt=prompt
            )
        )
        
        # Reference image: when continue_from_previous_scene, use previous scene's approved image; else use Ref dropdown (Image References)
        reference_image_path = None
        if continue_from_previous_scene:
            scenes = crud.get_scenes_by_project(db=db, project_id=project_id)
            prev_scene = next((s for s in scenes if s.order == scene.order - 1), None)
            if prev_scene and getattr(prev_scene, "approved_image_id", None):
                approved_img = crud.get_image(db=db, image_id=prev_scene.approved_image_id)
                if approved_img and approved_img.file_path:
                    reference_image_path = os.path.join("storage", approved_img.file_path.replace("\\", "/"))
                    if not os.path.isfile(reference_image_path):
                        reference_image_path = None
        if not reference_image_path and getattr(scene, 'image_reference_id', None):
            ref = crud.get_image_reference(db=db, ref_id=scene.image_reference_id)
            if ref and ref.image_path:
                reference_image_path = os.path.join("storage", ref.image_path)
                if not os.path.isfile(reference_image_path):
                    reference_image_path = None
        
        # Generate image in project-specific folder
        output_dir = os.path.join("storage", f"project_{project_id}", "images", f"scene_{scene_id}")
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"image_{image.id}.png")
        
        try:
            print(f"[WORKFLOW] 16. Task: calling generate_image_with_leonardo output_path={output_path}")
            file_path = ai_services.generate_image_with_leonardo(prompt, output_path, reference_image_path=reference_image_path, model_id=model_id)
            # Store relative path from storage directory
            relative_path = file_path.replace("storage/", "").replace("storage\\", "")
            crud.update_image(db=db, image_id=image.id, file_path=relative_path, status="pending")
            print(f"[WORKFLOW] 17. Task: SUCCESS image_id={image.id} file_path={relative_path}")
        except Exception as e:
            print(f"[WORKFLOW] Task ERROR: {e}")
            crud.update_image(db=db, image_id=image.id, status="rejected")
            return {"error": str(e)}
        
        return {"message": "Image generated", "image_id": image.id, "scene_id": scene_id}
    finally:
        db.close()


@celery_app.task
def create_video_task(project_id: int):
    """Create video from scene images"""
    db = SessionLocal()
    try:
        project = crud.get_project(db=db, project_id=project_id)
        if not project:
            return {"error": "Project not found"}
        
        # Get all scenes with images (use the latest image for each scene)
        scenes = crud.get_scenes_by_project(db=db, project_id=project_id)
        image_paths = []
        
        for scene in scenes:
            images = crud.get_images_by_scene(db=db, scene_id=scene.id)
            latest_image = images[0] if images else None
            if latest_image and latest_image.file_path:
                # Convert relative path back to full path for FFmpeg
                full_path = os.path.join("storage", latest_image.file_path)
                image_paths.append(full_path)
        
        if not image_paths:
            return {"error": "No images found for scenes"}
        
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

