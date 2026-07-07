"""
Workspace copilot: Groq turns a user message + workspace snapshot into an answer and optional actions
(create meeting, copilot task with assignee, update task, rebuild Kanban).
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId

from app.core.config import settings
from app.services.meeting_intelligence import get_groq_client
from app.services.meeting_context_qa import _build_transcript_text
from app.services.kanban_agentic_automation import rebuild_kanban_from_meeting_history
from app.api.v1.endpoints.tasks import _normalize_status

logger = logging.getLogger(__name__)

MAX_CONTEXT_CHARS = 55_000
MAX_TRANSCRIPT_SNIPPET = 12_000


def _similarity(a: str, b: str) -> float:
    a, b = (a or "").strip().lower(), (b or "").strip().lower()
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def _resolve_member_id(
    members: List[dict],
    owner_id: str,
    assignee_member_id: Optional[str],
    assignee_name_hint: Optional[str],
    role_hint: Optional[str],
) -> Tuple[Optional[str], str]:
    """Pick assignee user id + display name from hints."""
    if assignee_member_id:
        for m in members:
            if m.get("id") == assignee_member_id:
                return m["id"], (m.get("name") or "").strip() or m["id"]
    hints = " ".join(
        x for x in (assignee_name_hint, role_hint) if x
    ).strip().lower()
    if "owner" in hints or "manager" in hints:
        for m in members:
            if m.get("id") == owner_id:
                return m["id"], (m.get("name") or "").strip() or m["id"]
    best_id, best_name, best_s = None, "", 0.0
    for m in members:
        name = (m.get("name") or "").strip()
        if not name:
            continue
        for part in (assignee_name_hint, role_hint):
            if not part:
                continue
            s = _similarity(part, name)
            if len(part) >= 2 and part.lower() in name.lower():
                s = max(s, 0.88)
            if s > best_s:
                best_s, best_id, best_name = s, m["id"], name
    if best_s >= 0.55 and best_id:
        return best_id, best_name
    return None, ""


def _strip_json_fences(txt: str) -> str:
    t = (txt or "").strip()
    if t.startswith("```"):
        lines = t.split("\n")
        t = "\n".join(lines[1:-1] if lines and lines[-1].strip() == "```" else lines[1:])
    return t.strip()


def _parse_copilot_response(raw: str) -> dict:
    t = _strip_json_fences(raw or "")
    try:
        data = json.loads(t)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    return {"answer": (raw or "Could not parse assistant response.").strip(), "actions": []}


async def build_workspace_snapshot(db, project_id: str, meeting_id: Optional[str] = None) -> dict:
    project = await db.projects.find_one({"_id": ObjectId(project_id)})
    if not project:
        return {}
    owner_id = str(project.get("owner_id") or "")
    members_raw = project.get("members") or []
    member_rows = []
    for uid in members_raw:
        try:
            u = await db.users.find_one({"_id": ObjectId(uid)})
        except Exception:
            u = None
        if u:
            member_rows.append(
                {
                    "id": str(u["_id"]),
                    "name": (u.get("name") or "").strip(),
                    "email": (u.get("email") or "").strip(),
                    "is_owner": str(u["_id"]) == owner_id,
                }
            )
    meetings = await db.meetings.find({"project_id": project_id}).sort("started_at", -1).to_list(length=50)
    meeting_summaries = []
    for m in meetings:
        mid = str(m["_id"])
        summary_doc = await db.summaries.find_one({"meeting_id": mid}, sort=[("created_at", -1)])
        st = (summary_doc or {}).get("summary_text") or ""
        if len(st) > 400:
            st = st[:400] + "…"
        meeting_summaries.append(
            {
                "id": mid,
                "title": m.get("title") or "Meeting",
                "status": m.get("status") or "scheduled",
                "summary_excerpt": st or None,
            }
        )
    valid_mids = [str(m["_id"]) for m in meetings]
    task_query: dict = {
        "project_id": project_id,
        "is_auto_generated": True,
    }
    if valid_mids:
        task_query["$or"] = [
            {"source_meeting_id": {"$in": valid_mids}},
            {"synced_from_meeting_ids": {"$in": valid_mids}},
            {"copilot_created": True},
        ]
    else:
        task_query["$or"] = [{"copilot_created": True}]
    task_docs = await db.tasks.find(task_query).sort("updated_at", -1).to_list(length=80)
    tasks_out = []
    for t in task_docs:
        tasks_out.append(
            {
                "id": str(t["_id"]),
                "title": t.get("title"),
                "status": t.get("status"),
                "assignee_name": t.get("assignee_name"),
                "assignee_id": t.get("assignee_id"),
                "priority": t.get("priority"),
            }
        )
    extra_meeting = ""
    if meeting_id:
        segs = await db.transcript_segments.find({"meeting_id": meeting_id}).sort("timestamp", 1).to_list(
            length=3000
        )
        extra_meeting = _build_transcript_text([{"text": s.get("text")} for s in segs])
        if len(extra_meeting) > MAX_TRANSCRIPT_SNIPPET:
            extra_meeting = extra_meeting[-MAX_TRANSCRIPT_SNIPPET:]

    snap = {
        "project_name": project.get("name") or "Workspace",
        "owner_member_id": owner_id,
        "members": member_rows,
        "meetings": meeting_summaries,
        "tasks": tasks_out,
        "focused_meeting_id": meeting_id,
        "focused_meeting_transcript_excerpt": extra_meeting or None,
    }
    blob = json.dumps(snap, ensure_ascii=False)
    if len(blob) > MAX_CONTEXT_CHARS:
        snap["tasks"] = tasks_out[:40]
        snap["meetings"] = meeting_summaries[:25]
        blob = json.dumps(snap, ensure_ascii=False)
    return snap


async def run_workspace_copilot(
    db,
    project_id: str,
    user_message: str,
    meeting_id: Optional[str] = None,
) -> Tuple[str, List[dict]]:
    snap = await build_workspace_snapshot(db, project_id, meeting_id=meeting_id)
    if not snap:
        return "Workspace not found.", []

    sys_prompt = """You are a workspace copilot with access to the JSON snapshot below (in the user message).
You help with this project: meetings, tasks, members, and what was discussed.

Reply with ONE JSON object only (no markdown):
{
  "answer": "Friendly, concise reply to the user. Mention what you did if you ran actions.",
  "actions": [ ... ]
}

Allowed action objects (only when the user clearly wants it):
- {"type": "create_meeting", "title": "string", "meeting_url": "string or null"}
  Creates a scheduled meeting record (user can open meeting details to start bot).
- {"type": "create_task", "title": "string", "description": "string or null", "assignee_member_id": "exact id from members[] or null", "assignee_name_hint": "string or null", "role_hint": "e.g. owner, backend — or null", "priority": "low"|"medium"|"high"|"urgent"}
  Creates a Kanban task and assigns best-matching member from hints or leaves unassigned.
- {"type": "update_task", "task_id": "string", "status": "todo"|"in_progress"|"in_review"|"done"|"blockers"}
  Updates an existing task by id from snapshot tasks[].
- {"type": "sync_kanban"}
  Rebuilds Kanban from all meeting transcripts (use when user asks to refresh/extract tasks from meetings).
- {"type": "update_meeting", "meeting_id": "string", "title": "string or null", "meeting_url": "string or null"}
  Updates a scheduled/live meeting’s title and/or join URL (ids from meetings[] in snapshot).

Rules:
- Use only member ids and task ids that appear in the snapshot.
- If unsure, ask in "answer" and leave "actions" empty.
- Do not invent meetings or tasks not requested.
- For scheduling: create_meeting only creates the record; user adds link and starts bot in UI."""

    user_blob = json.dumps({"workspace_snapshot": snap, "user_message": user_message.strip()}, ensure_ascii=False)

    if not settings.GROQ_API_KEY:
        return "AI copilot is unavailable (missing GROQ_API_KEY).", []

    client = get_groq_client()
    model = settings.TASK_AUTOMATION_MODEL or "llama-3.3-70b-versatile"
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_blob},
            ],
            temperature=0.15,
            max_tokens=2048,
            response_format={"type": "json_object"},
        )
    except Exception as e:
        logger.exception("copilot groq: %s", e)
        return f"Assistant error: {e}", []

    parsed = _parse_copilot_response(resp.choices[0].message.content or "{}")
    answer = str(parsed.get("answer") or "").strip() or "Done."
    actions = parsed.get("actions") if isinstance(parsed.get("actions"), list) else []

    executed: List[dict] = []
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    members = snap.get("members") or []
    owner_id = snap.get("owner_member_id") or ""

    for raw in actions:
        if not isinstance(raw, dict):
            continue
        typ = str(raw.get("type") or "").strip().lower()
        try:
            if typ == "create_meeting":
                title = str(raw.get("title") or "Meeting").strip() or "Meeting"
                url = raw.get("meeting_url")
                url_s = str(url).strip() if url else None
                oid = ObjectId()
                await db.meetings.insert_one(
                    {
                        "_id": oid,
                        "meeting_id": str(oid),
                        "project_id": project_id,
                        "title": title,
                        "status": "scheduled",
                        "meeting_url": url_s,
                        "started_at": None,
                        "ended_at": None,
                    }
                )
                executed.append({"type": "create_meeting", "meeting_id": str(oid), "title": title})
            elif typ == "create_task":
                title = str(raw.get("title") or "").strip()
                if not title:
                    continue
                desc = raw.get("description")
                desc_s = str(desc).strip() if desc else None
                pr = str(raw.get("priority") or "medium").lower()
                if pr not in ("low", "medium", "high", "urgent"):
                    pr = "medium"
                aid, aname = _resolve_member_id(
                    members,
                    owner_id,
                    raw.get("assignee_member_id"),
                    raw.get("assignee_name_hint"),
                    raw.get("role_hint"),
                )
                tid = ObjectId()
                doc = {
                    "_id": tid,
                    "project_id": project_id,
                    "title": title,
                    "description": desc_s or "Created by workspace copilot",
                    "status": "todo",
                    "priority": pr,
                    "assignee_id": aid,
                    "assignee_name": aname or None,
                    "assigned_at": now if aid else None,
                    "due_date": None,
                    "subtasks": None,
                    "source_meeting_id": None,
                    "synced_from_meeting_ids": [],
                    "is_auto_generated": True,
                    "copilot_created": True,
                    "created_at": now,
                    "updated_at": now,
                    "completed_at": None,
                }
                await db.tasks.insert_one(doc)
                executed.append(
                    {
                        "type": "create_task",
                        "task_id": str(tid),
                        "title": title,
                        "assignee_id": aid,
                        "assignee_name": aname or None,
                    }
                )
            elif typ == "update_task":
                tid_s = str(raw.get("task_id") or "").strip()
                st = _normalize_status(raw.get("status"))
                if not tid_s:
                    continue
                try:
                    toid = ObjectId(tid_s)
                except Exception:
                    continue
                existing = await db.tasks.find_one({"_id": toid, "project_id": project_id})
                if not existing:
                    continue
                patch = {"status": st, "updated_at": now}
                if st == "done":
                    patch["completed_at"] = now
                await db.tasks.update_one({"_id": toid}, {"$set": patch})
                executed.append({"type": "update_task", "task_id": tid_s, "status": st})
            elif typ == "sync_kanban":
                result = await rebuild_kanban_from_meeting_history(project_id, trigger_meeting_id=None)
                executed.append({"type": "sync_kanban", "result": result})
            elif typ == "update_meeting":
                mid_s = str(raw.get("meeting_id") or "").strip()
                if not mid_s:
                    continue
                try:
                    moid = ObjectId(mid_s)
                except Exception:
                    continue
                mdoc = await db.meetings.find_one({"_id": moid, "project_id": project_id})
                if not mdoc:
                    continue
                patch_m: Dict[str, Any] = {}
                nt = raw.get("title")
                if nt is not None and str(nt).strip():
                    patch_m["title"] = str(nt).strip()
                nu = raw.get("meeting_url")
                if nu is not None:
                    patch_m["meeting_url"] = str(nu).strip() or None
                if patch_m:
                    await db.meetings.update_one({"_id": moid}, {"$set": patch_m})
                executed.append({"type": "update_meeting", "meeting_id": mid_s, **patch_m})
            else:
                executed.append({"type": typ, "skipped": True, "reason": "unknown_type"})
        except Exception as e:
            logger.exception("copilot action %s failed", typ)
            executed.append({"type": typ, "error": str(e)})

    if executed:
        lines = []
        for x in executed[:8]:
            t = x.get("type")
            if t == "create_meeting" and not x.get("error"):
                lines.append(f"• Scheduled meeting “{x.get('title')}” (open Meetings to start the bot).")
            elif t == "create_task" and not x.get("error"):
                who = x.get("assignee_name") or "unassigned"
                lines.append(f"• Added task “{x.get('title')}” → {who}.")
            elif t == "update_task" and not x.get("error"):
                lines.append(f"• Updated task to “{x.get('status')}”.")
            elif t == "sync_kanban" and not x.get("error"):
                lines.append("• Refreshed Kanban from meeting history.")
            elif t == "update_meeting" and not x.get("error"):
                lines.append("• Updated meeting details.")
            elif x.get("error"):
                lines.append(f"• Action failed: {x.get('error')}")
        if lines:
            answer = f"{answer}\n\n" + "\n".join(lines)
    return answer, executed
