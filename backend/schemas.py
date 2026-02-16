"""
Pydantic schemas for API request/response validation
"""
from pydantic import BaseModel
from typing import Optional, List
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


class ScriptGenerationRequest(BaseModel):
    """Request body for AI script generation"""
    title: Optional[str] = None
    description: str  # Short description of what the script should be about
    script_prompt_id: int  # ID of the script prompt to use for style/instructions


class ScriptGenerationResponse(BaseModel):
    script_content: str


class ScriptIterateRequest(BaseModel):
    feedback: str


class ScriptIterateResponse(BaseModel):
    script_content: str
    round_number: int


class ScriptIteration(BaseModel):
    id: int
    project_id: int
    round_number: int
    user_feedback: str
    revised_script: str
    created_at: datetime

    class Config:
        from_attributes = True


class InsertSceneRequest(BaseModel):
    """Request to insert a new scene at a specific position"""
    after_order: int  # 0 = insert at beginning; N = insert after scene with order N
    text: str = ""


class SegmentationPreviewResponse(BaseModel):
    """Full script with segment boundaries (--- on its own line). Edit and PUT to update scenes."""
    preview_text: str


class SegmentationPreviewUpdate(BaseModel):
    preview_text: str


class SceneBase(BaseModel):
    text: str
    order: int


class SceneCreate(SceneBase):
    project_id: int


class SceneUpdate(BaseModel):
    text: Optional[str] = None
    visual_description: Optional[str] = None
    scene_style_id: Optional[int] = None
    image_reference_id: Optional[int] = None
    approved_image_id: Optional[int] = None
    order: Optional[int] = None
    status: Optional[str] = None


class Scene(SceneBase):
    id: int
    project_id: int
    visual_description: Optional[str] = None  # Current description (for backward compatibility)
    current_visual_description_id: Optional[int] = None
    scene_style_id: Optional[int] = None
    image_reference_id: Optional[int] = None
    approved_image_id: Optional[int] = None
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class VisualDescriptionBase(BaseModel):
    description: str
    scene_style_id: Optional[int] = None


class VisualDescriptionCreate(VisualDescriptionBase):
    scene_id: int


class VisualDescriptionUpdate(BaseModel):
    description: str


class VisualDescription(VisualDescriptionBase):
    id: int
    scene_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class VisualDescriptionIterateRequest(BaseModel):
    """Request body for iterating on a scene description with user feedback"""
    comments: str
    current_description: Optional[str] = None  # Description to iterate on; if omitted, uses scene's current


class GenerateVisualDescriptionRequest(BaseModel):
    """Optional instruction to guide scene description generation"""
    instruction: Optional[str] = None


class ScriptPromptBase(BaseModel):
    name: str
    script_description: str  # Description/instructions for script generation


class ScriptPromptCreate(ScriptPromptBase):
    pass


class ScriptPromptUpdate(BaseModel):
    name: Optional[str] = None
    script_description: Optional[str] = None


class ScriptPrompt(ScriptPromptBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SceneStyleBase(BaseModel):
    name: str
    description: str  # Description of the scene style
    parameters: Optional[str] = "{}"  # Optional JSON string with additional scene parameters


class SceneStyleCreate(SceneStyleBase):
    pass


class SceneStyleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parameters: Optional[str] = None


class SceneStyle(SceneStyleBase):
    id: int
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


class AddImageFromReferenceRequest(BaseModel):
    """Request to add an image to a scene from the image references library"""
    image_reference_id: int


class AddImageFromProjectRequest(BaseModel):
    """Request to add an image to a scene from another scene in the project"""
    image_id: int


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


class ImageReferenceBase(BaseModel):
    name: str
    description: Optional[str] = None
    image_path: str


class ImageReferenceCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ImageReferenceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ImageReference(ImageReferenceBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class VideoBase(BaseModel):
    pass


class Video(VideoBase):
    id: int
    project_id: int
    voiceover_id: Optional[int] = None
    file_path: Optional[str] = None
    url: Optional[str] = None
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True


# Voiceover schemas

class SceneTimingEntry(BaseModel):
    scene_id: int
    start_time: float
    end_time: float
    transition_type: str = "cut"
    transition_duration: float = 0.0


class VoiceoverBase(BaseModel):
    pass


class Voiceover(VoiceoverBase):
    id: int
    project_id: int
    audio_file_path: Optional[str] = None
    scene_timings: Optional[str] = None
    total_duration: Optional[float] = None
    captions_enabled: bool = False
    caption_style: str = "word_highlight"
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class UpdateSceneTimings(BaseModel):
    scene_timings: List[SceneTimingEntry]


class UpdateCaptionSettings(BaseModel):
    captions_enabled: bool
    caption_style: str = "word_highlight"


class RenderVideoRequest(BaseModel):
    voiceover_id: int

