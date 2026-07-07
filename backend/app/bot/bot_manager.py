"""
Start/stop bot per meeting; run audio stream and participant monitoring.
"""
import asyncio
import logging
from typing import Dict, Optional

from app.core.config import settings
from app.bot.jitsi_meet_bot import JitsiMeetBot
from app.attendance import AttendanceTracker
from app.api.v1.endpoints.meeting_bot_ws import ws_manager

logger = logging.getLogger(__name__)

_bots: Dict[str, JitsiMeetBot] = {}
_tasks: Dict[str, asyncio.Task] = {}
_trackers: Dict[str, AttendanceTracker] = {}
_lock = asyncio.Lock()


async def _safe_audio_stream(meeting_id: str, bot: JitsiMeetBot, callback_url: str) -> None:
    """Run bot.start_audio_stream; reconnect on disconnect."""
    try:
        await bot.start_audio_stream(callback_url)
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.exception("Audio stream failed for meeting_id=%s (callback_url=%s): %s", meeting_id, callback_url, e)


async def _monitor_participants(meeting_id: str, bot: JitsiMeetBot, interval: float = 10.0) -> None:
    """Periodically sync participant list to attendance (join/leave)."""
    seen = set()
    while meeting_id in _bots and _bots[meeting_id] is bot:
        try:
            participants = bot.get_participants()
            tracker = _trackers.get(meeting_id)
            if tracker:
                for pid, name in participants:
                    key = (pid, name)
                    if key not in seen:
                        seen.add(key)
                        await tracker.record_join(pid, name, None)
            participants_set = set((p[0], p[1]) for p in participants)
            for key in list(seen):
                if key not in participants_set:
                    seen.discard(key)
                    if tracker:
                        await tracker.record_leave(key[0])
        except Exception:
            pass
        await asyncio.sleep(interval)


class BotManager:
    """Start/stop meeting bot; audio stream and attendance."""

    async def start_bot(self, meeting_id: str, meeting_url: str) -> None:
        async with _lock:
            if meeting_id in _bots:
                return
            backend_url = settings.BACKEND_URL or f"http://localhost:{settings.PORT}"
            ws_url = backend_url.replace("http://", "ws://").replace("https://", "wss://").rstrip("/")
            callback_url = ws_url + "/api/v1/ws/audio/" + meeting_id
            bot = JitsiMeetBot(meeting_id)
            _bots[meeting_id] = bot
            tracker = AttendanceTracker(meeting_id)
            _trackers[meeting_id] = tracker
            await tracker.record_join("bot", "Meeting Assistant", "bot")
        await bot.join_meeting(meeting_url)
        ws_manager.ensure_pipeline(meeting_id)
        t = asyncio.create_task(_safe_audio_stream(meeting_id, bot, callback_url))
        _tasks[meeting_id] = t
        asyncio.create_task(_monitor_participants(meeting_id, bot))

    async def stop_bot(self, meeting_id: str) -> None:
        async with _lock:
            bot = _bots.pop(meeting_id, None)
            tracker = _trackers.pop(meeting_id, None)
            task = _tasks.pop(meeting_id, None)
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        if tracker:
            await tracker.record_leave("bot")
        if bot:
            await bot.leave_meeting()


bot_manager = BotManager()
