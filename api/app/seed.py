"""Seed demo accounts + one course/lecture so the app has something to show on a fresh DB.

Demo logins (all password "password"): admin@osmio.dev, instructor@osmio.dev, student@osmio.dev.
The transcript below is a stand-in; the real one comes from the pipeline (Groq).
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from .db import SessionLocal
from .models import (
    Assignment,
    Course,
    Enrollment,
    Exam,
    Lecture,
    ProcessingStatus,
    Role,
    Subject,
    TranscriptSegment,
    User,
)
from .security import hash_password

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
        if db.scalar(select(User).limit(1)):
            return  # already seeded

        admin = User(
            email="admin@osmio.dev",
            full_name="Site Admin",
            role=Role.admin,
            password_hash=hash_password("password"),
        )
        instructor = User(
            email="instructor@osmio.dev",
            full_name="Prof. Rao",
            role=Role.instructor,
            password_hash=hash_password("password"),
        )
        student = User(
            email="student@osmio.dev",
            full_name="Priya",
            role=Role.student,
            password_hash=hash_password("password"),
        )
        db.add_all([admin, instructor, student])
        db.flush()

        subject = Subject(code="CS", name="Computer Science")
        db.add(subject)
        db.flush()

        course = Course(
            code="CS305",
            title="Information Retrieval",
            term="2026-Autumn",
            subject_id=subject.id,
            instructor_id=instructor.id,
        )
        db.add(course)
        db.flush()

        db.add(Enrollment(course_id=course.id, student_id=student.id))

        now = datetime.now(timezone.utc)

        lecture = Lecture(
            course_id=course.id,
            title="Ranking pages with PageRank",
            week=7,
            duration_s=67,
            scheduled_at=now - timedelta(days=2),
            status=ProcessingStatus.published,
            published=True,
            uploaded_by=instructor.id,
            stream_uid="",
        )
        db.add(lecture)
        db.flush()

        for start, end, text in DEMO_TRANSCRIPT:
            db.add(TranscriptSegment(lecture_id=lecture.id, start_ms=start, end_ms=end, text=text))

        # An upcoming lecture plus deadlines and an exam, so the calendar has content.
        db.add(
            Lecture(
                course_id=course.id,
                title="Implementing PageRank on a small crawl",
                week=8,
                duration_s=0,
                scheduled_at=now + timedelta(days=3),
                status=ProcessingStatus.uploaded,
                published=False,
                uploaded_by=instructor.id,
            )
        )
        db.add(
            Assignment(
                course_id=course.id,
                title="Problem Set 3: Link analysis",
                description="Compute PageRank on the provided graph and write up your findings.",
                due_at=now + timedelta(days=5),
            )
        )
        db.add(
            Assignment(
                course_id=course.id,
                title="Reading response: The anatomy of a search engine",
                due_at=now + timedelta(days=9),
            )
        )
        db.add(
            Exam(
                course_id=course.id,
                title="Midterm",
                starts_at=now + timedelta(days=12),
                duration_min=90,
            )
        )
        db.commit()
    finally:
        db.close()
