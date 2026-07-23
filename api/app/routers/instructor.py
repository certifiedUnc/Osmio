from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import require_role
from ..models import Announcement, Course, Lecture, ProcessingStatus, Role, User
from ..pipeline import run_pipeline
from ..schemas import AnnouncementIn, AnnouncementOut, CourseOut, LectureCreate, LectureSummary

router = APIRouter(prefix="/instructor", tags=["instructor"])


def _course_owned(db: Session, course_id: int, user: User) -> Course:
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "course not found")
    if user.role != Role.admin and course.instructor_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not your course")
    return course


@router.get("/courses", response_model=list[CourseOut])
def my_courses(
    user: User = Depends(require_role(Role.instructor, Role.admin)),
    db: Session = Depends(get_db),
):
    stmt = select(Course)
    if user.role != Role.admin:
        stmt = stmt.where(Course.instructor_id == user.id)
    return db.scalars(stmt).all()


@router.post("/lectures", response_model=LectureSummary)
def create_lecture(
    payload: LectureCreate,
    user: User = Depends(require_role(Role.instructor, Role.admin)),
    db: Session = Depends(get_db),
):
    _course_owned(db, payload.course_id, user)
    lecture = Lecture(
        course_id=payload.course_id,
        title=payload.title,
        week=payload.week,
        duration_s=payload.duration_s,
        stream_uid=payload.stream_uid,
        uploaded_by=user.id,
        status=ProcessingStatus.uploaded,
    )
    db.add(lecture)
    db.commit()
    db.refresh(lecture)
    return lecture


@router.post("/lectures/{lecture_id}/process", response_model=LectureSummary)
def process_lecture(
    lecture_id: int,
    background: BackgroundTasks,
    user: User = Depends(require_role(Role.instructor, Role.admin)),
    db: Session = Depends(get_db),
):
    lecture = db.get(Lecture, lecture_id)
    if lecture is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "lecture not found")
    _course_owned(db, lecture.course_id, user)

    lecture.status = ProcessingStatus.uploaded
    lecture.published = False
    db.commit()
    db.refresh(lecture)

    background.add_task(run_pipeline, lecture.id)
    return lecture


@router.post(
    "/courses/{course_id}/announcements",
    response_model=AnnouncementOut,
    status_code=status.HTTP_201_CREATED,
)
def post_announcement(
    course_id: int,
    payload: AnnouncementIn,
    user: User = Depends(require_role(Role.instructor, Role.admin)),
    db: Session = Depends(get_db),
):
    _course_owned(db, course_id, user)
    announcement = Announcement(
        course_id=course_id, author_id=user.id, title=payload.title, body=payload.body
    )
    db.add(announcement)
    db.commit()
    db.refresh(announcement)
    return announcement
