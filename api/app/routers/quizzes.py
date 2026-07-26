"""Course quizzes: instructors author multiple-choice quizzes, students take them and are
auto-graded. Correct answers are never sent to students until they submit."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import Course, Enrollment, Quiz, QuizAttempt, QuizQuestion, Role, User
from ..schemas import (
    AttemptIn,
    AttemptResult,
    QuestionResult,
    QuizDetail,
    QuizIn,
    QuizQuestionOut,
    QuizSummary,
)

router = APIRouter(tags=["quizzes"])


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


@router.get("/courses/{course_id}/quizzes", response_model=list[QuizSummary])
def list_quizzes(course_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_course_access(db, user, course_id)
    quizzes = db.scalars(
        select(Quiz).where(Quiz.course_id == course_id).order_by(Quiz.id)
    ).all()
    out = []
    for q in quizzes:
        best = None
        if user.role == Role.student:
            best = db.scalar(
                select(func.max(QuizAttempt.score)).where(
                    QuizAttempt.quiz_id == q.id, QuizAttempt.student_id == user.id
                )
            )
        out.append(
            QuizSummary(id=q.id, title=q.title, question_count=len(q.questions), total=len(q.questions), best_score=best)
        )
    return out


@router.get("/quizzes/{quiz_id}", response_model=QuizDetail)
def get_quiz(quiz_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    quiz = db.get(Quiz, quiz_id)
    if quiz is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "quiz not found")
    _require_course_access(db, user, quiz.course_id)
    return QuizDetail(
        id=quiz.id,
        title=quiz.title,
        questions=[QuizQuestionOut(id=q.id, prompt=q.prompt, options=q.options) for q in quiz.questions],
    )


@router.post("/quizzes/{quiz_id}/attempts", response_model=AttemptResult)
def submit_attempt(
    quiz_id: int,
    payload: AttemptIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    quiz = db.get(Quiz, quiz_id)
    if quiz is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "quiz not found")
    _require_course_access(db, user, quiz.course_id)
    questions = quiz.questions
    if len(payload.answers) != len(questions):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "answer count does not match the quiz")

    results = []
    score = 0
    for q, chosen in zip(questions, payload.answers):
        correct = chosen == q.correct_index
        if correct:
            score += 1
        results.append(
            QuestionResult(question_id=q.id, correct_index=q.correct_index, chosen=chosen, is_correct=correct)
        )

    db.add(QuizAttempt(quiz_id=quiz.id, student_id=user.id, score=score, total=len(questions)))
    db.commit()
    return AttemptResult(score=score, total=len(questions), results=results)


@router.post(
    "/instructor/courses/{course_id}/quizzes", response_model=QuizSummary, status_code=status.HTTP_201_CREATED
)
def create_quiz(
    course_id: int,
    payload: QuizIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    course = _require_course_access(db, user, course_id)
    if user.role not in (Role.instructor, Role.admin) or (
        user.role == Role.instructor and course.instructor_id != user.id
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the course instructor can add quizzes")
    if not payload.title.strip() or not payload.questions:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "a title and at least one question are required")

    quiz = Quiz(course_id=course_id, title=payload.title.strip())
    db.add(quiz)
    db.flush()
    for qn in payload.questions:
        opts = [o for o in qn.options if o.strip()]
        if len(opts) < 2 or not (0 <= qn.correct_index < len(opts)):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "each question needs 2+ options and a valid answer")
        db.add(
            QuizQuestion(quiz_id=quiz.id, prompt=qn.prompt.strip(), options=opts, correct_index=qn.correct_index)
        )
    db.commit()
    db.refresh(quiz)
    return QuizSummary(id=quiz.id, title=quiz.title, question_count=len(quiz.questions), total=len(quiz.questions))
