# Medical Shop Website and Inventory

This project has three parts:

- **Public website.** It shows the shop's details, the pharmaceutical companies the shop supplies, and each company's stock.
- **Staff area.** Staff sign in here to bill, receive stock, manage inventory and import data.
- **QR code.** Customers scan it to open the website.

```
shop-management/
├── backend/            Python · FastAPI · SQLAlchemy (SQLite locally, PostgreSQL in production)
│   ├── app/
│   │   ├── main.py         app setup and routes
│   │   ├── config.py       settings from environment variables / .env
│   │   ├── database.py     database connection
│   │   ├── models.py       tables
│   │   ├── schemas.py      request/response validation
│   │   ├── security.py     passwords, login tokens, roles
│   │   ├── cli.py          setup commands (create admin, sample data, import, QR)
│   │   ├── routers/        public, auth, admin, billing, qr
│   │   └── services/       stock rules, billing, purchases/CSV import, QR
│   ├── tests/              25 automated tests
│   ├── requirements.txt
│   └── .env.example
├── frontend/           React · Vite · Tailwind CSS · React Router
│   └── src/pages/          public pages and staff/ pages
└── render.yaml         one-click deployment on Render (optional)
```

> **Shivasharana Distributor:** follow **SETUP_GUIDE.md**. It covers the Marg ERP stock report import, going online and the QR code step by step.

> **Replacing your old files:** first rename your current `shop management` folder to `shop management OLD` as a backup. Then unzip this project in its place. The old `schemes.py` and `inventory.py` are replaced by `schemas.py`, `services/` and `routers/`.

---

## 1. Run it on Windows (VS Code)

You need:

- **Python 3.10 or newer.** When you install it, tick "Add python.exe to PATH".
- **Node.js 20 LTS or newer**, from nodejs.org.

Open the `shop-management` folder in VS Code. Open a terminal with **Terminal → New Terminal**.

### 1a. Backend (terminal 1)

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements-dev.txt
copy .env.example .env
python -m app.cli seed-sample
python -m app.cli create-admin --username owner --name "Shop Owner"
python -m uvicorn app.main:app --reload
```

What these do:

- `seed-sample` loads clearly labelled **SAMPLE** data.
- `create-admin` asks you to type a password (minimum 8 characters). Nothing appears while you type, which is normal.

If PowerShell says *"running scripts is disabled"*, run this once, then activate again:
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

Check that it works:

- http://127.0.0.1:8000 should show `{"message":"Medical Shop Inventory API is running!",...}`.
- http://127.0.0.1:8000/docs shows every API endpoint.

### 1b. Frontend (terminal 2)

Click **+** in the terminal panel to open a second terminal:

```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

Open http://localhost:5173. Staff sign in at http://localhost:5173/staff.

### 1c. Every day after that

- Terminal 1: `cd backend`, then `venv\Scripts\activate`, then `python -m uvicorn app.main:app --reload`
- Terminal 2: `cd frontend`, then `npm run dev`

### Open it on your phone (same Wi-Fi, for testing only)

1. Run `ipconfig` and find your IPv4 address, for example `192.168.1.20`.
2. In `frontend\.env`, set `VITE_API_URL=http://192.168.1.20:8000`.
3. In `backend\.env`, add `http://192.168.1.20:5173` to `CORS_ORIGINS`.
4. Start the backend with `python -m uvicorn app.main:app --reload --host 0.0.0.0`.
5. Open `http://192.168.1.20:5173` on the phone. If it doesn't load, allow Python and Node through Windows Firewall.

---

## 2. Putting in the real shop data

### Shop details

Go to **Staff → Shop details** and fill in:

- name, address, phone, email, opening hours, licence number
- whether the public can see quantities and batch numbers

Untick **"These are still sample details"** when you are done.

### Remove the sample data

```powershell
python -m app.cli remove-sample
```

This removes only the companies, medicines and batches marked SAMPLE.

### Add companies and stock

**From Marg ERP (recommended if you use Marg):** export the *Stock & Sales Analysis* report to Excel. Upload it under **Staff → Import stock → Marg ERP stock report**, or run:

```powershell
python -m app.cli import-marg data\PRODUCT_LIST.XLS            # check only
python -m app.cli import-marg data\PRODUCT_LIST.XLS --commit   # save
```

- Each item's closing stock becomes its stock, held in one row with no batch number. The earliest expiry (M.EXP) is shown with it.
- Uploading a newer report sets the new quantities, and uploading the same report again changes nothing.
- The report has no batch numbers or prices, so none are created.

Otherwise, you can do this in either of two ways.

**Option A: CSV file.** This is best for a large stock list.

1. Go to **Staff → Import CSV → Download the template**. Fill it in Excel with one row per batch, then **Save As → CSV UTF-8**.

   | column | required | example |
   |---|---|---|
   | company | yes | Company name exactly as you want it shown |
   | medicine | yes | Paracetamol |
   | strength | | 500 mg |
   | dosage_form | | Tablet |
   | unit | | strips / tablets / bottles / boxes |
   | pack_size | | 10 x 10 |
   | reorder_level | | 20 (shows Low Stock at or below this) |
   | batch_no | for stock | AB1234 |
   | expiry_date | with batch | 2027-08-31, 31-08-2027 or 08/2027 |
   | quantity | with batch | 50 |
   | sale_price / mrp | with batch | 18.50 / 20.00 (sale price ≤ MRP) |
   | purchase_price | | 14.00 |

   - Leave the batch columns empty to list a medicine with no stock yet. No batch is invented.
2. Click **Check file**. Any problems are listed by row number, and nothing is saved.
3. Click **Save to database**.

Importing the same file again does **not** double the stock, because quantities are *set* to the file's values. You can also run the import from the terminal:

```powershell
python -m app.cli import-csv data\my_stock.csv            # check only
python -m app.cli import-csv data\my_stock.csv --commit   # save
```

**Option B: by hand.**

1. Go to **Inventory → Add company / Add medicine**.
2. Go to **Receive stock** and enter the supplier invoice with batch, expiry, quantity and prices.

---

## 3. How stock works

- Stock is stored **per batch**. A medicine can have many batches, and a company can have many medicines.
- All numbers on the website are calculated from the database. Nothing is typed into the pages.
- Status labels:

  | Label | Meaning |
  |---|---|
  | **Expired** | Expiry date has passed. **Never counted as saleable, and billing refuses it.** |
  | **Out of Stock** | Quantity is 0. |
  | **Near Expiry** | Expires within `NEAR_EXPIRY_DAYS` (default 90). |
  | **Low Stock** | The medicine's total saleable quantity is at or below its reorder level. |
  | **In Stock** | Everything else. |

- **Billing:**
  - Staff search for a medicine, choose a quantity and, optionally, a batch. If no batch is chosen, the earliest-expiring batch is used first.
  - The bill is saved and stock is reduced in **one database transaction**. If any line fails (not enough stock, expired batch), nothing is saved.
  - Each bill carries a request id, so a double click or a retry can't create two bills.
  - Stock is reduced with a conditional update, so two counters can never sell the same last strip. This was tested with 12 simultaneous bills on PostgreSQL.
- **Returns** (staff) and **cancellations** (admin only) put stock back.
- Every stock change is written to a **stock history** with who did it, when and why: purchase, sale, return, cancellation, adjustment or import. You can see it under Inventory → a medicine → Stock history.
- **Roles:**
  - The public can only read.
  - **Staff** can bill and accept returns.
  - **Admin** can also edit stock, prices, shop details and users, and cancel bills.

  Add more users under **Staff → Users**.

---

## 4. Tests

```powershell
cd backend
python -m pytest -q        # 25 tests: stock status, billing, rollback, duplicates, returns, security, CSV + Marg import, QR
cd ..\frontend
npm test                   # table sorting/search helpers
```

The backend tests also pass against PostgreSQL. To run them that way, set `DATABASE_URL` to a PostgreSQL test database first.

---

## 5. Deploy (put it on the internet)

You need three things: a PostgreSQL database, the backend and the website. The steps below use **Render**, because one file (`render.yaml`) sets up all three.

- Free plans have limits: free databases expire and free servers sleep when idle. Use a paid plan for real shop use.
- Check render.com for current prices.

1. Put this folder on GitHub as a new repository. Don't upload the `.env` files (`.gitignore` already skips them).
2. On render.com, go to **New → Blueprint** and choose the repository. Render reads `render.yaml`.
3. When it asks for values:
   - `VITE_API_URL` = the API address Render shows, e.g. `https://shop-api.onrender.com`
   - `CORS_ORIGINS` and `PUBLIC_SITE_URL` = the website address, e.g. `https://shop-web.onrender.com`
   - Render may only show the addresses after the first deploy. In that case, fill them in under each service's **Environment** tab and redeploy. The website must be rebuilt after `VITE_API_URL` changes.
4. Set `BOOTSTRAP_ADMIN_PASSWORD` on shop-api before the first deploy. On first start the server creates the `owner` login with it, and loads `data/shop_details.json` if no shop details exist yet. No server shell is needed.
5. Open the website, sign in at `/staff`, enter the shop details and import the stock.

**Other hosts:**

- The backend runs anywhere that supports Python, for example Railway or a VPS. Use the start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- The database can be any managed PostgreSQL, for example Neon or Supabase. Paste its URL into `DATABASE_URL`.
- The frontend can go to Netlify or Vercel. Use build command `npm run build` and publish folder `dist`. The included `public/_redirects` (Netlify) and `vercel.json` make links like `/companies/abc` work.

**Production checklist:**

- `ENV=production` (this also hides `/docs`)
- `SECRET_KEY` is a long random value. The server refuses to start with the default.
- `DATABASE_URL` points to PostgreSQL.
- `CORS_ORIGINS` contains only the website address.
- Both addresses use **https**. Render, Netlify and Vercel provide this automatically.

### Your own domain (recommended for the QR code)

A printed QR code should point to an address that never changes. Buy a domain, for example `yourshopname.in`, and connect it to the website service. Then set `PUBLIC_SITE_URL=https://yourshopname.in`. If you change hosting later, point the domain at the new host and the printed QR codes keep working.

---

## 6. QR code

1. Set `PUBLIC_SITE_URL` on the backend to the website's public **https** address and restart the backend.
2. Go to **Staff → QR code** and open the print page, or open `/qr` directly. You can:
   - **Print** it with the shop name
   - **Download PNG** (high resolution, for printing)
   - **Download SVG** (for a print shop)
3. Each company also has its own QR code. It opens `/companies/<company-address>` directly.
4. Before printing many copies, scan the code with two different phones.

Safety rules built into the QR code:

- The app **refuses** to make a QR code for `localhost`, `127.0.0.1`, private Wi-Fi addresses or plain `http`. A printed code must open the real website.
- It uses medium error correction, black on white, with a 4-module quiet border, so it scans reliably.

For testing on your own Wi-Fi only:

```powershell
python -m app.cli make-qr --url http://192.168.1.20:5173 --test-only
```

This saves `qr\qr_TEST_ONLY.png`. Don't print it for customers.

For production, `python -m app.cli make-qr` saves `qr\qr_website.png` and `.svg` from `PUBLIC_SITE_URL`.

---

## 7. Main API endpoints

| Method | Path | Who |
|---|---|---|
| GET | `/api/shop` | public |
| GET | `/api/companies?q=&order=asc|desc&page=&page_size=` | public |
| GET | `/api/companies/{slug}` (company + stock rows) | public |
| GET | `/api/qr/info`, `/api/qr/code.png`, `/api/qr/code.svg` (`?company=slug`) | public |
| POST | `/api/auth/login` | staff |
| GET | `/api/billing/search?q=` | staff |
| POST | `/api/billing/bills` | staff |
| GET | `/api/billing/bills`, `/api/billing/bills/{id}` | staff |
| POST | `/api/billing/bills/{id}/return` | staff |
| POST | `/api/billing/bills/{id}/cancel` | admin |
| GET | `/api/admin/summary`, `/api/admin/medicines` | staff |
| | `/api/admin/companies`, `/medicines`, `/batches/{id}`, `/batches/{id}/adjust`, `/purchases`, `/movements`, `/import`, `/shop`, `/users` | admin |

Full interactive docs: http://127.0.0.1:8000/docs (development only).

## 8. Not included yet

These can be added later without rebuilding the site:

- GST/discount calculation on bills
- supplier master list
- barcode scanning
- PDF invoices
- database migrations (Alembic) once the table design is final
