from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Course, Lecture, Question
from ..schemas import CourseOut, LectureDetail, QuestionIn, QuestionOut

router = APIRouter()


@router.get("/courses", response_model=list[CourseOut])
def list_courses(db: Session = Depends(get_db)):
    return db.scalars(select(Course)).all()


@router.get("/lectures/{lecture_id}", response_model=LectureDetail)
def get_lecture(lecture_id: int, db: Session = Depends(get_db)):
    lecture = db.get(Lecture, lecture_id)
    if not lecture:
        raise HTTPException(404, "lecture not found")
    return lecture


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
