from datetime import date, timedelta

import pytest

from app.config import get_settings
from app.services.inventory import parse_expiry
from app.services.qr import url_problem

from .conftest import rid


# ------------------------------------------------------------------ helpers
def company(client, name_part):
    items = client.get("/api/companies", params={"q": name_part}).json()["items"]
    assert len(items) == 1, items
    return items[0]


def stock(client, slug):
    r = client.get(f"/api/companies/{slug}")
    assert r.status_code == 200, r.text
    return r.json()


def medicine_id(client, headers, name):
    rows = client.get("/api/admin/medicines", params={"q": name}, headers=headers).json()
    assert rows, name
    return rows[0]["id"], rows[0]


# ------------------------------------------------------------------ public pages
def test_root_and_shop(client):
    assert client.get("/").json()["status"] == "success"
    shop = client.get("/api/shop").json()
    assert shop["is_sample"] is True
    assert shop["phone"] is None  # nothing invented


def test_company_directory_counts_and_search(client):
    data = client.get("/api/companies").json()
    names = [c["name"] for c in data["items"]]
    assert names == sorted(names, key=str.lower)
    assert data["total"] == 6
    alpha = company(client, "alpha")
    # Paracetamol, Cetirizine, Amoxicillin -> all have saleable stock
    assert alpha["product_count"] == 3 and alpha["in_stock_count"] == 3
    beta = company(client, "beta")
    assert beta["product_count"] == 3 and beta["in_stock_count"] == 2  # Metformin has 0

    assert client.get("/api/companies", params={"q": "zzz-nothing"}).json()["items"] == []
    desc = client.get("/api/companies", params={"order": "desc"}).json()["items"]
    assert [c["name"] for c in desc] == names[::-1]
    page = client.get("/api/companies", params={"page_size": 4, "page": 2}).json()
    assert page["pages"] == 2 and len(page["items"]) == 2


def test_company_stock_statuses(client):
    alpha = company(client, "alpha")
    rows = stock(client, alpha["slug"])["rows"]
    by_batch = {r["batch_no"]: r for r in rows}
    assert by_batch["SAMPLE-A01"]["status"] == "In Stock"
    assert by_batch["SAMPLE-A02"]["status"] == "Near Expiry"
    assert by_batch["SAMPLE-A03"]["status"] == "Low Stock"  # 8 <= reorder 15
    assert by_batch["SAMPLE-A04"]["status"] == "Expired"
    assert by_batch["SAMPLE-A04"]["saleable"] is False

    beta = stock(client, company(client, "beta")["slug"])["rows"]
    assert {r["name"]: r["status"] for r in beta}["Metformin"] == "Out of Stock"

    gamma = stock(client, company(client, "gamma")["slug"])["rows"]
    vit = [r for r in gamma if r["name"] == "Vitamin D3"][0]
    assert vit["batch_no"] is None and vit["status"] == "Out of Stock"  # no batch invented


def test_unknown_company_404(client):
    assert client.get("/api/companies/does-not-exist").status_code == 404


def test_owner_can_hide_quantities_and_medicines(client, admin):
    shop = client.get("/api/admin/shop", headers=admin).json()
    shop.update(show_quantities=False, show_batches=False)
    assert client.put("/api/admin/shop", json=shop, headers=admin).status_code == 200
    rows = stock(client, company(client, "alpha")["slug"])["rows"]
    assert all(r["quantity"] is None and r["batch_no"] is None for r in rows)
    para = [r for r in rows if r["name"] == "Paracetamol"][0]
    assert para["status"] == "In Stock"

    mid, med = medicine_id(client, admin, "Cetirizine")
    body = {k: med[k] for k in ("company_id", "name", "strength", "dosage_form", "unit", "pack_size", "reorder_level")}
    body["is_public"] = False
    assert client.put(f"/api/admin/medicines/{mid}", json=body, headers=admin).status_code == 200
    names = {r["name"] for r in stock(client, company(client, "alpha")["slug"])["rows"]}
    assert "Cetirizine" not in names


# ------------------------------------------------------------------ security
def test_public_cannot_change_anything(client, staff):
    assert client.get("/api/admin/medicines").status_code == 401
    assert client.post("/api/billing/bills", json={}).status_code == 401
    assert client.post("/api/admin/companies", json={"name": "X"}).status_code == 401
    # staff can bill but not administer
    assert client.post("/api/admin/companies", json={"name": "X"}, headers=staff).status_code == 403
    assert client.get("/api/admin/users", headers=staff).status_code == 403
    bad = {"Authorization": "Bearer not-a-token"}
    assert client.get("/api/auth/me", headers=bad).status_code == 401


def test_login_lockout(client):
    for _ in range(5):
        assert client.post("/api/auth/login", json={"username": "owner", "password": "wrong"}).status_code == 401
    r = client.post("/api/auth/login", json={"username": "owner", "password": "owner-pass-1"})
    assert r.status_code == 429


# ------------------------------------------------------------------ billing
def test_bill_uses_earliest_expiry_and_updates_stock(client, staff):
    mid, before = medicine_id(client, staff, "Paracetamol")
    assert before["saleable_quantity"] == 135
    r = client.post("/api/billing/bills", headers=staff,
                    json={"client_request_id": rid(), "items": [{"medicine_id": mid, "quantity": 20}]})
    assert r.status_code == 201, r.text
    bill = r.json()
    # 15 from the near-expiry batch first, then 5 from the later one
    assert [(i["batch_no"], i["quantity"]) for i in bill["items"]] == [("SAMPLE-A02", 15), ("SAMPLE-A01", 5)]
    assert bill["total"] == "360.00"
    assert bill["bill_no"].startswith("B")
    _, after = medicine_id(client, staff, "Paracetamol")
    assert after["saleable_quantity"] == 115
    rows = {r["batch_no"]: r for r in stock(client, company(client, "alpha")["slug"])["rows"]}
    assert rows["SAMPLE-A02"]["quantity"] == 0 and rows["SAMPLE-A02"]["status"] == "Out of Stock"
    assert rows["SAMPLE-A01"]["quantity"] == 115


def test_expired_stock_is_never_sold(client, staff):
    mid, med = medicine_id(client, staff, "Amoxicillin")
    assert med["saleable_quantity"] == 40 and med["expired_quantity"] == 12
    batches = client.get(f"/api/admin/medicines/{mid}/batches", headers=staff).json()
    expired = [b for b in batches if b["status"] == "Expired"][0]
    r = client.post("/api/billing/bills", headers=staff, json={
        "client_request_id": rid(), "items": [{"medicine_id": mid, "quantity": 1, "batch_id": expired["id"]}]})
    assert r.status_code == 409 and "expired" in r.json()["detail"].lower()
    r = client.post("/api/billing/bills", headers=staff, json={
        "client_request_id": rid(), "items": [{"medicine_id": mid, "quantity": 41}]})
    assert r.status_code == 409


def test_failed_bill_changes_nothing(client, staff):
    para, _ = medicine_id(client, staff, "Paracetamol")
    metf, _ = medicine_id(client, staff, "Metformin")  # 0 in stock
    r = client.post("/api/billing/bills", headers=staff, json={
        "client_request_id": rid(),
        "items": [{"medicine_id": para, "quantity": 10}, {"medicine_id": metf, "quantity": 1}]})
    assert r.status_code == 409
    _, after = medicine_id(client, staff, "Paracetamol")
    assert after["saleable_quantity"] == 135
    assert client.get("/api/billing/bills", headers=staff).json() == []


def test_duplicate_submit_creates_one_bill(client, staff):
    mid, _ = medicine_id(client, staff, "Ibuprofen")
    body = {"client_request_id": rid(), "items": [{"medicine_id": mid, "quantity": 5}]}
    a = client.post("/api/billing/bills", headers=staff, json=body)
    b = client.post("/api/billing/bills", headers=staff, json=body)
    assert a.status_code == 201 and b.status_code == 200
    assert a.json()["id"] == b.json()["id"]
    _, after = medicine_id(client, staff, "Ibuprofen")
    assert after["saleable_quantity"] == 30


def test_cancel_and_return_restore_stock_with_history(client, staff, admin):
    mid, _ = medicine_id(client, staff, "Pantoprazole")
    bill = client.post("/api/billing/bills", headers=staff, json={
        "client_request_id": rid(), "customer_name": "Walk-in",
        "items": [{"medicine_id": mid, "quantity": 10}]}).json()
    line = bill["items"][0]["id"]
    r = client.post(f"/api/billing/bills/{bill['id']}/return", headers=staff,
                    json={"reason": "Customer returned", "items": [{"sale_item_id": line, "quantity": 4}]})
    assert r.status_code == 200 and r.json()["total"] == "570.00"
    assert medicine_id(client, staff, "Pantoprazole")[1]["saleable_quantity"] == 54
    r = client.post(f"/api/billing/bills/{bill['id']}/return", headers=staff,
                    json={"reason": "again", "items": [{"sale_item_id": line, "quantity": 7}]})
    assert r.status_code == 409

    assert client.post(f"/api/billing/bills/{bill['id']}/cancel", headers=staff, json={"reason": "x wrong"}).status_code == 403
    r = client.post(f"/api/billing/bills/{bill['id']}/cancel", headers=admin, json={"reason": "Entered by mistake"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert medicine_id(client, staff, "Pantoprazole")[1]["saleable_quantity"] == 60
    assert client.post(f"/api/billing/bills/{bill['id']}/cancel", headers=admin, json={"reason": "again"}).status_code == 409

    kinds = [m["kind"] for m in client.get("/api/admin/movements", params={"medicine_id": mid}, headers=admin).json()]
    assert kinds[:3] == ["sale_cancel", "return", "sale"]


# ------------------------------------------------------------------ admin inventory
def test_purchase_adds_stock_and_validates(client, admin):
    mid, _ = medicine_id(client, admin, "Metformin")
    exp = (date.today() + timedelta(days=400)).isoformat()
    body = {"supplier_name": "Sample Distributor", "invoice_no": "INV-1", "purchase_date": date.today().isoformat(),
            "items": [{"medicine_id": mid, "batch_no": "new-1", "expiry_date": exp, "quantity": 50,
                       "sale_price": "22.00", "mrp": "25.00", "purchase_price": "16.00"}]}
    r = client.post("/api/admin/purchases", json=body, headers=admin)
    assert r.status_code == 201, r.text
    assert r.json()["total_cost"] == "800.00"
    assert medicine_id(client, admin, "Metformin")[1]["saleable_quantity"] == 50
    # same batch number with a different expiry is rejected, nothing saved
    body["items"][0]["expiry_date"] = (date.today() + timedelta(days=10)).isoformat()
    assert client.post("/api/admin/purchases", json=body, headers=admin).status_code == 422
    assert medicine_id(client, admin, "Metformin")[1]["saleable_quantity"] == 50
    body["items"][0].update(expiry_date=exp, sale_price="30.00")
    assert client.post("/api/admin/purchases", json=body, headers=admin).status_code == 422  # above MRP
    body["items"][0].update(sale_price="22.00", quantity=0)
    assert client.post("/api/admin/purchases", json=body, headers=admin).status_code == 422


def test_adjustment_cannot_go_negative(client, admin):
    mid, _ = medicine_id(client, admin, "Losartan")
    b = client.get(f"/api/admin/medicines/{mid}/batches", headers=admin).json()[0]
    assert client.post(f"/api/admin/batches/{b['id']}/adjust", headers=admin,
                       json={"change": -31, "reason": "count"}).status_code == 409
    r = client.post(f"/api/admin/batches/{b['id']}/adjust", headers=admin, json={"change": -2, "reason": "Damaged strips"})
    assert r.status_code == 200 and r.json()["quantity"] == 28


def test_no_duplicate_companies(client, admin):
    r = client.post("/api/admin/companies", json={"name": "  sample pharma ALPHA (sample) "}, headers=admin)
    assert r.status_code == 409
    r = client.post("/api/admin/companies", json={"name": "New Company"}, headers=admin)
    assert r.status_code == 201 and r.json()["slug"] == "new-company"
    r = client.post("/api/admin/companies", json={"name": "Logo Co", "logo_url": "http://x"}, headers=admin)
    assert r.status_code == 422


def test_csv_import_check_commit_and_repeat(client, admin):
    exp = (date.today() + timedelta(days=300)).strftime("%m/%Y")
    csv_text = (
        "company,medicine,strength,dosage_form,unit,batch_no,expiry_date,quantity,sale_price,mrp\n"
        f"Real Co,Drug One,5 mg,Tablet,strips,x1,{exp},10,9.50,10\n"
        f"Real Co,Drug Two,,Syrup,bottles,,,,,\n"
    )
    files = {"file": ("s.csv", csv_text, "text/csv")}
    r = client.post("/api/admin/import", params={"dry_run": True}, files=files, headers=admin).json()
    assert r["errors"] == [] and r["companies_created"] == 1 and r["dry_run"]
    assert client.get("/api/companies", params={"q": "real co"}).json()["total"] == 0

    files = {"file": ("s.csv", csv_text, "text/csv")}
    r = client.post("/api/admin/import", params={"dry_run": False}, files=files, headers=admin).json()
    assert r["batches_created"] == 1
    files = {"file": ("s.csv", csv_text, "text/csv")}
    r = client.post("/api/admin/import", params={"dry_run": False}, files=files, headers=admin).json()
    assert r["batches_created"] == 0 and r["batches_topped_up"] == 0  # no double counting
    real = company(client, "real co")
    assert real["product_count"] == 2 and real["in_stock_count"] == 1

    bad = "company,medicine,batch_no,expiry_date,quantity,sale_price\nReal Co,Drug One,x9,soon,-3,abc\n"
    r = client.post("/api/admin/import", params={"dry_run": False},
                    files={"file": ("b.csv", bad, "text/csv")}, headers=admin).json()
    assert r["errors"] and "Row 2" in r["errors"][0]


def test_parse_expiry_formats():
    assert parse_expiry("2027-08-15") == date(2027, 8, 15)
    assert parse_expiry("15-08-2027") == date(2027, 8, 15)
    assert parse_expiry("08/2027") == date(2027, 8, 31)
    assert parse_expiry("02/28") == date(2028, 2, 29)
    with pytest.raises(ValueError):
        parse_expiry("soon")


# ------------------------------------------------------------------ QR
def test_qr_refuses_local_addresses():
    for bad in ["", "http://example.com", "https://localhost:5173", "https://127.0.0.1:8000",
                "https://192.168.1.5", "https://myshop"]:
        assert url_problem(bad), bad
    assert url_problem("https://myshop.example.com") is None


def test_qr_endpoint(client, monkeypatch):
    r = client.get("/api/qr/code.png")
    assert r.status_code == 409  # PUBLIC_SITE_URL not set yet
    monkeypatch.setattr(get_settings(), "public_site_url", "https://shop.example.com")
    info = client.get("/api/qr/info").json()
    assert info == {"ready": True, "problem": None, "url": "https://shop.example.com/"}
    png = client.get("/api/qr/code.png")
    assert png.status_code == 200 and png.content[:8] == b"\x89PNG\r\n\x1a\n"
    svg = client.get("/api/qr/code.svg")
    assert b"<svg" in svg.content

    cv2 = pytest.importorskip("cv2")
    import numpy as np

    img = cv2.imdecode(np.frombuffer(png.content, np.uint8), cv2.IMREAD_GRAYSCALE)
    text, *_ = cv2.QRCodeDetector().detectAndDecode(img)
    assert text == "https://shop.example.com/"

    slug = company(client, "alpha")["slug"]
    png = client.get("/api/qr/code.png", params={"company": slug}).content
    img = cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_GRAYSCALE)
    assert cv2.QRCodeDetector().detectAndDecode(img)[0] == f"https://shop.example.com/companies/{slug}"


def test_daily_totals_and_bill_filter(client, staff):
    from app.services.stock import today

    mid, _ = medicine_id(client, staff, "Losartan")
    client.post("/api/billing/bills", headers=staff,
                json={"client_request_id": rid(), "items": [{"medicine_id": mid, "quantity": 2}]})
    s = client.get("/api/admin/summary", headers=staff).json()
    assert s["bills_today"] == 1 and s["sales_today"] == "90.00"
    assert len(client.get("/api/billing/bills", params={"day": today().isoformat()}, headers=staff).json()) == 1
    assert client.get("/api/billing/bills", params={"day": "2020-01-01"}, headers=staff).json() == []


def test_restock_same_batch_updates_price(client, admin):
    mid, _ = medicine_id(client, admin, "Losartan")
    b = client.get(f"/api/admin/medicines/{mid}/batches", headers=admin).json()[0]
    body = {"supplier_name": "S", "purchase_date": date.today().isoformat(),
            "items": [{"medicine_id": mid, "batch_no": b["batch_no"], "expiry_date": b["expiry_date"],
                       "quantity": 5, "sale_price": "47.00", "mrp": "50.00"}]}
    assert client.post("/api/admin/purchases", json=body, headers=admin).status_code == 201
    b2 = client.get(f"/api/admin/medicines/{mid}/batches", headers=admin).json()[0]
    assert b2["quantity"] == 35 and b2["sale_price"] == "47.00"


def test_bootstrap_creates_first_admin_once(client, monkeypatch):
    from app.database import SessionLocal
    from app.main import bootstrap
    from app.models import User

    s = get_settings()
    monkeypatch.setattr(s, "bootstrap_admin_username", "boss")
    monkeypatch.setattr(s, "bootstrap_admin_password", "boss-pass-123")
    bootstrap()  # users already exist -> nothing created
    with SessionLocal() as db:
        assert db.query(User).filter_by(username="boss").count() == 0
        db.query(User).delete()
        db.commit()
    bootstrap()
    assert client.post("/api/auth/login", json={"username": "boss", "password": "boss-pass-123"}).status_code == 200
