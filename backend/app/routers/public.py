"""Read-only endpoints for website visitors. No login needed, nothing can be changed."""
from __future__ import annotations

import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Company, Medicine, ShopProfile
from ..schemas import CompanyCard, CompanyPage, CompanyStock, ShopOut, StockRow
from ..services.stock import (
    OUT_OF_STOCK,
    batch_status,
    company_counts,
    expiry_sort_key,
    is_expired,
    is_saleable,
    medicine_status,
    near_expiry_cutoff,
    today,
)

router = APIRouter(prefix="/api", tags=["public"])


def get_shop(db: Session) -> ShopProfile:
    shop = db.get(ShopProfile, 1)
    if shop is None:
        raise HTTPException(status_code=404, detail="Shop details have not been added yet.")
    return shop


@router.get("/shop", response_model=ShopOut)
def shop_profile(db: Session = Depends(get_db)):
    return get_shop(db)


def shop_or_default(db: Session) -> ShopProfile:
    return db.get(ShopProfile, 1) or ShopProfile(name="Medical Shop", show_quantities=True, show_batches=True)


def _card(c: Company, counts: dict[int, tuple[int, int]]) -> CompanyCard:
    total, instock = counts.get(c.id, (0, 0))
    return CompanyCard(id=c.id, name=c.name, slug=c.slug, logo_url=c.logo_url,
                       product_count=total, in_stock_count=instock, is_sample=c.is_sample)


@router.get("/companies", response_model=CompanyPage)
def list_companies(
    q: str = Query(default="", max_length=100),
    order: str = Query(default="asc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=100),
    db: Session = Depends(get_db),
):
    base = select(Company).where(Company.is_public.is_(True))
    term = " ".join(q.split()).lower()
    if term:
        base = base.where(Company.name_key.contains(term))
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    sort = Company.name_key.asc() if order == "asc" else Company.name_key.desc()
    rows = db.scalars(base.order_by(sort).offset((page - 1) * page_size).limit(page_size)).all()
    counts = company_counts(db, [c.id for c in rows])
    return CompanyPage(
        items=[_card(c, counts) for c in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


@router.get("/companies/{slug}", response_model=CompanyStock)
def company_stock(slug: str, db: Session = Depends(get_db)):
    company = db.scalar(
        select(Company)
        .where(Company.slug == slug, Company.is_public.is_(True))
        .options(selectinload(Company.medicines).selectinload(Medicine.batches))
    )
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found.")
    shop = shop_or_default(db)
    on = today()
    cutoff = near_expiry_cutoff(on)
    rows: list[StockRow] = []
    for med in company.medicines:
        if not med.is_public:
            continue
        saleable = sum(b.quantity for b in med.batches if is_saleable(b, on))
        if shop.show_batches and med.batches:
            for b in sorted(med.batches, key=expiry_sort_key):
                if b.quantity == 0 and (b.batch_no is None or is_expired(b, on)):
                    continue  # empty expired batches and empty summary rows are not stock
                status = batch_status(b, saleable, med.reorder_level, on)
                rows.append(StockRow(
                    medicine_id=med.id, batch_id=b.id, name=med.name,
                    strength=med.strength or None, dosage_form=med.dosage_form or None,
                    batch_no=b.batch_no,
                    quantity=b.quantity if shop.show_quantities else None,
                    unit=med.unit, pack_size=med.pack_size or None, expiry_date=b.expiry_date,
                    expiry_is_earliest=b.batch_no is None, status=status,
                    saleable=is_saleable(b, on),
                ))
            if not any(r.medicine_id == med.id for r in rows):
                rows.append(_medicine_row(med, 0, shop.show_quantities, OUT_OF_STOCK, None))
        else:
            saleable_batches = [b for b in med.batches if is_saleable(b, on)]
            known = [b.expiry_date for b in saleable_batches if b.expiry_date]
            next_expiry = min(known, default=None)
            status = medicine_status(saleable, med.reorder_level)
            # Without batch rows, flag Near Expiry only when ALL saleable stock is close to expiry
            if saleable_batches and len(known) == len(saleable_batches) and max(known) <= cutoff:
                status = "Near Expiry"
            rows.append(_medicine_row(med, saleable, shop.show_quantities, status, next_expiry))

    counts = company_counts(db, [company.id])
    return CompanyStock(
        company=_card(company, counts),
        rows=rows,
        show_quantities=shop.show_quantities,
        show_batches=shop.show_batches,
        stock_as_of=shop.stock_as_of,
        stock_source=shop.stock_source,
        generated_at=datetime.now(timezone.utc),
    )


def _medicine_row(med: Medicine, qty: int, show_qty: bool, status: str, expiry) -> StockRow:
    return StockRow(
        medicine_id=med.id, batch_id=None, name=med.name,
        strength=med.strength or None, dosage_form=med.dosage_form or None,
        batch_no=None, quantity=qty if show_qty else None, unit=med.unit, pack_size=med.pack_size or None,
        expiry_date=expiry, expiry_is_earliest=True, status=status, saleable=qty > 0,
    )
