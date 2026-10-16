from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..models import Company
from ..services.qr import png_bytes, svg_bytes, url_problem

router = APIRouter(prefix="/api/qr", tags=["qr"])


def _target(company: str | None, db: Session) -> str:
    base = get_settings().public_site_url.rstrip("/")
    problem = url_problem(base)
    if problem:
        raise HTTPException(status_code=409, detail=problem)
    if company:
        c = db.scalar(select(Company).where(Company.slug == company, Company.is_public.is_(True)))
        if c is None:
            raise HTTPException(status_code=404, detail="Company not found.")
        return f"{base}/companies/{c.slug}"
    return base + "/"


@router.get("/info")
def info(company: str | None = None, db: Session = Depends(get_db)):
    base = get_settings().public_site_url.rstrip("/")
    problem = url_problem(base)
    return {"ready": problem is None, "problem": problem, "url": None if problem else _target(company, db)}


@router.get("/code.png")
def qr_png(company: str | None = None, size: int = Query(20, ge=4, le=40), download: bool = False,
           db: Session = Depends(get_db)):
    url = _target(company, db)
    headers = {"Cache-Control": "no-store"}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="qr-{company or "website"}.png"'
    return Response(png_bytes(url, size), media_type="image/png", headers=headers)


@router.get("/code.svg")
def qr_svg(company: str | None = None, download: bool = False, db: Session = Depends(get_db)):
    url = _target(company, db)
    headers = {"Cache-Control": "no-store"}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="qr-{company or "website"}.svg"'
    return Response(svg_bytes(url), media_type="image/svg+xml", headers=headers)
