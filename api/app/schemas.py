from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str

    class Config:
        from_attributes = True


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    full_name: str = ""


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class SegmentOut(BaseModel):
    start_ms: int
    end_ms: int
    text: str

    class Config:
        from_attributes = True


class QuestionOut(BaseModel):
    id: int
    timestamp_ms: int
    author: str
    body: str
    created_at: datetime

    class Config:
        from_attributes = True


class QuestionIn(BaseModel):
    timestamp_ms: int
    body: str
    author: str = "Anonymous"


class LectureSummary(BaseModel):
    id: int
    title: str
    week: int
    duration_s: int
    status: str
    published: bool

    class Config:
        from_attributes = True


class LectureCreate(BaseModel):
    course_id: int
    title: str
    week: int = 1
    duration_s: int = 0
    stream_uid: str = ""
    scheduled_at: datetime | None = None


class LectureDetail(LectureSummary):
    stream_uid: str
    segments: list[SegmentOut]


class CourseOut(BaseModel):
    id: int
    code: str
    title: str
    term: str
    instructor_name: str | None = None
    lectures: list[LectureSummary]

    class Config:
        from_attributes = True


class AnnouncementIn(BaseModel):
    title: str
    body: str


class AnnouncementOut(BaseModel):
    id: int
    title: str
    body: str
    created_at: datetime

    class Config:
        from_attributes = True


class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str = ""
    role: str


class RoleUpdate(BaseModel):
    role: str


class CourseCreate(BaseModel):
    code: str
    title: str
    term: str = ""
    subject_id: int | None = None
    instructor_id: int | None = None


class EnrollIn(BaseModel):
    course_id: int
    student_id: int


class EnrollmentOut(BaseModel):
    id: int
    course_id: int
    student_id: int
    student: UserOut

    class Config:
        from_attributes = True


class PartnerIn(BaseModel):
    name: str


class PartnerOut(BaseModel):
    id: int
    name: str
    status: str

    class Config:
        from_attributes = True


class ApiKeyIn(BaseModel):
    label: str = ""


class ApiKeyOut(BaseModel):
    id: int
    label: str
    key_prefix: str
    revoked: bool

    class Config:
        from_attributes = True


class ApiKeyCreated(ApiKeyOut):
    key: str  # full key, shown once


class LicenseIn(BaseModel):
    course_id: int


class LicenseOut(BaseModel):
    id: int
    course_id: int

    class Config:
        from_attributes = True


class AssignmentIn(BaseModel):
    title: str
    description: str = ""
    due_at: datetime


class AssignmentOut(BaseModel):
    id: int
    course_id: int
    title: str
    description: str
    due_at: datetime
    max_score: int

    class Config:
        from_attributes = True


class ExamIn(BaseModel):
    title: str
    starts_at: datetime
    duration_min: int = 60


class ExamOut(BaseModel):
    id: int
    course_id: int
    title: str
    starts_at: datetime
    duration_min: int

    class Config:
        from_attributes = True


class CalendarEvent(BaseModel):
    type: str  # lecture | assignment | exam
    id: int
    title: str
    at: datetime
    end: datetime | None = None  # lectures/exams; assignments are deadlines (no end)
    course_id: int
    course_code: str
    link: str | None = None
    cancelled: bool = False


class LectureUpdate(BaseModel):
    scheduled_at: datetime | None = None
    cancelled: bool | None = None


class AssignmentUpdate(BaseModel):
    title: str | None = None
    due_at: datetime | None = None


class ExamUpdate(BaseModel):
    title: str | None = None
    starts_at: datetime | None = None


class SubmissionIn(BaseModel):
    body: str


class SubmissionOut(BaseModel):
    id: int
    assignment_id: int
    student_id: int
    student: UserOut
    body: str
    submitted_at: datetime
    score: int | None
    feedback: str
    graded_at: datetime | None

    class Config:
        from_attributes = True


class GradeIn(BaseModel):
    score: int
    feedback: str = ""


class StudentAssignmentOut(BaseModel):
    id: int
    course_id: int
    title: str
    description: str
    due_at: datetime
    max_score: int
    submission: SubmissionOut | None = None


class AttendanceSessionOut(BaseModel):
    id: int
    lecture_id: int
    code: str
    expires_at: datetime

    class Config:
        from_attributes = True


class AttendanceMarkIn(BaseModel):
    code: str


class AttendanceMarkOut(BaseModel):
    lecture_title: str


class RosterStudent(BaseModel):
    id: int
    full_name: str
    email: str
    present: bool


class AttendanceRosterOut(BaseModel):
    id: int
    lecture_id: int
    code: str
    expires_at: datetime
    students: list[RosterStudent]


# --- Partner content API (read-only, API-key auth) ---
class PartnerLectureOut(BaseModel):
    id: int
    title: str
    week: int
    duration_s: int

    class Config:
        from_attributes = True


class PartnerCourseOut(BaseModel):
    id: int
    code: str
    title: str
    term: str
    lectures: list[PartnerLectureOut]


class PartnerTranscriptOut(BaseModel):
    lecture_id: int
    title: str
    segments: list[SegmentOut]


class PartnerUsageItem(BaseModel):
    method: str
    path: str
    status_code: int
    created_at: datetime

    class Config:
        from_attributes = True


class PartnerUsageOut(BaseModel):
    partner: str
    total: int
    recent: list[PartnerUsageItem]


class PartnerDailyUsage(BaseModel):
    date: str
    count: int
