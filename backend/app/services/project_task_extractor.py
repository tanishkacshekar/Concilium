"""
Sync Kanban tasks from stored action_items (no LLM). Fuzzy dedup on title per project.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime
from difflib import SequenceMatcher
from typing import List, Optional

from app.core.database import get_database

logger = logging.getLogger(__name__)


def _normalize_title(s: str) -> str:
    s = (s or "").strip().lower()
    return re.sub(r"\s+", " ", s)


def _title_similarity(a: str, b: str) -> float:
    na, nb = _normalize_title(a), _normalize_title(b)
    if not na or not nb:
        return 0.0
    return SequenceMatcher(None, na, nb).ratio()


def _find_similar_task(existing_tasks: List[dict], title: str, threshold: float = 0.75) -> Optional[dict]:
    for t in existing_tasks:
        if _title_similarity(t.get("title") or "", title) >= threshold:
            return t
    return None


async def _action_items_for_project(project_id: str) -> List[dict]:
    """action_items docs for all meetings belonging to project, oldest first."""
    db = await get_database()
    meetings = await db.meetings.find({"project_id": project_id}).to_list(length=500)
    if not meetings:
        return []
    meeting_ids = [str(m["_id"]) for m in meetings]
    return await (
        db.action_items.find({"meeting_id": {"$in": meeting_ids}})
        .sort("created_at", 1)
        .to_list(length=5000)
    )


async def sync_tasks_to_kairox(project_id: str) -> None:
    """
    Create/update tasks in column `todo` from persisted action_items for this project.
    No Groq calls — relies on meeting_intelligence having written action_items.
    """
    db = await get_database()
    items = await _action_items_for_project(project_id)
    if not items:
        logger.info("No action_items for project_id=%s; skip task sync", project_id)
        return

    existing = await db.tasks.find({"project_id": project_id}).to_list(length=2000)
    now = datetime.utcnow()
    status = "todo"

    for doc in items:
        title = (doc.get("text") or "").strip()
        if not title:
            continue
        meeting_id = doc.get("meeting_id")
        similar = _find_similar_task(existing, title)
        if similar:
            update = {}
            if meeting_id and not similar.get("source_meeting_id"):
                update["source_meeting_id"] = meeting_id
            if update:
                update["updated_at"] = now
                await db.tasks.update_one({"_id": similar["_id"]}, {"$set": update})
            continue
        else:
            new_doc = {
                "project_id": project_id,
                "title": title,
                "description": None,
                "status": status,
                "priority": "medium",
                "assignee_id": None,
                "due_date": None,
                "subtasks": None,
                "source_meeting_id": meeting_id,
                "is_auto_generated": True,
                "created_at": now,
                "updated_at": now,
            }
            result = await db.tasks.insert_one(new_doc)
            existing.append({**new_doc, "_id": result.inserted_id})
            logger.debug("Created task from action_item: %s", title[:80])

    logger.info("Task sync from action_items finished project_id=%s items_processed=%d", project_id, len(items))
