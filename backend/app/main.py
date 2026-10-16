"""FastAPI application.

Run locally (from the backend folder):  python -m uvicorn app.main:app --reload
API docs: http://127.0.0.1:8000/docs
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import init_db
from .routers import admin, auth, billing, public, qr


@asynccontextmanager
async def lifespan(_: FastAPI):
    s = get_settings()
    if s.is_production and s.secret_key == "change-me-in-production":
        raise RuntimeError("Set SECRET_KEY to a long random value before running in production.")
    init_db()
    bootstrap()
    yield


def bootstrap() -> None:
    """On first start, load data/shop_details.json and create the first admin from settings."""
    import json
    from pathlib import Path

    from sqlalchemy import func, select

    from .database import SessionLocal
    from .models import ShopProfile, User
    from .schemas import ShopUpdate
    from .security import hash_password

    s = get_settings()
    details = Path(__file__).resolve().parent.parent / "data" / "shop_details.json"
    with SessionLocal() as db:
        if db.get(ShopProfile, 1) is None and details.exists():
            data = ShopUpdate(**json.loads(details.read_text(encoding="utf-8")))
            db.add(ShopProfile(id=1, **data.model_dump()))
            db.commit()
        if s.bootstrap_admin_username and len(s.bootstrap_admin_password) >= 8:
            if not db.scalar(select(func.count(User.id))):
                db.add(User(username=s.bootstrap_admin_username, full_name="Owner", role="admin",
                            password_hash=hash_password(s.bootstrap_admin_password)))
                db.commit()


settings = get_settings()
app = FastAPI(
    title="Medical Shop Inventory API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if request.url.path.startswith(("/api/admin", "/api/billing", "/api/auth")):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/")
def root():
    return {"message": "Medical Shop Inventory API is running!", "status": "success"}


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(public.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(billing.router)
app.include_router(qr.router)
