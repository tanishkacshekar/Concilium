"""Post-meeting orchestration: intelligence + deterministic Kanban rebuild."""
from __future__ import annotations

import logging
from typing import Optional

from app.services.meeting_intelligence import analyze_meeting_transcript
from app.services.kanban_agentic_automation import rebuild_kanban_from_meeting_history

logger = logging.getLogger(__name__)


async def run_meeting_intelligence(
    meeting_id: str,
    language: str = "en",
    project_id: Optional[str] = None,
    sync_kanban: bool = True,
) -> None:
    await analyze_meeting_transcript(meeting_id, language=language)
    if sync_kanban and project_id:
        try:
            await rebuild_kanban_from_meeting_history(project_id, trigger_meeting_id=meeting_id)
        except Exception:
            logger.exception("rebuild_kanban_from_meeting_history failed project_id=%s", project_id)
