from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import LoginIn, TokenOut, UserOut
from ..security import (
    clear_failures,
    create_token,
    current_user,
    login_blocked,
    record_failure,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, db: Session = Depends(get_db)):
    username = data.username.strip()
    if login_blocked(username):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Wait 5 minutes and try again.")
    user = db.scalar(select(User).where(User.username == username))
    if user is None or not user.is_active or not verify_password(data.password, user.password_hash):
        record_failure(username)
        raise HTTPException(status_code=401, detail="Wrong username or password.")
    clear_failures(username)
    return TokenOut(access_token=create_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user
