from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import PlainTextResponse
from fpdf import FPDF
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Course, Lecture, Question
from ..schemas import CourseOut, LectureDetail, QuestionIn, QuestionOut

router = APIRouter()


def _stamp(ms: int) -> str:
    total = ms // 1000
    return f"{total // 60}:{total % 60:02d}"


def _transcript_lines(lecture: Lecture) -> list[str]:
    return [f"[{_stamp(s.start_ms)}] {s.text}" for s in lecture.segments]


@router.get("/courses", response_model=list[CourseOut])
def list_courses(db: Session = Depends(get_db)):
    return db.scalars(select(Course)).all()


@router.get("/lectures/{lecture_id}", response_model=LectureDetail)
def get_lecture(lecture_id: int, db: Session = Depends(get_db)):
    lecture = db.get(Lecture, lecture_id)
    if not lecture:
        raise HTTPException(404, "lecture not found")
    return lecture


@router.get("/lectures/{lecture_id}/transcript.txt")
def transcript_txt(lecture_id: int, db: Session = Depends(get_db)):
    lecture = db.get(Lecture, lecture_id)
    if not lecture:
        raise HTTPException(404, "lecture not found")
    body = "\n".join([lecture.title, ""] + _transcript_lines(lecture))
    return PlainTextResponse(
        body,
        headers={"Content-Disposition": f'attachment; filename="lecture-{lecture_id}-transcript.txt"'},
    )


@router.get("/lectures/{lecture_id}/transcript.pdf")
def transcript_pdf(lecture_id: int, db: Session = Depends(get_db)):
    lecture = db.get(Lecture, lecture_id)
    if not lecture:
        raise HTTPException(404, "lecture not found")

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
def list_questions(lecture_id: int, db: Session = Depends(get_db)):
    q = select(Question).where(Question.lecture_id == lecture_id).order_by(Question.timestamp_ms)
    return db.scalars(q).all()


@router.post("/lectures/{lecture_id}/questions", response_model=QuestionOut)
def ask_question(lecture_id: int, payload: QuestionIn, db: Session = Depends(get_db)):
    if not db.get(Lecture, lecture_id):
        raise HTTPException(404, "lecture not found")
    question = Question(
        lecture_id=lecture_id,
        timestamp_ms=payload.timestamp_ms,
        body=payload.body,
        author=payload.author,
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return question
