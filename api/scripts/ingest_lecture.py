"""Ingest one real lecture: host the video on Cloudflare Stream and transcribe it with Groq.

This is the PoC's manual "process a lecture" step. Run it inside the api container so it has
the database and the credentials from api/.env:

  docker compose exec api python scripts/ingest_lecture.py \
      --course-id 1 --title "Ranking pages with PageRank" --week 7 \
      --video-url https://example.com/lecture.mp4 \
      --audio-url https://example.com/lecture.mp3   # optional, small file for Groq

Needs CF_ACCOUNT_ID, CF_STREAM_TOKEN, and GROQ_API_KEY set (see api/.env.example).
"""

import argparse
import os
import sys

# Allow running as `python scripts/ingest_lecture.py` from the api/ root.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.cloudflare import copy_from_url
from app.db import SessionLocal
from app.models import Course, Lecture, ProcessingStatus, TranscriptSegment
from app.transcription import transcribe_url


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest one real lecture (Cloudflare + Groq).")
    parser.add_argument("--course-id", type=int, required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--week", type=int, default=1)
    parser.add_argument("--video-url", required=True, help="Public URL Cloudflare can pull the video from")
    parser.add_argument("--audio-url", help="Optional smaller audio/clip URL to transcribe (defaults to --video-url)")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        course = db.get(Course, args.course_id)
        if course is None:
            raise SystemExit(f"course {args.course_id} not found")

        print("Uploading video to Cloudflare Stream (this waits for encoding)...")
        uid, duration_s = copy_from_url(args.video_url, args.title)
        print(f"  stream_uid={uid} duration_s={duration_s}")

        print("Transcribing with Groq...")
        segments = transcribe_url(args.audio_url or args.video_url)
        print(f"  {len(segments)} segments")
        if not duration_s and segments:
            duration_s = segments[-1][1] // 1000

        lecture = Lecture(
            course_id=course.id,
            title=args.title,
            week=args.week,
            stream_uid=uid,
            duration_s=duration_s,
            status=ProcessingStatus.published,
            published=True,
        )
        db.add(lecture)
        db.flush()
        for start_ms, end_ms, text in segments:
            db.add(TranscriptSegment(lecture_id=lecture.id, start_ms=start_ms, end_ms=end_ms, text=text))
        db.commit()
        print(f"Done. Lecture {lecture.id} published with a real video and transcript.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
