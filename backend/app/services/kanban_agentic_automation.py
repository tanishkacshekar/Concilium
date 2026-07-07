"""
Agentic Kanban automation pipeline.

Flow:
1) Triggered after meeting transcripts are available.
2) Cumulative history: LLM extracts only **confirmed** assignments (direct ownership or request + verbal
   acceptance). Suggestions / unconfirmed asks are not Kanban tasks.
3) First pass applies new/merged tasks to Mongo (match by title + assignee).
4) Second pass: current Kanban board (all auto tasks) + **latest meeting transcript only** → Groq returns
   column moves (todo / in_progress / in_review / done / blockers) grounded in verbatim evidence.
5) Informal action items from the latest pass are logged only (not persisted as tasks).
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

from groq import Groq
from bson import ObjectId

from app.core.config import settings
from app.core.database import get_database

logger = logging.getLogger(__name__)

KANBAN_STATUSES = {"todo", "in_progress", "in_review", "done", "blockers"}
MAX_CHARS_PER_CHUNK = 30_000

# Higher = further along; used when merging duplicate extractions across chunks.
_STATUS_RANK = {"todo": 1, "in_progress": 2, "in_review": 3, "blockers": 4, "done": 5}

_WEEKDAY_NAMES = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)


@dataclass
class ExtractedTask:
    title: str
    assignee: Optional[str]
    status: str
    due_date: Optional[str]
    blockers: List[str]
    confidence: float
    source_meeting_id: str
    evidence: str = ""  # verbatim transcript only (stored as task description)
    evidence_meeting_id: str = ""  # meeting section the evidence came from
    meeting_ordinal: int = 0  # 0 = oldest in bundle; higher = more recent


def _clean_transcript(text: str) -> str:
    """
    Normalize + clean transcription for task extraction.

    This preserves the original heuristic cleaning (timestamps/speaker tags),
    then applies deterministic filler/STT-error cleanup.
    """
    t = (text or "").strip()
    if not t:
        return ""
    # Remove common timestamp prefixes like [00:12:01], 00:12, 00:12:01
    t = re.sub(r"(?m)^\s*\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*", "", t)
    # Remove simple speaker tags like "John:" at line starts.
    t = re.sub(r"(?m)^\s*[A-Za-z][\w .'-]{0,40}:\s*", "", t)
    # Collapse repeated spaces.
    t = re.sub(r"[ \t]+", " ", t)

    from app.services.transcription_cleaning import clean_transcription_text

    return clean_transcription_text(t)


def _chunk_text(text: str, size: int = MAX_CHARS_PER_CHUNK) -> List[str]:
    if len(text) <= size:
        return [text]
    chunks: List[str] = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        # Prefer sentence/newline boundary
        if end < len(text):
            nl = text.rfind("\n", start, end)
            dot = text.rfind(". ", start, end)
            boundary = max(nl, dot)
            if boundary > start + int(size * 0.6):
                end = boundary + 1
        chunks.append(text[start:end].strip())
        start = end
    return [c for c in chunks if c]


def _normalize_status(s: Optional[str]) -> str:
    raw = (s or "").strip().lower()
    mapping = {
        "todo": "todo",
        "to_do": "todo",
        "to do": "todo",
        "open": "todo",
        "pending": "todo",
        "in progress": "in_progress",
        "in_progress": "in_progress",
        "doing": "in_progress",
        "working on": "in_progress",
        "review": "in_review",
        "in review": "in_review",
        "in_review": "in_review",
        "done": "done",
        "completed": "done",
        "complete": "done",
        "finished": "done",
        "finishing": "in_progress",
        "shipped": "done",
        "wrapped": "done",
        "closed": "done",
        "resolved": "done",
        "finalized": "done",
        "merged": "done",
        "delivered": "done",
        "blocked": "blockers",
        "blocker": "blockers",
        "blockers": "blockers",
        "stuck": "blockers",
    }
    return mapping.get(raw, "todo")


def _status_rank(status: str) -> int:
    return _STATUS_RANK.get(_normalize_status(status), 1)


def _next_weekday_on_or_after(anchor: date, target_weekday: int) -> date:
    """target_weekday: Monday=0 .. Sunday=6."""
    delta = (target_weekday - anchor.weekday()) % 7
    return anchor + timedelta(days=delta)


def _infer_due_date_iso(text: str, anchor: date) -> Optional[str]:
    """
    Map relative date phrases in task title (or raw due field) to YYYY-MM-DD using meeting date as 'today'.
    """
    t = (text or "").lower().strip()
    if not t:
        return None
    # EOD / COB phrasing (order-independent: "EOD today" vs "today EOD")
    if re.search(r"\b(eod|cob|close of business|end of (the )?day)\b", t) and re.search(
        r"\b(today|tonight|this evening)\b", t
    ):
        return anchor.isoformat()
    if re.search(r"\b(by|before)\s+(the\s+)?(eod|cob|close of business|end of (the )?day)\b", t):
        if re.search(r"\btomorrow\b", t):
            return (anchor + timedelta(days=1)).isoformat()
        return anchor.isoformat()
    if re.search(r"\b(today|tonight)\b", t) and re.search(
        r"\b(eod|by end|end of)\b", t
    ):
        return anchor.isoformat()
    if re.search(r"\b(today|tonight|eod|end of day)\b", t):
        return anchor.isoformat()
    if re.search(r"\btomorrow\b", t):
        return (anchor + timedelta(days=1)).isoformat()
    if re.search(r"\bday after tomorrow\b", t):
        return (anchor + timedelta(days=2)).isoformat()
    if re.search(r"\bnext week\b", t):
        return (anchor + timedelta(days=7)).isoformat()

    for i, day_name in enumerate(_WEEKDAY_NAMES):
        if not re.search(rf"\b{day_name}s?\b", t):
            continue
        if re.search(rf"\bnext\s+{day_name}s?\b", t):
            return (_next_weekday_on_or_after(anchor, i) + timedelta(days=7)).isoformat()
        if re.search(rf"\b(this|by|on|before|until|due)\s+{day_name}s?\b", t):
            return _next_weekday_on_or_after(anchor, i).isoformat()
        if re.search(r"\b(due|by|before|deadline)\b", t) and re.search(rf"\b{day_name}s?\b", t):
            return _next_weekday_on_or_after(anchor, i).isoformat()
    return None


def _resolve_task_due_date(
    raw_due: Optional[str],
    title: str,
    anchor: date,
    context: str = "",
) -> Optional[str]:
    """Return YYYY-MM-DD string or None. context = full meeting transcript for phrase search."""
    s = (raw_due or "").strip()
    if s:
        parsed = _parse_due_date_iso(s)
        if parsed:
            return parsed.date().isoformat()
        from_field = _infer_due_date_iso(s, anchor)
        if from_field:
            return from_field
    got = _infer_due_date_iso(title, anchor)
    if got:
        return got
    return _infer_due_date_iso(context, anchor)


def _collapse_ws(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _validate_transcript_evidence(evidence: str, chunk: str) -> str:
    """Keep only evidence that actually appears in the chunk (verbatim transcription)."""
    ev = (evidence or "").strip()
    if not ev or not chunk:
        return ""
    if ev in chunk:
        return ev
    ec, ch = _collapse_ws(ev), _collapse_ws(chunk)
    if ec and ec in ch:
        idx = ch.find(ec)
        if idx >= 0:
            return ch[idx : idx + len(ec)]
    return ""


def _fallback_transcript_snippet(chunk: str, assignee: str, title: str, max_chars: int = 1500) -> str:
    """Deterministic lines from transcript mentioning assignee / task — no LLM prose."""
    if not (chunk or "").strip():
        return ""
    parts = re.split(r"(?<=[.!?])\s+", chunk)
    a = (assignee or "").strip().lower()
    title_tokens = [w for w in re.split(r"\W+", (title or "").lower()) if len(w) > 2][:8]
    picked: List[str] = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        pl = p.lower()
        if a and a in pl:
            picked.append(p)
        elif title_tokens and sum(1 for w in title_tokens if w in pl) >= 2:
            picked.append(p)
    text = " ".join(picked[:10]).strip()
    if not text:
        text = chunk.strip()[:max_chars]
    return text[:max_chars]


def _assignees_equivalent(a: Optional[str], b: Optional[str]) -> bool:
    if not a or not b:
        return False
    a, b = str(a).strip(), str(b).strip()
    if not a or not b:
        return False
    if a.lower() == b.lower():
        return True
    if a.lower() in b.lower() or b.lower() in a.lower():
        return True
    return _similarity(a, b) >= 0.86


_INTRO_ROLE_PATTERNS = re.compile(
    r"\b(i\s*'?m|i\s+am|my name is|my name's|call me|introduce myself|"
    r"nice to meet|good to meet|pleased to meet|a bit about me|little about myself|"
    r"i\s+(work on|handle|lead|manage|focus on|specialize in)|my role is|i'm the\s+\w+\s+(lead|manager|engineer))\b",
    re.I,
)
_ROLE_ONLY_TITLE = re.compile(
    r"^(backend|frontend|full[\s-]?stack|mobile|qa|quality assurance|testing|test|devops|sre|"
    r"ui|ux|product|data|ml|ai)(\s+(engineering|development|developer|dev|tester|engineer))?$",
    re.I,
)


def _is_team_placeholder(name: Optional[str]) -> bool:
    if name is None:
        return True
    s = str(name).strip().lower()
    if not s:
        return True
    return bool(
        re.match(
            r"^(team|everyone|all of us|the team|group|we|unspecified|tbd|general)\b",
            s,
        )
    )


def _is_intro_or_role_noise(title: str, evidence: str) -> bool:
    """Filter intros / icebreakers mistaken as tasks (e.g. 'backend development')."""
    t = (title or "").strip()
    blob = f"{t} {evidence or ''}"
    if _INTRO_ROLE_PATTERNS.search(blob):
        if not re.search(
            r"\b(will|must|need to|assigned|action item|deadline|due|deliver|ship|complete the|"
            r"follow up|by friday|eod)\b",
            blob,
            re.I,
        ):
            return True
    if _ROLE_ONLY_TITLE.match(t) and len(t) < 48:
        return True
    if re.search(r"\b(introduce yourself|round of intros|icebreaker)\b", blob, re.I):
        return True
    return False


def _infer_evidence_meeting_id(evidence: str, chunk: str, meeting_id_order: List[str]) -> str:
    """Map evidence snippet to the last meeting header seen before it in this chunk."""
    if not evidence or not meeting_id_order:
        return meeting_id_order[-1]
    probe = evidence[:120].strip()
    if not probe:
        return meeting_id_order[-1]
    pos = chunk.find(probe)
    if pos < 0:
        ec = _collapse_ws(probe)
        cc = _collapse_ws(chunk)
        if ec and ec in cc:
            pos = cc.find(ec)
        else:
            return meeting_id_order[-1]
    prefix = chunk[:pos] if pos >= 0 else chunk
    last = meeting_id_order[-1]
    for mid in meeting_id_order:
        if f"meeting_id={mid}" in prefix:
            last = mid
    return last


def _task_row_matches(a: ExtractedTask, b: ExtractedTask) -> bool:
    if _similarity(a.title, b.title) < 0.82:
        return False
    if _assignees_equivalent(a.assignee, b.assignee):
        return True
    if _is_team_placeholder(a.assignee) or _is_team_placeholder(b.assignee):
        return True
    if _similarity(a.title, b.title) >= 0.92:
        return True
    return False


def _dedup_extracted_global(rows: List[ExtractedTask]) -> List[ExtractedTask]:
    """
    Merge the same logical task across meetings. Later ordinals win for status, assignee, due_date.
    """
    rows_asc = sorted(rows, key=lambda x: x.meeting_ordinal)
    merged: List[ExtractedTask] = []
    for t in rows_asc:
        existing = next((m for m in merged if _task_row_matches(m, t)), None)
        if not existing:
            merged.append(
                ExtractedTask(
                    title=t.title,
                    assignee=t.assignee,
                    status=t.status,
                    due_date=t.due_date,
                    blockers=list(t.blockers),
                    confidence=t.confidence,
                    source_meeting_id=t.source_meeting_id,
                    evidence=t.evidence,
                    evidence_meeting_id=t.evidence_meeting_id,
                    meeting_ordinal=t.meeting_ordinal,
                )
            )
            continue
        if t.meeting_ordinal >= existing.meeting_ordinal:
            if _status_rank(t.status) >= _status_rank(existing.status):
                existing.status = t.status
            if t.assignee and (
                not existing.assignee
                or _is_team_placeholder(existing.assignee)
                or (t.meeting_ordinal > existing.meeting_ordinal and not _is_team_placeholder(t.assignee))
            ):
                if not _is_team_placeholder(t.assignee):
                    existing.assignee = t.assignee
                elif not existing.assignee or _is_team_placeholder(existing.assignee):
                    existing.assignee = t.assignee or existing.assignee
            if t.due_date and (
                not existing.due_date or t.meeting_ordinal > existing.meeting_ordinal
            ):
                existing.due_date = t.due_date
            if t.evidence:
                existing.evidence = _merge_transcript_description(existing.evidence, t.evidence)
            existing.meeting_ordinal = max(existing.meeting_ordinal, t.meeting_ordinal)
            existing.evidence_meeting_id = t.evidence_meeting_id or existing.evidence_meeting_id
            existing.source_meeting_id = t.source_meeting_id or existing.source_meeting_id
            if t.confidence > existing.confidence:
                existing.confidence = t.confidence
            if t.blockers:
                existing.blockers = sorted(set(existing.blockers + t.blockers))
        else:
            if t.evidence and t.evidence not in (existing.evidence or ""):
                existing.evidence = _merge_transcript_description(existing.evidence, t.evidence)
            if t.blockers:
                existing.blockers = sorted(set(existing.blockers + t.blockers))
    return merged


def _normalize_assignee(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    s = re.sub(r"\s+", " ", str(name)).strip()
    # "Arjun S." -> "Arjun"
    parts = s.split(" ")
    if len(parts) >= 2 and len(parts[-1]) <= 2:
        return parts[0]
    return s


def _parse_due_date_iso(date_str: Optional[str]) -> Optional[datetime]:
    if not date_str:
        return None
    s = str(date_str).strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        # fallback date only
        try:
            return datetime.strptime(s, "%Y-%m-%d")
        except ValueError:
            return None


def _similarity(a: str, b: str) -> float:
    na = re.sub(r"\s+", " ", (a or "").strip().lower())
    nb = re.sub(r"\s+", " ", (b or "").strip().lower())
    if not na or not nb:
        return 0.0
    return SequenceMatcher(None, na, nb).ratio()


def _extract_json_list(raw: str) -> List[dict]:
    txt = (raw or "").strip()
    if txt.startswith("```"):
        lines = txt.split("\n")
        txt = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    data = json.loads(txt)
    if isinstance(data, dict) and "tasks" in data and isinstance(data["tasks"], list):
        return data["tasks"]
    if isinstance(data, list):
        return data
    return []


async def _project_member_users(db, project_id: str) -> List[dict]:
    """Users in project: [{\"id\", \"name\"}, ...]."""
    try:
        oid = ObjectId(project_id)
    except Exception:
        return []
    project = await db.projects.find_one({"_id": oid})
    if not project:
        return []
    out: List[dict] = []
    for uid in project.get("members") or []:
        try:
            u = await db.users.find_one({"_id": ObjectId(uid)})
        except Exception:
            u = None
        if u:
            name = (u.get("name") or "").strip()
            if name:
                out.append({"id": str(u["_id"]), "name": name})
    return out


def _resolve_assignee_user_id(assignee_display: str, members: List[dict]) -> Tuple[Optional[str], str]:
    """
    Match transcript assignee to a project member. Returns (user_id or None, display name to store).
    """
    ad = (assignee_display or "").strip()
    if not ad:
        return None, ""
    norm = _normalize_assignee(ad) or ad
    best_id: Optional[str] = None
    best_score = 0.0
    best_name = ad
    for m in members:
        mn = m["name"]
        s = _similarity(norm, mn)
        if norm.lower() in mn.lower() or mn.lower().split()[0] == norm.lower():
            s = max(s, 0.88)
        if s > best_score:
            best_score, best_id, best_name = s, m["id"], mn
    if best_score >= 0.72 and best_id:
        return best_id, best_name
    return None, ad


def _meeting_assignment_timestamp(m: dict) -> datetime:
    """When the meeting-assigned task was recorded: prefer end, then start, then now."""
    return m.get("ended_at") or m.get("started_at") or datetime.now(timezone.utc).replace(tzinfo=None)


def _get_groq_client() -> Groq:
    if not settings.GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not set")
    return Groq(api_key=settings.GROQ_API_KEY)


def _merge_transcript_description(old: Optional[str], new_ev: str) -> str:
    o = (old or "").strip()
    n = (new_ev or "").strip()
    if not n:
        return o
    if not o:
        return n
    if n in o:
        return o
    if o in n:
        return n
    return (o + "\n\n—\n" + n).strip()


def _strip_json_fences(txt: str) -> str:
    t = (txt or "").strip()
    if t.startswith("```"):
        lines = t.split("\n")
        t = "\n".join(lines[1:-1] if lines and lines[-1].strip() == "```" else lines[1:])
    return t.strip()


def _task_due_for_snapshot(due: Any) -> Optional[str]:
    if due is None:
        return None
    if isinstance(due, datetime):
        return due.date().isoformat()
    if isinstance(due, date):
        return due.isoformat()
    s = str(due).strip()
    return s[:10] if len(s) >= 10 and s[4] == "-" else (s or None)


def _board_snapshot_for_llm(tasks: List[dict]) -> List[dict]:
    out: List[dict] = []
    for t in tasks:
        out.append(
            {
                "task_id": str(t.get("_id", "")),
                "title": (t.get("title") or "").strip(),
                "assignee_name": (t.get("assignee_name") or "").strip(),
                "status": _normalize_status(t.get("status")),
                "due_date": _task_due_for_snapshot(t.get("due_date")),
            }
        )
    return out


def _parse_board_sync_response(raw: str) -> dict:
    txt = _strip_json_fences(raw or "")
    for candidate in (txt,):
        try:
            data = json.loads(candidate)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
    return {"task_updates": [], "informal_action_items": []}


def _groq_sync_board_with_latest_transcript(
    latest_transcript: str,
    reference_date: date,
    latest_meeting_id: str,
    board_snapshot: List[dict],
) -> dict:
    """
    Single Groq JSON call: full Kanban snapshot + latest meeting transcript → column updates + informal items.
    """
    payload = {
        "latest_meeting_id": latest_meeting_id,
        "reference_date": reference_date.isoformat(),
        "kanban_board": board_snapshot,
        "latest_meeting_transcript": latest_transcript,
    }
    sys_prompt = """You are updating a Kanban board from the LATEST meeting only.

Input JSON (in the user message) contains:
- kanban_board: every task already on the board (task_id, title, assignee_name, status, due_date).
- latest_meeting_transcript: transcript for the most recent meeting only.
- reference_date: calendar date of that meeting (for interpreting "today", "tomorrow", "this Friday" in due dates).

Output ONE JSON object only, no markdown:
{
  "task_updates": [
    {
      "task_id": "string (must match a task_id from kanban_board)",
      "new_status": "todo" | "in_progress" | "in_review" | "done" | "blockers",
      "due_date": "YYYY-MM-DD" | null,
      "blockers": ["string"],
      "transcript_evidence": "verbatim contiguous excerpt from latest_meeting_transcript only",
      "confidence": 0.0-1.0
    }
  ],
  "informal_action_items": ["string", ...]
}

Rules for task_updates:
- Only include a task if the latest meeting clearly discusses THAT task (same work as title/assignee) and justifies a change.
- Move to "done" only when the transcript clearly states completion (done, shipped, merged, finished, completed, etc.) for that work.
- Move to "in_progress" when someone states they are actively working on it.
- Move to "blockers" when blocked / stuck / waiting on external dependency is explicit.
- Move to "todo" when reset to not started or newly clarified as not done (rare).
- You may update due_date when a new deadline is agreed in the latest meeting (use reference_date for relative phrases).
- transcript_evidence MUST be copied verbatim from latest_meeting_transcript. If you cannot quote it, do not emit the update.
- Do not invent tasks; do not remove tasks. Omit tasks with no change.
- confidence reflects how explicit the transcript is.

Rules for informal_action_items:
- Ideas, suggestions, "we should", "maybe", unassigned asks, or requests with NO clear acceptance from the named person → list here as short strings.
- Do NOT duplicate work that is already covered by task_updates.

If nothing changes, return {"task_updates":[],"informal_action_items":[]}."""

    user_content = json.dumps(payload, ensure_ascii=False)
    provider = (settings.TASK_AUTOMATION_PROVIDER or "groq").strip().lower()
    if provider != "groq":
        logger.warning("Unsupported TASK_AUTOMATION_PROVIDER=%s, fallback to groq", provider)
    client = _get_groq_client()
    create_kwargs = dict(
        model=settings.TASK_AUTOMATION_MODEL,
        messages=[
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_content},
        ],
        temperature=0.1,
        max_tokens=8192,
        response_format={"type": "json_object"},
    )
    try:
        resp = client.chat.completions.create(**create_kwargs)
    except Exception as e:
        logger.warning("Board sync JSON mode failed (%s); retrying without response_format", e)
        create_kwargs.pop("response_format", None)
        resp = client.chat.completions.create(**create_kwargs)
    raw = resp.choices[0].message.content or "{}"
    return _parse_board_sync_response(raw)


def _extract_tasks_with_llm(
    chunk_text: str,
    meeting_catalog_text: str,
    latest_meeting_id: str,
    meeting_ref_dates: Dict[str, date],
    meeting_id_order: List[str],
    ordinal_by_meeting_id: Dict[str, int],
) -> List[ExtractedTask]:
    """
    Extraction over a chunk that may contain MULTIPLE meetings (cumulative project transcript).
    """
    catalog_dates = "\n".join(
        f"  - meeting_id={mid}: reference_date={meeting_ref_dates[mid].isoformat()} (use this date as 'today' for phrases like tomorrow/EOD in THAT meeting's section)"
        for mid in meeting_id_order
        if mid in meeting_ref_dates
    )
    schema_prompt = f"""You extract ONLY **confirmed Kanban tasks** from CUMULATIVE meeting transcripts (several meetings, oldest first).
A row belongs on the Kanban board only when there is **clear individual ownership AND commitment**.

Output ONE JSON object only: {{"tasks":[...]}}

Each task:
{{
  "title": string (concrete deliverable, not a job title or stack name),
  "assignee": string (one person's name as spoken — NEVER "Team", "we", "someone", or a role label),
  "confirmation_basis": "direct_assignment" | "request_and_acceptance",
  "status": "todo"|"in_progress"|"in_review"|"done"|"blockers",
  "due_date": "YYYY-MM-DD"|null,
  "blockers": string[],
  "transcript_evidence": string,
  "evidence_meeting_id": string,
  "confidence": number
}}

QUALIFIES as confirmed (include):
- **direct_assignment**: Someone is explicitly given ownership (e.g. "Amit will handle the backend", "I'll own the API", "Sarah's on the deck for Friday").
- **request_and_acceptance**: A direct request to a named person AND that same person clearly accepts in the same meeting (e.g. "Amit, can you take the designing?" → "Yes" / "Sure, I'll do it" / "On it"). transcript_evidence must cover BOTH parts or the clearest joint snippet.

DO NOT output (these are informal action items, not Kanban tasks):
- General discussion, ideas, "we should", "it would be nice", "maybe someone can" with no named assignee + commitment.
- A request to a person who does not accept or deflects.
- Assigning work to a role with no named person ("the backend team should…") unless a specific person is named and commits.
- Intros / icebreakers / "my role is X" with no task commitment.

Cross-meeting:
- **Latest meeting wins** when the same work is discussed again.
- If meeting 1 only had a vague idea but meeting 2 has a **named person committing**, output ONE merged task with evidence from the meeting where commitment became clear.

transcript_evidence: verbatim contiguous excerpt from the Transcript below (no paraphrase). Include enough to show ownership/commitment.

evidence_meeting_id: meeting_id= from the `=== Meeting ... meeting_id=... ===` header for the section containing transcript_evidence.

EXCLUDE: standalone intros; titles that are only role labels (e.g. "Backend development") with intro context.

Meeting catalog:
{meeting_catalog_text}

Per-meeting reference dates:
{catalog_dates}
Latest meeting_id: {latest_meeting_id}

due_date: use reference_date of evidence_meeting_id for "today", EOD, tomorrow, this Friday, etc.

confidence: how explicit the commitment is (0.0–1.0)."""
    provider = (settings.TASK_AUTOMATION_PROVIDER or "groq").strip().lower()
    if provider != "groq":
        logger.warning("Unsupported TASK_AUTOMATION_PROVIDER=%s, fallback to groq", provider)
    client = _get_groq_client()
    user_blob = (
        f"{meeting_catalog_text}\n\n"
        f"=== Full cumulative transcript (chunk) ===\n{chunk_text}"
    )
    create_kwargs = dict(
        model=settings.TASK_AUTOMATION_MODEL,
        messages=[
            {"role": "system", "content": schema_prompt},
            {"role": "user", "content": user_blob},
        ],
        temperature=0.1,
        max_tokens=8192,
        response_format={"type": "json_object"},
    )
    try:
        resp = client.chat.completions.create(**create_kwargs)
    except Exception as e:
        logger.warning("Task extract JSON mode unsupported or failed (%s); retrying without", e)
        create_kwargs.pop("response_format", None)
        resp = client.chat.completions.create(**create_kwargs)
    raw = resp.choices[0].message.content or '{"tasks":[]}'
    rows = _extract_json_list(raw)
    out: List[ExtractedTask] = []
    for r in rows:
        title  = str(r.get("title") or "").strip()
        if not title:
            continue
        assignee_raw = r.get("assignee")
        aname = ""
        if assignee_raw is not None and str(assignee_raw).strip():
            aname = _normalize_assignee(assignee_raw) or str(assignee_raw).strip()
        if not aname or _is_team_placeholder(aname):
            continue
        basis = str(r.get("confirmation_basis") or "").strip().lower()
        if basis not in ("direct_assignment", "request_and_acceptance"):
            continue
        conf_raw = r.get("confidence", 0.7)
        try:
            conf = max(0.0, min(1.0, float(conf_raw)))
        except (TypeError, ValueError):
            conf = 0.7
        rd = r.get("due_date")
        raw_due = str(rd).strip() if rd is not None and str(rd).strip() else None
        ev_raw = r.get("transcript_evidence")
        evidence = _validate_transcript_evidence(str(ev_raw or "").strip(), chunk_text)
        if not evidence:
            evidence = _fallback_transcript_snippet(chunk_text, aname, title)
        if not (evidence or "").strip():
            continue
        ev_mid = str(r.get("evidence_meeting_id") or r.get("meeting_id") or "").strip()
        if ev_mid not in meeting_ref_dates:
            ev_mid = _infer_evidence_meeting_id(evidence, chunk_text, meeting_id_order)
        ord_key = ordinal_by_meeting_id.get(ev_mid, ordinal_by_meeting_id.get(latest_meeting_id, 0))
        anchor = meeting_ref_dates.get(ev_mid, meeting_ref_dates[latest_meeting_id])
        local_ctx = f"{title}\n{evidence}\n{chunk_text}"
        due_iso = _resolve_task_due_date(raw_due, title, anchor, local_ctx)
        if _is_intro_or_role_noise(title, evidence):
            continue
        out.append(
            ExtractedTask(
                title=title,
                assignee=aname,
                status=_normalize_status(r.get("status")),
                due_date=due_iso,
                blockers=[str(x).strip() for x in (r.get("blockers") or []) if str(x).strip()],
                confidence=conf,
                source_meeting_id=ev_mid,
                evidence=evidence.strip(),
                evidence_meeting_id=ev_mid,
                meeting_ordinal=ord_key,
            )
        )
    return out


def _best_match(extracted: ExtractedTask, existing_tasks: List[dict]) -> Tuple[Optional[dict], float]:
    best, score = None, 0.0
    for t in existing_tasks:
        s = _similarity(extracted.title, t.get("title") or "")
        t_an = (t.get("assignee_name") or "").strip()
        ex_an = (extracted.assignee or "").strip()
        if ex_an and t_an:
            if _assignees_equivalent(extracted.assignee, t_an):
                s += 0.24
            elif _similarity(extracted.assignee, t_an) >= 0.72:
                s += 0.1
        if _is_team_placeholder(extracted.assignee) or _is_team_placeholder(t_an):
            if s >= 0.5:
                s += 0.22
        if s > score:
            score, best = s, t
    return best, score


def _extract_match_accepted(
    extracted: ExtractedTask, match: Optional[dict], score: float, threshold: float
) -> bool:
    if not match:
        return False
    if score >= threshold:
        return True
    if score >= 0.64 and _similarity(extracted.title, match.get("title") or "") >= 0.9:
        t_an = (match.get("assignee_name") or "").strip()
        if extracted.assignee and t_an and _assignees_equivalent(extracted.assignee, t_an):
            return True
    tit_sim = _similarity(extracted.title, match.get("title") or "")
    t_an = (match.get("assignee_name") or "").strip()
    if score >= 0.62 and tit_sim >= 0.86:
        if _is_team_placeholder(extracted.assignee) or _is_team_placeholder(t_an):
            return True
    return False


async def _write_run_log(project_id: str, meeting_id: str, payload: Dict[str, Any]) -> None:
    db = await get_database()
    await db.kanban_automation_runs.insert_one(
        {
            "project_id": project_id,
            "meeting_id": meeting_id,
            "payload": payload,
            "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
        }
    )


async def clean_orphaned_kanban_tasks(project_id: str) -> int:
    """
    Remove auto-generated tasks when no meeting that ever synced them still exists.
    Uses synced_from_meeting_ids (fallback: source_meeting_id).
    """
    db = await get_database()
    meetings = await db.meetings.find({"project_id": project_id}, {"_id": 1}).to_list(length=10000)
    valid_ids = {str(m["_id"]) for m in meetings}
    deleted = 0
    cursor = db.tasks.find({"project_id": project_id, "is_auto_generated": True})
    async for t in cursor:
        mids = t.get("synced_from_meeting_ids") or []
        if not mids:
            sm = t.get("source_meeting_id")
            mids = [sm] if sm else []
        if not any(mid in valid_ids for mid in mids if mid):
            await db.tasks.delete_one({"_id": t["_id"]})
            deleted += 1
    return deleted


async def rebuild_kanban_from_meeting_history(
    project_id: str,
    trigger_meeting_id: Optional[str] = None,
    fresh: bool = False,
) -> dict:
    """
    Rebuild auto Kanban tasks: (1) cumulative transcripts → confirmed-assignment extraction + dedupe;
    (2) full board snapshot + latest meeting transcript → Groq column updates; informal items logged only.
    """
    db = await get_database()
    meetings = await db.meetings.find({"project_id": project_id}).sort("started_at", 1).to_list(length=10000)
    if not meetings:
        wipe = await db.tasks.delete_many({"project_id": project_id, "is_auto_generated": True})
        return {"meetings": 0, "created": 0, "updated": 0, "review_required": 0, "deleted": wipe.deleted_count}

    if fresh:
        # Fresh extraction mode: ignore previous extraction state.
        # Remove all auto-generated tasks for this project before re-extracting.
        await db.tasks.delete_many({"project_id": project_id, "is_auto_generated": True})

    valid_meeting_ids = [str(m["_id"]) for m in meetings]
    latest_meeting_id = valid_meeting_ids[-1]
    meeting_by_id: Dict[str, dict] = {str(m["_id"]): m for m in meetings}
    meeting_ref_dates: Dict[str, date] = {}
    ordinal_by_meeting_id: Dict[str, int] = {}
    catalog_lines: List[str] = []
    bundle_sections: List[str] = []
    latest_meeting_cleaned = ""

    for i, m in enumerate(meetings):
        mid = str(m["_id"])
        ordinal_by_meeting_id[mid] = i
        mts = _meeting_assignment_timestamp(m)
        ref_d = mts.date() if isinstance(mts, datetime) else date.today()
        meeting_ref_dates[mid] = ref_d
        latest_flag = " LATEST" if mid == latest_meeting_id else ""
        catalog_lines.append(
            f"- meeting_id={mid} reference_date={ref_d.isoformat()} ordinal={i}{latest_flag}"
        )
        segs = await db.transcript_segments.find({"meeting_id": mid}).sort("timestamp", 1).to_list(length=10000)
        text = "\n".join([(s.get("text") or "").strip() for s in segs if (s.get("text") or "").strip()])
        cleaned = _clean_transcript(text)
        if not cleaned:
            continue
        if mid == latest_meeting_id:
            latest_meeting_cleaned = cleaned
        bundle_sections.append(
            f"=== Meeting meeting_id={mid} reference_date={ref_d.isoformat()} ordinal={i}{latest_flag} ===\n"
            f"{cleaned}"
        )

    meeting_catalog_text = "\n".join(catalog_lines)
    full_bundle = "\n\n".join(bundle_sections)

    created = 0
    updated = 0
    review_required = 0
    actions_taken: List[dict] = []
    existing: List[dict] = await db.tasks.find(
        {"project_id": project_id, "is_auto_generated": True}
    ).to_list(length=5000)
    existing = [dict(x) for x in existing]

    low_threshold = settings.TASK_AUTOMATION_LOW_CONFIDENCE_THRESHOLD
    match_threshold = settings.TASK_AUTOMATION_MATCH_THRESHOLD
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    members = await _project_member_users(db, project_id)

    extracted_agg: List[ExtractedTask] = []
    chunks: List[str] = []
    if full_bundle.strip():
        chunks = _chunk_text(full_bundle)
        for chunk in chunks:
            try:
                extracted_agg.extend(
                    _extract_tasks_with_llm(
                        chunk,
                        meeting_catalog_text,
                        latest_meeting_id,
                        meeting_ref_dates,
                        valid_meeting_ids,
                        ordinal_by_meeting_id,
                    )
                )
            except Exception as e:
                logger.exception(
                    "Task extraction failed project_id=%s cumulative chunk (len=%s): %s",
                    project_id,
                    len(chunk),
                    e,
                )

    extracted = _dedup_extracted_global(extracted_agg)
    extracted = [t for t in extracted if (t.assignee or "").strip()]

    for item in extracted:
        ev_mid = (item.evidence_meeting_id or item.source_meeting_id or latest_meeting_id).strip()
        if ev_mid not in meeting_by_id:
            ev_mid = latest_meeting_id
        row_meeting = meeting_by_id[ev_mid]
        meeting_ts = _meeting_assignment_timestamp(row_meeting)
        sync_ids = {latest_meeting_id, ev_mid, (trigger_meeting_id or "").strip()}
        sync_ids.discard("")

        if item.confidence < low_threshold:
            review_required += 1
            await db.kanban_task_review_queue.insert_one(
                {
                    "project_id": project_id,
                    "meeting_id": latest_meeting_id,
                    "candidate": item.__dict__,
                    "reason": "low_confidence",
                    "created_at": now,
                }
            )
            actions_taken.append({"task": item.title, "action": "queued_for_review"})
            continue

        match, score = _best_match(item, existing)
        due_dt = _parse_due_date_iso(item.due_date)
        assignee_id, assignee_display = _resolve_assignee_user_id(item.assignee or "", members)
        display_assignee_name = assignee_display or (item.assignee or "")

        if _extract_match_accepted(item, match, score, match_threshold):
            updates: Dict[str, Any] = {}
            if _normalize_status(match.get("status")) != item.status:
                updates["status"] = item.status
            aid_changed = assignee_id != match.get("assignee_id")
            an_changed = (display_assignee_name or "").strip() != (match.get("assignee_name") or "").strip()
            if aid_changed or an_changed:
                updates["assignee_id"] = assignee_id
                updates["assignee_name"] = display_assignee_name
                updates["assigned_at"] = meeting_ts
            if (match.get("due_date") or None) != due_dt:
                updates["due_date"] = due_dt
            if item.evidence:
                new_desc = _merge_transcript_description(match.get("description"), item.evidence)
                if new_desc != (match.get("description") or "").strip():
                    updates["description"] = new_desc
            had_field_changes = bool(updates)
            set_doc = {**updates, "updated_at": now}
            add_each = [x for x in sync_ids if x]
            await db.tasks.update_one(
                {"_id": match["_id"]},
                {"$set": set_doc, "$addToSet": {"synced_from_meeting_ids": {"$each": add_each}}},
            )
            match.update(set_doc)
            sfm = set(match.get("synced_from_meeting_ids") or [])
            sfm.update(add_each)
            match["synced_from_meeting_ids"] = list(sfm)
            if had_field_changes:
                updated += 1
            actions_taken.append({"task": item.title, "action": "updated", "score": score})
            if item.blockers:
                await db.kanban_task_activity.insert_one(
                    {
                        "task_id": str(match["_id"]),
                        "project_id": project_id,
                        "meeting_id": latest_meeting_id,
                        "type": "blocker_comment",
                        "text": "; ".join(item.blockers),
                        "created_at": now,
                    }
                )
            continue

        src_mid = (item.source_meeting_id or ev_mid or latest_meeting_id).strip()
        if src_mid not in meeting_by_id:
            src_mid = latest_meeting_id
        new_doc = {
            "project_id": project_id,
            "title": item.title,
            "description": (item.evidence or "").strip() or None,
            "status": item.status if item.status in KANBAN_STATUSES else "todo",
            "priority": "medium",
            "assignee_id": assignee_id,
            "assignee_name": display_assignee_name,
            "assigned_at": meeting_ts,
            "due_date": due_dt,
            "subtasks": None,
            "source_meeting_id": src_mid,
            "synced_from_meeting_ids": sorted(sync_ids),
            "is_auto_generated": True,
            "created_at": now,
            "updated_at": now,
        }
        ins = await db.tasks.insert_one(new_doc)
        created += 1
        existing.append({**new_doc, "_id": ins.inserted_id})
        actions_taken.append({"task": item.title, "action": "created"})
        if item.blockers:
            await db.kanban_task_activity.insert_one(
                {
                    "task_id": str(ins.inserted_id),
                    "project_id": project_id,
                    "meeting_id": latest_meeting_id,
                    "type": "blocker_comment",
                    "text": "; ".join(item.blockers),
                    "created_at": now,
                }
            )

    board_sync_result: dict = {"task_updates": [], "informal_action_items": []}
    if (latest_meeting_cleaned or "").strip():
        board_rows = await db.tasks.find(
            {"project_id": project_id, "is_auto_generated": True}
        ).to_list(length=5000)
        board_rows = [dict(x) for x in board_rows]
        snap = _board_snapshot_for_llm(board_rows)
        lt_send = latest_meeting_cleaned
        if len(lt_send) > 120_000:
            lt_send = lt_send[:120_000]
        try:
            board_sync_result = _groq_sync_board_with_latest_transcript(
                lt_send,
                meeting_ref_dates[latest_meeting_id],
                latest_meeting_id,
                snap,
            )
        except Exception as e:
            logger.exception("Board sync Groq failed project_id=%s: %s", project_id, e)

        add_mids = [latest_meeting_id, (trigger_meeting_id or "").strip()]
        add_mids = [x for x in add_mids if x]
        evidence_source = latest_meeting_cleaned

        for u in board_sync_result.get("task_updates") or []:
            tid = str(u.get("task_id") or "").strip()
            if not tid:
                continue
            try:
                oid = ObjectId(tid)
            except Exception:
                continue
            ev = str(u.get("transcript_evidence") or "").strip()
            if not _validate_transcript_evidence(ev, evidence_source):
                continue
            try:
                conf_u = float(u.get("confidence") if u.get("confidence") is not None else 0.65)
            except (TypeError, ValueError):
                conf_u = 0.65
            if conf_u < low_threshold:
                continue
            doc = await db.tasks.find_one(
                {"_id": oid, "project_id": project_id, "is_auto_generated": True}
            )
            if not doc:
                continue

            new_st = _normalize_status(u.get("new_status"))
            updates2: Dict[str, Any] = {}
            if _normalize_status(doc.get("status")) != new_st:
                updates2["status"] = new_st

            raw_du = u.get("due_date")
            if raw_du is not None and str(raw_du).strip() and str(raw_du).strip().lower() not in (
                "null",
                "none",
            ):
                new_dt = _parse_due_date_iso(str(raw_du).strip())
                if new_dt:
                    old_d = doc.get("due_date")
                    old_key = _task_due_for_snapshot(old_d)
                    new_key = new_dt.date().isoformat()
                    if old_key != new_key:
                        updates2["due_date"] = new_dt

            if ev:
                merged = _merge_transcript_description(doc.get("description"), ev)
                if merged != (doc.get("description") or "").strip():
                    updates2["description"] = merged

            bl_raw = u.get("blockers")
            blocker_text = ""
            if isinstance(bl_raw, list):
                blocker_text = "; ".join(str(x).strip() for x in bl_raw if str(x).strip())

            if not updates2 and not blocker_text:
                continue

            had_field_updates = bool(updates2)
            set_doc2 = {**updates2, "updated_at": now}
            await db.tasks.update_one(
                {"_id": oid},
                {"$set": set_doc2, "$addToSet": {"synced_from_meeting_ids": {"$each": add_mids}}},
            )
            if had_field_updates:
                updated += 1
            actions_taken.append(
                {
                    "task_id": tid,
                    "action": "latest_meeting_board_sync",
                    "fields": list(updates2.keys()),
                }
            )
            if blocker_text:
                await db.kanban_task_activity.insert_one(
                    {
                        "task_id": tid,
                        "project_id": project_id,
                        "meeting_id": latest_meeting_id,
                        "type": "blocker_comment",
                        "text": blocker_text,
                        "created_at": now,
                    }
                )

    await _write_run_log(
        project_id,
        latest_meeting_id,
        {
            "trigger_meeting_id": trigger_meeting_id,
            "cumulative_bundle_chars": len(full_bundle),
            "chunks": len(chunks),
            "extracted_count": len(extracted),
            "actions": actions_taken,
            "board_sync_informal_action_items": board_sync_result.get("informal_action_items") or [],
            "board_sync_task_updates_returned": len(board_sync_result.get("task_updates") or []),
        },
    )

    deleted = await clean_orphaned_kanban_tasks(project_id)
    return {
        "meetings": len(meetings),
        "created": created,
        "updated": updated,
        "review_required": review_required,
        "deleted": deleted,
        "valid_meeting_ids": valid_meeting_ids,
    }
