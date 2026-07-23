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


class LectureDetail(LectureSummary):
    stream_uid: str
    segments: list[SegmentOut]


class CourseOut(BaseModel):
    id: int
    code: str
    title: str
    term: str
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
