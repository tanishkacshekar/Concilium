"""
Record join/leave for meeting participants. Persists to attendance_records.
"""
from datetime import datetime
from typing import Optional

from app.core.database import get_database


class AttendanceTracker:
    """record_join / record_leave; stores in attendance_records."""

    def __init__(self, meeting_id: str):
        self.meeting_id = meeting_id
        self._recent_joins: dict = {}

    async def record_join(
        self,
        participant_id: str,
        participant_name: str,
        meeting_role: Optional[str] = None,
    ) -> None:
        """Insert join record (join_time, no leave_time). Avoid duplicate within 5 min."""
        db = await get_database()
        now = datetime.utcnow()
        key = (participant_id, participant_name)
        last = self._recent_joins.get(key)
        if last and (now - last).total_seconds() < 300:
            return
        self._recent_joins[key] = now
        await db.attendance_records.insert_one({
            "meeting_id": self.meeting_id,
            "participant_id": participant_id,
            "participant_name": participant_name,
            "join_time": now,
            "leave_time": None,
            "duration_seconds": None,
            "meeting_role": meeting_role,
        })

    async def record_leave(self, participant_id: str) -> None:
        """Set leave_time and duration_seconds on latest open record."""
        db = await get_database()
        now = datetime.utcnow()
        rec = await db.attendance_records.find_one(
            {"meeting_id": self.meeting_id, "participant_id": participant_id, "leave_time": None},
            sort=[("join_time", -1)],
        )
        if rec:
            join_time = rec.get("join_time") or now
            duration = (now - join_time).total_seconds()
            await db.attendance_records.update_one(
                {"_id": rec["_id"]},
                {"$set": {"leave_time": now, "duration_seconds": duration}},
            )
