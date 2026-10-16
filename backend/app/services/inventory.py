"""Receiving stock (purchases) and importing the shop's data from CSV."""
from __future__ import annotations

import calendar
import csv
import io
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Batch, Company, Medicine, Purchase, PurchaseItem, StockMovement, User
from ..schemas import ImportResult, PurchaseIn
from .stock import change_batch_quantity, name_key, unique_slug


def get_or_create_company(db: Session, name: str, *, is_sample: bool = False) -> tuple[Company, bool]:
    name = " ".join(name.split())
    company = db.scalar(select(Company).where(Company.name_key == name_key(name)))
    if company:
        return company, False
    company = Company(name=name, name_key=name_key(name), slug=unique_slug(db, name), is_sample=is_sample)
    db.add(company)
    db.flush()
    return company, True


def receive_purchase(db: Session, data: PurchaseIn, user: User) -> Purchase:
    """Add received stock to batches (creating batches as needed) in one transaction."""
    try:
        purchase = Purchase(
            supplier_name=data.supplier_name.strip(),
            invoice_no=(data.invoice_no or "").strip() or None,
            purchase_date=data.purchase_date,
            notes=data.notes,
            created_by_id=user.id,
        )
        db.add(purchase)
        db.flush()
        total = Decimal("0")
        for line in data.items:
            medicine = db.get(Medicine, line.medicine_id)
            if medicine is None:
                raise HTTPException(status_code=422, detail=f"Medicine {line.medicine_id} not found.")
            if line.mrp is not None and line.sale_price > line.mrp:
                raise HTTPException(
                    status_code=422,
                    detail=f"{medicine.name}: sale price cannot be more than MRP.",
                )
            batch = db.scalar(
                select(Batch).where(Batch.medicine_id == medicine.id, Batch.batch_no == line.batch_no)
            )
            if batch is None:
                batch = Batch(
                    medicine_id=medicine.id,
                    batch_no=line.batch_no,
                    expiry_date=line.expiry_date,
                    quantity=0,
                    mrp=line.mrp,
                    sale_price=line.sale_price,
                    purchase_price=line.purchase_price,
                )
                db.add(batch)
                db.flush()
            elif batch.expiry_date != line.expiry_date:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"{medicine.name} batch {line.batch_no} already exists with expiry "
                        f"{batch.expiry_date:%d-%m-%Y}. Check the batch number or expiry."
                    ),
                )
            else:
                batch.sale_price = line.sale_price
                if line.mrp is not None:
                    batch.mrp = line.mrp
                if line.purchase_price is not None:
                    batch.purchase_price = line.purchase_price
            change_batch_quantity(
                db, batch, line.quantity, "purchase", user_id=user.id,
                reference_type="purchase", reference_id=purchase.id,
            )
            db.add(PurchaseItem(purchase_id=purchase.id, batch_id=batch.id, quantity=line.quantity,
                                unit_cost=line.purchase_price))
            if line.purchase_price is not None:
                total += line.purchase_price * line.quantity
        purchase.total_cost = total
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(purchase)
    return purchase


# ------------------------------------------------------------------- CSV import
CSV_COLUMNS = [
    "company", "medicine", "strength", "dosage_form", "unit", "pack_size", "reorder_level",
    "batch_no", "expiry_date", "quantity", "sale_price", "mrp", "purchase_price",
]


def parse_expiry(text: str) -> date:
    t = text.strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(t, fmt).date()
        except ValueError:
            pass
    for fmt in ("%m/%Y", "%m-%Y", "%m/%y", "%m-%y", "%b-%Y", "%b %Y", "%b-%y"):
        try:
            d = datetime.strptime(t, fmt).date()
            # A month-only expiry (e.g. 08/2027) means the end of that month
            return d.replace(day=calendar.monthrange(d.year, d.month)[1])
        except ValueError:
            pass
    raise ValueError(f"unrecognised expiry date '{text}' (use YYYY-MM-DD, DD-MM-YYYY or MM/YYYY)")


def _money(v: str, field: str) -> Decimal | None:
    v = (v or "").strip().replace("₹", "").replace(",", "")
    if not v:
        return None
    try:
        d = Decimal(v)
    except InvalidOperation:
        raise ValueError(f"{field} '{v}' is not a number")
    if d < 0:
        raise ValueError(f"{field} cannot be negative")
    return d.quantize(Decimal("0.01"))


def import_csv(db: Session, content: str, user: User | None, *, dry_run: bool = False,
               is_sample: bool = False) -> ImportResult:
    """Import companies, medicines and batches.

    Re-importing the same file is safe: batch quantities are SET to the file's
    value (with an 'adjustment' movement when they change), never added twice.
    """
    reader = csv.DictReader(io.StringIO(content.lstrip("﻿")))
    headers = [h.strip().lower() for h in (reader.fieldnames or [])]
    missing = [c for c in ("company", "medicine") if c not in headers]
    if missing:
        raise HTTPException(status_code=422, detail=f"CSV is missing column(s): {', '.join(missing)}")

    res = ImportResult(companies_created=0, medicines_created=0, batches_created=0,
                       batches_topped_up=0, rows_read=0, errors=[], dry_run=dry_run)
    user_id = user.id if user else None
    try:
        for i, raw in enumerate(reader, start=2):  # row 1 is the header
            row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
            if not any(row.values()):
                continue
            res.rows_read += 1
            try:
                if not row.get("company") or not row.get("medicine"):
                    raise ValueError("company and medicine are required")
                company, created = get_or_create_company(db, row["company"], is_sample=is_sample)
                res.companies_created += created

                ident = dict(
                    company_id=company.id,
                    name=" ".join(row["medicine"].split()),
                    strength=" ".join(row.get("strength", "").split()),
                    dosage_form=" ".join(row.get("dosage_form", "").split()),
                    pack_size=" ".join(row.get("pack_size", "").split()),
                )
                med = db.scalar(select(Medicine).filter_by(**ident))
                if med is None:
                    reorder = int(row["reorder_level"]) if row.get("reorder_level") else 10
                    if reorder < 0:
                        raise ValueError("reorder_level cannot be negative")
                    med = Medicine(**ident, unit=row.get("unit") or "strips",
                                   reorder_level=reorder,
                                   is_sample=is_sample)
                    db.add(med)
                    db.flush()
                    res.medicines_created += 1

                if not row.get("batch_no"):
                    if row.get("quantity"):
                        raise ValueError("quantity given without batch_no; stock is tracked per batch")
                    continue
                if not row.get("expiry_date"):
                    raise ValueError("expiry_date is required when batch_no is given")
                expiry = parse_expiry(row["expiry_date"])
                qty_text = row.get("quantity") or "0"
                if not qty_text.isdigit():
                    raise ValueError(f"quantity '{qty_text}' must be a whole number ≥ 0")
                qty = int(qty_text)
                sale_price = _money(row.get("sale_price", ""), "sale_price")
                mrp = _money(row.get("mrp", ""), "mrp")
                if sale_price is None:
                    sale_price = mrp
                if sale_price is None:
                    raise ValueError("sale_price or mrp is required for a batch")
                if mrp is not None and sale_price > mrp:
                    raise ValueError("sale_price cannot be more than mrp")
                pprice = _money(row.get("purchase_price", ""), "purchase_price")
                batch_no = row["batch_no"].upper()

                batch = db.scalar(select(Batch).where(Batch.medicine_id == med.id, Batch.batch_no == batch_no))
                if batch is None:
                    batch = Batch(medicine_id=med.id, batch_no=batch_no, expiry_date=expiry, quantity=0,
                                  sale_price=sale_price, mrp=mrp, purchase_price=pprice)
                    db.add(batch)
                    db.flush()
                    res.batches_created += 1
                    if qty:
                        change_batch_quantity(db, batch, qty, "opening", user_id=user_id,
                                              reason="CSV import")
                else:
                    if batch.expiry_date != expiry:
                        raise ValueError(
                            f"batch {batch_no} already exists with expiry {batch.expiry_date:%Y-%m-%d}"
                        )
                    batch.sale_price, batch.mrp = sale_price, mrp
                    if pprice is not None:
                        batch.purchase_price = pprice
                    if qty != batch.quantity:
                        change_batch_quantity(db, batch, qty - batch.quantity, "adjustment",
                                              user_id=user_id, reason="CSV import: quantity set from file")
                        res.batches_topped_up += 1
            except HTTPException as e:
                res.errors.append(f"Row {i}: {e.detail}")
                raise
            except ValueError as e:
                res.errors.append(f"Row {i}: {e}")

        if res.errors or dry_run:
            db.rollback()
        else:
            db.commit()
    except Exception:
        db.rollback()
        if not res.errors:
            raise
    return res


def has_history(db: Session, batch_ids: list[int]) -> bool:
    if not batch_ids:
        return False
    return db.scalar(
        select(StockMovement.id).where(
            StockMovement.batch_id.in_(batch_ids), StockMovement.kind.notin_(["opening"])
        ).limit(1)
    ) is not None


# ------------------------------------------------------------------- Marg ERP report
def import_marg(db: Session, report, user: User | None, *, dry_run: bool = False,
                reorder_level: int = 10) -> ImportResult:
    """Sync stock from a Marg "Stock & Sales Analysis" report.

    For every item the report's CLOSING quantity becomes the medicine's stock, held in
    one row without a batch number, with the report's earliest expiry (M.EXP). Running it
    again with a newer report sets the new quantities; nothing is ever added twice.
    """
    from ..models import ShopProfile
    from .marg import period_label

    res = ImportResult(companies_created=0, medicines_created=0, batches_created=0,
                       batches_topped_up=0, rows_read=len(report.items), errors=[], dry_run=dry_run,
                       warnings=list(report.warnings), stock_as_of=report.period_to)
    if not report.items:
        res.errors.append("No items found. Is this the Marg 'Stock & Sales Analysis' report exported to Excel?")
        return res
    user_id = user.id if user else None
    reason = period_label(report)
    seen: set[int] = set()
    try:
        for it in report.items:
            company, created = get_or_create_company(db, it.company)
            res.companies_created += created
            ident = dict(company_id=company.id, name=it.name, strength="", dosage_form="", pack_size=it.pack)
            med = db.scalar(select(Medicine).filter_by(**ident))
            if med is None:
                med = Medicine(**ident, unit="pcs", reorder_level=reorder_level)
                db.add(med)
                db.flush()
                res.medicines_created += 1
            if med.id in seen:
                res.warnings.append(f"Row {it.row}: {it.name} {it.pack} appears twice under {it.company}; the later row was used")
            seen.add(med.id)

            summary = db.scalar(select(Batch).where(Batch.medicine_id == med.id, Batch.batch_no.is_(None)))
            is_new = summary is None
            if summary is None:
                if it.closing == 0:
                    continue
                summary = Batch(medicine_id=med.id, batch_no=None, expiry_date=it.earliest_expiry, quantity=0)
                db.add(summary)
                db.flush()
                res.batches_created += 1
            # This row is a summary, not a real batch, so its expiry follows the latest report
            summary.expiry_date = it.earliest_expiry if it.closing > 0 else None
            if it.closing != summary.quantity:
                if not is_new:
                    res.batches_topped_up += 1
                change_batch_quantity(db, summary, it.closing - summary.quantity, "import",
                                      user_id=user_id, reason=reason)
            extra = db.scalar(select(Batch.id).where(Batch.medicine_id == med.id, Batch.batch_no.is_not(None),
                                                     Batch.quantity > 0).limit(1))
            if extra:
                res.warnings.append(f"{it.name} ({it.company}) also has batches entered by hand; its stock may be counted twice")

        # Stock rows from earlier reports for items missing from this one are left as they were
        stale = db.scalars(
            select(Batch).where(Batch.batch_no.is_(None), Batch.quantity > 0,
                                Batch.medicine_id.notin_(seen or {0}))
        ).all()
        res.medicines_not_in_file = len(stale)
        if stale:
            res.warnings.append(f"{len(stale)} item(s) with stock are not in this report and were left unchanged. "
                                "Hide or adjust them in Inventory if they were removed in Marg.")

        shop = db.get(ShopProfile, 1)
        if shop is not None:
            if report.period_to:
                shop.stock_as_of = report.period_to
            shop.stock_source = "Marg ERP stock report"
            if report.shop_name and name_key(report.shop_name) != name_key(shop.name):
                res.warnings.append(f"The report is for '{report.shop_name}', but the shop is named '{shop.name}'.")

        if dry_run:
            db.rollback()
        else:
            db.commit()
    except Exception:
        db.rollback()
        raise
    return res
