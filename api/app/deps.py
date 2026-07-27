from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request, Security, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Partner, PartnerApiKey, PartnerRequest, PartnerStatus, Role, User
from .security import decode_access_token, verify_api_key

bearer = HTTPBearer(auto_error=False)
api_key_scheme = APIKeyHeader(name="X-API-Key", auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not authenticated")
    try:
        payload = decode_access_token(creds.credentials)
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token")
    user = db.get(User, int(payload.get("sub", 0)))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found")
    return user


def require_role(*roles: Role):
    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "insufficient permissions")
        return user

    return dep


def get_partner_key(
    key: str | None = Security(api_key_scheme),
    db: Session = Depends(get_db),
) -> tuple[Partner, PartnerApiKey]:
    """Resolve the partner behind an X-API-Key header. Keys are bcrypt-hashed, so we
    narrow by the stored prefix and then verify against the hash."""
    if not key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing API key")
    matched = None
    for candidate in db.scalars(
        select(PartnerApiKey).where(
            PartnerApiKey.key_prefix == key[:12], PartnerApiKey.revoked.is_(False)
        )
    ):
        if verify_api_key(key, candidate.key_hash):
            matched = candidate
            break
    if matched is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid API key")
    partner = db.get(Partner, matched.partner_id)
    if partner is None or partner.status != PartnerStatus.active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "partner is not active")
    return partner, matched


def partner_context(
    request: Request,
    ctx: tuple[Partner, PartnerApiKey] = Depends(get_partner_key),
    db: Session = Depends(get_db),
) -> Partner:
    """Authenticate the partner, enforce the per-key rate limit, and record the call."""
    partner, key = ctx

    limit = settings.partner_rate_limit_per_min
    window_start = datetime.now(timezone.utc) - timedelta(seconds=60)
    recent = (
        db.scalar(
            select(func.count(PartnerRequest.id)).where(
                PartnerRequest.partner_id == partner.id,
                PartnerRequest.created_at >= window_start,
            )
        )
        or 0
    )

    status_code = 429 if recent >= limit else 200
    db.add(
        PartnerRequest(
            partner_id=partner.id,
            api_key_id=key.id,
            method=request.method,
            path=request.url.path,
            status_code=status_code,
        )
    )
    db.commit()

    if status_code == 429:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"rate limit exceeded ({limit} requests per minute)",
            headers={"Retry-After": "60"},
        )
    return partner
