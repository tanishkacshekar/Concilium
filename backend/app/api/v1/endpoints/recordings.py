"""API for uploaded meeting recordings: upload, process (Groq transcribe/summarize/extract), list."""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Request
from bson import ObjectId

from app.core.database import get_database
from app.core.dependencies import get_current_user, get_user_from_token, verify_project_membership
from app.models.recording import MeetingRecording, RecordingSummary
from app.models.user import User
from app.services.groq_processing import transcribe_and_analyze

router = APIRouter()

# Max file size for Groq Whisper (25 MB free tier)
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


@router.post("/upload", response_model=MeetingRecording, status_code=status.HTTP_201_CREATED)
async def upload_recording(
    request: Request,
    file: UploadFile = File(...),
    project_id: str = Form(...),
    title: Optional[str] = Form(""),
    access_token: Optional[str] = Form(None),
):
    """Upload a meeting recording; transcribe via Groq, summarize and extract action items; store and return."""
    token = request.headers.get("Authorization")
    if token and token.startswith("Bearer "):
        token = token[7:].strip()
    if not token and access_token:
        token = (access_token or "").strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
    current_user = await get_user_from_token(token)
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
    await verify_project_membership(project_id, current_user)
    file_name = file.filename or "recording"
    display_title = (title or file_name).strip() or file_name

    db = await get_database()
    now = datetime.utcnow()
    doc = {
        "user_id": current_user.id,
        "project_id": project_id,
        "title": display_title,
        "file_name": file_name,
        "status": "processing",
        "transcription": None,
        "summary": None,
        "action_items": [],
        "created_at": now,
        "updated_at": now,
    }
    result = await db.recordings.insert_one(doc)
    rec_id = str(result.inserted_id)

    # Read file and process with Groq (transcribe + summarize + action items)
    try:
        body = await file.read()
        if len(body) > MAX_UPLOAD_BYTES:
            await db.recordings.update_one(
                {"_id": ObjectId(rec_id)},
                {"$set": {"status": "failed", "updated_at": datetime.utcnow()}},
            )
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large. Maximum size is {MAX_UPLOAD_BYTES // (1024*1024)} MB for transcription.",
            )
        transcription, summary_dict, action_items = transcribe_and_analyze(body, file_name)
    except ValueError as e:
        await db.recordings.update_one(
            {"_id": ObjectId(rec_id)},
            {"$set": {"status": "failed", "updated_at": datetime.utcnow()}},
        )
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        await db.recordings.update_one(
            {"_id": ObjectId(rec_id)},
            {"$set": {"status": "failed", "updated_at": datetime.utcnow()}},
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Processing failed: {getattr(e, 'message', str(e))}",
        )

    await db.recordings.update_one(
        {"_id": ObjectId(rec_id)},
        {
            "$set": {
                "status": "completed",
                "transcription": transcription,
                "summary": summary_dict,
                "action_items": action_items,
                "updated_at": datetime.utcnow(),
            }
        },
    )

    summary_obj = RecordingSummary(**summary_dict) if summary_dict else None
    return MeetingRecording(
        id=rec_id,
        user_id=doc["user_id"],
        project_id=doc["project_id"],
        title=doc["title"],
        file_name=doc["file_name"],
        status="completed",
        transcription=transcription,
        summary=summary_obj,
        summary_dict=summary_dict,
        action_items=action_items,
        created_at=doc["created_at"],
        updated_at=datetime.utcnow(),
    )


@router.get("", response_model=List[MeetingRecording])
async def list_recordings(
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """List recordings for the current user, optionally filtered by project."""
    db = await get_database()
    query: dict = {"user_id": current_user.id}
    if project_id:
        await verify_project_membership(project_id, current_user)
        query["project_id"] = project_id

    cursor = db.recordings.find(query).sort("created_at", -1)
    items = await cursor.to_list(length=100)
    out = []
    for m in items:
        sid = str(m["_id"])
        summary = m.get("summary")
        summary_obj = RecordingSummary(**summary) if isinstance(summary, dict) else None
        out.append(
            MeetingRecording(
                id=sid,
                user_id=m["user_id"],
                project_id=m["project_id"],
                title=m["title"],
                file_name=m["file_name"],
                status=m["status"],
                transcription=m.get("transcription"),
                summary=summary_obj,
                summary_dict=summary if isinstance(summary, dict) else None,
                action_items=m.get("action_items") or [],
                created_at=m["created_at"],
                updated_at=m["updated_at"],
            )
        )
    return out


@router.get("/{recording_id}", response_model=MeetingRecording)
async def get_recording(
    recording_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get a single recording by ID."""
    db = await get_database()
    try:
        rec = await db.recordings.find_one({"_id": ObjectId(recording_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid recording ID")
    if not rec:
        raise HTTPException(status_code=404, detail="Recording not found")
    if rec["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    await verify_project_membership(rec["project_id"], current_user)
    summary = rec.get("summary")
    summary_obj = RecordingSummary(**summary) if isinstance(summary, dict) else None
    return MeetingRecording(
        id=str(rec["_id"]),
        user_id=rec["user_id"],
        project_id=rec["project_id"],
        title=rec["title"],
        file_name=rec["file_name"],
        status=rec["status"],
        transcription=rec.get("transcription"),
        summary=summary_obj,
        summary_dict=summary if isinstance(summary, dict) else None,
        action_items=rec.get("action_items") or [],
        created_at=rec["created_at"],
        updated_at=rec["updated_at"],
    )
