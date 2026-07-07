"""
Groq Whisper for uploaded files; LLM analysis reuses meeting_intelligence.summarize_and_extract (single call).
"""
from typing import Tuple

from app.core.config import settings
from app.services.meeting_intelligence import get_groq_client, summarize_and_extract


def transcribe_audio(file_content: bytes, filename: str) -> str:
    """Transcribe audio/video using Groq Whisper. Returns full text."""
    client = get_groq_client()
    ext = (filename or "").split(".")[-1].lower() if "." in (filename or "") else "mp3"
    if ext not in ("flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "wav", "webm"):
        ext = "mp3"
    name = f"audio.{ext}"
    hints = str(getattr(settings, "STT_CONTEXT_HINTS", "") or "").strip()
    prompt = None
    if hints:
        prompt = (
            "Transcribe this meeting very accurately. "
            "Preserve technical terms and names exactly when possible. "
            f"Important terms and names: {hints}"
        )

    model_name = "whisper-large-v3" if bool(getattr(settings, "STT_ACCURACY_MODE", True)) else "whisper-large-v3-turbo"
    transcription = client.audio.transcriptions.create(
        file=(name, file_content),
        model=model_name,
        response_format="text",
        language="en",
        temperature=0.0,
        prompt=prompt,
    )
    if hasattr(transcription, "text"):
        return transcription.text
    return str(transcription)


def transcribe_and_analyze(file_content: bytes, filename: str) -> Tuple[str, dict, list]:
    """Whisper once, then one LLM pass for summary + action items."""
    transcription = transcribe_audio(file_content, filename)
    if not transcription or not transcription.strip():
        transcription = "(No speech detected in the recording.)"
    summary_dict, action_items = summarize_and_extract(transcription)
    return transcription, summary_dict, action_items
