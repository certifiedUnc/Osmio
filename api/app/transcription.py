"""Transcription for the pipeline.

transcribe_url() is the real thing: it sends media to Groq's Whisper and returns timestamped
segments. transcribe() is the placeholder the auto-pipeline uses when no audio is wired up yet.
"""

import httpx

from .config import settings
from .models import Lecture

Segment = tuple[int, int, str]

GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_MODEL = "whisper-large-v3"


class TranscriptionError(RuntimeError):
    pass


def transcribe_url(media_url: str) -> list[Segment]:
    """Download media from media_url and transcribe it with Groq Whisper.

    Note: Groq's free tier caps the upload (~25MB), so use a short clip or an audio-only file.
    """
    if not settings.groq_api_key:
        raise TranscriptionError("GROQ_API_KEY must be set")

    with httpx.Client(timeout=300) as client:
        media = client.get(media_url, follow_redirects=True)
        media.raise_for_status()
        filename = media_url.split("?")[0].rsplit("/", 1)[-1] or "audio"
        resp = client.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            data={
                "model": GROQ_MODEL,
                "response_format": "verbose_json",
                "timestamp_granularities[]": "segment",
            },
            files={
                "file": (filename, media.content, media.headers.get("content-type", "application/octet-stream"))
            },
        )
    if resp.status_code != 200:
        raise TranscriptionError(f"Groq error {resp.status_code}: {resp.text[:300]}")

    segments = resp.json().get("segments") or []
    return [
        (int(float(s["start"]) * 1000), int(float(s["end"]) * 1000), s["text"].strip())
        for s in segments
    ]


_PLACEHOLDER_LINES = [
    "Introduction and overview of today's topic.",
    "The core idea, explained from first principles.",
    "A worked example to make it concrete.",
    "Common pitfalls and how to avoid them.",
    "Summary and what comes next.",
]


def transcribe(lecture: Lecture) -> list[Segment]:
    """Placeholder transcript for the auto-pipeline (no real audio source yet)."""
    duration_ms = max(lecture.duration_s, len(_PLACEHOLDER_LINES) * 4) * 1000
    step = duration_ms // len(_PLACEHOLDER_LINES)
    return [(i * step, (i + 1) * step, line) for i, line in enumerate(_PLACEHOLDER_LINES)]
