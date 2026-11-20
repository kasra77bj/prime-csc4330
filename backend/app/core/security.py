"""Passwords, TOTP secret encryption, JWTs and refresh tokens."""
from __future__ import annotations

import base64
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from cryptography.fernet import Fernet

from app.config import get_settings

_ph = PasswordHasher()
ALGO = "HS256"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------- passwords ----------
def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError):
        return False


# ---------- TOTP ----------
def _fernet() -> Fernet:
    s = get_settings()
    key = s.fernet_key or base64.urlsafe_b64encode(hashlib.sha256(s.jwt_secret.encode()).digest()).decode()
    return Fernet(key)


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()


def totp_now(secret: str) -> str:
    return pyotp.TOTP(secret).now()


def verify_totp(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify(code.strip(), valid_window=1)


# ---------- JWT ----------
def make_token(kind: str, sub: uuid.UUID | str, minutes: float, **claims) -> str:
    s = get_settings()
    now = utcnow()
    payload = {"typ": kind, "sub": str(sub), "iat": int(now.timestamp()),
               "exp": int((now + timedelta(minutes=minutes)).timestamp()), "jti": uuid.uuid4().hex, **claims}
    return jwt.encode(payload, s.jwt_secret, algorithm=ALGO)


def decode_token(token: str, kind: str) -> dict:
    """Raises jwt.PyJWTError on any problem (expired, bad signature, wrong type)."""
    payload = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGO])
    if payload.get("typ") != kind:
        raise jwt.InvalidTokenError("wrong token type")
    return payload


def access_token(user_id: uuid.UUID, role: str) -> str:
    return make_token("access", user_id, get_settings().access_token_minutes, role=role)


# ---------- refresh tokens (opaque, stored hashed) ----------
def new_refresh_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(48)
    return raw, hash_refresh(raw)


def hash_refresh(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
