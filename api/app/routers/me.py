from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import Announcement, Course, Enrollment, Role, User
from ..schemas import AnnouncementOut, CourseOut

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
