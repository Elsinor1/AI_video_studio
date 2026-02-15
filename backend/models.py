"""
Database models for the video creator workflow
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from .database import Base


class Status(str, enum.Enum):
    DRAFT = "draft"
    REVIEWED = "reviewed"
    APPROVED = "approved"
    REJECTED = "rejected"
    PENDING = "pending"


class Project(Base):
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=True)
    script_content = Column(Text, nullable=False)  # Script is now a field within Project
    status = Column(String, default=Status.DRAFT.value)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    scenes = relationship("Scene", back_populates="project", cascade="all, delete-orphan")
    videos = relationship("Video", back_populates="project", cascade="all, delete-orphan")
    script_iterations = relationship("ScriptIteration", back_populates="project", cascade="all, delete-orphan", order_by="ScriptIteration.round_number")


class ScriptIteration(Base):
    """One round of script revision: user feedback + revised script. Sliding window uses last N rounds."""
    __tablename__ = "script_iterations"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    round_number = Column(Integer, nullable=False)  # 1-based
    user_feedback = Column(Text, nullable=False)
    revised_script = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    project = relationship("Project", back_populates="script_iterations")


class ScriptPrompt(Base):
    __tablename__ = "script_prompts"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    script_description = Column(Text, nullable=False)  # Description/instructions for script generation
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class SceneStyle(Base):
    __tablename__ = "scene_styles"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False)  # Description of the scene style (e.g., "cinematic", "documentary", "dramatic")
    parameters = Column(Text, nullable=True, default="{}")  # Optional JSON string with additional scene parameters
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    scenes = relationship("Scene", back_populates="scene_style")


class VisualDescription(Base):
    __tablename__ = "visual_descriptions"
    
    id = Column(Integer, primary_key=True, index=True)
    scene_id = Column(Integer, ForeignKey("scenes.id"), nullable=False)
    description = Column(Text, nullable=False)  # The visual description text
    scene_style_id = Column(Integer, ForeignKey("scene_styles.id"), nullable=True)  # Scene style used when generating
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    scene = relationship("Scene", back_populates="visual_descriptions", foreign_keys=[scene_id])
    scene_style = relationship("SceneStyle")


class Scene(Base):
    __tablename__ = "scenes"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    text = Column(Text, nullable=False)
    visual_description = Column(Text, nullable=True)  # Current/selected visual description (for backward compatibility)
    current_visual_description_id = Column(Integer, ForeignKey("visual_descriptions.id"), nullable=True)  # Currently selected description
    scene_style_id = Column(Integer, ForeignKey("scene_styles.id"), nullable=True)
    image_reference_id = Column(Integer, ForeignKey("image_references.id"), nullable=True)  # Optional reference image for Leonardo
    approved_image_id = Column(Integer, ForeignKey("images.id"), nullable=True)  # User-approved image for this scene (used as ref when continuing)
    order = Column(Integer, nullable=False)
    status = Column(String, default=Status.PENDING.value)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    project = relationship("Project", back_populates="scenes")
    scene_style = relationship("SceneStyle", back_populates="scenes")
    image_reference = relationship("ImageReference")
    images = relationship("Image", back_populates="scene", foreign_keys="Image.scene_id", cascade="all, delete-orphan")
    approved_image = relationship("Image", foreign_keys=[approved_image_id])
    visual_descriptions = relationship("VisualDescription", back_populates="scene", foreign_keys="VisualDescription.scene_id", cascade="all, delete-orphan", order_by="VisualDescription.created_at")
    current_visual_description = relationship("VisualDescription", foreign_keys=[current_visual_description_id], post_update=True, remote_side="VisualDescription.id")


class VisualStyle(Base):
    __tablename__ = "visual_styles"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False)  # Rich narrative description of the visual style
    parameters = Column(Text, nullable=True, default="{}")  # Optional JSON string with additional visual parameters
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    images = relationship("Image", back_populates="visual_style")


class Image(Base):
    __tablename__ = "images"
    
    id = Column(Integer, primary_key=True, index=True)
    scene_id = Column(Integer, ForeignKey("scenes.id"), nullable=False)
    visual_style_id = Column(Integer, ForeignKey("visual_styles.id"), nullable=True)
    prompt = Column(Text, nullable=False)
    file_path = Column(String, nullable=True)
    url = Column(String, nullable=True)
    status = Column(String, default=Status.PENDING.value)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    scene = relationship("Scene", back_populates="images", foreign_keys=[scene_id])
    visual_style = relationship("VisualStyle", back_populates="images")


class ImageReference(Base):
    __tablename__ = "image_references"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)  # Short label (e.g. "Main character", "Location ref")
    description = Column(Text, nullable=True)  # Optional general description of what this reference is for
    image_path = Column(String, nullable=False)  # Path relative to storage/ (e.g. image_references/ref_1.jpg)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Video(Base):
    __tablename__ = "videos"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    file_path = Column(String, nullable=True)
    url = Column(String, nullable=True)
    status = Column(String, default=Status.PENDING.value)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    project = relationship("Project", back_populates="videos")

