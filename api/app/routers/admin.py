from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import require_role
from ..models import (
    Course,
    Enrollment,
    Lecture,
    LearningEvent,
    Partner,
    PartnerApiKey,
    PartnerCourseLicense,
    PartnerRequest,
    Role,
    User,
)
from ..schemas import (
    AdminUserCreate,
    AnalyticsOut,
    ApiKeyCreated,
    ApiKeyIn,
    ApiKeyOut,
    CourseCreate,
    CourseOut,
    EnrollIn,
    EnrollmentOut,
    LicenseIn,
    LicenseOut,
    PartnerIn,
    PartnerOut,
    PartnerUsageItem,
    PartnerUsageOut,
    RoleUpdate,
    TopLecture,
    UserOut,
)
from ..security import generate_api_key, hash_api_key, hash_password

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_role(Role.admin))])


def _role(value: str) -> Role:
    try:
        return Role(value)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid role")


# --- Users ---
@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)):
    return db.scalars(select(User).order_by(User.id)).all()


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: AdminUserCreate, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "email already registered")
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        role=_role(payload.role),
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def set_role(user_id: int, payload: RoleUpdate, db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    user.role = _role(payload.role)
    db.commit()
    db.refresh(user)
    return user


# --- Courses ---
@router.get("/courses", response_model=list[CourseOut])
def list_courses(db: Session = Depends(get_db)):
    return db.scalars(select(Course).order_by(Course.id)).all()


@router.post("/courses", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_course(payload: CourseCreate, db: Session = Depends(get_db)):
    if db.scalar(select(Course).where(Course.code == payload.code)):
        raise HTTPException(status.HTTP_409_CONFLICT, "course code already exists")
    course = Course(
        code=payload.code,
        title=payload.title,
        term=payload.term,
        subject_id=payload.subject_id,
        instructor_id=payload.instructor_id,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


# --- Enrollment ---
@router.get("/courses/{course_id}/enrollments", response_model=list[EnrollmentOut])
def list_enrollments(course_id: int, db: Session = Depends(get_db)):
    return db.scalars(select(Enrollment).where(Enrollment.course_id == course_id)).all()


@router.post("/enrollments", response_model=EnrollmentOut, status_code=status.HTTP_201_CREATED)
def enroll(payload: EnrollIn, db: Session = Depends(get_db)):
    student = db.get(User, payload.student_id)
    if student is None or student.role != Role.student:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "not a student")
    if db.get(Course, payload.course_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "course not found")
    existing = db.scalar(
        select(Enrollment).where(
            Enrollment.course_id == payload.course_id,
            Enrollment.student_id == payload.student_id,
        )
    )
    if existing:
        return existing
    enrollment = Enrollment(course_id=payload.course_id, student_id=payload.student_id)
    db.add(enrollment)
    db.commit()
    db.refresh(enrollment)
    return enrollment


@router.delete("/enrollments/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT)
def unenroll(enrollment_id: int, db: Session = Depends(get_db)):
    enrollment = db.get(Enrollment, enrollment_id)
    if enrollment is not None:
        db.delete(enrollment)
        db.commit()


# --- Partners, keys, licenses ---
@router.get("/partners", response_model=list[PartnerOut])
def list_partners(db: Session = Depends(get_db)):
    return db.scalars(select(Partner).order_by(Partner.id)).all()


@router.post("/partners", response_model=PartnerOut, status_code=status.HTTP_201_CREATED)
def create_partner(payload: PartnerIn, db: Session = Depends(get_db)):
    partner = Partner(name=payload.name)
    db.add(partner)
    db.commit()
    db.refresh(partner)
    return partner


@router.get("/partners/{partner_id}/keys", response_model=list[ApiKeyOut])
def list_keys(partner_id: int, db: Session = Depends(get_db)):
    return db.scalars(select(PartnerApiKey).where(PartnerApiKey.partner_id == partner_id)).all()


@router.post("/partners/{partner_id}/keys", response_model=ApiKeyCreated, status_code=201)
def create_key(partner_id: int, payload: ApiKeyIn, db: Session = Depends(get_db)):
    if db.get(Partner, partner_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "partner not found")
    raw = generate_api_key()
    key = PartnerApiKey(
        partner_id=partner_id,
        label=payload.label,
        key_prefix=raw[:12],
        key_hash=hash_api_key(raw),
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    # The raw key is returned exactly once; only the hash is stored.
    return ApiKeyCreated(
        id=key.id, label=key.label, key_prefix=key.key_prefix, revoked=key.revoked, key=raw
    )


@router.post("/partners/{partner_id}/keys/{key_id}/revoke", response_model=ApiKeyOut)
def revoke_key(partner_id: int, key_id: int, db: Session = Depends(get_db)):
    key = db.get(PartnerApiKey, key_id)
    if key is None or key.partner_id != partner_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "key not found")
    key.revoked = True
    db.commit()
    db.refresh(key)
    return key


@router.get("/partners/{partner_id}/licenses", response_model=list[LicenseOut])
def list_licenses(partner_id: int, db: Session = Depends(get_db)):
    return db.scalars(
        select(PartnerCourseLicense).where(PartnerCourseLicense.partner_id == partner_id)
    ).all()


@router.post("/partners/{partner_id}/licenses", response_model=LicenseOut, status_code=201)
def grant_license(partner_id: int, payload: LicenseIn, db: Session = Depends(get_db)):
    if db.get(Partner, partner_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "partner not found")
    if db.get(Course, payload.course_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "course not found")
    existing = db.scalar(
        select(PartnerCourseLicense).where(
            PartnerCourseLicense.partner_id == partner_id,
            PartnerCourseLicense.course_id == payload.course_id,
        )
    )
    if existing:
        return existing
    lic = PartnerCourseLicense(partner_id=partner_id, course_id=payload.course_id)
    db.add(lic)
    db.commit()
    db.refresh(lic)
    return lic


@router.get("/analytics", response_model=AnalyticsOut)
def analytics(db: Session = Depends(get_db)):
    """North-star dashboard: weekly active learning minutes and the signals around it."""
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    week_seconds = db.scalar(
        select(func.coalesce(func.sum(LearningEvent.seconds), 0)).where(
            LearningEvent.created_at >= week_ago
        )
    )
    total_seconds = db.scalar(select(func.coalesce(func.sum(LearningEvent.seconds), 0)))
    active_students = db.scalar(
        select(func.count(func.distinct(LearningEvent.user_id))).where(
            LearningEvent.created_at >= week_ago, LearningEvent.user_id.is_not(None)
        )
    )
    deliveries = db.scalar(
        select(func.count(PartnerRequest.id)).where(
            PartnerRequest.created_at >= week_ago, PartnerRequest.path.like("%/lectures/%")
        )
    )

    rows = db.execute(
        select(LearningEvent.lecture_id, func.sum(LearningEvent.seconds).label("secs"))
        .where(LearningEvent.created_at >= month_ago)
        .group_by(LearningEvent.lecture_id)
        .order_by(func.sum(LearningEvent.seconds).desc())
        .limit(5)
    ).all()
    top = []
    for lecture_id, secs in rows:
        lecture = db.get(Lecture, lecture_id)
        top.append(
            TopLecture(
                lecture_id=lecture_id,
                title=lecture.title if lecture else f"Lecture {lecture_id}",
                minutes=round((secs or 0) / 60),
            )
        )

    return AnalyticsOut(
        active_minutes_week=round((week_seconds or 0) / 60),
        active_students_week=active_students or 0,
        total_minutes=round((total_seconds or 0) / 60),
        partner_deliveries_week=deliveries or 0,
        top_lectures=top,
    )


@router.get("/partners/{partner_id}/usage", response_model=PartnerUsageOut)
def partner_usage(partner_id: int, db: Session = Depends(get_db)):
    partner = db.get(Partner, partner_id)
    if partner is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "partner not found")
    total = (
        db.scalar(
            select(func.count(PartnerRequest.id)).where(PartnerRequest.partner_id == partner_id)
        )
        or 0
    )
    recent = db.scalars(
        select(PartnerRequest)
        .where(PartnerRequest.partner_id == partner_id)
        .order_by(PartnerRequest.id.desc())
        .limit(25)
    ).all()
    return PartnerUsageOut(
        partner=partner.name,
        total=total,
        recent=[PartnerUsageItem.model_validate(r) for r in recent],
    )
