"""
Clear data from meeting_monitor collections used by the app.
Run with: python -m scripts.clear_db
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

COLLECTIONS = [
    "users",
    "projects",
    "meetings",
    "transcript_segments",
    "transcripts",
    "attendance_records",
    "summaries",
    "action_items",
    "tasks",
    "documents",
]


async def clear_database():
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.MONGODB_DB_NAME]

    print(f"Clearing collections in database: {settings.MONGODB_DB_NAME}\n")

    for name in COLLECTIONS:
        try:
            result = await db[name].delete_many({})
            print(f"   {name}: deleted {result.deleted_count} document(s)")
        except Exception as e:
            print(f"   {name}: skip ({e})")

    client.close()
    print("\nDone. Restart the server to recreate indexes if needed.")


if __name__ == "__main__":
    asyncio.run(clear_database())
