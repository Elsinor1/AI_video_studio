"""
CRUD operations for database models
"""
from sqlalchemy.orm import Session
from sqlalchemy import desc
from . import models, schemas


# Script CRUD
def create_script(db: Session, script: schemas.ScriptCreate):
    db_script = models.Script(**script.dict())
    db.add(db_script)
    db.commit()
    db.refresh(db_script)
    return db_script


def get_script(db: Session, script_id: int):
    return db.query(models.Script).filter(models.Script.id == script_id).first()


def get_scripts(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Script).order_by(desc(models.Script.created_at)).offset(skip).limit(limit).all()


def update_script(db: Session, script_id: int, script: schemas.ScriptUpdate):
    db_script = db.query(models.Script).filter(models.Script.id == script_id).first()
    if not db_script:
        return None
    
    update_data = script.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_script, field, value)
    
    db.commit()
    db.refresh(db_script)
    return db_script


# Scene CRUD
def create_scene(db: Session, scene: schemas.SceneCreate):
    db_scene = models.Scene(**scene.dict())
    db.add(db_scene)
    db.commit()
    db.refresh(db_scene)
    return db_scene


def get_scene(db: Session, scene_id: int):
    return db.query(models.Scene).filter(models.Scene.id == scene_id).first()


def get_scenes_by_script(db: Session, script_id: int):
    return db.query(models.Scene).filter(models.Scene.script_id == script_id).order_by(models.Scene.order).all()


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
def create_video(db: Session, script_id: int):
    db_video = models.Video(script_id=script_id)
    db.add(db_video)
    db.commit()
    db.refresh(db_video)
    return db_video


def get_video(db: Session, video_id: int):
    return db.query(models.Video).filter(models.Video.id == video_id).first()


def get_video_by_script(db: Session, script_id: int):
    return db.query(models.Video).filter(models.Video.script_id == script_id).order_by(desc(models.Video.created_at)).first()

