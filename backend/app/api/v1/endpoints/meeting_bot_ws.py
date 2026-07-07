"""
WebSocket: /ws/audio/{meeting_id} accepts PCM from bot; process_audio → STT → broadcast.
/ws/meeting/{meeting_id}/live: frontend subscribes for transcript updates.
"""
import asyncio
import logging
from typing import Dict, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

from app.stt.stt_pipeline import STTPipeline

router = APIRouter()


async def _safe_stt_tick(meeting_id: str, pipeline: "STTPipeline") -> None:
    try:
        await pipeline.process_buffer()
    except Exception:
        logger.exception("STT process_buffer failed meeting_id=%s", meeting_id)


class WebSocketManager:
    """Per-meeting AudioProcessor, STTPipeline; broadcast transcript to frontend subscribers."""

    def __init__(self):
        self._pipelines: Dict[str, STTPipeline] = {}
        self._subscribers: Dict[str, Set[WebSocket]] = {}

    def ensure_pipeline(self, meeting_id: str) -> None:
        if meeting_id in self._pipelines:
            return
        logger.info("Audio pipeline created for meeting %s", meeting_id)
        async def push(mid: str, text: str):
            await self.broadcast_transcript(mid, text)
        self._pipelines[meeting_id] = STTPipeline(
            meeting_id,
            push_callback=push,
        )

    async def process_audio(self, meeting_id: str, data: bytes) -> None:
        """Process PCM from bot: processor → pipeline buffer → maybe transcribe and broadcast."""
        self.ensure_pipeline(meeting_id)
        pipeline = self._pipelines[meeting_id]
        if not data:
            return
        # Feed raw PCM directly into STT buffer. This avoids hard-dependence on
        # upstream frame gating and keeps transcription alive even when VAD tuning changes.
        pipeline.process_audio(data)
        asyncio.create_task(_safe_stt_tick(meeting_id, pipeline))

    def subscribe(self, meeting_id: str, ws: WebSocket) -> None:
        if meeting_id not in self._subscribers:
            self._subscribers[meeting_id] = set()
        self._subscribers[meeting_id].add(ws)

    def unsubscribe(self, meeting_id: str, ws: WebSocket) -> None:
        if meeting_id in self._subscribers:
            self._subscribers[meeting_id].discard(ws)

    async def broadcast_transcript(self, meeting_id: str, text: str) -> None:
        dead = set()
        for ws in self._subscribers.get(meeting_id) or set():
            try:
                await ws.send_json({"type": "transcript", "text": text})
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.unsubscribe(meeting_id, ws)

    def remove_meeting(self, meeting_id: str) -> None:
        self._pipelines.pop(meeting_id, None)
        self._subscribers.pop(meeting_id, None)


ws_manager = WebSocketManager()


@router.websocket("/audio/{meeting_id}")
async def websocket_audio(websocket: WebSocket, meeting_id: str):
    """Bot sends raw PCM here. We process and STT; transcript is broadcast to /ws/meeting/{id}/live."""
    await websocket.accept()
    logger.info("Bot audio WebSocket connected for meeting_id=%s", meeting_id)
    rx_count = 0
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            data = message.get("bytes")
            if not data:
                continue
            rx_count += 1
            if rx_count == 1 or rx_count % 500 == 0:
                logger.info(
                    "Audio RX meeting_id=%s chunks=%d last_bytes=%d",
                    meeting_id,
                    rx_count,
                    len(data),
                )
            await ws_manager.process_audio(meeting_id, data)
    except WebSocketDisconnect:
        logger.debug("Bot audio WebSocket disconnected for meeting_id=%s", meeting_id)
    except Exception as e:
        logger.exception("Bot audio WebSocket error for meeting_id=%s: %s", meeting_id, e)


@router.websocket("/meeting/{meeting_id}/live")
async def websocket_meeting_live(websocket: WebSocket, meeting_id: str):
    """Frontend connects here to receive live transcript messages."""
    await websocket.accept()
    ws_manager.subscribe(meeting_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.unsubscribe(meeting_id, websocket)
