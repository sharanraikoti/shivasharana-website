"""Database tables.

Company 1─* Medicine 1─* Batch. Stock lives on batches only; every change to a
batch quantity writes a StockMovement row so the history can be audited.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


Money = Numeric(10, 2)


class ShopProfile(Base):
    """A single row (id=1) holding the shop's public details."""

    __tablename__ = "shop_profile"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    tagline: Mapped[str | None] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text)
    address_line1: Mapped[str | None] = mapped_column(String(300))
    address_line2: Mapped[str | None] = mapped_column(String(300))
    city: Mapped[str | None] = mapped_column(String(120))
    state: Mapped[str | None] = mapped_column(String(120))
    pincode: Mapped[str | None] = mapped_column(String(12))
    phone: Mapped[str | None] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(200))
    opening_hours: Mapped[str | None] = mapped_column(Text)
    drug_licence_no: Mapped[str | None] = mapped_column(String(120))
    gstin: Mapped[str | None] = mapped_column(String(30))
    logo_url: Mapped[str | None] = mapped_column(String(500))
    # Owner's choices about what the public sees
    show_quantities: Mapped[bool] = mapped_column(Boolean, default=True)
    show_batches: Mapped[bool] = mapped_column(Boolean, default=True)
    # True while the details are placeholders, so the site can warn visitors
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    # Set by stock imports so visitors can see how current the stock is
    stock_as_of: Mapped[date | None] = mapped_column(Date)
    stock_source: Mapped[str | None] = mapped_column(String(200))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class User(Base):
    __tablename__ = "app_user"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    full_name: Mapped[str | None] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20), default="staff")  # admin | staff
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (CheckConstraint("role in ('admin','staff')", name="ck_user_role"),)


class Company(Base):
    __tablename__ = "company"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    # Lower-cased, space-collapsed name; unique so the same company can't be added twice
    name_key: Mapped[str] = mapped_column(String(200), unique=True)
    slug: Mapped[str] = mapped_column(String(220), unique=True, index=True)
    logo_url: Mapped[str | None] = mapped_column(String(500))
    logo_source: Mapped[str | None] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    medicines: Mapped[list[Medicine]] = relationship(back_populates="company", cascade="all, delete-orphan")


class Medicine(Base):
    __tablename__ = "medicine"

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("company.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    strength: Mapped[str] = mapped_column(String(80), default="")
    dosage_form: Mapped[str] = mapped_column(String(80), default="")
    unit: Mapped[str] = mapped_column(String(40), default="strips")
    pack_size: Mapped[str] = mapped_column(String(80), default="")
    reorder_level: Mapped[int] = mapped_column(Integer, default=10)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    company: Mapped[Company] = relationship(back_populates="medicines")
    batches: Mapped[list[Batch]] = relationship(back_populates="medicine", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("company_id", "name", "strength", "dosage_form", "pack_size", name="uq_medicine_identity"),
        CheckConstraint("reorder_level >= 0", name="ck_medicine_reorder"),
    )


class Batch(Base):
    __tablename__ = "batch"

    id: Mapped[int] = mapped_column(primary_key=True)
    medicine_id: Mapped[int] = mapped_column(ForeignKey("medicine.id", ondelete="CASCADE"), index=True)
    # None when the source (e.g. a Marg stock report) has no batch numbers. Such a row holds
    # the medicine's total stock and the EARLIEST expiry of that stock; it is never invented.
    batch_no: Mapped[str | None] = mapped_column(String(80))
    expiry_date: Mapped[date | None] = mapped_column(Date)
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    mrp: Mapped[Decimal | None] = mapped_column(Money)
    sale_price: Mapped[Decimal | None] = mapped_column(Money)  # None = not priced yet; cannot be billed
    purchase_price: Mapped[Decimal | None] = mapped_column(Money)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    medicine: Mapped[Medicine] = relationship(back_populates="batches")

    __table_args__ = (
        UniqueConstraint("medicine_id", "batch_no", name="uq_batch_per_medicine"),
        CheckConstraint("quantity >= 0", name="ck_batch_qty_nonneg"),
        CheckConstraint("sale_price >= 0", name="ck_batch_price_nonneg"),
    )


class Purchase(Base):
    """Stock received from a distributor/company."""

    __tablename__ = "purchase"

    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_name: Mapped[str] = mapped_column(String(200))
    invoice_no: Mapped[str | None] = mapped_column(String(80))
    purchase_date: Mapped[date] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    total_cost: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("app_user.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    items: Mapped[list[PurchaseItem]] = relationship(back_populates="purchase", cascade="all, delete-orphan")


class PurchaseItem(Base):
    __tablename__ = "purchase_item"

    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_id: Mapped[int] = mapped_column(ForeignKey("purchase.id", ondelete="CASCADE"), index=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("batch.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    unit_cost: Mapped[Decimal | None] = mapped_column(Money)

    purchase: Mapped[Purchase] = relationship(back_populates="items")
    batch: Mapped[Batch] = relationship()

    __table_args__ = (CheckConstraint("quantity > 0", name="ck_purchase_qty_pos"),)


class Sale(Base):
    """A bill. Cancelling keeps the row and restores stock."""

    __tablename__ = "sale"

    id: Mapped[int] = mapped_column(primary_key=True)
    bill_no: Mapped[str] = mapped_column(String(40), unique=True)
    # Sent by the billing screen; a repeated submit with the same id returns the first bill
    client_request_id: Mapped[str] = mapped_column(String(80), unique=True)
    customer_name: Mapped[str | None] = mapped_column(String(200))
    customer_phone: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="completed")  # completed | cancelled
    total: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("app_user.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(Text)

    items: Mapped[list[SaleItem]] = relationship(back_populates="sale", cascade="all, delete-orphan")
    created_by: Mapped[User | None] = relationship()

    __table_args__ = (CheckConstraint("status in ('completed','cancelled')", name="ck_sale_status"),)


class SaleItem(Base):
    __tablename__ = "sale_item"

    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sale.id", ondelete="CASCADE"), index=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("batch.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    returned_quantity: Mapped[int] = mapped_column(Integer, default=0)
    unit_price: Mapped[Decimal] = mapped_column(Money)
    line_total: Mapped[Decimal] = mapped_column(Money)

    sale: Mapped[Sale] = relationship(back_populates="items")
    batch: Mapped[Batch] = relationship()

    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_saleitem_qty_pos"),
        CheckConstraint("returned_quantity >= 0 AND returned_quantity <= quantity", name="ck_saleitem_returned"),
    )


class StockMovement(Base):
    """Append-only log of every stock change."""

    __tablename__ = "stock_movement"

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("batch.id"), index=True)
    # purchase | sale | sale_cancel | return | adjustment | opening
    kind: Mapped[str] = mapped_column(String(20))
    change: Mapped[int] = mapped_column(Integer)
    quantity_after: Mapped[int] = mapped_column(Integer)
    reference_type: Mapped[str | None] = mapped_column(String(20))
    reference_id: Mapped[int | None] = mapped_column(Integer)
    reason: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("app_user.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    batch: Mapped[Batch] = relationship()
    user: Mapped[User | None] = relationship()
