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


class Scene(Base):
    __tablename__ = "scenes"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    text = Column(Text, nullable=False)
    order = Column(Integer, nullable=False)
    status = Column(String, default=Status.PENDING.value)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    project = relationship("Project", back_populates="scenes")
    images = relationship("Image", back_populates="scene", cascade="all, delete-orphan")


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
    
    scene = relationship("Scene", back_populates="images")
    visual_style = relationship("VisualStyle", back_populates="images")


class Video(Base):
    __tablename__ = "videos"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    file_path = Column(String, nullable=True)
    url = Column(String, nullable=True)
    status = Column(String, default=Status.PENDING.value)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    project = relationship("Project", back_populates="videos")

