from datetime import datetime

from pydantic import BaseModel


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
    published: bool

    class Config:
        from_attributes = True


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
