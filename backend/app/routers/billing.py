"""Billing for signed-in staff. Stock is reduced in the same transaction as the bill."""
from __future__ import annotations

from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Batch, Company, Medicine, Sale, SaleItem, User
from ..schemas import BatchOut, BillIn, BillingSearchRow, BillOut, CancelIn, ReturnIn
from ..security import require_admin, require_staff
from ..services import billing
from ..services.stock import batch_status, expiry_sort_key, is_saleable, shop_tz, today

router = APIRouter(prefix="/api/billing", tags=["billing"])


@router.get("/search", response_model=list[BillingSearchRow])
def search(q: str = Query(..., min_length=1, max_length=100), db: Session = Depends(get_db),
           _: User = Depends(require_staff)):
    like = f"%{q.strip().lower()}%"
    meds = db.scalars(
        select(Medicine)
        .join(Company)
        .where(or_(func.lower(Medicine.name).like(like), Company.name_key.like(like)))
        .options(selectinload(Medicine.batches), selectinload(Medicine.company))
        .order_by(Medicine.name)
        .limit(25)
    ).all()
    on = today()
    out = []
    for m in meds:
        sale_batches = sorted((b for b in m.batches if is_saleable(b, on)), key=expiry_sort_key)
        saleable = sum(b.quantity for b in sale_batches)
        rows = []
        for b in sale_batches:
            r = BatchOut.model_validate(b)
            r.status = batch_status(b, saleable, m.reorder_level, on)
            rows.append(r)
        out.append(BillingSearchRow(
            medicine_id=m.id, name=m.name, strength=m.strength, dosage_form=m.dosage_form, pack_size=m.pack_size or "", unit=m.unit,
            company_name=m.company.name, saleable_quantity=saleable,
            next_price=sale_batches[0].sale_price if sale_batches else None,
            next_expiry=sale_batches[0].expiry_date if sale_batches else None,
            batches=rows,
        ))
    return out


@router.post("/bills", response_model=BillOut)
def create_bill(data: BillIn, response: Response, db: Session = Depends(get_db),
                user: User = Depends(require_staff)):
    bill, created = billing.create_bill(db, data, user)
    response.status_code = 201 if created else 200
    return bill


@router.get("/bills", response_model=list[BillOut])
def list_bills(day: date | None = None, limit: int = Query(50, ge=1, le=500),
               db: Session = Depends(get_db), _: User = Depends(require_staff)):
    stmt = select(Sale).order_by(Sale.id.desc()).limit(limit).options(
        selectinload(Sale.items).selectinload(SaleItem.batch).selectinload(Batch.medicine)
        .selectinload(Medicine.company),
        selectinload(Sale.created_by),
    )
    if day:
        start = datetime.combine(day, time.min, tzinfo=shop_tz()).astimezone(timezone.utc)
        end = datetime.combine(day, time.max, tzinfo=shop_tz()).astimezone(timezone.utc)
        stmt = stmt.where(Sale.created_at >= start, Sale.created_at <= end)
    return [billing.bill_out(s) for s in db.scalars(stmt)]


@router.get("/bills/{bill_id}", response_model=BillOut)
def get_bill(bill_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    return billing.get_bill(db, bill_id)


@router.post("/bills/{bill_id}/cancel", response_model=BillOut)
def cancel(bill_id: int, data: CancelIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    return billing.cancel_bill(db, bill_id, data.reason.strip(), user)


@router.post("/bills/{bill_id}/return", response_model=BillOut)
def return_items(bill_id: int, data: ReturnIn, db: Session = Depends(get_db),
                 user: User = Depends(require_staff)):
    return billing.return_items(db, bill_id, data, user)
