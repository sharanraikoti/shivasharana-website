"""Request and response shapes (validated by Pydantic)."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

StockStatus = Literal["In Stock", "Low Stock", "Out of Stock", "Near Expiry", "Expired"]


def _clean(v: str | None) -> str | None:
    if v is None:
        return None
    v = " ".join(v.split())
    return v or None


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------- shop
class ShopBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    tagline: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=3000)
    address_line1: str | None = Field(default=None, max_length=300)
    address_line2: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    pincode: str | None = Field(default=None, max_length=12)
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    opening_hours: str | None = Field(default=None, max_length=1000)
    drug_licence_no: str | None = Field(default=None, max_length=120)
    gstin: str | None = Field(default=None, max_length=30)
    logo_url: str | None = Field(default=None, max_length=500)

    @field_validator("email", mode="before")
    @classmethod
    def _empty_email(cls, v):
        return v or None


class ShopUpdate(ShopBase):
    show_quantities: bool = True
    show_batches: bool = True
    is_sample: bool = False


class ShopOut(ShopBase, ORM):
    show_quantities: bool
    show_batches: bool
    is_sample: bool
    stock_as_of: date | None = None
    stock_source: str | None = None


# ---------------------------------------------------------------- companies
class CompanyIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    logo_url: str | None = Field(default=None, max_length=500)
    logo_source: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=2000)
    is_public: bool = True

    @field_validator("name")
    @classmethod
    def _tidy_name(cls, v):
        v = _clean(v)
        if not v:
            raise ValueError("Company name is required")
        return v

    @field_validator("logo_url")
    @classmethod
    def _logo_needs_https(cls, v):
        if v and not v.startswith("https://"):
            raise ValueError("Logo URL must start with https://")
        return v or None


class CompanyCard(BaseModel):
    id: int
    name: str
    slug: str
    logo_url: str | None
    product_count: int
    in_stock_count: int
    is_sample: bool


class CompanyPage(BaseModel):
    items: list[CompanyCard]
    total: int
    page: int
    page_size: int
    pages: int


class CompanyAdminOut(ORM):
    id: int
    name: str
    slug: str
    logo_url: str | None
    logo_source: str | None
    description: str | None
    is_public: bool
    is_sample: bool


# ---------------------------------------------------------------- medicines & stock
class MedicineIn(BaseModel):
    company_id: int
    name: str = Field(min_length=1, max_length=200)
    strength: str = Field(default="", max_length=80)
    dosage_form: str = Field(default="", max_length=80)
    unit: str = Field(default="strips", min_length=1, max_length=40)
    pack_size: str = Field(default="", max_length=80)
    reorder_level: int = Field(default=10, ge=0, le=1_000_000)
    is_public: bool = True

    @field_validator("pack_size", mode="before")
    @classmethod
    def _pack(cls, v):
        return _clean(v) or ""

    @field_validator("name", "strength", "dosage_form", "unit")
    @classmethod
    def _tidy(cls, v):
        return _clean(v) or ""


class MedicineOut(ORM):
    id: int
    company_id: int
    name: str
    strength: str
    dosage_form: str
    unit: str
    pack_size: str
    reorder_level: int
    is_public: bool
    is_sample: bool


class MedicineAdminRow(MedicineOut):
    company_name: str
    saleable_quantity: int
    expired_quantity: int
    batch_count: int
    status: StockStatus


class StockRow(BaseModel):
    """One row on the public company stock page."""

    medicine_id: int
    batch_id: int | None
    name: str
    strength: str | None
    dosage_form: str | None
    pack_size: str | None = None
    batch_no: str | None
    quantity: int | None  # None when the owner hides quantities
    unit: str
    expiry_date: date | None
    expiry_is_earliest: bool = False  # expiry is the earliest of several (no batch details)
    status: StockStatus
    saleable: bool


class CompanyStock(BaseModel):
    company: CompanyCard
    rows: list[StockRow]
    show_quantities: bool
    show_batches: bool
    stock_as_of: date | None = None
    stock_source: str | None = None
    generated_at: datetime


class BatchOut(ORM):
    id: int
    medicine_id: int
    batch_no: str | None
    expiry_date: date | None
    quantity: int
    mrp: Decimal | None
    sale_price: Decimal | None
    purchase_price: Decimal | None
    status: StockStatus | None = None


class BatchUpdate(BaseModel):
    batch_no: str | None = Field(default=None, max_length=80)
    expiry_date: date | None = None
    mrp: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    sale_price: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    purchase_price: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)


class StockAdjust(BaseModel):
    change: int = Field(description="Positive adds stock, negative removes it")
    reason: str = Field(min_length=3, max_length=500)

    @field_validator("change")
    @classmethod
    def _nonzero(cls, v):
        if v == 0:
            raise ValueError("Change cannot be zero")
        return v


# ---------------------------------------------------------------- purchases
class PurchaseItemIn(BaseModel):
    medicine_id: int
    batch_no: str = Field(min_length=1, max_length=80)
    expiry_date: date
    quantity: int = Field(gt=0, le=10_000_000)
    sale_price: Decimal = Field(ge=0, max_digits=10, decimal_places=2)
    mrp: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    purchase_price: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)

    @field_validator("batch_no")
    @classmethod
    def _batch(cls, v):
        return (_clean(v) or "").upper()


class PurchaseIn(BaseModel):
    supplier_name: str = Field(min_length=1, max_length=200)
    invoice_no: str | None = Field(default=None, max_length=80)
    purchase_date: date
    notes: str | None = Field(default=None, max_length=2000)
    items: list[PurchaseItemIn] = Field(min_length=1, max_length=500)


class PurchaseItemOut(BaseModel):
    medicine_name: str
    batch_no: str
    expiry_date: date
    quantity: int
    unit_cost: Decimal | None


class PurchaseOut(BaseModel):
    id: int
    supplier_name: str
    invoice_no: str | None
    purchase_date: date
    total_cost: Decimal
    created_at: datetime
    items: list[PurchaseItemOut]


# ---------------------------------------------------------------- billing
class BillItemIn(BaseModel):
    medicine_id: int
    quantity: int = Field(gt=0, le=100_000)
    batch_id: int | None = Field(default=None, description="Leave empty to use the earliest-expiring stock first")


class BillIn(BaseModel):
    client_request_id: str = Field(min_length=8, max_length=80)
    customer_name: str | None = Field(default=None, max_length=200)
    customer_phone: str | None = Field(default=None, max_length=40)
    items: list[BillItemIn] = Field(min_length=1, max_length=200)


class BillItemOut(BaseModel):
    id: int
    medicine_id: int
    medicine_name: str
    strength: str
    pack_size: str = ""
    company_name: str
    batch_id: int
    batch_no: str | None
    expiry_date: date | None
    quantity: int
    returned_quantity: int
    unit_price: Decimal
    line_total: Decimal


class BillOut(BaseModel):
    id: int
    bill_no: str
    status: str
    customer_name: str | None
    customer_phone: str | None
    total: Decimal
    created_at: datetime
    created_by: str | None
    cancelled_at: datetime | None
    cancel_reason: str | None
    items: list[BillItemOut]


class CancelIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class ReturnItemIn(BaseModel):
    sale_item_id: int
    quantity: int = Field(gt=0)


class ReturnIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
    items: list[ReturnItemIn] = Field(min_length=1)


class BillingSearchRow(BaseModel):
    medicine_id: int
    name: str
    strength: str
    dosage_form: str
    pack_size: str = ""
    unit: str
    company_name: str
    saleable_quantity: int
    next_price: Decimal | None
    next_expiry: date | None
    batches: list[BatchOut]


# ---------------------------------------------------------------- auth & users
class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=200)


class UserOut(ORM):
    id: int
    username: str
    full_name: str | None
    role: str
    is_active: bool


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserIn(BaseModel):
    username: str = Field(min_length=3, max_length=80, pattern=r"^[A-Za-z0-9_.-]+$")
    full_name: str | None = Field(default=None, max_length=200)
    password: str = Field(min_length=8, max_length=200)
    role: Literal["admin", "staff"] = "staff"


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=200)
    role: Literal["admin", "staff"] | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=200)


class MovementOut(BaseModel):
    id: int
    created_at: datetime
    kind: str
    change: int
    quantity_after: int
    medicine_name: str
    company_name: str
    batch_no: str | None
    reference_type: str | None
    reference_id: int | None
    reason: str | None
    user: str | None


class Summary(BaseModel):
    companies: int
    medicines: int
    saleable_units: int
    low_stock: list[MedicineAdminRow]
    out_of_stock: int
    near_expiry: list[dict]
    expired_with_stock: list[dict]
    sales_today: Decimal
    bills_today: int


class ImportResult(BaseModel):
    companies_created: int
    medicines_created: int
    batches_created: int
    batches_topped_up: int
    rows_read: int
    errors: list[str]
    dry_run: bool
    warnings: list[str] = []
    medicines_not_in_file: int = 0
    stock_as_of: date | None = None
