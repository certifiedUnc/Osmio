from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Role(str, PyEnum):
    student = "student"
    instructor = "instructor"
    admin = "admin"


class ProcessingStatus(str, PyEnum):
    uploaded = "uploaded"
    normalizing = "normalizing"
    transcribing = "transcribing"
    review = "review"
    published = "published"
    failed = "failed"


class PartnerStatus(str, PyEnum):
    active = "active"
    suspended = "suspended"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200), default="")
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.student)
    password_hash: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(200))

    courses: Mapped[list["Course"]] = relationship(back_populates="subject")


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    term: Mapped[str] = mapped_column(String(32), default="")
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id"), nullable=True)
    instructor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    subject: Mapped["Subject | None"] = relationship(back_populates="courses")
    instructor: Mapped["User | None"] = relationship(foreign_keys=[instructor_id])
    lectures: Mapped[list["Lecture"]] = relationship(
        back_populates="course", order_by="Lecture.week"
    )
    announcements: Mapped[list["Announcement"]] = relationship(
        back_populates="course", order_by="Announcement.created_at.desc()"
    )

    @property
    def instructor_name(self) -> str | None:
        return self.instructor.full_name if self.instructor else None


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("course_id", "student_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    student: Mapped["User"] = relationship()


class Lecture(Base):
    __tablename__ = "lectures"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    title: Mapped[str] = mapped_column(String(200))
    week: Mapped[int] = mapped_column(Integer, default=1)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stream_uid: Mapped[str] = mapped_column(String(64), default="")
    duration_s: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[ProcessingStatus] = mapped_column(
        Enum(ProcessingStatus), default=ProcessingStatus.uploaded
    )
    published: Mapped[bool] = mapped_column(default=False)
    cancelled: Mapped[bool] = mapped_column(default=False)
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    # Object key of the raw upload before the pipeline runs.
    source_key: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    course: Mapped["Course"] = relationship(back_populates="lectures")
    segments: Mapped[list["TranscriptSegment"]] = relationship(
        back_populates="lecture", order_by="TranscriptSegment.start_ms", cascade="all, delete-orphan"
    )
    questions: Mapped[list["Question"]] = relationship(back_populates="lecture")


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"

    id: Mapped[int] = mapped_column(primary_key=True)
    lecture_id: Mapped[int] = mapped_column(ForeignKey("lectures.id"), index=True)
    start_ms: Mapped[int] = mapped_column(Integer)
    end_ms: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)

    lecture: Mapped["Lecture"] = relationship(back_populates="segments")


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    lecture_id: Mapped[int] = mapped_column(ForeignKey("lectures.id"), index=True)
    timestamp_ms: Mapped[int] = mapped_column(Integer)
    author: Mapped[str] = mapped_column(String(120), default="Anonymous")
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    lecture: Mapped["Lecture"] = relationship(back_populates="questions")


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    max_score: Mapped[int] = mapped_column(Integer, default=100)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Exam(Base):
    __tablename__ = "exams"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    duration_min: Mapped[int] = mapped_column(Integer, default=60)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AssignmentSubmission(Base):
    __tablename__ = "assignment_submissions"
    __table_args__ = (UniqueConstraint("assignment_id", "student_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("assignments.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    body: Mapped[str] = mapped_column(Text, default="")
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feedback: Mapped[str] = mapped_column(Text, default="")
    graded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    graded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    student: Mapped["User"] = relationship(foreign_keys=[student_id])


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    course: Mapped["Course"] = relationship(back_populates="announcements")


class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    lecture_id: Mapped[int] = mapped_column(ForeignKey("lectures.id"), index=True)
    code: Mapped[str] = mapped_column(String(12), index=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    lecture: Mapped["Lecture"] = relationship()
    records: Mapped[list["AttendanceRecord"]] = relationship(back_populates="session")


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    __table_args__ = (UniqueConstraint("session_id", "student_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("attendance_sessions.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    marked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    session: Mapped["AttendanceSession"] = relationship(back_populates="records")


class Partner(Base):
    __tablename__ = "partners"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[PartnerStatus] = mapped_column(Enum(PartnerStatus), default=PartnerStatus.active)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    api_keys: Mapped[list["PartnerApiKey"]] = relationship(back_populates="partner")
    licenses: Mapped[list["PartnerCourseLicense"]] = relationship(back_populates="partner")


class PartnerApiKey(Base):
    __tablename__ = "partner_api_keys"

    id: Mapped[int] = mapped_column(primary_key=True)
    partner_id: Mapped[int] = mapped_column(ForeignKey("partners.id"), index=True)
    label: Mapped[str] = mapped_column(String(120), default="")
    # Store a hash of the key plus a short prefix so it can be shown in a list.
    key_prefix: Mapped[str] = mapped_column(String(16))
    key_hash: Mapped[str] = mapped_column(String(200))
    revoked: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    partner: Mapped["Partner"] = relationship(back_populates="api_keys")


class PartnerCourseLicense(Base):
    __tablename__ = "partner_course_licenses"
    __table_args__ = (UniqueConstraint("partner_id", "course_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    partner_id: Mapped[int] = mapped_column(ForeignKey("partners.id"), index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)

    partner: Mapped["Partner"] = relationship(back_populates="licenses")


class PartnerRequest(Base):
    """One row per authenticated partner API call: the usage meter / billing log."""

    __tablename__ = "partner_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    partner_id: Mapped[int] = mapped_column(ForeignKey("partners.id"), index=True)
    api_key_id: Mapped[int | None] = mapped_column(
        ForeignKey("partner_api_keys.id"), nullable=True
    )
    method: Mapped[str] = mapped_column(String(8))
    path: Mapped[str] = mapped_column(String(300))
    status_code: Mapped[int] = mapped_column(Integer, default=200)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LearningEvent(Base):
    """Watch-time events: the raw signal behind the north-star (active learning minutes)."""

    __tablename__ = "learning_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
    lecture_id: Mapped[int] = mapped_column(ForeignKey("lectures.id"), index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), nullable=True)
    seconds: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
