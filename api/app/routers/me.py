from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import Announcement, Assignment, Course, Enrollment, Exam, Lecture, Role, User
from ..schemas import AnnouncementOut, CalendarEvent, CourseOut

router = APIRouter(tags=["me"])


@router.get("/me/courses", response_model=list[CourseOut])
def my_courses(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role == Role.student:
        course_ids = db.scalars(
            select(Enrollment.course_id).where(Enrollment.student_id == user.id)
        ).all()
        if not course_ids:
            return []
        return db.scalars(select(Course).where(Course.id.in_(course_ids))).all()
    if user.role == Role.instructor:
        return db.scalars(select(Course).where(Course.instructor_id == user.id)).all()
    return db.scalars(select(Course)).all()


@router.get("/me/calendar", response_model=list[CalendarEvent])
def my_calendar(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role == Role.student:
        course_ids = list(
            db.scalars(select(Enrollment.course_id).where(Enrollment.student_id == user.id))
        )
    elif user.role == Role.instructor:
        course_ids = list(db.scalars(select(Course.id).where(Course.instructor_id == user.id)))
    else:
        course_ids = list(db.scalars(select(Course.id)))
    if not course_ids:
        return []

    codes = dict(db.execute(select(Course.id, Course.code).where(Course.id.in_(course_ids))).all())
    events: list[CalendarEvent] = []

    lectures = db.scalars(
        select(Lecture).where(Lecture.course_id.in_(course_ids), Lecture.scheduled_at.is_not(None))
    )
    for lec in lectures:
        events.append(
            CalendarEvent(
                type="lecture",
                id=lec.id,
                title=lec.title,
                at=lec.scheduled_at,
                course_id=lec.course_id,
                course_code=codes.get(lec.course_id, ""),
                link=f"/lectures/{lec.id}" if lec.published else None,
                cancelled=lec.cancelled,
            )
        )
    for a in db.scalars(select(Assignment).where(Assignment.course_id.in_(course_ids))):
        events.append(
            CalendarEvent(
                type="assignment",
                id=a.id,
                title=a.title,
                at=a.due_at,
                course_id=a.course_id,
                course_code=codes.get(a.course_id, ""),
            )
        )
    for e in db.scalars(select(Exam).where(Exam.course_id.in_(course_ids))):
        events.append(
            CalendarEvent(
                type="exam",
                id=e.id,
                title=e.title,
                at=e.starts_at,
                course_id=e.course_id,
                course_code=codes.get(e.course_id, ""),
            )
        )

    events.sort(key=lambda ev: ev.at)
    return events


@router.get("/courses/{course_id}/announcements", response_model=list[AnnouncementOut])
def course_announcements(
    course_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(Announcement)
        .where(Announcement.course_id == course_id)
        .order_by(Announcement.created_at.desc())
    ).all()
