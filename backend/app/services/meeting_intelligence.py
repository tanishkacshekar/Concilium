"""
Single Groq LLM pass: transcript → summary + action items. Persist to MongoDB.
File uploads still use app.services.groq_processing.transcribe_audio + this module's summarize_and_extract.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import Any, List, Optional, Tuple, Dict

from groq import Groq

from app.core.config import settings
from app.core.database import get_database
from app.services.transcription_cleaning import clean_transcription_text

logger = logging.getLogger(__name__)

MAX_TRANSCRIPT_CHARS = 120_000


def get_groq_client() -> Groq:
    if not settings.GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not set")
    return Groq(api_key=settings.GROQ_API_KEY)


def _strip_code_fences(raw: str) -> str:
    txt = (raw or "").strip()
    if txt.startswith("```"):
        lines = txt.split("\n")
        txt = "\n".join(lines[1:-1] if lines and lines[-1].strip() == "```" else lines[1:])
    return txt.strip()


def _extract_first_json_object(raw: str) -> str:
    """Best-effort extraction of the first balanced JSON object."""
    s = _strip_code_fences(raw)
    start = s.find("{")
    if start < 0:
        return s
    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(s)):
        ch = s[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return s[start : i + 1]
    return s[start:]


def _repair_common_json_issues(raw: str) -> str:
    """Repair common LLM JSON mistakes (trailing commas/quotes)."""
    s = _extract_first_json_object(raw)
    # Replace smart quotes with plain quotes
    s = s.replace("“", '"').replace("”", '"').replace("’", "'")
    # Remove trailing commas before } or ]
    s = re.sub(r",\s*([}\]])", r"\1", s)
    return s.strip()


def _parse_model_json(raw: str) -> Dict:
    candidates = [
        _strip_code_fences(raw),
        _extract_first_json_object(raw),
        _repair_common_json_issues(raw),
    ]
    last_err: Optional[Exception] = None
    for c in candidates:
        try:
            parsed = json.loads(c)
            if isinstance(parsed, dict):
                return parsed
        except Exception as e:
            last_err = e
    if last_err:
        raise last_err
    raise json.JSONDecodeError("Invalid JSON", raw or "", 0)


def _safe_score(value: Any, default: float) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return default


def _repair_summary_json_with_llm(client: Groq, broken_output: str) -> dict:
    """Second pass: convert model output into strict JSON with the expected keys."""
    repair_sys = """You fix malformed model output. The user message contains text that was meant to be one JSON object with keys:
overview (string), key_points (array of strings), decisions (array of strings), action_items (array of strings), meeting_signals (object).

Rules:
- Output ONLY one JSON object, no markdown, no code fences, no commentary.
- overview must be ONE JSON string. Put paragraph breaks inside the string as \\n (backslash-n). Do not put raw line breaks after "overview": without quotes.
- All string values must use double quotes. Escape internal double quotes as \\".
- Keep meeting_signals as an object with: confidence_score, toxicity_score, dominant_emotion, emotion_scores.
- Copy faithfully from the broken text; do not invent meeting content."""
    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": repair_sys},
            {"role": "user", "content": f"Broken output to fix:\n\n{broken_output[:100_000]}"},
        ],
        temperature=0.0,
        max_tokens=8192,
        response_format={"type": "json_object"},
    )
    fixed = (resp.choices[0].message.content or "{}").strip()
    return _parse_model_json(fixed)


def summarize_and_extract(transcript: str) -> Tuple[dict, List[str]]:
    """
    One chat completion: overview, key_points, decisions, action_items.
    Returns (summary_dict, action_items_strings).
    """
    text_in = (transcript or "").strip()
    if not text_in:
        return (
            {"overview": "", "key_points": [], "decisions": []},
            [],
        )

    client = get_groq_client()
    prompt = """You are a precise meeting assistant. Read the full transcript. You MUST respond with one JSON object only (no markdown, no ``` fences).

Required shape (example structure only — replace values from the transcript):
{"overview":"<single JSON string: 3-6 paragraphs of narrative summary; use \\n between paragraphs inside this string>","key_points":["..."],"decisions":["..."],"action_items":["..."],"meeting_signals":{"confidence_score":0.0,"toxicity_score":0.0,"dominant_emotion":"neutral","emotion_scores":{"positive":0.0,"neutral":0.0,"negative":0.0}}}

Field rules:
- "overview": ONE string value in double quotes. Never write unquoted text after the colon. For new paragraphs inside overview use \\n inside the same string — not raw line breaks.
- "key_points": array of strings — substantive takeaways (often 10–25 for long meetings).
- "decisions": array of strings — finalized agreements; [] if none.
- "action_items": array of strings — concrete next steps; do not invent owners/dates absent from transcript.
- "meeting_signals": object with:
  - confidence_score: 0.0..1.0 estimate of transcript/reasoning confidence.
  - toxicity_score: 0.0..1.0 estimate of toxic or hostile language in the meeting.
  - dominant_emotion: one of "positive" | "neutral" | "negative" | "mixed".
  - emotion_scores: object with positive/neutral/negative floats from 0.0..1.0.

Stay faithful to the transcript. Valid JSON only."""
    create_kwargs = dict(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": prompt},
            {"role": "user", "content": f"Transcript:\n\n{text_in[:MAX_TRANSCRIPT_CHARS]}"},
        ],
        temperature=0.2,
        max_tokens=8192,
        response_format={"type": "json_object"},
    )
    try:
        response = client.chat.completions.create(**create_kwargs)
    except Exception as e:
        logger.warning("Groq call without response_format failed or unsupported: %s — retrying without json_object", e)
        create_kwargs.pop("response_format", None)
        response = client.chat.completions.create(**create_kwargs)

    raw = (response.choices[0].message.content or "{}").strip()
    try:
        data = _parse_model_json(raw)
    except json.JSONDecodeError as e:
        logger.warning(
            "summarize_and_extract primary parse failed: %s — running JSON repair pass. raw_prefix=%r",
            e,
            raw[:240],
        )
        try:
            data = _repair_summary_json_with_llm(client, raw)
        except Exception as e2:
            logger.exception(
                "Groq summarize repair failed: %s (original: %s) raw_prefix=%r",
                e2,
                e,
                raw[:240],
            )
            raise e2 from e

    overview = data.get("overview") or ""
    key_points = data.get("key_points")
    decisions = data.get("decisions")
    action_items = data.get("action_items")
    meeting_signals = data.get("meeting_signals") if isinstance(data.get("meeting_signals"), dict) else {}
    if not isinstance(key_points, list):
        key_points = []
    if not isinstance(decisions, list):
        decisions = []
    if not isinstance(action_items, list):
        action_items = [str(action_items)] if action_items else []
    else:
        action_items = [str(x) for x in action_items]

    summary_dict = {
        "overview": overview,
        "key_points": key_points,
        "decisions": decisions,
        "meeting_signals": {
            "confidence_score": _safe_score(meeting_signals.get("confidence_score"), 0.75),
            "toxicity_score": _safe_score(meeting_signals.get("toxicity_score"), 0.05),
            "dominant_emotion": str(meeting_signals.get("dominant_emotion") or "neutral").lower(),
            "emotion_scores": {
                "positive": _safe_score((meeting_signals.get("emotion_scores") or {}).get("positive"), 0.33),
                "neutral": _safe_score((meeting_signals.get("emotion_scores") or {}).get("neutral"), 0.34),
                "negative": _safe_score((meeting_signals.get("emotion_scores") or {}).get("negative"), 0.33),
            },
        },
    }
    return summary_dict, action_items


def _combine_segments(segments: List[dict]) -> str:
    parts = []
    for s in sorted(segments, key=lambda x: x.get("timestamp") or ""):
        parts.append(s.get("text") or "")
    return "\n".join(parts).strip()


async def analyze_meeting_transcript(
    meeting_id: str,
    language: str = "en",
) -> Optional[Dict[str, Any]]:
    """
    Load transcript_segments for meeting_id, call Groq once, write summaries + action_items.
    Returns a small result dict on success, None if no transcript or on failure after logging.
    """
    db = await get_database()
    cursor = db.transcript_segments.find({"meeting_id": meeting_id}).sort("timestamp", 1)
    segments = await cursor.to_list(length=10_000)
    if not segments:
        logger.info("No transcript segments for meeting_id=%s; skipping intelligence", meeting_id)
        return None

    full_text = _combine_segments(segments)
    if not full_text.strip():
        logger.info("Empty combined transcript for meeting_id=%s; skipping intelligence", meeting_id)
        return None

    cleaned_text = clean_transcription_text(full_text)
    if not cleaned_text.strip():
        # If cleaning strips everything, fall back to original to avoid losing the meeting.
        cleaned_text = full_text

    try:
        summary_dict, action_items = summarize_and_extract(cleaned_text)
    except Exception as e:
        logger.exception("Meeting intelligence failed for meeting_id=%s: %s", meeting_id, e)
        return None

    now = datetime.utcnow()
    overview = summary_dict.get("overview") or ""
    key_points = summary_dict.get("key_points") or []

    await db.summaries.insert_one(
        {
            "meeting_id": meeting_id,
            "language": language,
            "summary_text": overview,
            "key_points": key_points,
            "decisions": summary_dict.get("decisions") or [],
            "meeting_signals": summary_dict.get("meeting_signals") or {},
            "cleaned_transcription": cleaned_text,
            "created_at": now,
        }
    )

    for text in action_items:
        t = (text or "").strip()
        if not t:
            continue
        await db.action_items.insert_one(
            {
                "meeting_id": meeting_id,
                "text": t,
                "language": language,
                "created_at": now,
            }
        )

    logger.info(
        "Meeting intelligence completed meeting_id=%s action_items=%d",
        meeting_id,
        len(action_items),
    )
    return {
        "meeting_id": meeting_id,
        "overview_len": len(overview),
        "action_items_count": len([x for x in action_items if (x or "").strip()]),
    }
