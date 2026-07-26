"""Seed demo accounts + one course/lecture so the app has something to show on a fresh DB.

Demo logins (all password "password"): admin@osmio.dev, instructor@osmio.dev, student@osmio.dev.
The transcript below is a stand-in; the real one comes from the pipeline (Groq).
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from .db import SessionLocal
from .models import (
    Announcement,
    Assignment,
    AssignmentSubmission,
    Course,
    Enrollment,
    Exam,
    Lecture,
    Partner,
    PartnerApiKey,
    PartnerCourseLicense,
    ProcessingStatus,
    Role,
    Subject,
    TranscriptSegment,
    User,
)
from .security import hash_api_key, hash_password

# A fixed key so the partner demo works on a fresh database. In production keys are random
# and shown once; this one is only for the local funding demo.
DEMO_PARTNER_KEY = "osk_demo_partner_2026"

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

        def at(days: int, hour: int, minute: int = 0) -> datetime:
            return (now + timedelta(days=days)).replace(
                hour=hour, minute=minute, second=0, microsecond=0
            )

        lecture = Lecture(
            course_id=course.id,
            title="Ranking pages with PageRank",
            week=7,
            duration_s=67,
            scheduled_at=at(-2, 10),
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
                scheduled_at=at(3, 10),
                status=ProcessingStatus.uploaded,
                published=False,
                uploaded_by=instructor.id,
            )
        )
        ps3 = Assignment(
            course_id=course.id,
            title="Problem Set 3: Link analysis",
            description="Compute PageRank on the provided graph and write up your findings.",
            due_at=at(5, 23, 59),
        )
        db.add(ps3)
        db.flush()
        db.add(
            AssignmentSubmission(
                assignment_id=ps3.id,
                student_id=student.id,
                body="My writeup: I implemented power iteration; it converged after 18 steps with damping 0.85.",
            )
        )
        db.add(
            Assignment(
                course_id=course.id,
                title="Reading response: The anatomy of a search engine",
                due_at=at(9, 23, 59),
            )
        )
        db.add(
            Exam(
                course_id=course.id,
                title="Midterm",
                starts_at=at(12, 9),
                duration_min=90,
            )
        )

        db.add_all(
            [
                Announcement(course_id=course.id, author_id=instructor.id, title="Problem set 3 posted, due next week", body="Details are on the assignments page."),
                Announcement(course_id=course.id, author_id=instructor.id, title="Guest lecture moved to Thursday", body="A guest speaker will cover ranking systems in industry."),
            ]
        )

        # A couple more enrolled courses so the dashboard has breadth.
        stat = Course(code="STAT210", title="Applied Statistics", term="2026-Autumn", instructor_id=instructor.id)
        hist = Course(code="HIST140", title="Modern World History", term="2026-Autumn", instructor_id=instructor.id)
        db.add_all([stat, hist])
        db.flush()
        db.add_all(
            [
                Enrollment(course_id=stat.id, student_id=student.id),
                Enrollment(course_id=hist.id, student_id=student.id),
                Lecture(course_id=stat.id, title="Hypothesis testing in practice", week=7, duration_s=2460, scheduled_at=at(-1, 11), status=ProcessingStatus.published, published=True, uploaded_by=instructor.id),
                Lecture(course_id=hist.id, title="The interwar period", week=7, duration_s=3300, scheduled_at=at(-1, 14), status=ProcessingStatus.published, published=True, uploaded_by=instructor.id),
                Announcement(course_id=stat.id, author_id=instructor.id, title="Midterm project proposal guidelines", body="Proposals are due in two weeks."),
                Assignment(course_id=stat.id, title="Midterm project proposal", due_at=at(6, 23, 59)),
                Assignment(course_id=hist.id, title="Reading response 4", due_at=at(7, 23, 59)),
            ]
        )

        # A demo licensing partner: an external app that pulls CS305 through the content API.
        partner = Partner(name="Northwind Learning")
        db.add(partner)
        db.flush()
        db.add(
            PartnerApiKey(
                partner_id=partner.id,
                label="Demo sandbox key",
                key_prefix=DEMO_PARTNER_KEY[:12],
                key_hash=hash_api_key(DEMO_PARTNER_KEY),
            )
        )
        # Licensed for CS305 only, so the per-course scoping is visible in the demo.
        db.add(PartnerCourseLicense(partner_id=partner.id, course_id=course.id))

        db.commit()
    finally:
        db.close()
