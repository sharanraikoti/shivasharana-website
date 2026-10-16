"""Password hashing, login tokens and role checks."""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import threading
import time
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .models import User

_ITERATIONS = 240_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        _ITERATIONS, base64.b64encode(salt).decode(), base64.b64encode(digest).decode()
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_b64, digest_b64 = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.b64decode(salt_b64), int(iters))
        return hmac.compare_digest(digest, base64.b64decode(digest_b64))
    except (ValueError, TypeError):
        return False


def create_token(user: User) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "iat": now,
        "exp": now + timedelta(minutes=s.token_minutes),
    }
    return jwt.encode(payload, s.secret_key, algorithm="HS256")


# --- simple login throttling (per username, in memory) ---------------------
_failures: dict[str, list[float]] = {}
_lock = threading.Lock()
MAX_FAILURES = 5
WINDOW_SECONDS = 300


def login_blocked(username: str) -> bool:
    now = time.time()
    with _lock:
        recent = [t for t in _failures.get(username.lower(), []) if now - t < WINDOW_SECONDS]
        _failures[username.lower()] = recent
        return len(recent) >= MAX_FAILURES


def record_failure(username: str) -> None:
    with _lock:
        _failures.setdefault(username.lower(), []).append(time.time())


def clear_failures(username: str) -> None:
    with _lock:
        _failures.pop(username.lower(), None)


# --- dependencies ----------------------------------------------------------
_bearer = HTTPBearer(auto_error=False)


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Please sign in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if creds is None:
        raise unauthorized
    try:
        payload = jwt.decode(creds.credentials, get_settings().secret_key, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthorized
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise unauthorized
    return user


def require_staff(user: User = Depends(current_user)) -> User:
    return user  # admin and staff can both bill


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Only the shop admin can do this.")
    return user
