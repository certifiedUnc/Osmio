"""Transcription step of the pipeline.

For the PoC this returns a placeholder transcript so the pipeline runs end to end without
a real audio file. Real transcription (Groq Whisper) plugs in here once uploads carry audio:
send the lecture's audio to Groq and map its segments to (start_ms, end_ms, text).
"""

from .config import settings
from .models import Lecture

Segment = tuple[int, int, str]

_PLACEHOLDER_LINES = [
    "Introduction and overview of today's topic.",
    "The core idea, explained from first principles.",
    "A worked example to make it concrete.",
    "Common pitfalls and how to avoid them.",
    "Summary and what comes next.",
]


def transcribe(lecture: Lecture) -> list[Segment]:
    if settings.groq_api_key:
        # TODO: real Groq call needs the lecture's audio; wire when upload carries a file.
        pass
    duration_ms = max(lecture.duration_s, len(_PLACEHOLDER_LINES) * 4) * 1000
    step = duration_ms // len(_PLACEHOLDER_LINES)
    return [
        (i * step, (i + 1) * step, line) for i, line in enumerate(_PLACEHOLDER_LINES)
    ]
