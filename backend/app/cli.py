"""Command-line helpers. Run from the backend folder, for example:

    python -m app.cli init-db
    python -m app.cli create-admin --username owner
    python -m app.cli seed-sample
    python -m app.cli import-csv data/my_stock.csv --commit
    python -m app.cli remove-sample
    python -m app.cli load-shop data/shop_details.json
    python -m app.cli import-marg "PRODUCT_LIST.XLS" --commit
    python -m app.cli make-qr --out qr
"""
from __future__ import annotations

import argparse
import getpass
import sys
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import select

from .config import get_settings
from .database import SessionLocal, init_db
from .models import Batch, Company, Medicine, ShopProfile, StockMovement, User
from .security import hash_password
from .services.inventory import CSV_COLUMNS, import_csv
from .services.qr import png_bytes, svg_bytes, url_problem


def cmd_init_db(_):
    init_db()
    print("Database tables are ready.")


def cmd_create_admin(args):
    init_db()
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.username == args.username)):
            sys.exit(f"User '{args.username}' already exists.")
        pw = args.password or getpass.getpass("New password (min 8 characters): ")
        if len(pw) < 8:
            sys.exit("Password must be at least 8 characters.")
        if not args.password and getpass.getpass("Repeat password: ") != pw:
            sys.exit("Passwords do not match.")
        db.add(User(username=args.username, full_name=args.name, role=args.role, password_hash=hash_password(pw)))
        db.commit()
    print(f"Created {args.role} '{args.username}'.")


def sample_rows(on: date | None = None) -> str:
    """Clearly labelled SAMPLE inventory. Expiry dates are relative to today so every status appears."""
    on = on or date.today()
    d = lambda days: (on + timedelta(days=days)).isoformat()  # noqa: E731
    rows = [
        # company, medicine, strength, form, unit, pack, reorder, batch, expiry, qty, sale, mrp, purchase
        ("Sample Pharma Alpha (SAMPLE)", "Paracetamol", "500 mg", "Tablet", "strips", "10 x 10", 20, "SAMPLE-A01", d(540), 120, "18.00", "20.00", "13.50"),
        ("Sample Pharma Alpha (SAMPLE)", "Paracetamol", "500 mg", "Tablet", "strips", "10 x 10", 20, "SAMPLE-A02", d(45), 15, "18.00", "20.00", "13.50"),
        ("Sample Pharma Alpha (SAMPLE)", "Cetirizine", "10 mg", "Tablet", "strips", "10 x 10", 15, "SAMPLE-A03", d(400), 8, "16.00", "18.00", "11.00"),
        ("Sample Pharma Alpha (SAMPLE)", "Amoxicillin", "500 mg", "Capsule", "strips", "10 x 10", 10, "SAMPLE-A04", d(-20), 12, "70.00", "75.00", "52.00"),
        ("Sample Pharma Alpha (SAMPLE)", "Amoxicillin", "500 mg", "Capsule", "strips", "10 x 10", 10, "SAMPLE-A05", d(300), 40, "70.00", "75.00", "52.00"),
        ("Sample Labs Beta (SAMPLE)", "Pantoprazole", "40 mg", "Tablet", "strips", "10 x 15", 10, "SAMPLE-B01", d(600), 60, "95.00", "105.00", "70.00"),
        ("Sample Labs Beta (SAMPLE)", "Metformin", "500 mg", "Tablet", "strips", "10 x 10", 25, "SAMPLE-B02", d(250), 0, "22.00", "25.00", "16.00"),
        ("Sample Labs Beta (SAMPLE)", "Oral Rehydration Salts", "21 g", "Sachet", "sachets", "1 x 21 g", 30, "SAMPLE-B03", d(700), 200, "20.00", "22.00", "14.00"),
        ("Sample Healthcare Gamma (SAMPLE)", "Cough Syrup (sample)", "100 ml", "Syrup", "bottles", "1 x 100 ml", 10, "SAMPLE-G01", d(80), 24, "98.00", "110.00", "72.00"),
        ("Sample Healthcare Gamma (SAMPLE)", "Ibuprofen", "400 mg", "Tablet", "strips", "10 x 15", 10, "SAMPLE-G02", d(500), 35, "28.00", "32.00", "20.00"),
        ("Sample Healthcare Gamma (SAMPLE)", "Vitamin D3", "60000 IU", "Capsule", "strips", "1 x 4", 10, "", "", "", "", "", ""),
        ("Sample Biotech Delta (SAMPLE)", "Azithromycin", "500 mg", "Tablet", "strips", "1 x 3", 10, "SAMPLE-D01", d(365), 18, "110.00", "120.00", "82.00"),
        ("Sample Remedies Epsilon (SAMPLE)", "Antiseptic Liquid (sample)", "500 ml", "Liquid", "bottles", "1 x 500 ml", 5, "SAMPLE-E01", d(900), 12, "180.00", "199.00", "140.00"),
        ("Sample Generics Zeta (SAMPLE)", "Losartan", "50 mg", "Tablet", "strips", "10 x 10", 10, "SAMPLE-Z01", d(420), 30, "45.00", "50.00", "33.00"),
    ]
    lines = [",".join(CSV_COLUMNS)]
    for r in rows:
        lines.append(",".join(str(x) for x in r))
    return "\n".join(lines) + "\n"


def cmd_seed_sample(_):
    init_db()
    with SessionLocal() as db:
        if db.get(ShopProfile, 1) is None:
            db.add(ShopProfile(
                id=1,
                name="Your Medical Shop (sample name)",
                tagline="Sample details: replace with the real shop information",
                description=(
                    "This is placeholder text. The shop owner will add the real description, "
                    "address, phone number and opening hours from the admin page."
                ),
                is_sample=True,
            ))
            db.commit()
        res = import_csv(db, sample_rows(), None, is_sample=True)
    if res.errors:
        sys.exit("Sample import failed:\n" + "\n".join(res.errors))
    print(f"Sample data loaded: {res.companies_created} companies, {res.medicines_created} medicines, "
          f"{res.batches_created} batches. Everything is labelled SAMPLE.")


def cmd_remove_sample(_):
    with SessionLocal() as db:
        meds = db.scalars(select(Medicine).where(Medicine.is_sample.is_(True))).all()
        batch_ids = [b.id for m in meds for b in m.batches]
        used = db.scalar(select(StockMovement.id).where(
            StockMovement.batch_id.in_(batch_ids or [0]), StockMovement.kind.notin_(["opening"])).limit(1))
        if used:
            sys.exit("Some sample stock has been billed or adjusted. Delete those records first or start a fresh database.")
        if batch_ids:
            db.query(StockMovement).filter(StockMovement.batch_id.in_(batch_ids)).delete(synchronize_session=False)
            db.query(Batch).filter(Batch.id.in_(batch_ids)).delete(synchronize_session=False)
        for m in meds:
            db.delete(m)
        db.flush()
        for c in db.scalars(select(Company).where(Company.is_sample.is_(True))).all():
            if not c.medicines:
                db.delete(c)
        db.commit()
    print("Sample companies, medicines and batches removed. Shop details are kept; edit them on the admin page.")


def cmd_import_csv(args):
    init_db()
    text = Path(args.file).read_text(encoding="utf-8-sig")
    with SessionLocal() as db:
        res = import_csv(db, text, None, dry_run=not args.commit)
    print(f"Rows read: {res.rows_read}")
    print(f"New companies: {res.companies_created}, new medicines: {res.medicines_created}, "
          f"new batches: {res.batches_created}, quantities changed: {res.batches_topped_up}")
    if res.errors:
        print("\nNothing was saved because of these problems:")
        for e in res.errors:
            print("  -", e)
        sys.exit(1)
    print("Saved." if args.commit else "\nCheck only (nothing saved). Run again with --commit to save.")


def cmd_import_marg(args):
    from .services.inventory import import_marg
    from .services.marg import parse_marg_report

    init_db()
    path = Path(args.file)
    report = parse_marg_report(path.read_bytes(), path.name)
    with SessionLocal() as db:
        res = import_marg(db, report, None, dry_run=not args.commit)
    print(f"Report: {report.shop_name or '?'} · stock up to {report.period_to or '?'}")
    print(f"Items read: {res.rows_read} · new companies: {res.companies_created} · new medicines: "
          f"{res.medicines_created} · new stock rows: {res.batches_created} · quantities changed: {res.batches_topped_up}")
    for w in res.warnings:
        print("  note:", w)
    if res.errors:
        print("\nNothing was saved:")
        for e in res.errors:
            print("  -", e)
        sys.exit(1)
    print("Saved." if args.commit else "\nCheck only (nothing saved). Run again with --commit to save.")


def cmd_load_shop(args):
    import json

    from .schemas import ShopUpdate

    init_db()
    data = ShopUpdate(**json.loads(Path(args.file).read_text(encoding="utf-8")))
    with SessionLocal() as db:
        shop = db.get(ShopProfile, 1) or ShopProfile(id=1)
        for k, v in data.model_dump().items():
            setattr(shop, k, v)
        db.add(shop)
        db.commit()
    print(f"Shop details saved for '{data.name}'.")


def cmd_make_qr(args):
    url = args.url or get_settings().public_site_url
    problem = url_problem(url)
    if problem and not args.test_only:
        sys.exit(f"Not generating a QR code: {problem}")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    stem = "qr_TEST_ONLY" if problem else "qr_website"
    (out / f"{stem}.png").write_bytes(png_bytes(url, 20))
    (out / f"{stem}.svg").write_bytes(svg_bytes(url))
    print(f"Saved {out / (stem + '.png')} and .svg for {url}")
    if problem:
        print("WARNING: this is a TEST code for your own network only. Do not print it for customers.")


def main(argv=None):
    p = argparse.ArgumentParser(prog="python -m app.cli")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init-db").set_defaults(fn=cmd_init_db)
    a = sub.add_parser("create-admin")
    a.add_argument("--username", required=True)
    a.add_argument("--name")
    a.add_argument("--password", help="omit to be asked securely")
    a.add_argument("--role", choices=["admin", "staff"], default="admin")
    a.set_defaults(fn=cmd_create_admin)
    sub.add_parser("seed-sample").set_defaults(fn=cmd_seed_sample)
    sub.add_parser("remove-sample").set_defaults(fn=cmd_remove_sample)
    i = sub.add_parser("import-csv")
    i.add_argument("file")
    i.add_argument("--commit", action="store_true", help="save (default only checks the file)")
    i.set_defaults(fn=cmd_import_csv)
    mg = sub.add_parser("import-marg", help="import a Marg 'Stock & Sales Analysis' Excel report")
    mg.add_argument("file")
    mg.add_argument("--commit", action="store_true", help="save (default only checks the file)")
    mg.set_defaults(fn=cmd_import_marg)
    ls = sub.add_parser("load-shop", help="load shop details from a JSON file")
    ls.add_argument("file")
    ls.set_defaults(fn=cmd_load_shop)
    q = sub.add_parser("make-qr")
    q.add_argument("--url", help="defaults to PUBLIC_SITE_URL")
    q.add_argument("--out", default="qr")
    q.add_argument("--test-only", action="store_true", help="allow a local address, for phone testing on your Wi-Fi")
    q.set_defaults(fn=cmd_make_qr)
    args = p.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
