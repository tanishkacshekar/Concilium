"""
Abstract base for meeting bots: join, stream audio to backend WebSocket, leave.
"""
from abc import ABC, abstractmethod
from typing import List, Optional, Tuple


class BaseBot(ABC):
    """Subclass to implement platform-specific join and optional participant list."""

    @abstractmethod
    async def join_meeting(self, meeting_url: str) -> bool:
        """Open meeting (e.g. in browser), optionally inject join/leave JS. Return True on success."""
        pass

    @abstractmethod
    async def start_audio_stream(self, callback_url: str) -> None:
        """Connect to callback_url (ws://.../ws/audio/{meeting_id}), send PCM chunks in a loop."""
        pass

    @abstractmethod
    async def leave_meeting(self) -> None:
        """Leave the meeting and cleanup."""
        pass

    def get_participants(self) -> List[Tuple[str, str]]:
        """Optional: return list of (participant_id, display_name) for attendance sync. Default empty."""
        return []
