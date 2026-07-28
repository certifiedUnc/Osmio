import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..deps import get_current_user
from ..models import (
    Announcement,
    Assignment,
    AssignmentSubmission,
    AttendanceRecord,
    AttendanceSession,
    Course,
    Enrollment,
    Exam,
    Lecture,
    LearningEvent,
    Role,
    SubmissionFile,
    User,
)
from ..schemas import (
    AnnouncementOut,
    AssignmentOut,
    AttendanceMarkIn,
    AttendanceMarkOut,
    CalendarEvent,
    CourseOut,
    EventIn,
    StudentAssignmentOut,
    SubmissionFileOut,
    SubmissionIn,
    SubmissionOut,
)

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
                end=lec.scheduled_at + timedelta(minutes=50),
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
                end=e.starts_at + timedelta(minutes=e.duration_min or 60),
                course_id=e.course_id,
                course_code=codes.get(e.course_id, ""),
            )
        )

    events.sort(key=lambda ev: ev.at)
    return events


@router.post("/me/events", status_code=status.HTTP_204_NO_CONTENT)
def record_event(
    payload: EventIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """A watch-time heartbeat from the player. Seconds are capped so seeking or a stuck
    tab cannot inflate the meter."""
    lecture = db.get(Lecture, payload.lecture_id)
    if lecture is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "lecture not found")
    seconds = max(0, min(payload.seconds, 120))
    if seconds == 0:
        return
    db.add(
        LearningEvent(
            user_id=user.id,
            lecture_id=lecture.id,
            course_id=lecture.course_id,
            seconds=seconds,
        )
    )
    db.commit()


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


@router.get("/courses/{course_id}/assignments", response_model=list[AssignmentOut])
def course_assignments(
    course_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(Assignment).where(Assignment.course_id == course_id).order_by(Assignment.due_at)
    ).all()


@router.get("/me/assignments", response_model=list[StudentAssignmentOut])
def my_assignments(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    course_ids = list(
        db.scalars(select(Enrollment.course_id).where(Enrollment.student_id == user.id))
    )
    if not course_ids:
        return []
    assignments = db.scalars(
        select(Assignment).where(Assignment.course_id.in_(course_ids)).order_by(Assignment.due_at)
    ).all()
    subs = {
        s.assignment_id: s
        for s in db.scalars(
            select(AssignmentSubmission).where(AssignmentSubmission.student_id == user.id)
        )
    }
    return [
        StudentAssignmentOut(
            id=a.id,
            course_id=a.course_id,
            title=a.title,
            description=a.description,
            due_at=a.due_at,
            max_score=a.max_score,
            submission=SubmissionOut.model_validate(subs[a.id]) if a.id in subs else None,
        )
        for a in assignments
    ]


@router.post("/assignments/{assignment_id}/submissions", response_model=SubmissionOut)
def submit_assignment(
    assignment_id: int,
    payload: SubmissionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assignment = db.get(Assignment, assignment_id)
    if assignment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "assignment not found")
    enrolled = db.scalar(
        select(Enrollment).where(
            Enrollment.course_id == assignment.course_id,
            Enrollment.student_id == user.id,
        )
    )
    if user.role != Role.student or enrolled is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not enrolled in this course")

    submission = db.scalar(
        select(AssignmentSubmission).where(
            AssignmentSubmission.assignment_id == assignment_id,
            AssignmentSubmission.student_id == user.id,
        )
    )
    if submission is None:
        submission = AssignmentSubmission(
            assignment_id=assignment_id, student_id=user.id, body=payload.body
        )
        db.add(submission)
    else:
        # A resubmission replaces the text and clears any prior grade.
        submission.body = payload.body
        submission.score = None
        submission.feedback = ""
        submission.graded_at = None
        submission.graded_by = None
    db.commit()
    db.refresh(submission)
    return submission


@router.post(
    "/assignments/{assignment_id}/files",
    response_model=SubmissionFileOut,
    status_code=status.HTTP_201_CREATED,
)
def upload_submission_file(
    assignment_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assignment = db.get(Assignment, assignment_id)
    if assignment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "assignment not found")
    enrolled = db.scalar(
        select(Enrollment).where(
            Enrollment.course_id == assignment.course_id, Enrollment.student_id == user.id
        )
    )
    if user.role != Role.student or enrolled is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not enrolled in this course")

    contents = file.file.read()
    if not contents:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "the file is empty")
    if len(contents) > settings.max_upload_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "file exceeds 25 MB")

    # A submission holds the files; create an empty one on the first upload.
    submission = db.scalar(
        select(AssignmentSubmission).where(
            AssignmentSubmission.assignment_id == assignment_id,
            AssignmentSubmission.student_id == user.id,
        )
    )
    if submission is None:
        submission = AssignmentSubmission(assignment_id=assignment_id, student_id=user.id, body="")
        db.add(submission)
        db.flush()

    os.makedirs(settings.upload_dir, exist_ok=True)
    key = uuid.uuid4().hex
    with open(os.path.join(settings.upload_dir, key), "wb") as out:
        out.write(contents)

    record = SubmissionFile(
        submission_id=submission.id,
        filename=file.filename or "upload",
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(contents),
        storage_key=key,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def _submission_file_or_403(db: Session, user: User, file_id: int) -> SubmissionFile:
    record = db.get(SubmissionFile, file_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "file not found")
    submission = db.get(AssignmentSubmission, record.submission_id)
    assignment = db.get(Assignment, submission.assignment_id)
    course = db.get(Course, assignment.course_id)
    is_owner = user.id == submission.student_id
    is_staff = user.role == Role.admin or (
        user.role == Role.instructor and course is not None and course.instructor_id == user.id
    )
    if not (is_owner or is_staff):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "you cannot access this file")
    return record


@router.get("/submission-files/{file_id}")
def download_submission_file(
    file_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    record = _submission_file_or_403(db, user, file_id)
    path = os.path.join(settings.upload_dir, record.storage_key)
    if not os.path.exists(path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "stored file is missing")
    return FileResponse(path, media_type=record.content_type, filename=record.filename)


@router.delete("/submission-files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_submission_file(
    file_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    record = db.get(SubmissionFile, file_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "file not found")
    submission = db.get(AssignmentSubmission, record.submission_id)
    if user.id != submission.student_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "you can only remove your own files")
    try:
        os.remove(os.path.join(settings.upload_dir, record.storage_key))
    except FileNotFoundError:
        pass
    db.delete(record)
    db.commit()


@router.post("/attendance/mark", response_model=AttendanceMarkOut)
def mark_attendance(
    payload: AttendanceMarkIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    code = payload.code.strip().upper()
    session = db.scalar(
        select(AttendanceSession)
        .where(AttendanceSession.code == code)
        .order_by(AttendanceSession.id.desc())
    )
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "invalid code")
    if session.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "this code has expired")

    lecture = db.get(Lecture, session.lecture_id)
    enrolled = db.scalar(
        select(Enrollment).where(
            Enrollment.course_id == lecture.course_id,
            Enrollment.student_id == user.id,
        )
    )
    if user.role != Role.student or enrolled is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not enrolled in this course")

    existing = db.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.session_id == session.id,
            AttendanceRecord.student_id == user.id,
        )
    )
    if existing is None:
        db.add(AttendanceRecord(session_id=session.id, student_id=user.id))
        db.commit()
    return AttendanceMarkOut(lecture_title=lecture.title)
