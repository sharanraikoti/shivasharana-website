"""Stock rules shared by the public pages, admin and billing.

All quantities shown anywhere are calculated here from the batch table.
Expired batches are never counted as saleable stock.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import case, func, or_, select, update
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Batch, Company, Medicine, StockMovement

IN_STOCK = "In Stock"
LOW_STOCK = "Low Stock"
OUT_OF_STOCK = "Out of Stock"
NEAR_EXPIRY = "Near Expiry"
EXPIRED = "Expired"


def shop_tz() -> ZoneInfo:
    return ZoneInfo(get_settings().timezone)


def now_local() -> datetime:
    return datetime.now(shop_tz())


def today() -> date:
    return now_local().date()


def near_expiry_cutoff(on: date | None = None) -> date:
    return (on or today()) + timedelta(days=get_settings().near_expiry_days)


def is_expired(batch: Batch, on: date | None = None) -> bool:
    """Unknown expiry (None) is not treated as expired; known past expiry always is."""
    return batch.expiry_date is not None and batch.expiry_date < (on or today())


def is_saleable(batch: Batch, on: date | None = None) -> bool:
    return batch.quantity > 0 and not is_expired(batch, on)


def not_expired_clause(on: date):
    """SQL version of 'not expired' (unknown expiry counts as not expired)."""
    return or_(Batch.expiry_date.is_(None), Batch.expiry_date >= on)


def expiry_sort_key(batch: Batch):
    return (batch.expiry_date is None, batch.expiry_date or date.max, batch.batch_no or "", batch.id or 0)


def batch_label(batch: Batch) -> str:
    return f"batch {batch.batch_no}" if batch.batch_no else "stock"


def batch_status(batch: Batch, medicine_saleable: int, reorder_level: int, on: date | None = None) -> str:
    on = on or today()
    if is_expired(batch, on):
        return EXPIRED
    if batch.quantity <= 0:
        return OUT_OF_STOCK
    if batch.expiry_date is not None and batch.expiry_date <= near_expiry_cutoff(on):
        return NEAR_EXPIRY
    if medicine_saleable <= reorder_level:
        return LOW_STOCK
    return IN_STOCK


def medicine_status(saleable: int, reorder_level: int) -> str:
    if saleable <= 0:
        return OUT_OF_STOCK
    if saleable <= reorder_level:
        return LOW_STOCK
    return IN_STOCK


# ----------------------------------------------------------------- names
def name_key(name: str) -> str:
    return " ".join(name.lower().split())


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text or "company"


def unique_slug(db: Session, name: str, exclude_id: int | None = None) -> str:
    base = slugify(name)
    slug, n = base, 2
    while True:
        q = select(Company.id).where(Company.slug == slug)
        if exclude_id:
            q = q.where(Company.id != exclude_id)
        if db.scalar(q) is None:
            return slug
        slug = f"{base}-{n}"
        n += 1


# ----------------------------------------------------------------- aggregates
def saleable_by_medicine_subquery(on: date | None = None):
    """medicine_id -> saleable quantity (non-expired batches only)."""
    on = on or today()
    return (
        select(
            Batch.medicine_id.label("medicine_id"),
            func.coalesce(func.sum(case((not_expired_clause(on), Batch.quantity), else_=0)), 0).label("saleable"),
            func.coalesce(func.sum(case((Batch.expiry_date < on, Batch.quantity), else_=0)), 0).label("expired"),
            func.count(Batch.id).label("batch_count"),
        )
        .group_by(Batch.medicine_id)
        .subquery()
    )


def saleable_for_medicine(db: Session, medicine_id: int, on: date | None = None) -> int:
    on = on or today()
    return int(
        db.scalar(
            select(func.coalesce(func.sum(Batch.quantity), 0)).where(
                Batch.medicine_id == medicine_id, not_expired_clause(on)
            )
        )
        or 0
    )


def company_counts(db: Session, company_ids: list[int], public_only: bool = True) -> dict[int, tuple[int, int]]:
    """company_id -> (product_count, in_stock_count)."""
    if not company_ids:
        return {}
    sub = saleable_by_medicine_subquery()
    q = (
        select(
            Medicine.company_id,
            func.count(Medicine.id),
            func.sum(case((func.coalesce(sub.c.saleable, 0) > 0, 1), else_=0)),
        )
        .outerjoin(sub, sub.c.medicine_id == Medicine.id)
        .where(Medicine.company_id.in_(company_ids))
        .group_by(Medicine.company_id)
    )
    if public_only:
        q = q.where(Medicine.is_public.is_(True))
    return {cid: (int(total or 0), int(instock or 0)) for cid, total, instock in db.execute(q)}


# ----------------------------------------------------------------- stock changes
def change_batch_quantity(
    db: Session,
    batch: Batch,
    change: int,
    kind: str,
    *,
    user_id: int | None,
    reference_type: str | None = None,
    reference_id: int | None = None,
    reason: str | None = None,
) -> int:
    """Atomically change a batch quantity and log the movement.

    Uses a conditional UPDATE so two bills can never take the same units, even
    on PostgreSQL with several workers. Does not commit; the caller owns the
    transaction.
    """
    if change == 0:
        return batch.quantity
    db.flush()  # save pending edits to this batch first; the refresh below would discard them
    stmt = update(Batch).where(Batch.id == batch.id).values(quantity=Batch.quantity + change)
    if change < 0:
        stmt = stmt.where(Batch.quantity >= -change)
    result = db.execute(stmt.execution_options(synchronize_session=False))
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"Not enough {batch_label(batch)} left. Refresh and try again.",
        )
    db.refresh(batch)
    db.add(
        StockMovement(
            batch_id=batch.id,
            kind=kind,
            change=change,
            quantity_after=batch.quantity,
            reference_type=reference_type,
            reference_id=reference_id,
            reason=reason,
            user_id=user_id,
        )
    )
    return batch.quantity
