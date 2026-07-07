from pydantic import BaseModel
from typing import Literal, Optional, List
from datetime import datetime
from bson import ObjectId

from app.models.task import Task


class MemberInfo(BaseModel):
    id: str
    name: str
    email: str


class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    invite_code: str
    project_type: Literal["workspace", "class"]


class ProjectCreate(ProjectBase):
    owner_id: Optional[str] = None  # set from current_user if not provided


class Project(ProjectBase):
    id: str
    owner_id: str
    members: List[str] = []  # user IDs
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
        json_encoders = {ObjectId: str}


class ProjectOut(Project):
    """Project response with member details (name, email) for display."""
    member_details: List[MemberInfo] = []


class ProjectDetail(ProjectOut):
    """Project with tasks for Kairox board (GET project detail)."""
    tasks: List[Task] = []
