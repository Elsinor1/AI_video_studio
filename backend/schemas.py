"""
Pydantic schemas for API request/response validation
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ScriptBase(BaseModel):
    title: Optional[str] = None
    content: str


class ScriptCreate(ScriptBase):
    pass


class ScriptUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None


class Script(ScriptBase):
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
    script_id: int


class SceneUpdate(BaseModel):
    text: Optional[str] = None
    order: Optional[int] = None
    status: Optional[str] = None


class Scene(SceneBase):
    id: int
    script_id: int
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class ImageBase(BaseModel):
    prompt: str


class ImageCreate(ImageBase):
    scene_id: int


class Image(ImageBase):
    id: int
    scene_id: int
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
    script_id: int
    file_path: Optional[str] = None
    url: Optional[str] = None
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True

