"""Transcription for the pipeline.

transcribe_file()/transcribe_url() are the real thing: they send media to Groq's Whisper and
return timestamped segments. transcribe() is the placeholder used when there is no recording to
work from, or when a real transcription is unavailable.
"""

import os

import httpx

from .config import settings
from .models import Lecture

Segment = tuple[int, int, str]

GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
GROQ_MODEL = "whisper-large-v3"


class TranscriptionError(RuntimeError):
    pass


def _groq_transcribe(filename: str, content: bytes, content_type: str) -> list[Segment]:
    """Post a media blob to Groq Whisper and parse the segment timings it returns."""
    if not settings.groq_api_key:
        raise TranscriptionError("GROQ_API_KEY must be set")

    with httpx.Client(timeout=300) as client:
        resp = client.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            data={
                "model": GROQ_MODEL,
                "response_format": "verbose_json",
                "timestamp_granularities[]": "segment",
            },
            files={"file": (filename, content, content_type)},
        )
    if resp.status_code != 200:
        raise TranscriptionError(f"Groq error {resp.status_code}: {resp.text[:300]}")

    segments = resp.json().get("segments") or []
    return [
        (int(float(s["start"]) * 1000), int(float(s["end"]) * 1000), s["text"].strip())
        for s in segments
    ]


def transcribe_file(path: str, filename: str = "audio") -> list[Segment]:
    """Transcribe a recording sitting on disk with Groq Whisper.

    Note: Groq caps the upload (~25MB), so long recordings fall back to the placeholder upstream.
    """
    with open(path, "rb") as fh:
        content = fh.read()
    return _groq_transcribe(filename, content, "application/octet-stream")


def transcribe_url(media_url: str) -> list[Segment]:
    """Download media from media_url and transcribe it with Groq Whisper."""
    with httpx.Client(timeout=300) as client:
        media = client.get(media_url, follow_redirects=True)
        media.raise_for_status()
        filename = media_url.split("?")[0].rsplit("/", 1)[-1] or "audio"
        content_type = media.headers.get("content-type", "application/octet-stream")
    return _groq_transcribe(filename, media.content, content_type)


def transcribe_lecture(lecture: Lecture) -> list[Segment]:
    """Transcribe a lecture's recording when we have one and a Groq key is configured.

    Falls back to the placeholder transcript when there is no recording on disk, no API key, or
    the real transcription fails (for example a clip past Groq's size limit)."""
    if lecture.source_key and settings.groq_api_key:
        path = os.path.join(settings.upload_dir, lecture.source_key)
        if os.path.exists(path):
            try:
                segments = transcribe_file(path, f"{lecture.source_key}.webm")
                if segments:
                    return segments
            except (TranscriptionError, httpx.HTTPError):
                pass
    return transcribe(lecture)


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
