"""Read-only content API for licensed partners. Auth is by API key (X-API-Key); every
call is scoped to the courses the partner is licensed for and recorded in the usage meter."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import partner_context
from ..models import Course, Lecture, Partner, PartnerCourseLicense, PartnerRequest
from ..schemas import (
    PartnerCourseOut,
    PartnerLectureOut,
    PartnerTranscriptOut,
    PartnerUsageItem,
    PartnerUsageOut,
    SegmentOut,
)

router = APIRouter(prefix="/partner/v1", tags=["partner"])


def _licensed_ids(db: Session, partner: Partner) -> set[int]:
    return set(
        db.scalars(
            select(PartnerCourseLicense.course_id).where(
                PartnerCourseLicense.partner_id == partner.id
            )
        )
    )


def _course_out(course: Course) -> PartnerCourseOut:
    published = [lec for lec in course.lectures if lec.published]
    return PartnerCourseOut(
        id=course.id,
        code=course.code,
        title=course.title,
        term=course.term,
        lectures=[PartnerLectureOut.model_validate(lec) for lec in published],
    )


def _authorized_lecture(db: Session, partner: Partner, lecture_id: int) -> Lecture:
    lecture = db.get(Lecture, lecture_id)
    if lecture is None or not lecture.published:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "lecture not found")
    if lecture.course_id not in _licensed_ids(db, partner):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "this lecture is not licensed to your account"
        )
    return lecture


@router.get("/courses", response_model=list[PartnerCourseOut])
def list_courses(partner: Partner = Depends(partner_context), db: Session = Depends(get_db)):
    ids = _licensed_ids(db, partner)
    if not ids:
        return []
    courses = db.scalars(select(Course).where(Course.id.in_(ids)).order_by(Course.code))
    return [_course_out(c) for c in courses]


@router.get("/courses/{course_id}", response_model=PartnerCourseOut)
def get_course(
    course_id: int, partner: Partner = Depends(partner_context), db: Session = Depends(get_db)
):
    if course_id not in _licensed_ids(db, partner):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "this course is not licensed to your account"
        )
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "course not found")
    return _course_out(course)


@router.get("/lectures/{lecture_id}", response_model=PartnerLectureOut)
def get_lecture(
    lecture_id: int, partner: Partner = Depends(partner_context), db: Session = Depends(get_db)
):
    return PartnerLectureOut.model_validate(_authorized_lecture(db, partner, lecture_id))


@router.get("/lectures/{lecture_id}/transcript", response_model=PartnerTranscriptOut)
def get_transcript(
    lecture_id: int, partner: Partner = Depends(partner_context), db: Session = Depends(get_db)
):
    lecture = _authorized_lecture(db, partner, lecture_id)
    return PartnerTranscriptOut(
        lecture_id=lecture.id,
        title=lecture.title,
        segments=[SegmentOut.model_validate(s) for s in lecture.segments],
    )


@router.get("/usage", response_model=PartnerUsageOut)
def get_usage(partner: Partner = Depends(partner_context), db: Session = Depends(get_db)):
    total = (
        db.scalar(
            select(func.count(PartnerRequest.id)).where(PartnerRequest.partner_id == partner.id)
        )
        or 0
    )
    recent = db.scalars(
        select(PartnerRequest)
        .where(PartnerRequest.partner_id == partner.id)
        .order_by(PartnerRequest.id.desc())
        .limit(15)
    ).all()
    return PartnerUsageOut(
        partner=partner.name,
        total=total,
        recent=[PartnerUsageItem.model_validate(r) for r in recent],
    )
