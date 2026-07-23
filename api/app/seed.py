"""Seed one demo course + lecture so the player has real data before the pipeline exists.

The transcript below is a short stand-in; the real one comes from Groq (see scripts/).
"""

from sqlalchemy import select

from .db import SessionLocal
from .models import Course, Lecture, TranscriptSegment

DEMO_TRANSCRIPT = [
    (0, 6000, "Alright, let's get started. Today we're looking at how search engines rank pages."),
    (6000, 14000, "The core idea behind PageRank is that a link is a kind of vote of confidence."),
    (14000, 22000, "But not every vote counts equally. A link from a highly-trusted page is worth more."),
    (22000, 31000, "So we model the whole web as a graph, where pages are nodes and links are edges."),
    (31000, 40000, "A random surfer clicks links at random, and PageRank is the long-run fraction of "
                    "time they spend on each page."),
    (40000, 49000, "The tricky part is dangling nodes, pages with no outgoing links at all."),
    (49000, 58000, "We handle those with a damping factor, usually set to around 0.85."),
    (58000, 67000, "In the next lecture we'll actually implement this and run it on a small crawl."),
]


def seed():
    db = SessionLocal()
    try:
        if db.scalar(select(Course).limit(1)):
            return  # already seeded

        course = Course(code="CS305", title="Information Retrieval", term="2026-Autumn")
        db.add(course)
        db.flush()

        lecture = Lecture(
            course_id=course.id,
            title="Ranking pages with PageRank",
            week=7,
            duration_s=67,
            published=True,
            # Fill in with a real Cloudflare Stream UID once a lecture is uploaded.
            stream_uid="",
        )
        db.add(lecture)
        db.flush()

        for start, end, text in DEMO_TRANSCRIPT:
            db.add(
                TranscriptSegment(lecture_id=lecture.id, start_ms=start, end_ms=end, text=text)
            )
        db.commit()
    finally:
        db.close()
