"""Marg ERP 'Stock & Sales Analysis' import, using a small report built like the real one."""
import io
from datetime import date

from openpyxl import Workbook

from app.services.marg import parse_marg_report

from .conftest import rid


def item(desc, closing):
    return [desc, 0.0, 5.0, 0.0, "  0    0", 0.0, 5.0, 0.0, "  0      0", " 0      0", 0.0, closing]


def make_report(rows_for_period="01-10-2026 - 15-10-2026", alpha_qty="  12  4/27"):
    blank = [""] * 12
    rows = [
        ["TEST DISTRIBUTOR"] + [""] * 11,
        ["SHOP NO.03, NEAR SOMETHING, RAICHUR-584101"] + [""] * 11,
        ["Phone : 0000000000 E-Mail : x@example.com"] + [""] * 11,
        [f"STOCK & SALES ANALYSIS {rows_for_period}"] + [""] * 11,
        ["ITEM DESCRIPTION", "OPENING", "", "PURCHASE", "  S/R", "REPL/", "TOTAL", "", "SALES", "STOCK    P/R", "REPL/", "CLOSING"],
        ["", "STOCK", "QTY.", "FREE", "QTY. FREE", "OTHER", "STOCK", "QTY.", "FREE SAMPLE", "T/F", "OTHER", "STOCK M.EXP"],
        blank,
        ["ALPHA PHARMA LTD"] + [""] * 11,
        item("ALPHACOL TAB        10'S   PCS", alpha_qty),
        item("ALPHACOL TAB        30 S   PCS", 0.0),
        item("ALPHA GEL           30GM   PCS", "   3 10/26"),
        item("ALPHA LONG NAME REFILL     1'S", "   7  2/28"),
        [" Quantity", 0.0, 15.0, 0.0, "", 0.0, 15.0, 0.0, "", "", 0.0, 22.0],
        [" Value in Rs.", "", 1000.0, "", 0.0, 0.0, "", 0.0, 0.0, 0.0, "", 900.0],
        ["", "", "", "", "", "Continued ..2", "", "", "", "", "", ""],
        ["TEST DISTRIBUTOR"] + [""] * 11,
        ["STOCK & SALES ANALYSIS"] + [""] * 11,
        ["PURCHASE DETAIL :-"] + [""] * 11,
        ["SUPPLIER NAME", "INVOICE", "NO.", "DATE", "RECEIVE", "DATE", "AMOUNT", "", "", "", "", ""],
        ["SOME AGENCIES", "HUBBALLI", "BIO2", "6-27/967", "07-10-2026", "05-10-2026", 90347.0, "", "", "", "", ""],
        ["I am satisfied with Marg ERP | advert"] + [""] * 11,
        ["BETA LABS"] + [""] * 11,
        item("BETAMOL SYP         100ML  PCS", "  -4  3/27"),
        item("BETA KIT            1N     PCS", "   2"),
    ]
    wb = Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_parser_reads_items_and_skips_noise():
    rep = parse_marg_report(make_report(), "r.xlsx")
    assert rep.shop_name == "TEST DISTRIBUTOR"
    assert rep.period_to == date(2026, 10, 15)
    got = [(i.company, i.name, i.pack, i.closing, i.earliest_expiry) for i in rep.items]
    assert got == [
        ("ALPHA PHARMA LTD", "ALPHACOL TAB", "10'S", 12, date(2027, 4, 30)),
        ("ALPHA PHARMA LTD", "ALPHACOL TAB", "30 S", 0, None),
        ("ALPHA PHARMA LTD", "ALPHA GEL", "30GM", 3, date(2026, 10, 31)),
        ("ALPHA PHARMA LTD", "ALPHA LONG NAME REFILL", "1'S", 7, date(2028, 2, 29)),
        ("BETA LABS", "BETAMOL SYP", "100ML", 0, date(2027, 3, 31)),
        ("BETA LABS", "BETA KIT", "1N", 2, None),
    ]
    assert any("negative" in w for w in rep.warnings)


def upload(client, headers, content, dry_run):
    return client.post("/api/admin/import/marg", params={"dry_run": dry_run}, headers=headers,
                       files={"file": ("PRODUCT_LIST.xlsx", content, "application/octet-stream")})


def test_marg_import_sync_public_pages_and_billing(client, admin, staff):
    r = upload(client, admin, make_report(), True).json()
    assert r["errors"] == [] and r["companies_created"] == 2 and r["dry_run"]
    assert client.get("/api/companies", params={"q": "alpha pharma"}).json()["total"] == 0

    r = upload(client, admin, make_report(), False).json()
    assert r["medicines_created"] == 6 and r["batches_created"] == 4 and r["stock_as_of"] == "2026-10-15"

    alpha = client.get("/api/companies", params={"q": "alpha pharma"}).json()["items"][0]
    assert alpha["product_count"] == 4 and alpha["in_stock_count"] == 3
    page = client.get(f"/api/companies/{alpha['slug']}").json()
    assert page["stock_as_of"] == "2026-10-15"
    rows = {(x["name"], x["pack_size"]): x for x in page["rows"]}
    col = rows[("ALPHACOL TAB", "10'S")]
    assert col["quantity"] == 12 and col["batch_no"] is None and col["expiry_is_earliest"]
    assert rows[("ALPHACOL TAB", "30 S")]["status"] == "Out of Stock"

    beta = client.get("/api/companies", params={"q": "beta labs"}).json()["items"][0]
    kit = [x for x in client.get(f"/api/companies/{beta['slug']}").json()["rows"] if x["name"] == "BETA KIT"][0]
    assert kit["quantity"] == 2 and kit["expiry_date"] is None and kit["status"] != "Expired"

    # The same report again changes nothing; a newer report sets the new quantity
    r = upload(client, admin, make_report(), False).json()
    assert r["batches_created"] == 0 and r["batches_topped_up"] == 0
    r = upload(client, admin, make_report("01-10-2026 - 20-10-2026", "   5  6/27"), False).json()
    assert r["batches_topped_up"] == 1
    page = client.get(f"/api/companies/{alpha['slug']}").json()
    col = [x for x in page["rows"] if x["name"] == "ALPHACOL TAB" and x["pack_size"] == "10'S"][0]
    assert col["quantity"] == 5 and col["expiry_date"] == "2027-06-30" and page["stock_as_of"] == "2026-10-20"

    # No price in the report, so billing asks for one instead of guessing
    mid = client.get("/api/admin/medicines", params={"q": "alphacol"}, headers=staff).json()
    mid = [m for m in mid if m["pack_size"] == "10'S"][0]["id"]
    r = client.post("/api/billing/bills", headers=staff,
                    json={"client_request_id": rid(), "items": [{"medicine_id": mid, "quantity": 1}]})
    assert r.status_code == 409 and "price" in r.json()["detail"]
    b = client.get(f"/api/admin/medicines/{mid}/batches", headers=admin).json()[0]
    assert client.put(f"/api/admin/batches/{b['id']}", headers=admin,
                      json={"batch_no": None, "expiry_date": b["expiry_date"], "sale_price": "30.00"}).status_code == 200
    r = client.post("/api/billing/bills", headers=staff,
                    json={"client_request_id": rid(), "items": [{"medicine_id": mid, "quantity": 2}]})
    assert r.status_code == 201 and r.json()["items"][0]["batch_no"] is None


def test_marg_rejects_wrong_files(client, admin):
    r = client.post("/api/admin/import/marg", headers=admin, files={"file": ("x.csv", b"a,b", "text/csv")})
    assert r.status_code == 422
    r = client.post("/api/admin/import/marg", headers=admin, files={"file": ("x.xls", b"not excel", "application/octet-stream")})
    assert r.status_code == 422
