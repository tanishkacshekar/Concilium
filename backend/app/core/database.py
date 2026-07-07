from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import OperationFailure
from app.core.config import settings
import asyncio

class Database:
    client: AsyncIOMotorClient = None

db = Database()

async def get_database():
    """Get database instance"""
    return db.client[settings.MONGODB_DB_NAME]

async def init_db():
    """Initialize database connection and create indexes"""
    db.client = AsyncIOMotorClient(settings.MONGODB_URL)
    # Test connection
    await db.client.admin.command('ping')
    print(f"✅ Connected to MongoDB: {settings.MONGODB_DB_NAME}")
    
    # Create indexes
    await create_indexes()
    print("✅ Database indexes created")

async def create_indexes():
    """Create database indexes for performance. Idempotent: does not crash if index already exists."""
    database = db.client[settings.MONGODB_DB_NAME]

    async def ensure_index(coll, key, **opts):
        try:
            await coll.create_index(key, **opts)
        except OperationFailure as e:
            if e.code in (85, 86) or "already exists" in (e.details or {}).get("errmsg", "").lower():
                pass
            else:
                raise

    # Users collection indexes
    await ensure_index(database.users, "email", unique=True)
    await ensure_index(database.users, "role")

    # Projects collection indexes
    await ensure_index(database.projects, "invite_code", unique=True)
    await ensure_index(database.projects, "owner_id")
    await ensure_index(database.projects, "members")
    await ensure_index(database.projects, "project_type")

    # Meeting bot collections (default names; idempotent)
    await ensure_index(database.meetings, "project_id")
    await ensure_index(database.meetings, "status")
    await ensure_index(database.meetings, "started_at")
    await ensure_index(database.transcript_segments, "meeting_id")
    await ensure_index(database.transcript_segments, "timestamp")
    await ensure_index(database.transcripts, "meeting_id")
    await ensure_index(database.transcripts, "timestamp")
    await ensure_index(database.attendance_records, "meeting_id")
    await ensure_index(database.attendance_records, "participant_id")
    await ensure_index(database.summaries, "meeting_id")
    await ensure_index(database.action_items, "meeting_id")

    # Tasks collection indexes
    await ensure_index(database.tasks, "project_id")
    await ensure_index(database.tasks, "assignee_id")
    await ensure_index(database.tasks, "status")
    await ensure_index(database.tasks, "source_meeting_id")
    await ensure_index(database.tasks, [("project_id", 1), ("status", 1)])
    await ensure_index(database.tasks, [("project_id", 1), ("is_auto_generated", 1), ("source_meeting_id", 1)])
    await ensure_index(database.tasks, "synced_from_meeting_ids")

    # Kanban automation logs/review queues
    await ensure_index(database.kanban_automation_runs, "project_id")
    await ensure_index(database.kanban_automation_runs, "meeting_id")
    await ensure_index(database.kanban_task_review_queue, "project_id")
    await ensure_index(database.kanban_task_review_queue, "meeting_id")
    await ensure_index(database.kanban_task_activity, "task_id")
    await ensure_index(database.kanban_task_activity, "project_id")

    # Documents collection indexes (for team member documents)
    await ensure_index(database.documents, "workspace_id")
    await ensure_index(database.documents, "name")

async def close_db():
    """Close database connection"""
    if db.client:
        db.client.close()
        print("✅ MongoDB connection closed")
