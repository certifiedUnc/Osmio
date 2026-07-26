"""Course discussion forum: threads and replies, visible to the people on a course
(enrolled students, the course instructor, admins)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import Course, DiscussionReply, DiscussionThread, Enrollment, Role, User
from ..schemas import ReplyIn, ReplyOut, ThreadDetail, ThreadIn, ThreadSummary

router = APIRouter(tags=["discussions"])


def _require_course_access(db: Session, user: User, course_id: int) -> Course:
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "course not found")
    if user.role == Role.admin:
        return course
    if user.role == Role.instructor and course.instructor_id == user.id:
        return course
    if user.role == Role.student:
        enrolled = db.scalar(
            select(Enrollment).where(
                Enrollment.course_id == course_id, Enrollment.student_id == user.id
            )
        )
        if enrolled:
            return course
    raise HTTPException(status.HTTP_403_FORBIDDEN, "you do not have access to this course")


def _name(u: User | None) -> str:
    return (u.full_name or u.email) if u else "Unknown"


def _detail(thread: DiscussionThread) -> ThreadDetail:
    return ThreadDetail(
        id=thread.id,
        title=thread.title,
        body=thread.body,
        author=_name(thread.author),
        created_at=thread.created_at,
        replies=[
            ReplyOut(id=r.id, author=_name(r.author), body=r.body, created_at=r.created_at)
            for r in thread.replies
        ],
    )


@router.get("/courses/{course_id}/threads", response_model=list[ThreadSummary])
def list_threads(course_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_course_access(db, user, course_id)
    threads = db.scalars(
        select(DiscussionThread)
        .where(DiscussionThread.course_id == course_id)
        .order_by(DiscussionThread.created_at.desc())
    ).all()
    return [
        ThreadSummary(
            id=t.id,
            title=t.title,
            author=_name(t.author),
            reply_count=len(t.replies),
            created_at=t.created_at,
        )
        for t in threads
    ]


@router.post(
    "/courses/{course_id}/threads", response_model=ThreadDetail, status_code=status.HTTP_201_CREATED
)
def create_thread(
    course_id: int,
    payload: ThreadIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_course_access(db, user, course_id)
    if not payload.title.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "a title is required")
    thread = DiscussionThread(
        course_id=course_id,
        author_id=user.id,
        title=payload.title.strip(),
        body=payload.body.strip(),
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return _detail(thread)


@router.get("/threads/{thread_id}", response_model=ThreadDetail)
def get_thread(thread_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    thread = db.get(DiscussionThread, thread_id)
    if thread is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "thread not found")
    _require_course_access(db, user, thread.course_id)
    return _detail(thread)


@router.post(
    "/threads/{thread_id}/replies", response_model=ThreadDetail, status_code=status.HTTP_201_CREATED
)
def add_reply(
    thread_id: int,
    payload: ReplyIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    thread = db.get(DiscussionThread, thread_id)
    if thread is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "thread not found")
    _require_course_access(db, user, thread.course_id)
    if not payload.body.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "a reply body is required")
    db.add(DiscussionReply(thread_id=thread_id, author_id=user.id, body=payload.body.strip()))
    db.commit()
    db.refresh(thread)
    return _detail(thread)
