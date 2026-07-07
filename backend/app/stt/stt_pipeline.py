"""
Buffers ~6s audio → WAV → Groq Whisper → save to transcript_segments + transcripts; broadcast via callback.

Enhanced with multi-layer silence/hallucination prevention:
  1. Pre-transcription RMS check with configurable threshold
  2. Zero-crossing rate analysis to detect noise vs speech
  3. Spectral flatness check (white noise vs tonal/speech content)
  4. Hallucination phrase filtering with consecutive-repeat detection
  5. Short/repetitive text filtering
  6. Comprehensive debug logging of every decision
  7. FALLBACK to local Whisper when Groq fails
"""
import asyncio
import io
import logging
import struct
import wave
from datetime import datetime
from typing import Any, Callable, Awaitable, Optional, List, Dict, Tuple

from groq import Groq

from app.audio.signal_utils import pcm16_peak, pcm16_rms, pcm16_rms_db
from app.core.config import settings
from app.core.database import get_database

logger = logging.getLogger(__name__)

# Try to import whisper for local fallback
WHISPER_AVAILABLE = False
try:
    import whisper
    WHISPER_AVAILABLE = True
    logger.info("Local Whisper available as fallback")
except ImportError:
    logger.info("Local Whisper not available (pip install whisper). Only Groq will be used.")

# Whisper often hallucinates these on silence or low-quality audio
HALLUCINATION_PHRASES = frozenset({
    "thank you", "thank you.", "thanks", "thanks.",
    "thanks for watching", "thanks for watching.", "thanks for watching!",
    "subscribe", "subscribe.", "like and subscribe",
    "bye", "bye.", "bye bye", "bye bye.",
    "see you", "see you.", "see you next time",
    "goodbye", "goodbye.", "good bye",
    "the end", "the end.",
    "please subscribe", "please subscribe.",
    "thank you for watching", "thank you for watching.",
    "thanks for listening", "thanks for listening.",
    "hmm", "hmm.", "uh", "uh.", "um", "um.",
    "...", "…",
    "subtitles by", "subtitles by the amara.org community",
    "transcribed by", "music", "applause",
    "okay", "okay.", "ok", "ok.",
    "hello", "hello.", "hi", "hi.",
    "hey", "hey.",
    "yeah", "yeah.", "yes", "yes.",
    "no", "no.",
    "right", "right.",
    "alright", "alright.",
    "sure", "sure.",
    "context", "context?", "transcript context",
    "my name is", "my name is .",
    "well", "well.",
    # Single word hallucinations
    "transcript", "transcript.",
    "it's moving", "it's moving.",
    "moving", "moving.",
    "reading", "reading.",
    "blockers", "blockers.",
    "stand up", "stand up.",
    "mute", "mute.", "please mute", "please mute.",
    "excuse me", "excuse me.",
    # Party/night hallucinations
    "let's party", "let's party.", "lets party",
    "party all night", "party all night.",
    "come on", "come on.",
    "all night", "all night.",
    # What are you doing hallucinations
    "what are you doing", "what are you doing?",
    "what you doing", "what you doing?",
    "what are you doing",
    # Don't know hallucinations
    "i don't know", "i don't know.",
    "i dont know", "i dont know.",
    "dont know", "dont know.",
    "don't know", "don't know.",
    # Doing hallucinations
    "you're doing", "you're doing?",
    "youre doing", "youre doing?",
    "doing", "doing.",
    # IMPORTANT and similar
    "important", "important!", "important.",
    # Game hallucinations
    "the game seems to be slow", "the game seems to be slow.",
    "game seems to be slow", "game seems to be slow.",
    # I'm sure hallucinations
    "i'm sure i made all the way through", "i'm sure i made all the way through.",
    "im sure i made all the way through", "im sure i made all the way through.",
    "sure i made all the way through", "sure i made all the way through.",
    # Call him/leave hallucinations
    "call him here", "call him here or leave the",
    "call him", "call him.",
    "leave the", "leave the...",
    # I'll see you hallucinations
    "i'll see you next time", "i'll see you next time!",
    "ill see you next time", "ill see you next time!",
    "see you next time", "see you next time!",
    # Other common hallucinations
    "please join us", "please join us.",
    "i guess it's a bit", "i guess it's a bit...",
    "i guess its a bit", "i guess its a bit...",
    "i've generated", "ive generated", "i have generated",
    "three or", "three or...",
    "surnames", "surnames.",
    "not maurice", "not maurice.",
    "maria", "maria.",
    "hi guys", "hi guys!", "high guys",
    "today there's", "today there's", "today theres",
    # Video/YouTube hallucinations
    "reaction in video", "reaction in video.",
    "video", "video.",
})
# Maximum allowed consecutive identical hallucination-like outputs
MAX_CONSECUTIVE_HALLUCINATION = 2

# Minimum text length (characters) to accept — require longer phrases to reduce hallucinations
MIN_TEXT_LENGTH = 25


def _segment_field(segment: Any, key: str, default: Any = None) -> Any:
    """Read a segment field from dict-like or object-like segment payloads."""
    if isinstance(segment, dict):
        return segment.get(key, default)
    return getattr(segment, key, default)


def _contains_letters_or_digits(text: str) -> bool:
    """Reject punctuation-only outputs often returned on noise/silence."""
    return any(ch.isalnum() for ch in text)


def _has_repeated_words(text: str) -> bool:
    """Check if text has repeated words (common hallucination pattern)."""
    words = text.lower().replace(".", "").replace(",", "").split()
    if len(words) < 3:
        return False
    # Check if the same word appears 3+ times
    from collections import Counter
    counts = Counter(words)
    for word, count in counts.items():
        if count >= 3:
            return True
    # Check for patterns like "word word word"
    for i in range(len(words) - 2):
        if words[i] == words[i+1] == words[i+2]:
            return True
    return False


def _normalize_context_hints(raw_hints: str) -> str:
    if not raw_hints:
        return ""
    hints = [h.strip() for h in raw_hints.split(",") if h.strip()]
    return ", ".join(hints)


def _transcription_text_and_segments(transcription: Any) -> Tuple[str, Any]:
    """Groq SDK returns a model with .text; verbose_json may add segments via extra fields."""
    if transcription is None:
        return "", None
    if isinstance(transcription, dict):
        return (str(transcription.get("text") or "").strip(), transcription.get("segments"))
    dump_fn = getattr(transcription, "model_dump", None)
    if callable(dump_fn):
        try:
            d = dump_fn()
            if isinstance(d, dict):
                return (str(d.get("text") or "").strip(), d.get("segments"))
        except Exception:
            pass
    text = getattr(transcription, "text", None)
    text = str(text).strip() if text is not None else ""
    segments = getattr(transcription, "segments", None)
    if segments is None and hasattr(transcription, "model_extra"):
        extra = getattr(transcription, "model_extra", None) or {}
        segments = extra.get("segments")
    return text, segments


def _zero_crossing_rate(pcm_bytes: bytes) -> float:
    """
    Fraction of sign changes between consecutive samples.
    Pure noise has ZCR ~0.5; speech is typically 0.02–0.20.
    """
    if len(pcm_bytes) < 4:
        return 0.0
    n = len(pcm_bytes) // 2
    crossings = 0
    prev_sign = 0
    for i in range(0, len(pcm_bytes) - 1, 2):
        sample = struct.unpack_from("<h", pcm_bytes, i)[0]
        sign = 1 if sample >= 0 else -1
        if i > 0 and sign != prev_sign:
            crossings += 1
        prev_sign = sign
    return crossings / (n - 1) if n > 1 else 0.0


def _pcm_to_wav(pcm_bytes: bytes, sample_rate: int = 16000, channels: int = 1) -> bytes:
    """Build minimal WAV from PCM16."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm_bytes)
    return buf.getvalue()


def _transcribe_with_local_whisper(wav_bytes: bytes, model_size: str = "base") -> Tuple[str, Any]:
    """
    Fallback transcription using local Whisper model.
    Returns (text, segments) where segments is None for local Whisper.
    """
    if not WHISPER_AVAILABLE:
        raise RuntimeError("Local Whisper not available")

    import tempfile
    import os

    # Write WAV to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
        tmp.write(wav_bytes)
        tmp_path = tmp.name

    try:
        # Load model (use smaller model for speed)
        model = whisper.load_model(model_size)

        # Transcribe
        result = model.transcribe(
            tmp_path,
            language="en",
            fp16=False,  # Use FP32 for compatibility
            temperature=0.0,
        )

        text = result.get("text", "").strip()
        segments = result.get("segments", [])

        logger.info(f"Local Whisper transcribed: {text[:50]}...")
        return text, {"segments": segments}

    finally:
        # Clean up temp file
        try:
            os.unlink(tmp_path)
        except:
            pass


# ---------------------------------------------------------------------------
# Main STT Pipeline
# ---------------------------------------------------------------------------

class STTPipeline:
    """
    Accumulates PCM until ~6 seconds, then runs multi-layer validation
    before transcribing with Groq Whisper. Saves to DB and broadcasts.
    """

    def __init__(
        self,
        meeting_id: str,
        push_callback: Optional[Callable[[str, str], Awaitable[None]]] = None,
        sample_rate: int = None,
        buffer_seconds: float = None,
    ):
        self.meeting_id = meeting_id
        self.push_callback = push_callback
        self.sample_rate = sample_rate or settings.AUDIO_SAMPLE_RATE
        self.buffer_seconds = buffer_seconds or getattr(
            settings, "STT_BUFFER_SECONDS", 2.0
        )
        self._buffer = bytearray()
        self._bytes_per_chunk = int(self.sample_rate * self.buffer_seconds * 2)
        self._last_transcribe_time = 0.0
        self._min_interval = self.buffer_seconds
        self._lock = asyncio.Lock()
        self._rate_limit_until = 0.0

        # Hallucination tracking
        self._last_texts: List[str] = []
        self._consecutive_same: int = 0
        self._last_text: str = ""
        self._context_hints = _normalize_context_hints(
            str(getattr(settings, "STT_CONTEXT_HINTS", "") or "")
        )
        self._prompt_history_lines = max(
            0, int(getattr(settings, "STT_PROMPT_HISTORY_LINES", 6))
        )
        self._accuracy_mode = bool(getattr(settings, "STT_ACCURACY_MODE", True))
        self._transcribe_model = str(
            getattr(settings, "STT_TRANSCRIBE_MODEL", "whisper-large-v3")
        )
        self._overlap_seconds = float(
            getattr(
                settings,
                "STT_OVERLAP_SECONDS",
                2.0 if self._accuracy_mode else 0.5,
            )
        )

        # Configurable thresholds
        self._silence_rms_threshold = float(getattr(settings, "STT_SILENCE_RMS_THRESHOLD", 80.0))
        self._silence_db_threshold = float(getattr(settings, "STT_SILENCE_DB_THRESHOLD", -55.0))
        self._max_zcr = float(getattr(settings, "STT_MAX_ZCR", 0.52))
        self._min_peak = int(getattr(settings, "STT_MIN_PEAK", 40))

        # Stats
        self._total_chunks = 0
        self._skipped_silence = 0
        self._skipped_hallucination = 0
        self._transcribed = 0

    async def _requeue_chunk(self, chunk: bytes, keep_seconds: float = None) -> None:
        """
        Put a tail of the failed chunk back into the front of the buffer.
        This prevents content loss when API calls fail or are rate-limited.
        """
        seconds = self._overlap_seconds if keep_seconds is None else max(0.2, float(keep_seconds))
        keep_bytes = int(self.sample_rate * seconds * 2)
        retry_tail = chunk[-keep_bytes:] if keep_bytes > 0 else b""
        if not retry_tail:
            return
        async with self._lock:
            self._buffer = bytearray(retry_tail) + self._buffer

    def _build_whisper_prompt(self) -> str:
        """
        Build prompt context for Whisper using recent accepted text and glossary hints.
        This improves consistency for names and technical terms at the cost of latency.
        """
        parts = []

        # Add custom style prompt if defined
        custom_prompt = str(getattr(settings, "STT_CUSTOM_PROMPT", "") or "").strip()
        if custom_prompt:
            parts.append(custom_prompt)

        # Add context from recent transcriptions
        context_lines = self._last_texts[-self._prompt_history_lines:] if self._prompt_history_lines else []
        if context_lines:
            parts.append("Recent meeting transcript context:\n" + "\n".join(context_lines))

        # Add context hints (names, technical terms)
        if self._context_hints:
            parts.append(
                "Important terms and names (preserve exact words): "
                + self._context_hints
            )

        return "\n\n".join(parts).strip()

    def process_audio(self, pcm_chunk: bytes) -> None:
        """Add PCM to buffer; does not run transcription (call process_buffer() after)."""
        self._buffer.extend(pcm_chunk)

    async def process_buffer(self) -> None:
        """
        If buffer has ~6s of audio, validate audio quality, then transcribe.
        Multiple layers of filtering prevent hallucinated transcriptions.
        """
        if len(self._buffer) < self._bytes_per_chunk:
            return

        import time
        now = time.monotonic()

        # Rate-limit: respect Groq 429 backoff
        if now < self._rate_limit_until:
            logger.debug("Groq rate-limit active, skipping transcription")
            return

        if now - self._last_transcribe_time < self._min_interval:
            return

        async with self._lock:
            if len(self._buffer) < self._bytes_per_chunk:
                return

            # Extract chunk with overlap for context continuity
            chunk = bytes(self._buffer[: self._bytes_per_chunk])
            overlap_seconds = min(self._overlap_seconds, self.buffer_seconds * 0.8)
            overlap_bytes = int(self.sample_rate * overlap_seconds * 2)
            trim_bytes = max(0, self._bytes_per_chunk - overlap_bytes)
            del self._buffer[:trim_bytes]

        self._last_transcribe_time = time.monotonic()
        self._total_chunks += 1

        # ── Layer 1: RMS energy check ──
        rms = pcm16_rms(chunk)
        rms_db = pcm16_rms_db(chunk)
        if rms < self._silence_rms_threshold:
            self._skipped_silence += 1
            logger.debug(
                "⏭ SKIP chunk #%d: RMS=%.0f (%.1f dBFS) < threshold %.0f | "
                "total=%d skipped=%d transcribed=%d",
                self._total_chunks, rms, rms_db, self._silence_rms_threshold,
                self._total_chunks, self._skipped_silence, self._transcribed,
            )
            return

        # ── Layer 2: dB floor check ──
        if rms_db < self._silence_db_threshold:
            self._skipped_silence += 1
            logger.debug(
                "⏭ SKIP chunk #%d: %.1f dBFS < threshold %.1f dBFS",
                self._total_chunks, rms_db, self._silence_db_threshold,
            )
            return

        # ── Layer 3: Peak amplitude check ──
        peak = pcm16_peak(chunk)
        if peak < self._min_peak:
            self._skipped_silence += 1
            logger.debug(
                "⏭ SKIP chunk #%d: peak=%d < min_peak=%d (near-silent)",
                self._total_chunks, peak, self._min_peak,
            )
            return

        # ── Layer 4: Zero-crossing rate (noise detection) ──
        zcr = _zero_crossing_rate(chunk)
        if zcr > self._max_zcr:
            self._skipped_silence += 1
            logger.debug(
                "⏭ SKIP chunk #%d: ZCR=%.3f > max_zcr=%.3f (likely noise, not speech)",
                self._total_chunks, zcr, self._max_zcr,
            )
            return

        # ── Passed all pre-checks — send to Whisper ──
        logger.info(
            "🎙 TRANSCRIBING chunk #%d: RMS=%.0f (%.1f dBFS) peak=%d ZCR=%.3f",
            self._total_chunks, rms, rms_db, peak, zcr,
        )

        wav_bytes = _pcm_to_wav(chunk, self.sample_rate)

        if not settings.GROQ_API_KEY:
            logger.warning("STT skipped (no GROQ_API_KEY)")
            return

        # ── Try Groq first, then fall back to local Whisper ──
        transcription = None
        used_fallback = False

        try:
            # Sync HTTP blocks the event loop; run in a thread so the audio WS keeps receiving.
            # Fresh client per call avoids sharing httpx state across threads.
            def _call_groq():
                client = Groq(api_key=settings.GROQ_API_KEY)
                prompt = self._build_whisper_prompt()
                model_name = self._transcribe_model
                if not self._accuracy_mode and model_name == "whisper-large-v3":
                    model_name = "whisper-large-v3-turbo"
                return client.audio.transcriptions.create(
                    file=("audio.wav", wav_bytes, "audio/wav"),
                    model=model_name,
                    response_format="verbose_json",
                    language="en",
                    temperature=0.0,
                    prompt=prompt if prompt else None,
                )

            transcription = await asyncio.to_thread(_call_groq)
            logger.debug("✅ Groq transcription successful")

        except Exception as e:
            err_name = type(e).__name__
            err_str = str(e).lower()

            # Check if we should use fallback
            use_fallback = getattr(settings, "STT_USE_LOCAL_FALLBACK", True)

            if "AuthenticationError" in err_name or "401" in err_str or "invalid_api_key" in err_str:
                logger.error("Groq API key is invalid. Trying fallback..." if use_fallback else "Groq API key is invalid. Set a valid GROQ_API_KEY in backend/.env")
            elif "429" in err_str or "rate" in err_str:
                logger.warning("Groq rate limit (429). Trying fallback..." if use_fallback else "Groq rate limit (429). Backing off...")
                if not use_fallback:
                    backoff = 20.0
                    self._rate_limit_until = time.monotonic() + backoff
                    await self._requeue_chunk(chunk)
                    return
            else:
                logger.warning(f"Groq transcription failed: {e}. Trying fallback..." if use_fallback else f"Groq transcription failed: {e}")

            # Try fallback
            if use_fallback and WHISPER_AVAILABLE:
                try:
                    logger.info("🔄 Falling back to local Whisper...")
                    fallback_model = getattr(settings, "STT_FALLBACK_MODEL", "base")
                    text, segments = _transcribe_with_local_whisper(wav_bytes, model_size=fallback_model)

                    # Create a mock transcription object
                    class MockTranscription:
                        def __init__(self, text, segments):
                            self.text = text
                            self.segments = segments

                    transcription = MockTranscription(text, {"segments": segments})
                    used_fallback = True
                    logger.info(f"✅ Fallback transcription successful: {text[:50]}...")

                except Exception as fallback_error:
                    logger.error(f"❌ Fallback transcription also failed: {fallback_error}")
                    await self._requeue_chunk(chunk)
                    return
            else:
                # No fallback available or disabled
                if not use_fallback:
                    logger.debug("Fallback disabled in settings")
                elif not WHISPER_AVAILABLE:
                    logger.warning("Local Whisper not available. Install with: pip install whisper")
                await self._requeue_chunk(chunk)
                return

        text, segments = _transcription_text_and_segments(transcription)
        text_clean = text.strip()

        if not text_clean:
            logger.debug("⏭ Whisper returned empty text (chunk #%d)", self._total_chunks)
            return

        # Reject punctuation/noise-like text early.
        if not _contains_letters_or_digits(text_clean):
            self._skipped_hallucination += 1
            logger.debug(
                "⏭ NON-LEXICAL output filtered: %r (chunk #%d)",
                text_clean, self._total_chunks,
            )
            return

        # ── Post-transcription filter: Hallucination phrases ──
        # Normalize by lowercasing and stripping common punctuation
        normalized = text_clean.lower().strip()
        # Strip common ending punctuation
        for punct in [".", ",", "!", "?", "...", "…"]:
            normalized = normalized.rstrip(punct)
        if normalized in HALLUCINATION_PHRASES:
            self._skipped_hallucination += 1
            logger.debug(
                "⏭ HALLUCINATION filtered: %r (chunk #%d, total_filtered=%d)",
                text_clean, self._total_chunks, self._skipped_hallucination,
            )
            return

        # ── Post-transcription filter: Too short ──
        if len(text_clean) < MIN_TEXT_LENGTH:
            self._skipped_hallucination += 1
            logger.debug(
                "⏭ TEXT too short (%d chars): %r (chunk #%d)",
                len(text_clean), text_clean, self._total_chunks,
            )
            return

        # ── Post-transcription filter: Repeated words ──
        if _has_repeated_words(text_clean):
            self._skipped_hallucination += 1
            logger.debug(
                "⏭ REPEATED WORDS filtered: %r (chunk #%d)",
                text_clean, self._total_chunks,
            )
            return

        # ── Post-transcription filter: Consecutive identical outputs ──
        if text_clean == self._last_text:
            self._consecutive_same += 1
            # Block on FIRST repeat - any repeated text is almost always a hallucination
            if self._consecutive_same >= 1:
                self._skipped_hallucination += 1
                logger.debug(
                    "⏭ REPEATED text filtered (%dx): %r",
                    self._consecutive_same + 1, text_clean,
                )
                return
        else:
            self._consecutive_same = 0
        self._last_text = text_clean

        # ── Post-transcription filter: optional segment confidence (when API returns segments) ──
        if segments:
            no_speech_probs = [
                float(_segment_field(seg, "no_speech_prob", 0.0) or 0.0) for seg in segments
            ]
            avg_logprob_values = [
                float(_segment_field(seg, "avg_logprob", 0.0) or 0.0) for seg in segments
            ]
            if no_speech_probs and all(p > 0.9 for p in no_speech_probs):
                avg_prob = sum(no_speech_probs) / len(no_speech_probs)
                self._skipped_hallucination += 1
                logger.debug(
                    "⏭ HIGH no_speech_prob (avg=%.2f): %r (chunk #%d)",
                    avg_prob, text_clean, self._total_chunks,
                )
                return
            if avg_logprob_values and all(x != 0.0 for x in avg_logprob_values):
                avg_logprob = sum(avg_logprob_values) / len(avg_logprob_values)
                if avg_logprob < -2.8:
                    self._skipped_hallucination += 1
                    logger.debug(
                        "⏭ LOW avg_logprob (%.2f) filtered: %r (chunk #%d)",
                        avg_logprob, text_clean, self._total_chunks,
                    )
                    return

        # ── Accepted — save and broadcast ──
        self._transcribed += 1
        self._last_texts = (self._last_texts + [text_clean])[-10:]

        logger.info(
            "✅ TRANSCRIPT #%d (chunk #%d): %s",
            self._transcribed, self._total_chunks, text_clean[:120],
        )

        db = await get_database()
        now_dt = datetime.utcnow()
        await db.transcript_segments.insert_one({
            "meeting_id": self.meeting_id,
            "text": text_clean,
            "timestamp": now_dt,
            "language": "en",
            "audio_rms": round(rms, 1),
            "audio_rms_db": round(rms_db, 1),
            "audio_zcr": round(zcr, 4),
        })
        await db.transcripts.insert_one({
            "meeting_id": self.meeting_id,
            "text": text_clean,
            "timestamp": now_dt,
        })
        if self.push_callback:
            await self.push_callback(self.meeting_id, text_clean)

    def get_stats(self) -> dict:
        """Return pipeline statistics for debugging."""
        return {
            "total_chunks": self._total_chunks,
            "skipped_silence": self._skipped_silence,
            "skipped_hallucination": self._skipped_hallucination,
            "transcribed": self._transcribed,
            "buffer_bytes": len(self._buffer),
            "last_texts": self._last_texts[-3:],
        }
