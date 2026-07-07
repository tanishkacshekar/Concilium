from fastapi import APIRouter, Depends, HTTPException, status, Body
from typing import List, Optional, Dict
from datetime import datetime

from app.core.database import get_database
from app.core.dependencies import get_current_user, verify_project_membership, verify_project_owner
from app.models.project import Project, ProjectCreate, ProjectOut, ProjectDetail, MemberInfo
from app.models.task import Task, TaskCreate, TaskUpdate, TaskCreateBody
from app.models.user import User
from app.api.v1.endpoints.tasks import _task_doc_to_model, _normalize_status, apply_assignee_change_timestamp
from bson import ObjectId
from app.services.kanban_agentic_automation import rebuild_kanban_from_meeting_history
from app.services.workspace_copilot import run_workspace_copilot

router = APIRouter()


async def _project_to_out(db, project_dict: dict) -> ProjectOut:
    """Convert project dict to ProjectOut with member_details from users collection."""
    members = project_dict.get("members") or []
    member_details = []
    for uid in members:
        try:
            u = await db.users.find_one({"_id": ObjectId(uid)})
        except Exception:
            u = None
        if u:
            member_details.append(MemberInfo(id=str(u["_id"]), name=u.get("name", ""), email=u.get("email", "")))
    out_id = str(project_dict["_id"])
    rest = {k: v for k, v in project_dict.items() if k not in ("_id", "id")}
    return ProjectOut(id=out_id, **rest, member_details=member_details)


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(project_data: ProjectCreate, current_user: User = Depends(get_current_user)):
    """Create a new project (workspace or class). Stored in database."""
    db = await get_database()
    existing = await db.projects.find_one({"invite_code": project_data.invite_code})
    if existing:
        raise HTTPException(status_code=400, detail="Invite code already exists")
    project_dict = project_data.model_dump(exclude_unset=True)
    project_dict["owner_id"] = project_dict.get("owner_id") or current_user.id
    project_dict["members"] = [current_user.id]
    project_dict["created_at"] = datetime.utcnow()
    project_dict["updated_at"] = datetime.utcnow()
    result = await db.projects.insert_one(project_dict)
    project_dict["_id"] = result.inserted_id
    project_dict["id"] = str(result.inserted_id)
    return await _project_to_out(db, project_dict)


@router.get("", response_model=List[ProjectOut])
async def list_projects(
    project_type: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """List projects user has access to (from database)."""
    db = await get_database()
    query = {"members": current_user.id}
    if project_type:
        query["project_type"] = project_type
    projects = await db.projects.find(query).to_list(length=100)
    return [await _project_to_out(db, {**p, "_id": p["_id"]}) for p in projects]

@router.delete("/all", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_projects(current_user: User = Depends(get_current_user)):
    """Delete all projects owned by the current user."""
    db = await get_database()
    await db.projects.delete_many({"owner_id": current_user.id})


@router.get("/{project_id}", response_model=ProjectDetail)
async def get_project(
    project_id: str,
    project: dict = Depends(verify_project_membership),
    current_user: User = Depends(get_current_user),
):
    """Get project by ID with member details and Kairox board tasks."""
    db = await get_database()
    project_out = await _project_to_out(db, {**project, "_id": project["_id"]})
    meetings = await db.meetings.find({"project_id": project_id}, {"_id": 1}).to_list(length=5000)
    valid_meeting_ids = [str(m["_id"]) for m in meetings]
    task_filter: Dict = {"project_id": project_id, "is_auto_generated": True}
    if valid_meeting_ids:
        task_filter["$or"] = [
            {"source_meeting_id": {"$in": valid_meeting_ids}},
            {"synced_from_meeting_ids": {"$in": valid_meeting_ids}},
            {"copilot_created": True},
        ]
    else:
        task_filter["$or"] = [{"copilot_created": True}]
    task_docs = await db.tasks.find(task_filter).sort("created_at", -1).to_list(length=500)
    tasks = [_task_doc_to_model(t) for t in task_docs]
    return ProjectDetail(**project_out.model_dump(), tasks=tasks)


@router.post("/{project_id}/tasks", response_model=Task, status_code=status.HTTP_201_CREATED)
async def create_project_task(
    project_id: str,
    body: TaskCreateBody,
    project: dict = Depends(verify_project_membership),
    current_user: User = Depends(get_current_user),
):
    """Manual create disabled: tasks are derived from meeting history only."""
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Manual task creation is disabled. Tasks are generated from meeting transcripts.",
    )


@router.put("/{project_id}/tasks/{task_id}", response_model=Task)
async def update_project_task(
    project_id: str,
    task_id: str,
    body: TaskUpdate,
    project: dict = Depends(verify_project_membership),
    current_user: User = Depends(get_current_user),
):
    """Update a task (e.g. drag-and-drop status change). Task must belong to this project."""
    db = await get_database()
    try:
        oid = ObjectId(task_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid task ID")
    task = await db.tasks.find_one({"_id": oid, "project_id": project_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    update_data = body.model_dump(exclude_unset=True)
    if "status" in update_data:
        update_data["status"] = _normalize_status(update_data["status"])
    if update_data.get("status") == "done" and not update_data.get("completed_at"):
        update_data["completed_at"] = datetime.utcnow()
    apply_assignee_change_timestamp(task, update_data)
    update_data["updated_at"] = datetime.utcnow()
    await db.tasks.update_one({"_id": oid}, {"$set": update_data})
    updated = await db.tasks.find_one({"_id": oid})
    return _task_doc_to_model(updated)


@router.post("/{project_id}/extract-tasks", status_code=status.HTTP_200_OK)
async def extract_project_tasks(
    project_id: str,
    project: dict = Depends(verify_project_membership),
    current_user: User = Depends(get_current_user),
):
    """Rebuild Kanban tasks from meeting history using agentic automation."""
    # "Fresh extraction mode": reprocess from scratch to avoid stale/duplicate tasks.
    result = await rebuild_kanban_from_meeting_history(project_id, fresh=True)
    return {"message": "Kanban rebuilt from meeting history", "project_id": project_id, "result": result}


@router.post("/{project_id}/copilot/chat", status_code=status.HTTP_200_OK)
async def workspace_copilot_chat(
    project_id: str,
    body: dict = Body(...),
    project: dict = Depends(verify_project_membership),
    current_user: User = Depends(get_current_user),
):
    """
    Workspace copilot: answers questions using meetings/tasks/members context and can run actions
    (create meeting, create task with assignee resolution, update task, sync Kanban).
    """
    message = (body.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message is required")
    meeting_id = body.get("meeting_id")
    meeting_id_s = str(meeting_id).strip() if meeting_id else None
    db = await get_database()
    if meeting_id_s:
        try:
            mid_oid = ObjectId(meeting_id_s)
        except Exception:
            meeting_id_s = None
        else:
            mdoc = await db.meetings.find_one({"_id": mid_oid})
            if not mdoc or str(mdoc.get("project_id") or "") != project_id:
                meeting_id_s = None
    answer, actions = await run_workspace_copilot(db, project_id, message, meeting_id=meeting_id_s)
    return {"answer": answer, "actions_executed": actions, "project_id": project_id}


@router.post("/join/{invite_code}", response_model=ProjectOut)
async def join_project(invite_code: str, current_user: User = Depends(get_current_user)):
    """Join a project using invite code. Updates project in database."""
    db = await get_database()
    project = await db.projects.find_one({"invite_code": invite_code})
    if not project:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    if current_user.id in project.get("members", []):
        raise HTTPException(status_code=400, detail="Already a member")
    await db.projects.update_one(
        {"_id": project["_id"]},
        {"$addToSet": {"members": current_user.id}, "$set": {"updated_at": datetime.utcnow()}},
    )
    project = await db.projects.find_one({"_id": project["_id"]})
    return await _project_to_out(db, {**project, "_id": project["_id"]})


@router.post("/{project_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_project(
    project_id: str,
    project: dict = Depends(verify_project_membership),
    current_user: User = Depends(get_current_user),
):
    """Leave a project. All users (owner and members) can leave. User is removed from the project and it disappears from their list. If owner leaves, ownership transfers to another member or the project is deleted if empty."""
    db = await get_database()
    members = project.get("members") or []
    if current_user.id not in members:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not a member")
    new_members = [m for m in members if m != current_user.id]
    is_owner = project.get("owner_id") == current_user.id
    if not new_members:
        await db.projects.delete_one({"_id": project["_id"]})
        return
    if is_owner:
        await db.projects.update_one(
            {"_id": project["_id"]},
            {
                "$set": {
                    "owner_id": new_members[0],
                    "members": new_members,
                    "updated_at": datetime.utcnow(),
                }
            },
        )
    else:
        await db.projects.update_one(
            {"_id": project["_id"]},
            {
                "$pull": {"members": current_user.id},
                "$set": {"updated_at": datetime.utcnow()},
            },
        )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project: dict = Depends(verify_project_owner),
):
    """Delete a project. Only the project owner can delete it."""
    db = await get_database()
    await db.projects.delete_one({"_id": project["_id"]})
