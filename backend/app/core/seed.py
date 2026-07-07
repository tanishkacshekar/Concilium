"""
Development seed script for the updated Meeting Monitor schema.

Seeds:
- users with free-text roles + skills
- projects (workspace/class)
- one ended meeting with transcript, summary, meeting_signals, action_items
- one live meeting placeholder
- a few kanban tasks

Idempotent: re-running updates existing docs by stable keys (email / invite_code / meeting title).
"""
from pathlib import Path
from datetime import datetime, timedelta
import asyncio
import sys

# Allow running as a direct script from repo root:
#   python backend/app/core/seed.py
_CURRENT_FILE = Path(__file__).resolve()
_BACKEND_DIR = _CURRENT_FILE.parents[2]  # .../backend
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.core.security import get_password_hash


def _utc_now() -> datetime:
    return datetime.utcnow()


async def _upsert_user(db, payload: dict) -> str:
    now = _utc_now()
    email = payload["email"]
    doc = {
        "name": payload["name"],
        "email": email,
        "role": payload["role"],
        "skills": payload.get("skills", []),
        "avatar": payload.get("avatar"),
        "hashed_password": get_password_hash(payload.get("password", "password123")),
        "updated_at": now,
    }
    existing = await db.users.find_one({"email": email})
    if existing:
        await db.users.update_one({"_id": existing["_id"]}, {"$set": doc})
        return str(existing["_id"])
    doc["created_at"] = now
    res = await db.users.insert_one(doc)
    return str(res.inserted_id)


async def _upsert_project(db, payload: dict) -> str:
    now = _utc_now()
    invite_code = payload["invite_code"]
    doc = {
        "name": payload["name"],
        "description": payload.get("description"),
        "invite_code": invite_code,
        "project_type": payload.get("project_type", "workspace"),
        "owner_id": payload["owner_id"],
        "members": payload["members"],
        "updated_at": now,
    }
    existing = await db.projects.find_one({"invite_code": invite_code})
    if existing:
        await db.projects.update_one({"_id": existing["_id"]}, {"$set": doc})
        return str(existing["_id"])
    doc["created_at"] = now
    res = await db.projects.insert_one(doc)
    return str(res.inserted_id)


async def _upsert_meeting_bundle(db, project_id: str, title: str) -> str:
    now = _utc_now()
    started = now - timedelta(hours=2)
    ended = now - timedelta(hours=1, minutes=20)
    meeting = await db.meetings.find_one({"project_id": project_id, "title": title})

    meeting_doc = {
        "project_id": project_id,
        "title": title,
        "status": "ended",
        "meeting_url": "https://meet.jit.si/meeting-monitor-demo",
        "started_at": started,
        "ended_at": ended,
    }

    if meeting:
        meeting_id = str(meeting["_id"])
        await db.meetings.update_one({"_id": meeting["_id"]}, {"$set": meeting_doc})
    else:
        meeting_doc["meeting_id"] = "autogen"
        res = await db.meetings.insert_one(meeting_doc)
        meeting_id = str(res.inserted_id)
        await db.meetings.update_one({"_id": res.inserted_id}, {"$set": {"meeting_id": meeting_id}})

    # Reset bundle for deterministic seed result.
    await db.transcript_segments.delete_many({"meeting_id": meeting_id})
    await db.transcripts.delete_many({"meeting_id": meeting_id})
    await db.attendance_records.delete_many({"meeting_id": meeting_id})
    await db.summaries.delete_many({"meeting_id": meeting_id})
    await db.action_items.delete_many({"meeting_id": meeting_id})

    segment_rows = [
        ("Good morning everyone, today we finalize architecture and delivery plan.", started + timedelta(minutes=1)),
        ("Vikram will own websocket service stabilization and monitoring.", started + timedelta(minutes=5)),
        ("Asha will lead QA regression testing for meeting recordings.", started + timedelta(minutes=12)),
        ("We agreed to ship analytics dashboard by Friday EOD.", started + timedelta(minutes=20)),
    ]
    for text, ts in segment_rows:
        await db.transcript_segments.insert_one(
            {
                "meeting_id": meeting_id,
                "text": text,
                "timestamp": ts,
                "language": "en",
            }
        )
        await db.transcripts.insert_one(
            {
                "meeting_id": meeting_id,
                "text": text,
                "timestamp": ts,
            }
        )

    await db.summaries.insert_one(
        {
            "meeting_id": meeting_id,
            "language": "en",
            "summary_text": "Team aligned on architecture, ownership, and delivery windows.",
            "key_points": [
                "WebSocket stability is prioritized.",
                "QA regression testing assigned.",
                "Analytics dashboard deadline confirmed.",
            ],
            "decisions": [
                "Ship analytics dashboard by Friday EOD.",
                "Use accuracy-first transcription profile.",
            ],
            "meeting_signals": {
                "confidence_score": 0.88,
                "toxicity_score": 0.03,
                "dominant_emotion": "neutral",
                "emotion_scores": {"positive": 0.32, "neutral": 0.62, "negative": 0.06},
            },
            "created_at": now,
        }
    )

    action_items = [
        "Stabilize websocket reconnect and heartbeat behavior.",
        "Run end-to-end QA on transcription flow and report defects.",
        "Prepare analytics dashboard release checklist.",
    ]
    for item in action_items:
        await db.action_items.insert_one(
            {
                "meeting_id": meeting_id,
                "text": item,
                "language": "en",
                "created_at": now,
            }
        )

    return meeting_id


async def seed_database() -> None:
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.MONGODB_DB_NAME]
    now = _utc_now()

    print("Seeding updated Meeting Monitor data...")

    users_seed = [
        {
            "name": "Sarah Chen",
            "email": "sarah.chen@company.com",
            "password": "password123",
            "role": "Engineering Manager",
            "skills": ["Planning", "Architecture", "Delivery"],
            "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah",
        },
        {
            "name": "Michael Park",
            "email": "michael.park@company.com",
            "password": "password123",
            "role": "Backend Developer",
            "skills": ["Python", "FastAPI", "MongoDB"],
            "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=Michael",
        },
        {
            "name": "Asha Patel",
            "email": "asha.patel@company.com",
            "password": "password123",
            "role": "QA Engineer",
            "skills": ["Testing", "Automation", "Postman"],
            "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=Asha",
        },
        {
            "name": "Vikram Rao",
            "email": "vikram.rao@company.com",
            "password": "password123",
            "role": "DevOps Engineer",
            "skills": ["CI/CD", "Docker", "Monitoring"],
            "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=Vikram",
        },
    ]

    user_ids: dict[str, str] = {}
    for row in users_seed:
        user_ids[row["email"]] = await _upsert_user(db, row)
    print(f"Users seeded: {len(user_ids)}")

    alpha_workspace_id = await _upsert_project(
        db,
        {
            "name": "Alpha Workspace",
            "description": "Core product and meeting intelligence delivery",
            "invite_code": "ALPHA2026",
            "project_type": "workspace",
            "owner_id": user_ids["sarah.chen@company.com"],
            "members": [
                user_ids["sarah.chen@company.com"],
                user_ids["michael.park@company.com"],
                user_ids["asha.patel@company.com"],
                user_ids["vikram.rao@company.com"],
            ],
        },
    )

    await _upsert_project(
        db,
        {
            "name": "Release Readiness Class",
            "description": "Internal enablement and process training",
            "invite_code": "RRCLASS26",
            "project_type": "class",
            "owner_id": user_ids["sarah.chen@company.com"],
            "members": [
                user_ids["sarah.chen@company.com"],
                user_ids["asha.patel@company.com"],
            ],
        },
    )
    print("Projects seeded: 2")

    ended_meeting_id = await _upsert_meeting_bundle(
        db,
        alpha_workspace_id,
        "Architecture and Delivery Sync",
    )

    live_meeting = await db.meetings.find_one({"project_id": alpha_workspace_id, "title": "Live Standup Demo"})
    live_doc = {
        "project_id": alpha_workspace_id,
        "title": "Live Standup Demo",
        "status": "live",
        "meeting_url": "https://meet.jit.si/meeting-monitor-live-demo",
        "started_at": now - timedelta(minutes=10),
        "ended_at": None,
    }
    if live_meeting:
        await db.meetings.update_one({"_id": live_meeting["_id"]}, {"$set": live_doc})
    else:
        res = await db.meetings.insert_one({**live_doc, "meeting_id": "autogen"})
        await db.meetings.update_one({"_id": res.inserted_id}, {"$set": {"meeting_id": str(res.inserted_id)}})

    await db.tasks.delete_many({"project_id": alpha_workspace_id, "is_auto_generated": True})
    task_rows = [
        {
            "title": "Harden WebSocket reconnection flow",
            "description": "Stabilize reconnect/backoff logic for live audio stream.",
            "status": "in_progress",
            "priority": "high",
            "assignee_id": user_ids["vikram.rao@company.com"],
            "assignee_name": "Vikram Rao",
            "source_meeting_id": ended_meeting_id,
        },
        {
            "title": "Run transcription QA regression suite",
            "description": "Validate quality and continuity across noisy and clean audio.",
            "status": "todo",
            "priority": "high",
            "assignee_id": user_ids["asha.patel@company.com"],
            "assignee_name": "Asha Patel",
            "source_meeting_id": ended_meeting_id,
        },
    ]
    for task in task_rows:
        await db.tasks.insert_one(
            {
                "project_id": alpha_workspace_id,
                "title": task["title"],
                "description": task["description"],
                "status": task["status"],
                "priority": task["priority"],
                "assignee_id": task["assignee_id"],
                "assignee_name": task["assignee_name"],
                "assigned_at": now,
                "due_date": now + timedelta(days=2),
                "subtasks": None,
                "source_meeting_id": task["source_meeting_id"],
                "synced_from_meeting_ids": [task["source_meeting_id"]],
                "is_auto_generated": True,
                "created_at": now,
                "updated_at": now,
                "completed_at": None,
            }
        )

    print("Meetings seeded: 2 (1 ended + 1 live)")
    print("Tasks seeded: 2")
    print("")
    print("Test credentials:")
    print("  sarah.chen@company.com / password123 (Engineering Manager)")
    print("  michael.park@company.com / password123 (Backend Developer)")
    print("  asha.patel@company.com / password123 (QA Engineer)")
    print("  vikram.rao@company.com / password123 (DevOps Engineer)")
    print("")
    print("Invite codes:")
    print("  ALPHA2026")
    print("  RRCLASS26")

    client.close()


if __name__ == "__main__":
    asyncio.run(seed_database())
