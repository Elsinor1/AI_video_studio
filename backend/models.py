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


class Script(Base):
    __tablename__ = "scripts"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=True)
    content = Column(Text, nullable=False)
    status = Column(String, default=Status.DRAFT.value)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    scenes = relationship("Scene", back_populates="script", cascade="all, delete-orphan")
    videos = relationship("Video", back_populates="script", cascade="all, delete-orphan")


class Scene(Base):
    __tablename__ = "scenes"
    
    id = Column(Integer, primary_key=True, index=True)
    script_id = Column(Integer, ForeignKey("scripts.id"), nullable=False)
    text = Column(Text, nullable=False)
    order = Column(Integer, nullable=False)
    status = Column(String, default=Status.PENDING.value)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    script = relationship("Script", back_populates="scenes")
    images = relationship("Image", back_populates="scene", cascade="all, delete-orphan")


class Image(Base):
    __tablename__ = "images"
    
    id = Column(Integer, primary_key=True, index=True)
    scene_id = Column(Integer, ForeignKey("scenes.id"), nullable=False)
    prompt = Column(Text, nullable=False)
    file_path = Column(String, nullable=True)
    url = Column(String, nullable=True)
    status = Column(String, default=Status.PENDING.value)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    scene = relationship("Scene", back_populates="images")


class Video(Base):
    __tablename__ = "videos"
    
    id = Column(Integer, primary_key=True, index=True)
    script_id = Column(Integer, ForeignKey("scripts.id"), nullable=False)
    file_path = Column(String, nullable=True)
    url = Column(String, nullable=True)
    status = Column(String, default=Status.PENDING.value)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    script = relationship("Script", back_populates="videos")

