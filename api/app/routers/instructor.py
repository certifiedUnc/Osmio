from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import require_role
from ..models import (
    Announcement,
    Assignment,
    AssignmentSubmission,
    Course,
    Exam,
    Lecture,
    ProcessingStatus,
    Role,
    User,
)
from ..pipeline import run_pipeline
from ..schemas import (
    AnnouncementIn,
    AnnouncementOut,
    AssignmentIn,
    AssignmentOut,
    AssignmentUpdate,
    CourseOut,
    ExamIn,
    ExamOut,
    ExamUpdate,
    GradeIn,
    LectureCreate,
    LectureSummary,
    LectureUpdate,
    SubmissionOut,
)

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
        scheduled_at=payload.scheduled_at,
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


@router.post(
    "/courses/{course_id}/assignments",
    response_model=AssignmentOut,
    status_code=status.HTTP_201_CREATED,
)
def create_assignment(
    course_id: int,
    payload: AssignmentIn,
    user: User = Depends(require_role(Role.instructor, Role.admin)),
    db: Session = Depends(get_db),
):
    _course_owned(db, course_id, user)
    assignment = Assignment(
        course_id=course_id,
        title=payload.title,
        description=payload.description,
        due_at=payload.due_at,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.post(
    "/courses/{course_id}/exams",
    response_model=ExamOut,
    status_code=status.HTTP_201_CREATED,
)
def create_exam(
    course_id: int,
    payload: ExamIn,
    user: User = Depends(require_role(Role.instructor, Role.admin)),
    db: Session = Depends(get_db),
):
    _course_owned(db, course_id, user)
    exam = Exam(
        course_id=course_id,
        title=payload.title,
        starts_at=payload.starts_at,
        duration_min=payload.duration_min,
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam


def _owned_or_404(db: Session, obj, user: User):
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
    _course_owned(db, obj.course_id, user)
    return obj


@router.patch("/lectures/{lecture_id}", response_model=LectureSummary)
def update_lecture(
    lecture_id: int,
    payload: LectureUpdate,
    user: User = Depends(require_role(Role.instructor, Role.admin)),
    db: Session = Depends(get_db),
):
    lecture = _owned_or_404(db, db.get(Lecture, lecture_id), user)
    if payload.scheduled_at is not None:
        lecture.scheduled_at = payload.scheduled_at
    if payload.cancelled is not None:
        lecture.cancelled = payload.cancelled
    db.commit()
    db.refresh(lecture)
    return lecture


@router.patch("/assignments/{assignment_id}", response_model=AssignmentOut)
def update_assignment(
    assignment_id: int,
    payload: AssignmentUpdate,
    user: User = Depends(require_role(Role.instructor, Role.admin)),
    db: Session = Depends(get_db),
):
    assignment = _owned_or_404(db, db.get(Assignment, assignment_id), user)
    if payload.title is not None:
        assignment.title = payload.title
    if payload.due_at is not None:
        assignment.due_at = payload.due_at
    db.commit()
    db.refresh(assignment)
    return assignment


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment(
    assignment_id: int,
    user: User = Depends(require_role(Role.instructor, Role.admin)),
    db: Session = Depends(get_db),
):
    assignment = _owned_or_404(db, db.get(Assignment, assignment_id), user)
    db.delete(assignment)
    db.commit()


@router.patch("/exams/{exam_id}", response_model=ExamOut)
def update_exam(
    exam_id: int,
    payload: ExamUpdate,
    user: User = Depends(require_role(Role.instructor, Role.admin)),
    db: Session = Depends(get_db),
):
    exam = _owned_or_404(db, db.get(Exam, exam_id), user)
    if payload.title is not None:
        exam.title = payload.title
    if payload.starts_at is not None:
        exam.starts_at = payload.starts_at
    db.commit()
    db.refresh(exam)
    return exam


@router.delete("/exams/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exam(
    exam_id: int,
    user: User = Depends(require_role(Role.instructor, Role.admin)),
    db: Session = Depends(get_db),
):
    exam = _owned_or_404(db, db.get(Exam, exam_id), user)
    db.delete(exam)
    db.commit()


@router.get("/assignments/{assignment_id}/submissions", response_model=list[SubmissionOut])
def list_submissions(
    assignment_id: int,
    user: User = Depends(require_role(Role.instructor, Role.admin)),
    db: Session = Depends(get_db),
):
    assignment = _owned_or_404(db, db.get(Assignment, assignment_id), user)
    return db.scalars(
        select(AssignmentSubmission)
        .where(AssignmentSubmission.assignment_id == assignment.id)
        .order_by(AssignmentSubmission.submitted_at)
    ).all()


@router.post("/submissions/{submission_id}/grade", response_model=SubmissionOut)
def grade_submission(
    submission_id: int,
    payload: GradeIn,
    user: User = Depends(require_role(Role.instructor, Role.admin)),
    db: Session = Depends(get_db),
):
    submission = db.get(AssignmentSubmission, submission_id)
    if submission is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "submission not found")
    _owned_or_404(db, db.get(Assignment, submission.assignment_id), user)
    submission.score = payload.score
    submission.feedback = payload.feedback
    submission.graded_by = user.id
    submission.graded_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(submission)
    return submission
