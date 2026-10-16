import os
import tempfile
import uuid
from pathlib import Path

_tmp = Path(tempfile.mkdtemp()) / "test.db"
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}")
os.environ["PUBLIC_SITE_URL"] = ""
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough-for-hs256"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.cli import cmd_seed_sample  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.security import _failures, hash_password  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    _failures.clear()
    cmd_seed_sample(None)
    with SessionLocal() as db:
        db.add(User(username="owner", password_hash=hash_password("owner-pass-1"), role="admin"))
        db.add(User(username="staff", password_hash=hash_password("staff-pass-1"), role="staff"))
        db.commit()
    with TestClient(app) as c:
        yield c


def login(client, username="owner", password=None):
    password = password or f"{username}-pass-1"
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def admin(client):
    return login(client, "owner")


@pytest.fixture()
def staff(client):
    return login(client, "staff")


def rid():
    return uuid.uuid4().hex


@pytest.fixture()
def settings():
    return get_settings()
