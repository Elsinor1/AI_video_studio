"""
CRUD operations for database models
"""
from sqlalchemy.orm import Session
from sqlalchemy import desc
from . import models, schemas


# Project CRUD
def create_project(db: Session, project: schemas.ProjectCreate):
    db_project = models.Project(**project.dict())
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


def get_project(db: Session, project_id: int):
    return db.query(models.Project).filter(models.Project.id == project_id).first()


def get_projects(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Project).order_by(desc(models.Project.created_at)).offset(skip).limit(limit).all()


def update_project(db: Session, project_id: int, project: schemas.ProjectUpdate):
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        return None
    
    update_data = project.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_project, field, value)
    
    db.commit()
    db.refresh(db_project)
    return db_project


def delete_project(db: Session, project_id: int):
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        return False
    
    db.delete(db_project)
    db.commit()
    return True


# Scene CRUD
def create_scene(db: Session, scene: schemas.SceneCreate):
    db_scene = models.Scene(**scene.dict())
    db.add(db_scene)
    db.commit()
    db.refresh(db_scene)
    return db_scene


def get_scene(db: Session, scene_id: int):
    return db.query(models.Scene).filter(models.Scene.id == scene_id).first()


def get_scenes_by_project(db: Session, project_id: int):
    return db.query(models.Scene).filter(models.Scene.project_id == project_id).order_by(models.Scene.order).all()


def delete_scenes_by_project(db: Session, project_id: int):
    """Delete all scenes for a project (e.g. before re-segmenting).
    Clears approved_image_id and current_visual_description_id first to avoid circular FK errors,
    then cascades to visual_descriptions and images."""
    scenes = db.query(models.Scene).filter(models.Scene.project_id == project_id).all()
    for scene in scenes:
        scene.approved_image_id = None
        scene.current_visual_description_id = None
    db.flush()
    for scene in scenes:
        db.delete(scene)
    db.commit()


def insert_scene_at(db: Session, project_id: int, after_order: int, text: str = ""):
    """Insert a new scene after the given order position.
    after_order=0 inserts at the beginning. Shifts all subsequent scenes' order +1."""
    db.query(models.Scene).filter(
        models.Scene.project_id == project_id,
        models.Scene.order > after_order,
    ).update({models.Scene.order: models.Scene.order + 1})
    db.flush()
    new_scene = models.Scene(
        project_id=project_id,
        text=text,
        order=after_order + 1,
    )
    db.add(new_scene)
    db.commit()
    db.refresh(new_scene)
    return new_scene


def delete_scene(db: Session, scene_id: int):
    """Delete a single scene. Clears circular FK refs first, then deletes and renumbers remaining scenes."""
    scene = db.query(models.Scene).filter(models.Scene.id == scene_id).first()
    if not scene:
        return False
    project_id = scene.project_id
    scene.approved_image_id = None
    scene.current_visual_description_id = None
    db.flush()
    db.delete(scene)
    db.flush()
    remaining = (
        db.query(models.Scene)
        .filter(models.Scene.project_id == project_id)
        .order_by(models.Scene.order)
        .all()
    )
    for idx, s in enumerate(remaining, start=1):
        if s.order != idx:
            s.order = idx
    db.commit()
    return True


def update_scene(db: Session, scene_id: int, scene: schemas.SceneUpdate):
    db_scene = db.query(models.Scene).filter(models.Scene.id == scene_id).first()
    if not db_scene:
        return None
    
    update_data = scene.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_scene, field, value)
    
    db.commit()
    db.refresh(db_scene)
    return db_scene


# Visual Style CRUD
def create_visual_style(db: Session, visual_style: schemas.VisualStyleCreate):
    db_style = models.VisualStyle(**visual_style.dict())
    db.add(db_style)
    db.commit()
    db.refresh(db_style)
    return db_style


def get_visual_style(db: Session, style_id: int):
    return db.query(models.VisualStyle).filter(models.VisualStyle.id == style_id).first()


def get_visual_styles(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.VisualStyle).order_by(desc(models.VisualStyle.created_at)).offset(skip).limit(limit).all()


def update_visual_style(db: Session, style_id: int, visual_style: schemas.VisualStyleUpdate):
    db_style = db.query(models.VisualStyle).filter(models.VisualStyle.id == style_id).first()
    if not db_style:
        return None
    
    update_data = visual_style.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_style, field, value)
    
    db.commit()
    db.refresh(db_style)
    return db_style


def delete_visual_style(db: Session, style_id: int):
    db_style = db.query(models.VisualStyle).filter(models.VisualStyle.id == style_id).first()
    if not db_style:
        return False
    
    db.delete(db_style)
    db.commit()
    return True


# Script Prompt CRUD
def create_script_prompt(db: Session, script_prompt: schemas.ScriptPromptCreate):
    db_prompt = models.ScriptPrompt(**script_prompt.dict())
    db.add(db_prompt)
    db.commit()
    db.refresh(db_prompt)
    return db_prompt


def get_script_prompt(db: Session, prompt_id: int):
    return db.query(models.ScriptPrompt).filter(models.ScriptPrompt.id == prompt_id).first()


def get_script_prompts(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.ScriptPrompt).order_by(desc(models.ScriptPrompt.created_at)).offset(skip).limit(limit).all()


def update_script_prompt(db: Session, prompt_id: int, script_prompt: schemas.ScriptPromptUpdate):
    db_prompt = db.query(models.ScriptPrompt).filter(models.ScriptPrompt.id == prompt_id).first()
    if not db_prompt:
        return None
    update_data = script_prompt.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_prompt, field, value)
    db.commit()
    db.refresh(db_prompt)
    return db_prompt


def delete_script_prompt(db: Session, prompt_id: int):
    db_prompt = db.query(models.ScriptPrompt).filter(models.ScriptPrompt.id == prompt_id).first()
    if not db_prompt:
        return False
    db.delete(db_prompt)
    db.commit()
    return True


# Script Iteration CRUD (sliding window: store all, send only last K feedbacks to API)
def create_script_iteration(db: Session, project_id: int, user_feedback: str, revised_script: str):
    count = db.query(models.ScriptIteration).filter(models.ScriptIteration.project_id == project_id).count()
    round_number = count + 1
    iteration = models.ScriptIteration(
        project_id=project_id,
        round_number=round_number,
        user_feedback=user_feedback,
        revised_script=revised_script,
    )
    db.add(iteration)
    db.commit()
    db.refresh(iteration)
    return iteration


def get_last_script_iterations_feedback(db: Session, project_id: int, k: int):
    """Return the last k iterations' user_feedback only, in chronological order (for sliding window prompt)."""
    rows = (
        db.query(models.ScriptIteration.user_feedback)
        .filter(models.ScriptIteration.project_id == project_id)
        .order_by(desc(models.ScriptIteration.round_number))
        .limit(k)
        .all()
    )
    feedbacks = [r[0] for r in reversed(rows)]  # chronological
    return feedbacks


# Scene Style CRUD
def create_scene_style(db: Session, scene_style: schemas.SceneStyleCreate):
    db_style = models.SceneStyle(**scene_style.dict())
    db.add(db_style)
    db.commit()
    db.refresh(db_style)
    return db_style


def get_scene_style(db: Session, style_id: int):
    return db.query(models.SceneStyle).filter(models.SceneStyle.id == style_id).first()


def get_scene_styles(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.SceneStyle).order_by(desc(models.SceneStyle.created_at)).offset(skip).limit(limit).all()


def update_scene_style(db: Session, style_id: int, scene_style: schemas.SceneStyleUpdate):
    db_style = db.query(models.SceneStyle).filter(models.SceneStyle.id == style_id).first()
    if not db_style:
        return None
    
    update_data = scene_style.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_style, field, value)
    
    db.commit()
    db.refresh(db_style)
    return db_style


def delete_scene_style(db: Session, style_id: int):
    db_style = db.query(models.SceneStyle).filter(models.SceneStyle.id == style_id).first()
    if not db_style:
        return False
    
    db.delete(db_style)
    db.commit()
    return True


# Image CRUD
def create_image(db: Session, image: schemas.ImageCreate):
    db_image = models.Image(**image.dict())
    db.add(db_image)
    db.commit()
    db.refresh(db_image)
    return db_image


def get_image(db: Session, image_id: int):
    return db.query(models.Image).filter(models.Image.id == image_id).first()


def get_images_by_scene(db: Session, scene_id: int):
    return db.query(models.Image).filter(models.Image.scene_id == scene_id).order_by(desc(models.Image.created_at)).all()


def get_images_by_project(db: Session, project_id: int):
    """Get all images from all scenes in a project. Returns images with file_path or url."""
    return (
        db.query(models.Image)
        .join(models.Scene, models.Image.scene_id == models.Scene.id)
        .filter(models.Scene.project_id == project_id)
        .order_by(desc(models.Image.created_at))
        .all()
    )


def update_image(db: Session, image_id: int, **kwargs):
    db_image = db.query(models.Image).filter(models.Image.id == image_id).first()
    if not db_image:
        return None
    
    for field, value in kwargs.items():
        setattr(db_image, field, value)
    
    db.commit()
    db.refresh(db_image)
    return db_image


# Video CRUD
def create_video(db: Session, project_id: int, voiceover_id: int = None):
    db_video = models.Video(project_id=project_id, voiceover_id=voiceover_id)
    db.add(db_video)
    db.commit()
    db.refresh(db_video)
    return db_video


def get_video(db: Session, video_id: int):
    return db.query(models.Video).filter(models.Video.id == video_id).first()


def get_video_by_project(db: Session, project_id: int):
    return db.query(models.Video).filter(models.Video.project_id == project_id).order_by(desc(models.Video.created_at)).first()


# Voiceover CRUD
def create_voiceover(db: Session, project_id: int):
    db_vo = models.Voiceover(project_id=project_id)
    db.add(db_vo)
    db.commit()
    db.refresh(db_vo)
    return db_vo


def get_voiceover(db: Session, voiceover_id: int):
    return db.query(models.Voiceover).filter(models.Voiceover.id == voiceover_id).first()


def get_voiceover_by_project(db: Session, project_id: int):
    return db.query(models.Voiceover).filter(
        models.Voiceover.project_id == project_id
    ).order_by(desc(models.Voiceover.created_at)).first()


def update_voiceover(db: Session, voiceover_id: int, **kwargs):
    db_vo = db.query(models.Voiceover).filter(models.Voiceover.id == voiceover_id).first()
    if not db_vo:
        return None
    for field, value in kwargs.items():
        setattr(db_vo, field, value)
    db.commit()
    db.refresh(db_vo)
    return db_vo


# Visual Description CRUD
def create_visual_description(db: Session, visual_description: schemas.VisualDescriptionCreate):
    db_desc = models.VisualDescription(**visual_description.dict())
    db.add(db_desc)
    db.commit()
    db.refresh(db_desc)
    return db_desc


def get_visual_description(db: Session, desc_id: int):
    return db.query(models.VisualDescription).filter(models.VisualDescription.id == desc_id).first()


def get_visual_descriptions_by_scene(db: Session, scene_id: int):
    return db.query(models.VisualDescription).filter(models.VisualDescription.scene_id == scene_id).order_by(models.VisualDescription.created_at).all()


def update_visual_description(db: Session, scene_id: int, visual_description_id: int, description: str):
    """Update a visual description's text. Verifies it belongs to the scene."""
    desc = db.query(models.VisualDescription).filter(
        models.VisualDescription.id == visual_description_id,
        models.VisualDescription.scene_id == scene_id
    ).first()
    if not desc:
        return None
    desc.description = description
    db.commit()
    db.refresh(desc)
    # Also update scene.visual_description if this is the current one
    scene = db.query(models.Scene).filter(models.Scene.id == scene_id).first()
    if scene and scene.current_visual_description_id == visual_description_id:
        scene.visual_description = description
        db.commit()
    return desc


def update_scene_current_description(db: Session, scene_id: int, visual_description_id: int):
    """Set the current visual description for a scene"""
    scene = db.query(models.Scene).filter(models.Scene.id == scene_id).first()
    if not scene:
        return None
    
    # Verify the description belongs to this scene
    desc = db.query(models.VisualDescription).filter(
        models.VisualDescription.id == visual_description_id,
        models.VisualDescription.scene_id == scene_id
    ).first()
    
    if not desc:
        return None
    
    scene.current_visual_description_id = visual_description_id
    scene.visual_description = desc.description  # Keep backward compatibility
    db.commit()
    db.refresh(scene)
    return scene


# Image Reference CRUD
def create_image_reference(db: Session, name: str, image_path: str, description: str = None):
    ref = models.ImageReference(name=name, image_path=image_path, description=description)
    db.add(ref)
    db.commit()
    db.refresh(ref)
    return ref


def get_image_reference(db: Session, ref_id: int):
    return db.query(models.ImageReference).filter(models.ImageReference.id == ref_id).first()


def get_image_references(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.ImageReference).order_by(desc(models.ImageReference.created_at)).offset(skip).limit(limit).all()


def update_image_reference(db: Session, ref_id: int, update: schemas.ImageReferenceUpdate):
    ref = db.query(models.ImageReference).filter(models.ImageReference.id == ref_id).first()
    if not ref:
        return None
    update_data = update.model_dump(exclude_unset=True) if hasattr(update, 'model_dump') else update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(ref, field, value)
    db.commit()
    db.refresh(ref)
    return ref


def delete_image_reference(db: Session, ref_id: int):
    ref = db.query(models.ImageReference).filter(models.ImageReference.id == ref_id).first()
    if not ref:
        return False
    db.delete(ref)
    db.commit()
    return True

