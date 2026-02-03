"""
Pydantic schemas for API request/response validation
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ProjectBase(BaseModel):
    title: Optional[str] = None
    script_content: str  # Script is now a field within Project


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    script_content: Optional[str] = None
    status: Optional[str] = None


class Project(ProjectBase):
    id: int
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class SceneBase(BaseModel):
    text: str
    order: int


class SceneCreate(SceneBase):
    project_id: int


class SceneUpdate(BaseModel):
    text: Optional[str] = None
    order: Optional[int] = None
    status: Optional[str] = None


class Scene(SceneBase):
    id: int
    project_id: int
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class VisualStyleBase(BaseModel):
    name: str
    description: str  # Rich narrative description of the visual style
    parameters: Optional[str] = "{}"  # Optional JSON string with additional visual parameters


class VisualStyleCreate(VisualStyleBase):
    pass


class VisualStyleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parameters: Optional[str] = None


class VisualStyle(VisualStyleBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class ImageBase(BaseModel):
    prompt: str


class ImageCreate(ImageBase):
    scene_id: int
    visual_style_id: Optional[int] = None


class Image(ImageBase):
    id: int
    scene_id: int
    visual_style_id: Optional[int] = None
    file_path: Optional[str] = None
    url: Optional[str] = None
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class VideoBase(BaseModel):
    pass


class Video(VideoBase):
    id: int
    project_id: int
    file_path: Optional[str] = None
    url: Optional[str] = None
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True

