from pydantic import BaseModel, field_validator
from typing import Literal, Optional, List
from datetime import datetime
from bson import ObjectId

# Kairox Kanban: 5 columns — To Do, In Progress, In Review, Done, Blockers
TaskStatusLiteral = Literal["todo", "in_progress", "in_review", "done", "blockers"]


def _normalize_status_val(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    m = {"in-progress": "in_progress", "review": "in_review", "blocked": "blockers"}
    return m.get((v or "").strip(), v)


class TaskBase(BaseModel):
    project_id: str  # workspace_id or class_id
    title: str
    description: Optional[str] = None
    status: TaskStatusLiteral = "todo"
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    assignee_id: Optional[str] = None  # owner / assignee user id
    assignee_name: Optional[str] = None  # display / transcript name when id unknown
    assigned_at: Optional[datetime] = None  # when the assignment was recorded (meeting end or manual)
    due_date: Optional[datetime] = None
    source_meeting_id: Optional[str] = None
    subtasks: Optional[List[str]] = None  # list of sub-item strings

class TaskCreate(TaskBase):
    pass


class TaskCreateBody(BaseModel):
    """Request body for POST /projects/{project_id}/tasks (project_id from path)."""
    title: str
    description: Optional[str] = None
    status: TaskStatusLiteral = "todo"
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    due_date: Optional[datetime] = None
    subtasks: Optional[List[str]] = None

    @field_validator("status", mode="before")
    @classmethod
    def _status(cls, v: Optional[str]) -> str:
        return _normalize_status_val(v) or "todo"

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatusLiteral] = None
    priority: Optional[Literal["low", "medium", "high", "urgent"]] = None
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    assigned_at: Optional[datetime] = None
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    subtasks: Optional[List[str]] = None

    @field_validator("status", mode="before")
    @classmethod
    def _status(cls, v: Optional[str]) -> Optional[str]:
        return _normalize_status_val(v)

class Task(TaskBase):
    id: str
    is_auto_generated: bool = False
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        json_encoders = {ObjectId: str}
