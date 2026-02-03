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
def create_video(db: Session, project_id: int):
    db_video = models.Video(project_id=project_id)
    db.add(db_video)
    db.commit()
    db.refresh(db_video)
    return db_video


def get_video(db: Session, video_id: int):
    return db.query(models.Video).filter(models.Video.id == video_id).first()


def get_video_by_project(db: Session, project_id: int):
    return db.query(models.Video).filter(models.Video.project_id == project_id).order_by(desc(models.Video.created_at)).first()

