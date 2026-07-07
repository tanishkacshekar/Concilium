from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List, Union, Optional

# Resolve .env from backend directory so it loads even when running from project root
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"

class Settings(BaseSettings):
    # MongoDB
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "meeting_monitor"
    
    # JWT
    JWT_SECRET_KEY: str = "your-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Groq API (for Whisper transcription). Get a key at https://console.groq.com
    GROQ_API_KEY: str = ""
    TASK_AUTOMATION_PROVIDER: str = "groq"  # groq | gemini
    TASK_AUTOMATION_MODEL: str = "llama-3.3-70b-versatile"
    TASK_AUTOMATION_MATCH_THRESHOLD: float = 0.78
    TASK_AUTOMATION_LOW_CONFIDENCE_THRESHOLD: float = 0.60
    
    # CORS - accept list or comma-separated / JSON string from env
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8080",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8080",
    ]
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Meeting bot: backend URL for WebSocket and API (bot connects here)
    # If not set in env, bot_manager will fall back to http://localhost:{PORT}
    BACKEND_URL: str = ""

    # Audio capture & STT (must match what bot sends)
    AUDIO_SAMPLE_RATE: int = 16000
    AUDIO_CHANNELS: int = 1
    AUDIO_CHUNK_SIZE: int = 1024
    # Input device for bot: system audio (e.g. "Stereo Mix" on Windows) not microphone.
    # Set to device name substring (e.g. "Stereo Mix", "What U Hear") or device index (e.g. "2").
    # Leave unset to use default input device (usually mic).
    AUDIO_INPUT_DEVICE: Optional[Union[int, str]] = None
    # STT buffer seconds before calling Whisper (smaller = faster first transcript, more API calls)
    STT_BUFFER_SECONDS: float = 5.0
    # Accuracy-first mode keeps more context and can increase transcript delay.
    STT_ACCURACY_MODE: bool = True
    # Default Whisper model for streaming chunks.
    STT_TRANSCRIBE_MODEL: str = "whisper-large-v3"
    # Extra domain terms to bias Whisper toward correct spelling/pronunciation.
    STT_CONTEXT_HINTS: str = "WebSocket, analytics, Vikram, project scope, testing"
    # Number of previous accepted transcript segments to pass as prompt context.
    STT_PROMPT_HISTORY_LINES: int = 6
    # Custom prompt for Whisper to enforce specific transcription style
    STT_CUSTOM_PROMPT: str = ""
    # Overlap retained between chunks to avoid losing words at chunk boundaries.
    STT_OVERLAP_SECONDS: float = 2.0
    # Skip sending chunks with RMS below this to reduce "Thank you" hallucinations on silence (set 0 to disable)
    STT_SILENCE_RMS_THRESHOLD: float = 80.0

    # ── Voice Activity Detection (AudioProcessor) ──
    # RMS energy threshold: frames below this are discarded as silence (default 150 suits 16-bit PCM)
    VAD_ENERGY_THRESHOLD_RMS: float = 120.0
    # Noise gate: frames with RMS below this are zeroed out to remove low-level hum
    VAD_NOISE_GATE_RMS: float = 80.0
    # Number of consecutive speech-positive frames required to confirm speech (at 16kHz/1024 chunk ≈ 64ms each)
    # 3 frames ≈ 190ms of consistent speech before transcription starts
    VAD_SPEECH_CONFIRM_FRAMES: int = 3
    # WebRTC VAD aggressiveness: 0 (least aggressive, more false positives) to 3 (most aggressive, may clip speech)
    VAD_AGGRESSIVENESS: int = 2

    # ── STT pre-transcription audio quality checks ──
    # Minimum dBFS level for a chunk to be sent to Whisper (-45 dBFS is very quiet)
    STT_SILENCE_DB_THRESHOLD: float = -55.0
    # Maximum zero-crossing rate — above this, audio is likely noise not speech (speech is typically 0.02–0.20)
    STT_MAX_ZCR: float = 0.52
    # Minimum peak sample amplitude in a chunk (out of 32767)
    STT_MIN_PEAK: int = 40

    # ── STT Fallback ──
    # Use local Whisper model when Groq API fails (rate limits, errors, etc.)
    STT_USE_LOCAL_FALLBACK: bool = True
    # Whisper model size for fallback: "tiny", "base", "small", "medium", "large"
    # Smaller models = faster but less accurate. Recommended: "base" or "small"
    STT_FALLBACK_MODEL: str = "base"

    @field_validator("GROQ_API_KEY", mode="before")
    @classmethod
    def strip_groq_api_key(cls, v: str) -> str:
        if v is None:
            return ""
        s = (v or "").strip().strip('"').strip("'").strip("\r")
        if s.startswith("\ufeff"):
            s = s[1:]  # BOM
        return s

    @field_validator("AUDIO_INPUT_DEVICE", mode="before")
    @classmethod
    def parse_audio_input_device(cls, v) -> Optional[Union[int, str]]:
        if v is None or (isinstance(v, str) and v.strip() == ""):
            return None
        if isinstance(v, str) and v.strip().isdigit():
            return int(v.strip())
        return v if isinstance(v, (int, str)) else None

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        import json
        if isinstance(v, list):
            # Env might give one element that is the whole JSON string
            if len(v) == 1 and isinstance(v[0], str) and v[0].strip().startswith("["):
                return json.loads(v[0])
            return v
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                return json.loads(v)
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return []
    
    class Config:
        env_file = str(_ENV_FILE) if _ENV_FILE.exists() else ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True

settings = Settings()
