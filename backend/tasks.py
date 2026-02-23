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
    """Legacy: Create video from scene images (fixed duration, no voiceover)"""
    db = SessionLocal()
    try:
        project = crud.get_project(db=db, project_id=project_id)
        if not project:
            return {"error": "Project not found"}
        
        scenes = crud.get_scenes_by_project(db=db, project_id=project_id)
        image_paths = []
        
        for scene in scenes:
            images = crud.get_images_by_scene(db=db, scene_id=scene.id)
            latest_image = images[0] if images else None
            if latest_image and latest_image.file_path:
                full_path = os.path.join("storage", latest_image.file_path)
                image_paths.append(full_path)
        
        if not image_paths:
            return {"error": "No images found for scenes"}
        
        video = crud.create_video(db=db, project_id=project_id)
        
        output_dir = os.path.join("storage", f"project_{project_id}", "videos")
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"video_{video.id}.mp4")
        
        try:
            file_path = ai_services.create_video_from_images(image_paths, output_path)
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


@celery_app.task
def generate_voiceover_task(project_id: int, voiceover_id: int):
    """Generate voiceover for the full project script using ElevenLabs TTS with timestamps."""
    import json as _json
    db = SessionLocal()
    try:
        voiceover = crud.get_voiceover(db=db, voiceover_id=voiceover_id)
        if not voiceover:
            return {"error": "Voiceover record not found"}

        scenes = crud.get_scenes_by_project(db=db, project_id=project_id)
        if not scenes:
            crud.update_voiceover(db=db, voiceover_id=voiceover_id, status="error")
            return {"error": "No scenes found"}

        scene_texts = [s.text for s in scenes]
        scene_ids = [s.id for s in scenes]

        full_text = " ".join(scene_texts)

        audio_dir = os.path.join("storage", f"project_{project_id}", "voiceovers")
        os.makedirs(audio_dir, exist_ok=True)
        audio_path = os.path.join(audio_dir, f"voiceover_{voiceover_id}.mp3")

        tts_kwargs = {}
        if voiceover.tts_settings:
            tts_kwargs = _json.loads(voiceover.tts_settings)
            tts_kwargs = {k: v for k, v in tts_kwargs.items() if v is not None}

        try:
            alignment = ai_services.generate_full_script_speech(full_text, audio_path, **tts_kwargs)
        except Exception as e:
            print(f"[VOICEOVER] TTS failed: {e}")
            crud.update_voiceover(db=db, voiceover_id=voiceover_id, status="error")
            return {"error": str(e)}

        scene_timings = ai_services.compute_scene_timings(scene_texts, scene_ids, alignment)

        end_times = alignment.get("character_end_times_seconds", [])
        total_duration = max(end_times) if end_times else 0.0

        relative_audio = audio_path.replace("storage/", "").replace("storage\\", "")

        crud.update_voiceover(
            db=db,
            voiceover_id=voiceover_id,
            audio_file_path=relative_audio,
            alignment_data=_json.dumps(alignment),
            scene_timings=_json.dumps(scene_timings),
            total_duration=round(total_duration, 3),
            status="ready",
        )

        return {
            "message": "Voiceover generated",
            "voiceover_id": voiceover_id,
            "total_duration": total_duration,
        }
    except Exception as e:
        print(f"[VOICEOVER] Task error: {e}")
        try:
            crud.update_voiceover(db=db, voiceover_id=voiceover_id, status="error")
        except Exception:
            pass
        return {"error": str(e)}
    finally:
        db.close()


@celery_app.task
def render_video_task(project_id: int, voiceover_id: int):
    """Render final video from voiceover + scene timings + transitions + optional captions."""
    import json as _json
    db = SessionLocal()
    try:
        voiceover = crud.get_voiceover(db=db, voiceover_id=voiceover_id)
        if not voiceover or voiceover.status != "ready":
            return {"error": "Voiceover not ready"}

        scenes = crud.get_scenes_by_project(db=db, project_id=project_id)
        if not scenes:
            return {"error": "No scenes found"}

        scene_map = {s.id: s for s in scenes}
        timings = _json.loads(voiceover.scene_timings) if voiceover.scene_timings else []
        if not timings:
            return {"error": "No scene timings found"}

        scene_entries = []
        for t in timings:
            scene = scene_map.get(t["scene_id"])
            if not scene:
                continue

            if scene.approved_image_id:
                img = crud.get_image(db=db, image_id=scene.approved_image_id)
            else:
                imgs = crud.get_images_by_scene(db=db, scene_id=scene.id)
                img = imgs[0] if imgs else None

            if not img or not img.file_path:
                continue

            image_path = os.path.join("storage", img.file_path)
            if not os.path.isfile(image_path):
                continue

            duration = t["end_time"] - t["start_time"]
            if duration <= 0:
                duration = 1.0

            scene_entries.append({
                "image_path": image_path,
                "duration": duration,
                "transition_type": t.get("transition_type", "cut"),
                "transition_duration": t.get("transition_duration", 0.0),
                "image_animation": t.get("image_animation"),
                "image_effect": t.get("image_effect"),
            })

        if not scene_entries:
            return {"error": "No valid scene images found"}

        audio_path = os.path.join("storage", voiceover.audio_file_path)

        ass_path = None
        if voiceover.captions_enabled and voiceover.alignment_data:
            alignment = _json.loads(voiceover.alignment_data)
            ass_dir = os.path.join("storage", f"project_{project_id}", "voiceovers")
            ass_path = os.path.join(ass_dir, f"captions_{voiceover_id}.ass")
            align = getattr(voiceover, "caption_alignment", 2)
            margin_v = getattr(voiceover, "caption_margin_v", 60)
            ai_services.generate_captions_ass(
                alignment, voiceover.caption_style, ass_path,
                caption_alignment=align, caption_margin_v=margin_v,
            )

        video = crud.create_video(db=db, project_id=project_id, voiceover_id=voiceover_id)
        output_dir = os.path.join("storage", f"project_{project_id}", "videos")
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"video_{video.id}.mp4")

        try:
            ai_services.create_video_with_transitions(
                scene_entries=scene_entries,
                audio_path=audio_path,
                output_path=output_path,
                ass_path=ass_path,
            )
            relative_path = output_path.replace("storage/", "").replace("storage\\", "")
            video.file_path = relative_path
            video.status = "approved"
            db.commit()
        except Exception as e:
            print(f"[RENDER] Error: {e}")
            video.status = "rejected"
            db.commit()
            return {"error": str(e)}

        return {"message": "Video rendered", "video_id": video.id}
    except Exception as e:
        print(f"[RENDER] Task error: {e}")
        return {"error": str(e)}
    finally:
        db.close()

