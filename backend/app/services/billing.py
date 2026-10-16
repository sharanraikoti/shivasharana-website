"""Billing: create bills, cancel them and accept returns.

Every operation runs in one database transaction. If any line fails (not
enough stock, expired batch, ...) nothing is saved and no stock changes.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..models import Batch, Medicine, Sale, SaleItem, User
from ..schemas import BillIn, BillItemOut, BillOut, ReturnIn
from .stock import batch_label, change_batch_quantity, expiry_sort_key, is_expired, is_saleable, not_expired_clause, now_local, today

CENT = Decimal("0.01")


def _load_bill(db: Session, sale_id: int) -> Sale:
    sale = db.scalar(
        select(Sale)
        .where(Sale.id == sale_id)
        .options(
            selectinload(Sale.items).selectinload(SaleItem.batch).selectinload(Batch.medicine).selectinload(
                Medicine.company
            ),
            selectinload(Sale.created_by),
        )
    )
    if sale is None:
        raise HTTPException(status_code=404, detail="Bill not found.")
    return sale


def bill_out(sale: Sale) -> BillOut:
    items = []
    for it in sale.items:
        med = it.batch.medicine
        items.append(
            BillItemOut(
                id=it.id,
                medicine_id=med.id,
                medicine_name=med.name,
                strength=med.strength,
                pack_size=med.pack_size or "",
                company_name=med.company.name,
                batch_id=it.batch_id,
                batch_no=it.batch.batch_no,
                expiry_date=it.batch.expiry_date,
                quantity=it.quantity,
                returned_quantity=it.returned_quantity,
                unit_price=it.unit_price,
                line_total=it.line_total,
            )
        )
    return BillOut(
        id=sale.id,
        bill_no=sale.bill_no,
        status=sale.status,
        customer_name=sale.customer_name,
        customer_phone=sale.customer_phone,
        total=sale.total,
        created_at=sale.created_at,
        created_by=sale.created_by.full_name or sale.created_by.username if sale.created_by else None,
        cancelled_at=sale.cancelled_at,
        cancel_reason=sale.cancel_reason,
        items=items,
    )


def get_bill(db: Session, sale_id: int) -> BillOut:
    return bill_out(_load_bill(db, sale_id))


def _allocate(db: Session, medicine: Medicine, quantity: int, batch_id: int | None) -> list[tuple[Batch, int]]:
    """Choose batches for a line: a named batch, or earliest expiry first (FEFO)."""
    on = today()
    label = f"{medicine.name} {medicine.strength}".strip()
    if batch_id is not None:
        batch = db.get(Batch, batch_id)
        if batch is None or batch.medicine_id != medicine.id:
            raise HTTPException(status_code=422, detail=f"Batch does not belong to {label}.")
        if is_expired(batch, on):
            raise HTTPException(status_code=409, detail=f"The {batch_label(batch)} of {label} has expired and cannot be sold.")
        if batch.quantity < quantity:
            raise HTTPException(
                status_code=409,
                detail=f"Only {batch.quantity} {medicine.unit} left in {batch_label(batch)} of {label}.",
            )
        return [(batch, quantity)]

    batches = sorted(
        db.scalars(
            select(Batch).where(Batch.medicine_id == medicine.id, Batch.quantity > 0, not_expired_clause(on))
        ).all(),
        key=expiry_sort_key,  # earliest expiry first, unknown expiry last
    )
    available = sum(b.quantity for b in batches)
    if available < quantity:
        raise HTTPException(
            status_code=409,
            detail=f"Only {available} {medicine.unit} of {label} can be sold (expired stock is excluded).",
        )
    plan, remaining = [], quantity
    for b in batches:
        if remaining == 0:
            break
        take = min(b.quantity, remaining)
        plan.append((b, take))
        remaining -= take
    return plan


def create_bill(db: Session, data: BillIn, user: User) -> tuple[BillOut, bool]:
    """Returns (bill, created). created=False means this request was already processed."""
    existing = db.scalar(select(Sale.id).where(Sale.client_request_id == data.client_request_id))
    if existing:
        return get_bill(db, existing), False

    # Merge repeated lines for the same medicine/batch so stock checks are correct
    merged: dict[tuple[int, int | None], int] = {}
    for line in data.items:
        key = (line.medicine_id, line.batch_id)
        merged[key] = merged.get(key, 0) + line.quantity

    try:
        sale = Sale(
            bill_no="PENDING-" + data.client_request_id[:30],
            client_request_id=data.client_request_id,
            customer_name=(data.customer_name or "").strip() or None,
            customer_phone=(data.customer_phone or "").strip() or None,
            created_by_id=user.id,
            status="completed",
        )
        db.add(sale)
        db.flush()

        total = Decimal("0")
        for (medicine_id, batch_id), qty in merged.items():
            medicine = db.get(Medicine, medicine_id)
            if medicine is None:
                raise HTTPException(status_code=422, detail=f"Medicine {medicine_id} not found.")
            for batch, take in _allocate(db, medicine, qty, batch_id):
                if not is_saleable(batch):
                    raise HTTPException(status_code=409, detail=f"The {batch_label(batch)} of {medicine.name} cannot be sold.")
                if batch.sale_price is None:
                    raise HTTPException(
                        status_code=409,
                        detail=f"No sale price is set for {medicine.name}. An admin can add it in Inventory.",
                    )
                price = Decimal(batch.sale_price).quantize(CENT)
                line_total = (price * take).quantize(CENT)
                change_batch_quantity(
                    db, batch, -take, "sale", user_id=user.id, reference_type="sale", reference_id=sale.id
                )
                db.add(SaleItem(sale_id=sale.id, batch_id=batch.id, quantity=take, unit_price=price, line_total=line_total))
                total += line_total

        sale.total = total
        sale.bill_no = f"B{now_local().strftime('%Y%m%d')}-{sale.id:05d}"
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        # Two identical submits raced; return the one that won
        existing = db.scalar(select(Sale.id).where(Sale.client_request_id == data.client_request_id))
        if existing:
            return get_bill(db, existing), False
        raise HTTPException(status_code=409, detail="The bill could not be saved. Please try again.")
    return get_bill(db, sale.id), True


def cancel_bill(db: Session, sale_id: int, reason: str, user: User) -> BillOut:
    sale = _load_bill(db, sale_id)
    if sale.status == "cancelled":
        raise HTTPException(status_code=409, detail="This bill is already cancelled.")
    try:
        for it in sale.items:
            back = it.quantity - it.returned_quantity
            if back > 0:
                change_batch_quantity(
                    db, it.batch, back, "sale_cancel", user_id=user.id,
                    reference_type="sale", reference_id=sale.id, reason=reason,
                )
        sale.status = "cancelled"
        sale.cancelled_at = datetime.now(timezone.utc)
        sale.cancel_reason = reason
        db.commit()
    except Exception:
        db.rollback()
        raise
    return get_bill(db, sale.id)


def return_items(db: Session, sale_id: int, data: ReturnIn, user: User) -> BillOut:
    sale = _load_bill(db, sale_id)
    if sale.status != "completed":
        raise HTTPException(status_code=409, detail="Items can only be returned from a completed bill.")
    by_id = {it.id: it for it in sale.items}
    try:
        refund = Decimal("0")
        for r in data.items:
            it = by_id.get(r.sale_item_id)
            if it is None:
                raise HTTPException(status_code=422, detail=f"Line {r.sale_item_id} is not on this bill.")
            if it.returned_quantity + r.quantity > it.quantity:
                raise HTTPException(
                    status_code=409,
                    detail=f"Cannot return {r.quantity}; only {it.quantity - it.returned_quantity} left on this line.",
                )
            it.returned_quantity += r.quantity
            refund += (Decimal(it.unit_price) * r.quantity).quantize(CENT)
            change_batch_quantity(
                db, it.batch, r.quantity, "return", user_id=user.id,
                reference_type="sale", reference_id=sale.id, reason=data.reason,
            )
        sale.total = (Decimal(sale.total) - refund).quantize(CENT)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return get_bill(db, sale.id)
