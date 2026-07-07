"""
Deterministic transcription cleaning helpers.

Used as a pre-processing step before:
- summary/action extraction (meeting_intelligence)
- Kanban extraction (kanban_agentic_automation)

This is intentionally heuristic (no extra LLM calls) to keep costs predictable.
"""

from __future__ import annotations

import re
from typing import Iterable, List, Dict, Set


_FILLER_PHRASES: List[str] = [
    "am i audible",
    "okay guys",
    "good morning",
    "yes",
    "okay",
]

_COMMON_STT_ERRORS: Dict[str, str] = {
    # Common examples from user reports:
    "project score": "project scope",
    "december": "testing",
}


def _normalize_sentence(s: str) -> str:
    t = (s or "").strip().lower()
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"[^a-z0-9 ]+", "", t)
    return t.strip()


def _apply_common_corrections(text: str) -> str:
    out = text
    for wrong, right in _COMMON_STT_ERRORS.items():
        # Word-boundary-ish replacement; good enough for typical STT mistakes.
        out = re.sub(rf"\b{re.escape(wrong)}\b", right, out, flags=re.IGNORECASE)
    return out


def _remove_filler_sentences(sentences: Iterable[str]) -> List[str]:
    cleaned: List[str] = []
    for s in sentences:
        t = (s or "").strip()
        if not t:
            continue
        t_norm = t.lower()
        # Drop sentences/clauses that are just fillers (or nearly just fillers).
        if any(fp in t_norm for fp in _FILLER_PHRASES):
            # If filler is embedded in a longer sentence, keep the rest.
            # Example: "Okay, we will ship" => "we will ship"
            for fp in _FILLER_PHRASES:
                # Remove the phrase and trim punctuation/whitespace.
                if fp in t_norm:
                    t = re.sub(rf"(?i)\b{re.escape(fp)}\b[,:;]?\s*", "", t).strip()
            if not t:
                continue
        cleaned.append(t)
    return cleaned


def clean_transcription_text(text: str) -> str:
    """
    Clean meeting transcription text.

    Steps:
    - Normalize whitespace
    - Apply a small set of common STT corrections
    - Remove filler/noise phrases
    - Remove exact/near-duplicate sentences
    - Rejoin into a single cleaned text
    """
    raw = (text or "").strip()
    if not raw:
        return ""

    # Normalize whitespace first
    t = re.sub(r"\s+", " ", raw)
    t = _apply_common_corrections(t)

    # Split into sentences-ish chunks (keep punctuation where possible)
    # Also treat newlines as boundaries.
    parts = re.split(r"[\n]+|(?<=[.!?])\s+", t)
    parts = [p.strip() for p in parts if (p or "").strip()]

    parts = _remove_filler_sentences(parts)

    deduped: List[str] = []
    seen: Set[str] = set()
    for p in parts:
        norm = _normalize_sentence(p)
        if not norm:
            continue
        if norm in seen:
            continue
        seen.add(norm)
        deduped.append(p)

    return " ".join(deduped).strip()

