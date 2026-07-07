import math
import struct


def pcm16_rms(pcm_bytes: bytes) -> float:
    """Calculate RMS energy of PCM16-LE mono audio bytes."""
    if len(pcm_bytes) < 2:
        return 0.0
    n = len(pcm_bytes) // 2
    total = 0.0
    for i in range(0, len(pcm_bytes) - 1, 2):
        sample = struct.unpack_from("<h", pcm_bytes, i)[0]
        total += sample * sample
    return (total / n) ** 0.5 if n else 0.0


def pcm16_rms_db(pcm_bytes: bytes) -> float:
    """RMS energy in dBFS (0 dBFS = full-scale 32767)."""
    rms = pcm16_rms(pcm_bytes)
    if rms < 1.0:
        return -96.0
    return 20.0 * math.log10(rms / 32767.0)


def pcm16_peak(pcm_bytes: bytes) -> int:
    """Peak absolute sample value for PCM16 mono audio bytes."""
    if len(pcm_bytes) < 2:
        return 0
    peak = 0
    for i in range(0, len(pcm_bytes) - 1, 2):
        sample = abs(struct.unpack_from("<h", pcm_bytes, i)[0])
        if sample > peak:
            peak = sample
    return peak


def apply_noise_gate(frame: bytes, threshold_rms: float) -> bytes:
    """Hard-gate a frame to zero when overall RMS is below threshold."""
    if pcm16_rms(frame) < threshold_rms:
        return b"\x00" * len(frame)
    return frame
