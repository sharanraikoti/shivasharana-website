"""Inventory administration. Every endpoint here needs a signed-in user."""
from __future__ import annotations

from datetime import datetime, time, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Batch, Company, Medicine, Purchase, PurchaseItem, Sale, ShopProfile, StockMovement, User
from ..schemas import (
    BatchOut,
    BatchUpdate,
    CompanyAdminOut,
    CompanyIn,
    ImportResult,
    MedicineAdminRow,
    MedicineIn,
    MedicineOut,
    MovementOut,
    PurchaseIn,
    PurchaseItemOut,
    PurchaseOut,
    ShopOut,
    ShopUpdate,
    StockAdjust,
    Summary,
    UserIn,
    UserOut,
    UserUpdate,
)
from ..security import hash_password, require_admin, require_staff
from ..services.inventory import CSV_COLUMNS, has_history, import_csv, import_marg, receive_purchase
from ..services.marg import parse_marg_report
from ..services.stock import (
    batch_label,
    batch_status,
    change_batch_quantity,
    expiry_sort_key,
    medicine_status,
    name_key,
    near_expiry_cutoff,
    shop_tz,
    saleable_by_medicine_subquery,
    saleable_for_medicine,
    today,
    unique_slug,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ------------------------------------------------------------------ shop
@router.get("/shop", response_model=ShopOut)
def get_shop(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    shop = db.get(ShopProfile, 1)
    if shop is None:  # first run: an empty form to fill in
        return ShopOut(name="", show_quantities=True, show_batches=True, is_sample=False)
    return shop


@router.put("/shop", response_model=ShopOut)
def update_shop(data: ShopUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    shop = db.get(ShopProfile, 1) or ShopProfile(id=1)
    for k, v in data.model_dump().items():
        setattr(shop, k, v.strip() if isinstance(v, str) else v)
    db.add(shop)
    db.commit()
    return shop


# ------------------------------------------------------------------ companies
@router.get("/companies", response_model=list[CompanyAdminOut])
def all_companies(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    return db.scalars(select(Company).order_by(Company.name_key)).all()


@router.post("/companies", response_model=CompanyAdminOut, status_code=201)
def create_company(data: CompanyIn, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if db.scalar(select(Company.id).where(Company.name_key == name_key(data.name))):
        raise HTTPException(409, f"A company called '{data.name}' already exists.")
    c = Company(**data.model_dump(), name_key=name_key(data.name), slug=unique_slug(db, data.name))
    db.add(c)
    db.commit()
    return c


@router.put("/companies/{company_id}", response_model=CompanyAdminOut)
def update_company(company_id: int, data: CompanyIn, db: Session = Depends(get_db),
                   _: User = Depends(require_admin)):
    c = db.get(Company, company_id) or _404("Company")
    clash = db.scalar(select(Company.id).where(Company.name_key == name_key(data.name), Company.id != c.id))
    if clash:
        raise HTTPException(409, f"A company called '{data.name}' already exists.")
    # The slug (web address) stays the same so printed company QR codes keep working
    for k, v in data.model_dump().items():
        setattr(c, k, v)
    c.name_key = name_key(data.name)
    c.is_sample = False
    db.commit()
    return c


@router.delete("/companies/{company_id}", status_code=204)
def delete_company(company_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    c = db.get(Company, company_id) or _404("Company")
    if db.scalar(select(Medicine.id).where(Medicine.company_id == c.id).limit(1)):
        raise HTTPException(409, "Remove this company's medicines first, or hide the company instead.")
    db.delete(c)
    db.commit()
    return Response(status_code=204)


# ------------------------------------------------------------------ medicines
def _medicine_rows(db: Session, company_id: int | None = None, q: str = "", ids: list[int] | None = None):
    sub = saleable_by_medicine_subquery()
    stmt = (
        select(Medicine, Company.name, sub.c.saleable, sub.c.expired, sub.c.batch_count)
        .join(Company, Company.id == Medicine.company_id)
        .outerjoin(sub, sub.c.medicine_id == Medicine.id)
        .order_by(Company.name_key, Medicine.name, Medicine.strength)
    )
    if company_id:
        stmt = stmt.where(Medicine.company_id == company_id)
    if q.strip():
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(func.lower(Medicine.name).like(like))
    if ids is not None:
        stmt = stmt.where(Medicine.id.in_(ids))
    out = []
    for med, cname, saleable, expired, bcount in db.execute(stmt):
        saleable, expired = int(saleable or 0), int(expired or 0)
        out.append(MedicineAdminRow(
            **MedicineOut.model_validate(med).model_dump(),
            company_name=cname, saleable_quantity=saleable, expired_quantity=expired,
            batch_count=int(bcount or 0), status=medicine_status(saleable, med.reorder_level),
        ))
    return out


@router.get("/medicines", response_model=list[MedicineAdminRow])
def list_medicines(company_id: int | None = None, q: str = Query("", max_length=100),
                   db: Session = Depends(get_db), _: User = Depends(require_staff)):
    return _medicine_rows(db, company_id, q)


@router.post("/medicines", response_model=MedicineOut, status_code=201)
def create_medicine(data: MedicineIn, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    db.get(Company, data.company_id) or _404("Company")
    m = Medicine(**data.model_dump())
    db.add(m)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This medicine (same name, strength and form) already exists for the company.")
    return m


@router.put("/medicines/{medicine_id}", response_model=MedicineOut)
def update_medicine(medicine_id: int, data: MedicineIn, db: Session = Depends(get_db),
                    _: User = Depends(require_admin)):
    m = db.get(Medicine, medicine_id) or _404("Medicine")
    db.get(Company, data.company_id) or _404("Company")
    for k, v in data.model_dump().items():
        setattr(m, k, v)
    m.is_sample = False
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Another medicine with the same name, strength and form already exists.")
    return m


@router.delete("/medicines/{medicine_id}", status_code=204)
def delete_medicine(medicine_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    m = db.scalar(select(Medicine).where(Medicine.id == medicine_id).options(selectinload(Medicine.batches))) \
        or _404("Medicine")
    if has_history(db, [b.id for b in m.batches]):
        raise HTTPException(409, "This medicine has purchase or sales history. Hide it instead of deleting.")
    for b in m.batches:
        db.query(StockMovement).filter(StockMovement.batch_id == b.id).delete()
    db.delete(m)
    db.commit()
    return Response(status_code=204)


# ------------------------------------------------------------------ batches
@router.get("/medicines/{medicine_id}/batches", response_model=list[BatchOut])
def medicine_batches(medicine_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    m = db.get(Medicine, medicine_id) or _404("Medicine")
    saleable = saleable_for_medicine(db, m.id)
    batches = sorted(db.scalars(select(Batch).where(Batch.medicine_id == m.id)).all(), key=expiry_sort_key)
    out = []
    for b in batches:
        row = BatchOut.model_validate(b)
        row.status = batch_status(b, saleable, m.reorder_level)
        out.append(row)
    return out


@router.put("/batches/{batch_id}", response_model=BatchOut)
def update_batch(batch_id: int, data: BatchUpdate, db: Session = Depends(get_db),
                 _: User = Depends(require_admin)):
    """Correct batch details. Quantity is changed only through purchases, bills or adjustments."""
    b = db.get(Batch, batch_id) or _404("Batch")
    if data.mrp is not None and data.sale_price > data.mrp:
        raise HTTPException(422, "Sale price cannot be more than MRP.")
    b.batch_no = " ".join((data.batch_no or "").split()).upper() or None
    if b.batch_no and data.expiry_date is None:
        raise HTTPException(422, "Expiry date is required for a batch.")
    b.expiry_date, b.mrp, b.sale_price, b.purchase_price = data.expiry_date, data.mrp, data.sale_price, data.purchase_price
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Another batch of this medicine already has that batch number.")
    return b


@router.post("/batches/{batch_id}/adjust", response_model=BatchOut)
def adjust_batch(batch_id: int, data: StockAdjust, db: Session = Depends(get_db),
                 user: User = Depends(require_admin)):
    """Manual correction, e.g. damaged strips, stock count difference, expired stock removed."""
    b = db.get(Batch, batch_id) or _404("Batch")
    if b.quantity + data.change < 0:
        raise HTTPException(409, f"Only {b.quantity} left in this {batch_label(b)}.")
    change_batch_quantity(db, b, data.change, "adjustment", user_id=user.id, reason=data.reason.strip())
    db.commit()
    db.refresh(b)
    return b


# ------------------------------------------------------------------ purchases
def _purchase_out(p: Purchase) -> PurchaseOut:
    return PurchaseOut(
        id=p.id, supplier_name=p.supplier_name, invoice_no=p.invoice_no, purchase_date=p.purchase_date,
        total_cost=p.total_cost, created_at=p.created_at,
        items=[PurchaseItemOut(medicine_name=f"{i.batch.medicine.name} {i.batch.medicine.strength}".strip(),
                               batch_no=i.batch.batch_no, expiry_date=i.batch.expiry_date,
                               quantity=i.quantity, unit_cost=i.unit_cost) for i in p.items],
    )


@router.post("/purchases", response_model=PurchaseOut, status_code=201)
def create_purchase(data: PurchaseIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    p = receive_purchase(db, data, user)
    return _purchase_out(_load_purchase(db, p.id))


@router.get("/purchases", response_model=list[PurchaseOut])
def list_purchases(limit: int = Query(50, ge=1, le=500), db: Session = Depends(get_db),
                   _: User = Depends(require_admin)):
    ps = db.scalars(
        select(Purchase).order_by(Purchase.id.desc()).limit(limit)
        .options(selectinload(Purchase.items).selectinload(PurchaseItem.batch).selectinload(Batch.medicine))
    ).all()
    return [_purchase_out(p) for p in ps]


def _load_purchase(db: Session, pid: int) -> Purchase:
    return db.scalar(
        select(Purchase).where(Purchase.id == pid)
        .options(selectinload(Purchase.items).selectinload(PurchaseItem.batch).selectinload(Batch.medicine))
    )


# ------------------------------------------------------------------ history & dashboard
@router.get("/movements", response_model=list[MovementOut])
def movements(medicine_id: int | None = None, batch_id: int | None = None,
              limit: int = Query(100, ge=1, le=1000), db: Session = Depends(get_db),
              _: User = Depends(require_admin)):
    stmt = (
        select(StockMovement)
        .join(Batch, Batch.id == StockMovement.batch_id)
        .options(selectinload(StockMovement.batch).selectinload(Batch.medicine).selectinload(Medicine.company),
                 selectinload(StockMovement.user))
        .order_by(StockMovement.id.desc())
        .limit(limit)
    )
    if medicine_id:
        stmt = stmt.where(Batch.medicine_id == medicine_id)
    if batch_id:
        stmt = stmt.where(StockMovement.batch_id == batch_id)
    out = []
    for mv in db.scalars(stmt):
        med = mv.batch.medicine
        out.append(MovementOut(
            id=mv.id, created_at=mv.created_at, kind=mv.kind, change=mv.change, quantity_after=mv.quantity_after,
            medicine_name=f"{med.name} {med.strength}".strip(), company_name=med.company.name,
            batch_no=mv.batch.batch_no, reference_type=mv.reference_type, reference_id=mv.reference_id,
            reason=mv.reason, user=(mv.user.full_name or mv.user.username) if mv.user else None,
        ))
    return out


@router.get("/summary", response_model=Summary)
def summary(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    on = today()
    rows = _medicine_rows(db)
    low = [r for r in rows if r.status == "Low Stock"]
    out_count = sum(1 for r in rows if r.status == "Out of Stock")

    def batch_list(stmt):
        return [
            {"batch_id": b.id, "medicine": f"{m.name} {m.strength}".strip(), "company": c.name,
             "batch_no": b.batch_no, "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None, "quantity": b.quantity,
             "unit": m.unit}
            for b, m, c in db.execute(stmt)
        ]

    base = select(Batch, Medicine, Company).join(Medicine, Medicine.id == Batch.medicine_id) \
        .join(Company, Company.id == Medicine.company_id).where(Batch.quantity > 0).order_by(Batch.expiry_date)
    near = batch_list(base.where(Batch.expiry_date >= on, Batch.expiry_date <= near_expiry_cutoff(on)).limit(50))
    expired = batch_list(base.where(Batch.expiry_date < on).limit(50))

    start = datetime.combine(on, time.min, tzinfo=shop_tz()).astimezone(timezone.utc)
    sales_today = db.scalar(select(func.coalesce(func.sum(Sale.total), 0))
                            .where(Sale.status == "completed", Sale.created_at >= start)) or 0
    bills_today = db.scalar(select(func.count(Sale.id)).where(Sale.status == "completed", Sale.created_at >= start)) or 0
    return Summary(
        companies=db.scalar(select(func.count(Company.id))) or 0,
        medicines=len(rows),
        saleable_units=sum(r.saleable_quantity for r in rows),
        low_stock=low[:50],
        out_of_stock=out_count,
        near_expiry=near,
        expired_with_stock=expired,
        sales_today=Decimal(sales_today),
        bills_today=bills_today,
    )


# ------------------------------------------------------------------ import
@router.get("/import/template")
def import_template(_: User = Depends(require_admin)):
    example = "Example Company Name,Paracetamol,500 mg,Tablet,strips,10x10,20,AB1234,2027-08-31,50,18.50,20.00,14.00\n"
    return Response(",".join(CSV_COLUMNS) + "\n" + example, media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="stock_template.csv"'})


@router.post("/import", response_model=ImportResult)
async def import_file(file: UploadFile = File(...), dry_run: bool = Query(True),
                      db: Session = Depends(get_db), user: User = Depends(require_admin)):
    raw = await file.read()
    if len(raw) > 5_000_000:
        raise HTTPException(413, "File is larger than 5 MB.")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252", errors="replace")  # Excel on Windows
    return import_csv(db, text, user, dry_run=dry_run)


@router.post("/import/marg", response_model=ImportResult)
async def import_marg_report(file: UploadFile = File(...), dry_run: bool = Query(True),
                             db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Upload the Marg ERP 'Stock & Sales Analysis' report (.xls or .xlsx)."""
    name = (file.filename or "").lower()
    if not name.endswith((".xls", ".xlsx")):
        raise HTTPException(422, "Upload the Marg report as an Excel file (.xls or .xlsx).")
    raw = await file.read()
    if len(raw) > 20_000_000:
        raise HTTPException(413, "File is larger than 20 MB.")
    try:
        report = parse_marg_report(raw, name)
    except Exception:
        raise HTTPException(422, "Could not read this Excel file. Export the report from Marg again and retry.")
    return import_marg(db, report, user, dry_run=dry_run)


# ------------------------------------------------------------------ users
@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.scalars(select(User).order_by(User.username)).all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(data: UserIn, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if db.scalar(select(User.id).where(User.username == data.username)):
        raise HTTPException(409, "That username is taken.")
    u = User(username=data.username, full_name=data.full_name, role=data.role,
             password_hash=hash_password(data.password))
    db.add(u)
    db.commit()
    return u


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db),
                me: User = Depends(require_admin)):
    u = db.get(User, user_id) or _404("User")
    if u.id == me.id and (data.is_active is False or data.role == "staff"):
        raise HTTPException(409, "You cannot remove your own admin access.")
    if data.full_name is not None:
        u.full_name = data.full_name
    if data.role is not None:
        u.role = data.role
    if data.is_active is not None:
        u.is_active = data.is_active
    if data.password:
        u.password_hash = hash_password(data.password)
    db.commit()
    return u


def _404(what: str):
    raise HTTPException(404, f"{what} not found.")
