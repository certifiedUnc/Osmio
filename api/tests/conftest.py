"""Test harness. Runs the app against an in-memory SQLite database with a small seeded
dataset, so the suite needs no live Postgres."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  (register all tables on Base.metadata)
from app.db import Base, get_db
from app.main import app
from app.models import (
    Course,
    Enrollment,
    Lecture,
    Partner,
    PartnerApiKey,
    PartnerCourseLicense,
    ProcessingStatus,
    Quiz,
    QuizQuestion,
    Role,
    User,
)
from app.security import hash_api_key, hash_password

TEST_KEY = "osk_test_key_abcdef"
PW = "password"


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def ids(db):
    """Seed a baseline and return the ids tests need."""
    users = {
        "admin": User(email="admin@t.dev", full_name="Admin", role=Role.admin, password_hash=hash_password(PW)),
        "instructor": User(email="instr@t.dev", full_name="Prof Test", role=Role.instructor, password_hash=hash_password(PW)),
        "student": User(email="stu@t.dev", full_name="Stu Dent", role=Role.student, password_hash=hash_password(PW)),
        "outsider": User(email="out@t.dev", full_name="Out Sider", role=Role.student, password_hash=hash_password(PW)),
    }
    db.add_all(users.values())
    db.flush()

    course = Course(code="CS1", title="Course One", term="2026", instructor_id=users["instructor"].id)
    course2 = Course(code="CS2", title="Course Two", term="2026", instructor_id=users["instructor"].id)
    db.add_all([course, course2])
    db.flush()
    db.add(Enrollment(course_id=course.id, student_id=users["student"].id))
    lecture = Lecture(
        course_id=course.id, title="Lecture One", week=1, duration_s=60,
        status=ProcessingStatus.published, published=True,
    )
    db.add(lecture)

    partner = Partner(name="TestCo")
    db.add(partner)
    db.flush()
    db.add(PartnerApiKey(partner_id=partner.id, label="k", key_prefix=TEST_KEY[:12], key_hash=hash_api_key(TEST_KEY)))
    db.add(PartnerCourseLicense(partner_id=partner.id, course_id=course.id))  # licensed for CS1 only

    quiz = Quiz(course_id=course.id, title="Quiz One")
    db.add(quiz)
    db.flush()
    db.add(QuizQuestion(quiz_id=quiz.id, prompt="2 + 2 = ?", options=["3", "4", "5"], correct_index=1))
    db.commit()

    return {
        "course": course.id,
        "course2": course2.id,
        "lecture": lecture.id,
        "quiz": quiz.id,
        "partner": partner.id,
    }


@pytest.fixture()
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


def _token(client, email):
    resp = client.post("/auth/login", json={"email": email, "password": PW})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest.fixture()
def student_token(client, ids):
    return _token(client, "stu@t.dev")


@pytest.fixture()
def instructor_token(client, ids):
    return _token(client, "instr@t.dev")


def auth(token):
    return {"Authorization": f"Bearer {token}"}
