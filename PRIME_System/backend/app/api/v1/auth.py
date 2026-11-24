"""Authentication: password + TOTP 2FA, refresh cookie, remember-device (US-01, docs/13)."""
from __future__ import annotations

import io
import uuid
from datetime import timedelta

import jwt
import pyotp
import qrcode
import qrcode.image.svg
from fastapi import APIRouter, Cookie, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.audit import audit
from app.core.errors import APIError
from app.core.rbac import current_user
from app.core.security import (access_token, decode_token, decrypt_secret, encrypt_secret, hash_refresh,
                               make_token, new_refresh_token, utcnow, verify_password, verify_totp)
from app.db import get_db
from app.models import RefreshToken, User
from app.schemas.common import (EnrollConfirmIn, EnrollIn, EnrollOut, LoginIn, LoginOut, MfaVerifyIn, TokenOut,
                                UserOut)

router = APIRouter(prefix="/auth", tags=["auth"])
REFRESH_COOKIE, DEVICE_COOKIE = "prime_refresh", "prime_device"
_used_mfa_tokens: set[str] = set()   # single-use mfa tokens (process memory is fine for a laptop demo)


def _set_cookie(resp: Response, name: str, value: str, days: float, path: str = "/api/v1/auth") -> None:
    resp.set_cookie(name, value, max_age=int(days * 86400), httponly=True, samesite="strict",
                    secure=get_settings().cookie_secure, path=path)


async def _issue(db: AsyncSession, resp: Response, user: User, remember_device: bool, request: Request) -> TokenOut:
    s = get_settings()
    raw, hashed = new_refresh_token()
    now = utcnow()
    db.add(RefreshToken(user_id=user.id, token_hash=hashed, expires_at=now + timedelta(days=s.refresh_token_days),
                        device_label=(request.headers.get("user-agent") or "")[:120],
                        remember_device_until=now + timedelta(days=30) if remember_device else None))
    user.last_login_at, user.failed_logins, user.locked_until = now, 0, None
    audit(db, user.id, "auth.login", "user", user.id, request=request)
    await db.commit()
    _set_cookie(resp, REFRESH_COOKIE, raw, s.refresh_token_days)
    if remember_device:
        _set_cookie(resp, DEVICE_COOKIE, make_token("device", user.id, 30 * 24 * 60), 30)
    return TokenOut(access_token=access_token(user.id, user.role.value), user=UserOut.model_validate(user))


def _mfa_payload(token: str) -> dict:
    try:
        p = decode_token(token, "mfa")
    except jwt.PyJWTError:
        raise APIError(401, "MFA_TOKEN_INVALID", "Your sign-in step expired. Please sign in again.")
    if p["jti"] in _used_mfa_tokens:
        raise APIError(401, "MFA_TOKEN_USED", "This sign-in step was already used. Please sign in again.")
    return p


@router.post("/login", response_model=LoginOut)
async def login(body: LoginIn, request: Request, response: Response, db: AsyncSession = Depends(get_db),
                prime_device: str | None = Cookie(default=None)):
    s = get_settings()
    user = await db.scalar(select(User).where(User.email == body.email.lower()))
    now = utcnow()
    if user is not None and user.locked_until and user.locked_until > now:
        mins = max(1, int((user.locked_until - now).total_seconds() // 60) + 1)
        raise APIError(423, "ACCOUNT_LOCKED", f"Too many attempts. Try again in {mins} minute(s).")
    if user is None or not user.is_active or not verify_password(user.password_hash, body.password):
        if user is not None:
            user.failed_logins += 1
            if user.failed_logins >= s.lockout_attempts:
                user.locked_until, user.failed_logins = now + timedelta(minutes=s.lockout_minutes), 0
            audit(db, user.id, "auth.login_failed", "user", user.id, request=request)
            await db.commit()
        raise APIError(401, "BAD_CREDENTIALS", "Email or password is incorrect.")
    # remembered device: skip the second factor (US-01 design: "Remember this device for 30 days")
    if prime_device and user.mfa_enrolled:
        try:
            if decode_token(prime_device, "device")["sub"] == str(user.id):
                out = await _issue(db, response, user, False, request)
                return LoginOut(mfa_required=False, access_token=out.access_token, user=out.user)
        except jwt.PyJWTError:
            pass
    token = make_token("mfa", user.id, 5, remember=body.remember_device, enroll=not user.mfa_enrolled)
    return LoginOut(mfa_required=True, enroll_required=not user.mfa_enrolled, mfa_token=token)


@router.post("/mfa/verify", response_model=TokenOut)
async def mfa_verify(body: MfaVerifyIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    p = _mfa_payload(body.mfa_token)
    user = await db.get(User, uuid.UUID(p["sub"]))
    if user is None or not user.is_active:
        raise APIError(401, "UNAUTHENTICATED", "User not active")
    if not user.mfa_enrolled or not user.totp_secret_enc:
        raise APIError(409, "MFA_NOT_ENROLLED", "Set up your authenticator app first.")
    s = get_settings()
    ok = verify_totp(decrypt_secret(user.totp_secret_enc), body.code)
    if not ok and s.demo_mode and body.code == s.demo_mfa_code and user.email.endswith("@prime.demo"):
        ok = True   # DEMO_MODE backup code, seeded demo users only
    if not ok:
        audit(db, user.id, "auth.mfa_failed", "user", user.id, request=request)
        await db.commit()
        raise APIError(401, "BAD_CODE", "That code didn't match. Check your authenticator app and try again.")
    _used_mfa_tokens.add(p["jti"])
    return await _issue(db, response, user, bool(p.get("remember")), request)


@router.post("/mfa/enroll", response_model=EnrollOut)
async def mfa_enroll(body: EnrollIn, db: AsyncSession = Depends(get_db)):
    p = _mfa_payload(body.mfa_token)
    user = await db.get(User, uuid.UUID(p["sub"]))
    if user is None or user.mfa_enrolled:
        raise APIError(409, "ALREADY_ENROLLED", "2-factor authentication is already set up.")
    secret = pyotp.random_base32()
    user.totp_secret_enc = encrypt_secret(secret)
    await db.commit()
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="PRIME")
    buf = io.BytesIO()
    qrcode.make(uri, image_factory=qrcode.image.svg.SvgPathImage).save(buf)
    return EnrollOut(otpauth_uri=uri, qr_svg=buf.getvalue().decode(), secret=secret)


@router.post("/mfa/enroll/confirm", response_model=TokenOut)
async def mfa_enroll_confirm(body: EnrollConfirmIn, request: Request, response: Response,
                             db: AsyncSession = Depends(get_db)):
    p = _mfa_payload(body.mfa_token)
    user = await db.get(User, uuid.UUID(p["sub"]))
    if user is None or not user.totp_secret_enc:
        raise APIError(409, "ENROLL_FIRST", "Start enrollment first.")
    if not verify_totp(decrypt_secret(user.totp_secret_enc), body.code):
        raise APIError(401, "BAD_CODE", "That code didn't match. Try the newest code in your app.")
    user.mfa_enrolled = True
    audit(db, user.id, "auth.mfa_enrolled", "user", user.id, request=request)
    _used_mfa_tokens.add(p["jti"])
    return await _issue(db, response, user, bool(p.get("remember")), request)


@router.post("/refresh")
async def refresh(response: Response, db: AsyncSession = Depends(get_db),
                  prime_refresh: str | None = Cookie(default=None)):
    if not prime_refresh:
        raise APIError(401, "NO_REFRESH", "Sign in required")
    rt = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_refresh(prime_refresh)))
    if rt is None or rt.revoked_at is not None or rt.expires_at < utcnow():
        raise APIError(401, "REFRESH_INVALID", "Session expired. Please sign in again.")
    user = await db.get(User, rt.user_id)
    if user is None or not user.is_active:
        raise APIError(401, "UNAUTHENTICATED", "User not active")
    # rotate
    rt.revoked_at = utcnow()
    raw, hashed = new_refresh_token()
    db.add(RefreshToken(user_id=user.id, token_hash=hashed, expires_at=rt.expires_at,
                        device_label=rt.device_label, remember_device_until=rt.remember_device_until))
    await db.commit()
    _set_cookie(response, REFRESH_COOKIE, raw, max(0.01, (rt.expires_at - utcnow()).total_seconds() / 86400))
    return {"access_token": access_token(user.id, user.role.value), "token_type": "bearer"}


@router.post("/logout")
async def logout(request: Request, response: Response, user: User = Depends(current_user),
                 db: AsyncSession = Depends(get_db), prime_refresh: str | None = Cookie(default=None)):
    if prime_refresh:
        rt = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_refresh(prime_refresh)))
        if rt is not None:
            rt.revoked_at = utcnow()
    audit(db, user.id, "auth.logout", "user", user.id, request=request)
    await db.commit()
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")
    return {"ok": True}

