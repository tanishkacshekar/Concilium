from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from app.core.database import get_database
from app.core.dependencies import get_current_user, verify_project_membership
from app.models.task import Task, TaskCreate, TaskUpdate
from app.models.user import User
from bson import ObjectId
from datetime import datetime

router = APIRouter()

# Normalize legacy status values to Kairox 5-column statuses
def _normalize_status(s: Optional[str]) -> str:
    if not s:
        return "todo"
    m = {"in-progress": "in_progress", "review": "in_review", "blocked": "blockers"}
    return m.get(s, s)


def _task_doc_to_model(d: dict) -> Task:
    d = dict(d)
    d["id"] = str(d.pop("_id", d.get("id", "")))
    d["status"] = _normalize_status(d.get("status"))
    d.pop("copilot_created", None)
    return Task(**{k: v for k, v in d.items() if k != "_id"})


def apply_assignee_change_timestamp(task: dict, update_data: dict) -> None:
    """If assignee fields change and caller did not set assigned_at, set assigned_at to now."""
    if "assigned_at" in update_data:
        return
    changed = False
    if "assignee_id" in update_data and update_data.get("assignee_id") != task.get("assignee_id"):
        changed = True
    if "assignee_name" in update_data:
        new_n = (update_data.get("assignee_name") or "").strip()
        old_n = (task.get("assignee_name") or "").strip()
        if new_n != old_n:
            changed = True
    if changed:
        update_data["assigned_at"] = datetime.utcnow()

@router.post("", response_model=Task, status_code=status.HTTP_201_CREATED)
async def create_task(
    task_data: TaskCreate,
    current_user: User = Depends(get_current_user)
):
    """Manual create disabled: tasks are generated from meetings only."""
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Manual task creation is disabled. Tasks are generated from meeting transcripts.",
    )

@router.get("", response_model=List[Task])
async def list_tasks(
    project_id: Optional[str] = None,
    assignee_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """List tasks"""
    db = await get_database()
    query = {}
    
    if project_id:
        query["project_id"] = project_id
        # Verify access (will raise exception if not member)
        await verify_project_membership(project_id, current_user)
        meetings = await db.meetings.find({"project_id": project_id}, {"_id": 1}).to_list(length=5000)
        valid_meeting_ids = [str(m["_id"]) for m in meetings]
        query["is_auto_generated"] = True
        if valid_meeting_ids:
            query["$or"] = [
                {"source_meeting_id": {"$in": valid_meeting_ids}},
                {"synced_from_meeting_ids": {"$in": valid_meeting_ids}},
                {"copilot_created": True},
            ]
        else:
            query["$or"] = [{"copilot_created": True}]
    else:
        query["is_auto_generated"] = True
    
    if assignee_id:
        query["assignee_id"] = assignee_id
    
    if status:
        query["status"] = status
    
    tasks = await db.tasks.find(query).sort("created_at", -1).to_list(length=100)
    return [_task_doc_to_model(t) for t in tasks]

@router.get("/{task_id}", response_model=Task)
async def get_task(task_id: str, current_user: User = Depends(get_current_user)):
    """Get task by ID"""
    db = await get_database()
    task = await db.tasks.find_one({"_id": ObjectId(task_id)})
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Verify project access
    await verify_project_membership(task["project_id"], current_user)
    
    return _task_doc_to_model(task)

@router.patch("/{task_id}", response_model=Task)
async def update_task(
    task_id: str,
    task_update: TaskUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update task"""
    db = await get_database()
    task = await db.tasks.find_one({"_id": ObjectId(task_id)})
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Verify project access
    await verify_project_membership(task["project_id"], current_user)
    
    update_data = task_update.model_dump(exclude_unset=True)
    if "status" in update_data:
        update_data["status"] = _normalize_status(update_data["status"])
    if update_data.get("status") == "done" and not update_data.get("completed_at"):
        update_data["completed_at"] = datetime.utcnow()
    apply_assignee_change_timestamp(task, update_data)
    update_data["updated_at"] = datetime.utcnow()
    
    await db.tasks.update_one(
        {"_id": ObjectId(task_id)},
        {"$set": update_data}
    )
    
    updated = await db.tasks.find_one({"_id": ObjectId(task_id)})
    return _task_doc_to_model(updated)

@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: str, current_user: User = Depends(get_current_user)):
    """Delete task"""
    db = await get_database()
    task = await db.tasks.find_one({"_id": ObjectId(task_id)})
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Verify project access
    await verify_project_membership(task["project_id"], current_user)
    
    await db.tasks.delete_one({"_id": ObjectId(task_id)})
    return None
