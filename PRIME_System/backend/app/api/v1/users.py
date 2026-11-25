"""Users, sites and the signed-in user's profile/notifications (US-02)."""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit import audit
from app.core.errors import APIError, not_found
from app.core.rbac import Permission, current_user, permissions_for, require
from app.core.security import hash_password
from app.db import get_db
from app.models import Notification, OnboardingProgress, Site, User, UserRole
from app.schemas.common import (MeOut, NotificationOut, OnboardingPatch, SiteOut, UserCreateIn, UserCreateOut,
                                UserOut, UserPatchIn)

router = APIRouter(tags=["users"])
ONBOARDING_FIELDS = ("welcome_done", "role_seen", "tour_done", "practice_stop_done", "first_live_watched",
                     "first_alert_ack", "dismissed")


async def _onboarding(db: AsyncSession, user_id: uuid.UUID) -> OnboardingProgress:
    ob = await db.scalar(select(OnboardingProgress).where(OnboardingProgress.user_id == user_id))
    if ob is None:
        ob = OnboardingProgress(user_id=user_id)
        db.add(ob)
        await db.flush()
    return ob


@router.get("/me", response_model=MeOut)
async def me(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    u = await db.scalar(select(User).options(selectinload(User.sites)).where(User.id == user.id))
    ob = await _onboarding(db, user.id)
    await db.commit()
    return MeOut(**UserOut.model_validate(u).model_dump(), permissions=permissions_for(u.role),
                 sites=[SiteOut.model_validate(s) for s in u.sites],
                 onboarding={f: getattr(ob, f) for f in ONBOARDING_FIELDS})


@router.patch("/me/onboarding")
async def patch_onboarding(body: OnboardingPatch, user: User = Depends(current_user),
                           db: AsyncSession = Depends(get_db)):
    ob = await _onboarding(db, user.id)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(ob, k, v)
    await db.commit()
    return {f: getattr(ob, f) for f in ONBOARDING_FIELDS}


@router.get("/me/notifications", response_model=list[NotificationOut])
async def my_notifications(unread: bool = False, limit: int = 50, user: User = Depends(current_user),
                           db: AsyncSession = Depends(get_db)):
    q = select(Notification).where(Notification.user_id == user.id)
    if unread:
        q = q.where(Notification.read_at.is_(None))
    return (await db.scalars(q.order_by(Notification.created_at.desc()).limit(min(limit, 200)))).all()


@router.post("/me/notifications/{notification_id}/read")
async def read_notification(notification_id: uuid.UUID, user: User = Depends(current_user),
                            db: AsyncSession = Depends(get_db)):
    n = await db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise not_found("Notification")
    n.read_at = n.read_at or datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@router.get("/sites", response_model=list[SiteOut])
async def sites(_: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return (await db.scalars(select(Site).order_by(Site.name))).all()


@router.get("/users", response_model=list[UserOut])
async def list_users(role: UserRole | None = None, q: str | None = None,
                     _: User = Depends(require(Permission.manage_users)), db: AsyncSession = Depends(get_db)):
    stmt = select(User)
    if role:
        stmt = stmt.where(User.role == role)
    if q:
        stmt = stmt.where(User.full_name.ilike(f"%{q}%") | User.email.ilike(f"%{q}%"))
    return (await db.scalars(stmt.order_by(User.full_name))).all()


@router.post("/users", response_model=UserCreateOut, status_code=201)
async def create_user(body: UserCreateIn, request: Request, admin: User = Depends(require(Permission.manage_users)),
                      db: AsyncSession = Depends(get_db)):
    if await db.scalar(select(User).where(User.email == body.email.lower())):
        raise APIError(409, "EMAIL_TAKEN", "A user with this email already exists.")
    temp = "Prime-" + secrets.token_urlsafe(6)
    u = User(email=body.email.lower(), full_name=body.full_name, role=body.role, password_hash=hash_password(temp),
             mfa_enrolled=False, created_by=admin.id)
    site_ids = body.site_ids or [s.id for s in (await db.scalars(select(Site))).all()]
    u.sites = list((await db.scalars(select(Site).where(Site.id.in_(site_ids)))).all())
    db.add(u)
    await db.flush()
    db.add(OnboardingProgress(user_id=u.id))
    audit(db, admin.id, "user.create", "user", u.id, None, {"email": u.email, "role": u.role}, request)
    await db.commit()
    await db.refresh(u)
    return UserCreateOut(user=UserOut.model_validate(u), temporary_password=temp)


@router.patch("/users/{user_id}", response_model=UserOut)
async def patch_user(user_id: uuid.UUID, body: UserPatchIn, request: Request,
                     admin: User = Depends(require(Permission.manage_users)), db: AsyncSession = Depends(get_db)):
    u = await db.scalar(select(User).options(selectinload(User.sites)).where(User.id == user_id))
    if u is None:
        raise not_found("User")
    from app.core.rbac import Permission as _P
    from app.core.rbac import has_permission as _has
    if u.id == admin.id and (body.is_active is False or (body.role and not _has(body.role, _P.manage_users))):
        raise APIError(409, "SELF_LOCKOUT", "You can't remove your own admin access.")
    before = {"role": u.role, "is_active": u.is_active, "full_name": u.full_name}
    data = body.model_dump(exclude_none=True)
    site_ids = data.pop("site_ids", None)
    for k, v in data.items():
        setattr(u, k, v)
    if site_ids is not None:
        u.sites = list((await db.scalars(select(Site).where(Site.id.in_(site_ids)))).all())
    audit(db, admin.id, "user.update", "user", u.id, before, data, request)
    await db.commit()
    await db.refresh(u)
    return u


# ---------------- onboarding practice, gamification, audit (T3.6 / T3.7) ----------------
@router.post("/me/onboarding/practice-stop")
async def practice_stop(request: Request, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Hold-to-stop practice in the onboarding tour: a no-op for the printers, earns Safety First."""
    from app.gamification.service import award
    ob = await _onboarding(db, user.id)
    ob.practice_stop_done = True
    earned = await award(db, user.id, "safety_first")
    audit(db, user.id, "onboarding.practice_stop", "user", user.id, request=request)
    await db.commit()
    return {"ok": True, "badge_earned": earned, "onboarding": {f: getattr(ob, f) for f in ONBOARDING_FIELDS}}


async def _site_id(db: AsyncSession, user: User) -> uuid.UUID | None:
    u = await db.scalar(select(User).options(selectinload(User.sites)).where(User.id == user.id))
    return u.sites[0].id if u.sites else await db.scalar(select(Site.id).order_by(Site.name).limit(1))


@router.get("/me/achievements")
async def my_achievements(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Badges with progress, clean-print streak, shift summary and the team goal (no leaderboards)."""
    from app.gamification.service import achievements
    return await achievements(db, user.id, await _site_id(db, user))


@router.get("/shift-goals/current")
async def current_shift_goal(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    from app.gamification.service import shift_goal
    return await shift_goal(db, await _site_id(db, user))


@router.get("/audit")
async def audit_log(action: str | None = None, user_id: uuid.UUID | None = None, limit: int = 200,
                    _: User = Depends(require(Permission.view_audit)), db: AsyncSession = Depends(get_db)):
    from app.models import AuditLog
    q = select(AuditLog, User.full_name, User.email).outerjoin(User, User.id == AuditLog.user_id)
    if action:
        q = q.where(AuditLog.action.ilike(f"{action}%"))
    if user_id:
        q = q.where(AuditLog.user_id == user_id)
    rows = (await db.execute(q.order_by(AuditLog.created_at.desc()).limit(min(limit, 1000)))).all()
    return [{"id": str(a.id), "at": a.created_at, "action": a.action, "entity_type": a.entity_type,
             "entity_id": str(a.entity_id) if a.entity_id else None, "before": a.before, "after": a.after,
             "ip": str(a.ip) if a.ip else None, "user_id": str(a.user_id) if a.user_id else None,
             "user_name": name, "user_email": email} for a, name, email in rows]
