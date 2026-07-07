"""
Answer user questions about a single meeting using transcript + summary context (Groq).
"""
from __future__ import annotations

import logging
from typing import List, Optional

from app.core.config import settings
from app.services.meeting_intelligence import get_groq_client

logger = logging.getLogger(__name__)

MAX_TRANSCRIPT_CHARS = 48_000


def _build_transcript_text(segments: List[dict]) -> str:
    parts = []
    for s in segments or []:
        t = (s.get("text") or "").strip()
        if t:
            parts.append(t)
    return " ".join(parts).strip()


def answer_meeting_question(
    meeting_title: str,
    transcript_text: str,
    summary_text: Optional[str],
    key_points: Optional[List[str]],
    action_items: Optional[List[str]],
    question: str,
) -> str:
    if not settings.GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not configured")

    t = transcript_text.strip()
    if len(t) > MAX_TRANSCRIPT_CHARS:
        t = t[-MAX_TRANSCRIPT_CHARS:]

    ctx_parts = [f"Meeting title: {meeting_title or 'Untitled'}"]
    if summary_text:
        ctx_parts.append(f"Summary:\n{summary_text.strip()}")
    if key_points:
        ctx_parts.append("Key points:\n" + "\n".join(f"- {p}" for p in key_points if p))
    if action_items:
        ctx_parts.append("Action items (informal list):\n" + "\n".join(f"- {a}" for a in action_items if a))
    ctx_parts.append(f"Transcript (may be partial):\n{t or '(no transcript yet)'}")

    context_blob = "\n\n".join(ctx_parts)

    sys_msg = """You are a concise meeting assistant. Answer ONLY using the meeting context provided
(transcript, summary, key points, action items). If the context does not contain enough information,
say so briefly and suggest what would be needed (e.g. more transcript or running the meeting longer).
Do not invent participants, decisions, or tasks. Keep answers clear and short unless the user asks for detail."""

    user_msg = f"Context:\n{context_blob}\n\nQuestion: {question.strip()}"

    client = get_groq_client()
    model = settings.TASK_AUTOMATION_MODEL or "llama-3.3-70b-versatile"
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": sys_msg},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.2,
            max_tokens=1024,
        )
        return (resp.choices[0].message.content or "").strip() or "No response from assistant."
    except Exception as e:
        logger.exception("meeting_context_qa failed: %s", e)
        raise
