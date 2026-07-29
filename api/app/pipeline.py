"""Lecture processing pipeline: uploaded -> normalizing -> transcribing -> review -> published.

Runs as a background job. Each stage updates the lecture's status so an instructor can watch
progress. Audio normalization is a placeholder step here; transcription delegates to
transcription.transcribe_lecture, which uses the real recording when one is available.
"""

import time

from .config import settings
from .db import SessionLocal
from .models import Lecture, ProcessingStatus, TranscriptSegment
from .transcription import transcribe_lecture


def run_pipeline(lecture_id: int) -> None:
    delay = settings.pipeline_stage_delay_s
    db = SessionLocal()
    try:
        lecture = db.get(Lecture, lecture_id)
        if lecture is None:
            return

        # Audio normalization (placeholder for the PoC).
        lecture.status = ProcessingStatus.normalizing
        db.commit()
        time.sleep(delay)

        # Transcription.
        lecture.status = ProcessingStatus.transcribing
        db.commit()
        segments = transcribe_lecture(lecture)
        time.sleep(delay)

        for existing in list(lecture.segments):
            db.delete(existing)
        db.flush()
        for start_ms, end_ms, text in segments:
            db.add(
                TranscriptSegment(lecture_id=lecture.id, start_ms=start_ms, end_ms=end_ms, text=text)
            )

        lecture.status = ProcessingStatus.review
        db.commit()
        time.sleep(delay)

        lecture.status = ProcessingStatus.published
        lecture.published = True
        db.commit()
    except Exception:
        db.rollback()
        lecture = db.get(Lecture, lecture_id)
        if lecture is not None:
            lecture.status = ProcessingStatus.failed
            db.commit()
    finally:
        db.close()
