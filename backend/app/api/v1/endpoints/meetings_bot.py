"""
Meeting bot API: start/stop meeting, participant join/leave, get meeting (transcripts, attendance, summary, action items).
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, status
from bson import ObjectId

from app.core.database import get_database
from app.core.dependencies import get_current_active_user, verify_project_membership
from app.models.user import User
from app.attendance import AttendanceTracker
from app.api.v1.endpoints.meeting_bot_ws import ws_manager
from app.services.meetings_ops import run_meeting_intelligence
from app.services.kanban_agentic_automation import rebuild_kanban_from_meeting_history
from app.services.meeting_context_qa import answer_meeting_question, _build_transcript_text

router = APIRouter()

_bot_manager = None


def _meeting_now() -> datetime:
    """Store naive UTC for Mongo (consistent wall times when clients interpret as UTC)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def set_bot_manager(manager):
    global _bot_manager
    _bot_manager = manager


def _doc_to_meeting(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "project_id": doc.get("project_id"),
        "title": doc.get("title"),
        "status": doc.get("status", "scheduled"),
        "meeting_url": doc.get("meeting_url"),
        "started_at": doc.get("started_at").isoformat() if doc.get("started_at") else None,
        "ended_at": doc.get("ended_at").isoformat() if doc.get("ended_at") else None,
    }


@router.post("/{meeting_id}/participants/join", status_code=status.HTTP_200_OK)
async def participant_join(meeting_id: str, payload: dict):
    """Bot or injected JS: record participant join. No auth."""
    try:
        ObjectId(meeting_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid meeting ID")
    db = await get_database()
    meeting = await db.meetings.find_one({"_id": ObjectId(meeting_id)})
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    pid = (payload.get("participant_id") or payload.get("id") or "unknown").strip()
    name = (payload.get("name") or payload.get("display_name") or pid).strip()
    role = payload.get("meeting_role")
    tracker = AttendanceTracker(meeting_id)
    await tracker.record_join(pid, name, role)
    return {"message": "ok", "participant_id": pid}


@router.post("/{meeting_id}/participants/leave", status_code=status.HTTP_200_OK)
async def participant_leave(meeting_id: str, payload: dict):
    """Bot or injected JS: record participant leave. No auth."""
    try:
        ObjectId(meeting_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid meeting ID")
    db = await get_database()
    meeting = await db.meetings.find_one({"_id": ObjectId(meeting_id)})
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    pid = (payload.get("participant_id") or payload.get("id") or "unknown").strip()
    tracker = AttendanceTracker(meeting_id)
    await tracker.record_leave(pid)
    return {"message": "ok", "participant_id": pid}


@router.get("", status_code=status.HTTP_200_OK)
async def list_meetings(
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
):
    """List meetings, optionally by project_id."""
    db = await get_database()
    q = {}
    if project_id:
        await verify_project_membership(project_id, current_user)
        q["project_id"] = project_id
    cursor = db.meetings.find(q).sort("started_at", -1)
    items = await cursor.to_list(length=100)
    return {"meetings": [_doc_to_meeting(d) for d in items]}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_meeting(
    body: dict,
    current_user: User = Depends(get_current_active_user),
):
    """Create a meeting; returns meeting id for start/stop."""
    db = await get_database()
    if body.get("project_id"):
        await verify_project_membership(body["project_id"], current_user)
    oid = ObjectId()
    meeting_id_str = str(oid)
    doc = {
        "_id": oid,
        "meeting_id": meeting_id_str,
        "project_id": body.get("project_id"),
        "title": body.get("title", "Meeting"),
        "status": "scheduled",
        "meeting_url": body.get("meeting_url"),
        "started_at": None,
        "ended_at": None,
    }
    await db.meetings.insert_one(doc)
    return {"id": meeting_id_str, "meeting_id": meeting_id_str}


@router.get("/{meeting_id}", status_code=status.HTTP_200_OK)
async def get_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Meeting detail with transcripts, attendance, summary, action items."""
    db = await get_database()
    try:
        oid = ObjectId(meeting_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid meeting ID")
    meeting = await db.meetings.find_one({"_id": oid})
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.get("project_id"):
        await verify_project_membership(meeting["project_id"], current_user)

    segments = await db.transcript_segments.find({"meeting_id": meeting_id}).sort("timestamp", 1).to_list(length=5000)
    transcripts = await db.transcripts.find({"meeting_id": meeting_id}).sort("timestamp", 1).to_list(length=5000)
    attendance = await db.attendance_records.find({"meeting_id": meeting_id}).sort("join_time", 1).to_list(length=500)
    summary_doc = await db.summaries.find_one({"meeting_id": meeting_id}, sort=[("created_at", -1)])
    action_docs = await db.action_items.find({"meeting_id": meeting_id}).sort("created_at", 1).to_list(length=200)

    unique_participants = len({a.get("participant_id") for a in attendance if a.get("participant_id")})
    total_duration = None
    try:
        if meeting.get("started_at") and meeting.get("ended_at"):
            delta = meeting["ended_at"] - meeting["started_at"]
            total_duration = int(delta.total_seconds())
    except (TypeError, AttributeError):
        pass

    return {
        "meeting": _doc_to_meeting(meeting),
        "transcript_segments": [{"text": s.get("text"), "timestamp": s.get("timestamp")} for s in segments],
        "transcripts": [{"text": t.get("text"), "timestamp": t.get("timestamp")} for t in transcripts],
        "attendance": [
            {
                "participant_id": a.get("participant_id"),
                "participant_name": a.get("participant_name"),
                "join_time": a.get("join_time"),
                "leave_time": a.get("leave_time"),
                "duration_seconds": a.get("duration_seconds"),
                "meeting_role": a.get("meeting_role"),
            }
            for a in attendance
        ],
        "summary": {
            "summary_text": summary_doc.get("summary_text") if summary_doc else None,
            "key_points": summary_doc.get("key_points") if summary_doc else None,
            "decisions": summary_doc.get("decisions") if summary_doc else None,
            "meeting_signals": summary_doc.get("meeting_signals") if summary_doc else None,
        } if summary_doc else None,
        "action_items": [{"text": a.get("text")} for a in action_docs],
        "total_participants": unique_participants,
        "total_duration": total_duration,
    }


@router.post("/{meeting_id}/ask", status_code=status.HTTP_200_OK)
async def ask_about_meeting(
    meeting_id: str,
    body: Optional[dict] = Body(None),
    current_user: User = Depends(get_current_active_user),
):
    """
    Ask a question about what happened in this meeting (transcript + summary context via Groq).
    """
    question = ((body or {}).get("question") or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required")
    db = await get_database()
    try:
        oid = ObjectId(meeting_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid meeting ID")
    meeting = await db.meetings.find_one({"_id": oid})
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.get("project_id"):
        await verify_project_membership(meeting["project_id"], current_user)

    segments = await db.transcript_segments.find({"meeting_id": meeting_id}).sort("timestamp", 1).to_list(length=5000)
    transcript_text = _build_transcript_text(segments)
    summary_doc = await db.summaries.find_one({"meeting_id": meeting_id}, sort=[("created_at", -1)])
    action_docs = await db.action_items.find({"meeting_id": meeting_id}).sort("created_at", 1).to_list(length=200)
    summary_text = (summary_doc or {}).get("summary_text")
    key_points = (summary_doc or {}).get("key_points") or []
    if isinstance(key_points, str):
        key_points = [key_points]
    action_texts = [a.get("text") for a in action_docs if a.get("text")]

    try:
        answer = answer_meeting_question(
            meeting_title=(meeting.get("title") or "") or "",
            transcript_text=transcript_text,
            summary_text=summary_text,
            key_points=key_points if isinstance(key_points, list) else [],
            action_items=action_texts,
            question=question,
        )
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception:
        raise HTTPException(status_code=502, detail="Assistant failed to respond")

    return {"answer": answer, "meeting_id": meeting_id}


@router.post("/{meeting_id}/start", status_code=status.HTTP_200_OK)
async def start_meeting(
    meeting_id: str,
    body: dict,
    current_user: User = Depends(get_current_active_user),
):
    """Start meeting bot: ensure meeting doc, start bot (join Jitsi, stream audio)."""
    db = await get_database()
    try:
        oid = ObjectId(meeting_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid meeting ID")
    meeting = await db.meetings.find_one({"_id": oid})
    if not meeting:
        await db.meetings.insert_one({
            "_id": oid,
            "project_id": body.get("project_id"),
            "title": body.get("title", "Meeting"),
            "status": "live",
            "meeting_url": body.get("meeting_url"),
            "started_at": _meeting_now(),
            "ended_at": None,
        })
    else:
        # Preserve first start time so restarts / reconnects do not shift "held at" timestamps.
        patch: dict = {"status": "live", "ended_at": None}
        if not meeting.get("started_at"):
            patch["started_at"] = _meeting_now()
        await db.meetings.update_one({"_id": oid}, {"$set": patch})
    meeting_url = body.get("meeting_url") or (meeting or {}).get("meeting_url")
    if not meeting_url:
        raise HTTPException(status_code=400, detail="meeting_url required to start bot")
    if _bot_manager:
        await _bot_manager.start_bot(meeting_id, meeting_url)
    return {"message": "Meeting started", "meeting_id": meeting_id}


@router.post("/{meeting_id}/stop", status_code=status.HTTP_200_OK)
async def stop_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Stop bot, end meeting, generate intelligence, then rebuild Kanban from meeting history."""
    db = await get_database()
    try:
        oid = ObjectId(meeting_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid meeting ID")
    meeting = await db.meetings.find_one({"_id": oid})
    project_id = (meeting or {}).get("project_id") if meeting else None
    if _bot_manager:
        await _bot_manager.stop_bot(meeting_id)
    ws_manager.remove_meeting(meeting_id)
    await db.meetings.update_one(
        {"_id": oid},
        {"$set": {"status": "ended", "ended_at": _meeting_now()}},
    )
    await run_meeting_intelligence(meeting_id, language="en", project_id=project_id, sync_kanban=True)
    return {"message": "Meeting stopped", "meeting_id": meeting_id}


@router.post("/{meeting_id}/generate-summary", status_code=status.HTTP_200_OK)
async def generate_summary(
    meeting_id: str,
    body: Optional[dict] = Body(None),
    current_user: User = Depends(get_current_active_user),
):
    """On-demand summary and action items (single LLM call)."""
    lang = (body or {}).get("language", "en")
    db = await get_database()
    try:
        oid = ObjectId(meeting_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid meeting ID")
    meeting = await db.meetings.find_one({"_id": oid})
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.get("project_id"):
        await verify_project_membership(meeting["project_id"], current_user)
    await run_meeting_intelligence(
        meeting_id,
        language=lang,
        project_id=meeting.get("project_id"),
        sync_kanban=bool(meeting.get("project_id")),
    )
    return {"message": "Summary generated", "meeting_id": meeting_id}


@router.delete("/{meeting_id}", status_code=status.HTTP_200_OK)
async def delete_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """Delete a meeting and all related data (transcripts, attendance, summary, action items)."""
    db = await get_database()
    try:
        oid = ObjectId(meeting_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid meeting ID")
    meeting = await db.meetings.find_one({"_id": oid})
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if meeting.get("project_id"):
        await verify_project_membership(meeting["project_id"], current_user)
    if meeting.get("status") == "live" and _bot_manager:
        await _bot_manager.stop_bot(meeting_id)
    ws_manager.remove_meeting(meeting_id)
    await db.transcript_segments.delete_many({"meeting_id": meeting_id})
    await db.transcripts.delete_many({"meeting_id": meeting_id})
    await db.attendance_records.delete_many({"meeting_id": meeting_id})
    await db.summaries.delete_many({"meeting_id": meeting_id})
    await db.action_items.delete_many({"meeting_id": meeting_id})
    await db.meetings.delete_one({"_id": oid})
    if meeting.get("project_id"):
        await rebuild_kanban_from_meeting_history(meeting["project_id"], trigger_meeting_id=meeting_id)
    return {"message": "Meeting deleted", "meeting_id": meeting_id}
