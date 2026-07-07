"""
Advanced audio processor with multi-layer speech detection:
  1. RMS energy gating — reject frames below configurable threshold
  2. Noise gate — zero out sub-threshold samples to suppress low-level hum
  3. WebRTC VAD — neural-net voice activity detection
  4. Speech confirmation buffer — require N consecutive speech frames before emitting
  5. Debug metrics logging — energy level, VAD decision, skip reason
"""
import logging
from typing import Optional, List

from app.audio.signal_utils import apply_noise_gate, pcm16_rms, pcm16_rms_db
from app.core.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Main AudioProcessor
# ---------------------------------------------------------------------------

class AudioProcessor:
    """
    Receives raw PCM frames from the capture layer.
    Applies energy gating, noise gate, VAD, and speech-confirmation
    buffering before emitting combined chunks for STT.
    """

    def __init__(
        self,
        sample_rate: int = None,
        chunk_frames: int = 10,
        use_vad: bool = True,
        energy_threshold_rms: float = None,
        noise_gate_threshold_rms: float = None,
        speech_confirm_frames: int = None,
        vad_aggressiveness: int = None,
    ):
        self.sample_rate = sample_rate or settings.AUDIO_SAMPLE_RATE
        self.chunk_frames = chunk_frames
        self.use_vad = use_vad

        # Configurable thresholds with sensible defaults
        self.energy_threshold_rms = (
            energy_threshold_rms
            if energy_threshold_rms is not None
            else getattr(settings, "VAD_ENERGY_THRESHOLD_RMS", 150.0)
        )
        self.noise_gate_threshold_rms = (
            noise_gate_threshold_rms
            if noise_gate_threshold_rms is not None
            else getattr(settings, "VAD_NOISE_GATE_RMS", 80.0)
        )
        # How many consecutive speech-positive frames before we confirm speech
        self.speech_confirm_frames = (
            speech_confirm_frames
            if speech_confirm_frames is not None
            else getattr(settings, "VAD_SPEECH_CONFIRM_FRAMES", 8)
        )
        vad_aggr = (
            vad_aggressiveness
            if vad_aggressiveness is not None
            else getattr(settings, "VAD_AGGRESSIVENESS", 2)
        )

        # Internal state
        self._buffer: List[bytes] = []
        self._speech_frame_count: int = 0  # consecutive speech frames
        self._silence_frame_count: int = 0  # consecutive silence frames
        self._speech_confirmed: bool = False  # speech confirmation latch
        self._frames_since_log: int = 0
        self._total_frames: int = 0
        self._skipped_energy: int = 0
        self._skipped_vad: int = 0

        # WebRTC VAD
        self._vad = None
        if use_vad:
            try:
                import webrtcvad
                self._vad = webrtcvad.Vad(vad_aggr)
                logger.info(
                    "WebRTC VAD enabled (aggressiveness=%d, energy_thresh=%.0f, "
                    "noise_gate=%.0f, confirm_frames=%d)",
                    vad_aggr, self.energy_threshold_rms,
                    self.noise_gate_threshold_rms, self.speech_confirm_frames,
                )
            except ImportError:
                logger.warning("webrtcvad not installed — VAD disabled")
                self.use_vad = False

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    def process_audio_frame(self, frame: bytes) -> Optional[bytes]:
        """
        Process one PCM16 frame through the full filtering pipeline.
        Returns a combined chunk when buffer is full (during confirmed speech),
        or None if the frame was rejected.
        """
        self._total_frames += 1
        self._frames_since_log += 1

        # ── Step 1: Noise gate ──
        frame = apply_noise_gate(frame, self.noise_gate_threshold_rms)

        # ── Step 2: Energy gating ──
        rms = pcm16_rms(frame)
        rms_db = pcm16_rms_db(frame)
        is_energetic = rms >= self.energy_threshold_rms

        if not is_energetic:
            self._skipped_energy += 1
            self._speech_frame_count = 0
            self._silence_frame_count += 1
            # If we had confirmed speech but now have extended silence, unlatch
            if self._speech_confirmed and self._silence_frame_count > self.speech_confirm_frames * 3:
                self._speech_confirmed = False
                logger.debug(
                    "Speech ended (silence_frames=%d)",
                    self._silence_frame_count,
                )
                # Flush remaining buffer as the tail of the speech segment
                return self._flush_buffer()
            self._log_periodic(rms, rms_db, "SKIP_ENERGY", False)
            return None

        # ── Step 3: VAD check ──
        vad_speech = True
        if self.use_vad and self._vad:
            vad_speech = self._check_vad(frame)
            if not vad_speech:
                self._skipped_vad += 1
                self._speech_frame_count = 0
                self._silence_frame_count += 1
                if self._speech_confirmed and self._silence_frame_count > self.speech_confirm_frames * 3:
                    self._speech_confirmed = False
                    return self._flush_buffer()
                self._log_periodic(rms, rms_db, "SKIP_VAD", False)
                return None

        # ── Step 4: Speech confirmation ──
        self._silence_frame_count = 0
        self._speech_frame_count += 1

        if not self._speech_confirmed:
            if self._speech_frame_count >= self.speech_confirm_frames:
                self._speech_confirmed = True
                logger.info(
                    "🎤 Speech CONFIRMED after %d consecutive frames (RMS=%.0f / %.1f dBFS)",
                    self._speech_frame_count, rms, rms_db,
                )
            else:
                # Not yet confirmed — hold frame but don't emit
                self._buffer.append(frame)
                self._log_periodic(rms, rms_db, "PENDING_CONFIRM", True)
                return None

        # ── Step 5: Buffer and emit ──
        self._buffer.append(frame)
        self._log_periodic(rms, rms_db, "SPEECH", True)

        if len(self._buffer) >= self.chunk_frames:
            out = b"".join(self._buffer)
            self._buffer.clear()
            return out
        return None

    def flush(self) -> Optional[bytes]:
        """Return any remaining buffered audio."""
        return self._flush_buffer()

    def get_stats(self) -> dict:
        """Return debug statistics."""
        return {
            "total_frames": self._total_frames,
            "skipped_energy": self._skipped_energy,
            "skipped_vad": self._skipped_vad,
            "speech_confirmed": self._speech_confirmed,
            "buffer_size": len(self._buffer),
        }

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    def _check_vad(self, frame: bytes) -> bool:
        """Run WebRTC VAD on the frame. Handles frame-size requirements."""
        # WebRTC VAD needs exact 10/20/30 ms frames at 8/16/32 kHz
        frame_ms = 20
        frame_bytes = int(self.sample_rate * frame_ms / 1000) * 2  # 640 for 16kHz/20ms
        if len(frame) < frame_bytes:
            return True  # too short to check, assume speech
        try:
            return self._vad.is_speech(frame[:frame_bytes], self.sample_rate)
        except Exception:
            return True  # on error, assume speech to avoid dropping real audio

    def _flush_buffer(self) -> Optional[bytes]:
        if not self._buffer:
            return None
        out = b"".join(self._buffer)
        self._buffer.clear()
        return out

    def _log_periodic(self, rms: float, rms_db: float, decision: str, is_speech: bool) -> None:
        """Log debug metrics every ~100 frames to avoid flooding logs."""
        if self._frames_since_log >= 100:
            self._frames_since_log = 0
            stats = self.get_stats()
            logger.debug(
                "AudioProcessor | RMS=%.0f (%.1f dBFS) | decision=%s | speech=%s | "
                "total=%d skip_energy=%d skip_vad=%d buf=%d",
                rms, rms_db, decision, is_speech,
                stats["total_frames"], stats["skipped_energy"],
                stats["skipped_vad"], stats["buffer_size"],
            )
