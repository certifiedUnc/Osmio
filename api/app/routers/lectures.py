from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import PlainTextResponse
from fpdf import FPDF
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import course_access_or_403, course_is_staff, get_current_user
from ..models import Course, Lecture, Question, User
from ..schemas import CourseOut, LectureDetail, QuestionIn, QuestionOut

router = APIRouter()


def _stamp(ms: int) -> str:
    total = ms // 1000
    return f"{total // 60}:{total % 60:02d}"


def _transcript_lines(lecture: Lecture) -> list[str]:
    return [f"[{_stamp(s.start_ms)}] {s.text}" for s in lecture.segments]


def _lecture_or_403(db: Session, user: User, lecture_id: int) -> Lecture:
    """Fetch a lecture the caller may see: staff always, enrolled students only once published."""
    lecture = db.get(Lecture, lecture_id)
    if lecture is None:
        raise HTTPException(404, "lecture not found")
    course = course_access_or_403(db, user, lecture.course_id)
    if not course_is_staff(user, course) and not lecture.published:
        raise HTTPException(404, "lecture not found")
    return lecture


@router.get("/courses", response_model=list[CourseOut])
def list_courses(db: Session = Depends(get_db)):
    return db.scalars(select(Course)).all()


@router.get("/lectures/{lecture_id}", response_model=LectureDetail)
def get_lecture(
    lecture_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _lecture_or_403(db, user, lecture_id)


@router.get("/lectures/{lecture_id}/transcript.txt")
def transcript_txt(
    lecture_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lecture = _lecture_or_403(db, user, lecture_id)
    body = "\n".join([lecture.title, ""] + _transcript_lines(lecture))
    return PlainTextResponse(
        body,
        headers={"Content-Disposition": f'attachment; filename="lecture-{lecture_id}-transcript.txt"'},
    )


@router.get("/lectures/{lecture_id}/transcript.pdf")
def transcript_pdf(
    lecture_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lecture = _lecture_or_403(db, user, lecture_id)

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.multi_cell(0, 8, lecture.title, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    pdf.set_font("Helvetica", size=11)
    for line in _transcript_lines(lecture):
        # The built-in font is latin-1 only; replace anything outside it.
        safe = line.encode("latin-1", "replace").decode("latin-1")
        pdf.multi_cell(0, 6, safe, new_x="LMARGIN", new_y="NEXT")
    data = bytes(pdf.output())
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="lecture-{lecture_id}-transcript.pdf"'},
    )


@router.get("/lectures/{lecture_id}/questions", response_model=list[QuestionOut])
def list_questions(
    lecture_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _lecture_or_403(db, user, lecture_id)
    q = select(Question).where(Question.lecture_id == lecture_id).order_by(Question.timestamp_ms)
    return db.scalars(q).all()


@router.post("/lectures/{lecture_id}/questions", response_model=QuestionOut)
def ask_question(
    lecture_id: int,
    payload: QuestionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _lecture_or_403(db, user, lecture_id)
    # The author is the authenticated user, never taken from the request body.
    question = Question(
        lecture_id=lecture_id,
        timestamp_ms=payload.timestamp_ms,
        body=payload.body,
        author=user.full_name or user.email,
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return question
