# Setup guide: Shivasharana Distributor website

This guide takes you from the zip file to a live website with a printed QR code. Part A runs it on your laptop. Part B puts it online. Part C covers daily use.

What you get:

- **Public website** that anyone can open by scanning the QR code. It shows:
  - shop details
  - 48 companies
  - each company's products with closing stock, earliest expiry and status
- **Staff area** at `/staff`, which needs a login. Staff use it to:
  - upload the daily Marg report
  - manage inventory
  - print the QR code

> **Keep billing in Marg.** The stock on the website comes from the Marg report you upload. The website also has its own "New bill" screen, but if you bill in both places the numbers won't match. The next Marg upload will overwrite the website's numbers anyway.

---

## Part A: Run it on your laptop (about 15 minutes)

### A1. Put the files in place
1. In VS Code, close the old project.
2. In File Explorer, rename your old `shop management` folder to `shop management OLD` as a backup.
3. Unzip `shop-management.zip` to the Desktop. You get a folder called `shop-management` containing `backend` and `frontend`.
4. Copy `PRODUCT_LIST.XLS` into `shop-management\backend\data\`.
5. In VS Code, use **File → Open Folder** and pick `shop-management`.

### A2. Backend (Terminal 1)
Open **Terminal → New Terminal** and run these commands one at a time:

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements-dev.txt
copy .env.example .env
```

If you see "running scripts is disabled", run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, then run `venv\Scripts\activate` again.

Load the shop details. The address, phone and email you gave are already in `data\shop_details.json`:

```powershell
python -m app.cli load-shop data\shop_details.json
```

Create the owner login. It asks for a password of at least 8 characters. Nothing shows while you type, which is normal:

```powershell
python -m app.cli create-admin --username owner --name "Owner"
```

Import the Marg stock report. First check it (this saves nothing):

```powershell
python -m app.cli import-marg data\PRODUCT_LIST.XLS
```

You should see `Items read: 1487`. There will also be 13 notes about negative closing stock in Marg; those items are shown as 0. Now save it:

```powershell
python -m app.cli import-marg data\PRODUCT_LIST.XLS --commit
```

Start the backend:

```powershell
python -m uvicorn app.main:app --reload
```

Leave this terminal running. http://127.0.0.1:8000 should say *"Medical Shop Inventory API is running!"*.

### A3. Website (Terminal 2)
Click **+** in the terminal panel to open a second terminal:

```powershell
cd frontend
copy .env.example .env
npm install
npm run dev
```

Open http://localhost:5173 and check these pages:

| Page | What you should see |
|---|---|
| Home | Shivasharana Distributor, address, phone, email, "Stock list updated 15 Oct 2026" |
| View Companies | 48 companies, with search and A–Z sort |
| Any company | Products, pack, quantity, earliest expiry, status (In Stock, Near Expiry, Out of Stock and so on) |
| `/staff` | Log in as `owner` with your password |

### A4. Check the details
Go to **Staff → Shop details** and check:

- **Address.** You typed *"1st Floor, Shop No. 3, Santhoshi Homtel"*, but the Marg report header says *"Shop No. 03, Ground Floor (Duplex), near Vishal Mart, Santhos…"*. Correct whichever is wrong. Also check the spelling "Homtel".
- **Opening hours, drug licence number and GSTIN.** Add these if you want them on the website. Empty fields are hidden.
- **What the public can see.** If you don't want customers or competitors to see exact quantities, untick "Show stock quantities". The website will then show only the In Stock or Out of Stock status.

---

## Part B: Put it online and make the QR code

### B1. Upload the code to GitHub
1. Create a free account at github.com.
2. Create a new **private** repository called `shivasharana-website`.
3. Install **GitHub Desktop**. Use **File → Add local repository**, pick the `shop-management` folder, then **Publish**.
   - The `.gitignore` file keeps out `.env`, `shop.db`, `venv` and `node_modules`.
   - Don't upload `PRODUCT_LIST.XLS` to GitHub. Upload it through the website in step B3 instead.

### B2. Create the database, API and website on Render
1. Sign up at render.com using your GitHub account.
2. Click **New → Blueprint** and select `shivasharana-website`. Render reads `render.yaml` and creates three things:
   - `shop-db` (PostgreSQL database)
   - `shop-api` (backend)
   - `shop-web` (website)
3. Render asks for a few values:
   - `BOOTSTRAP_ADMIN_PASSWORD`: type the password you want for the `owner` login, at least 8 characters. On the first start, the server creates the `owner` login with this password and loads the shop details from `data/shop_details.json`. After you've logged in once, you can delete this value under shop-api → Environment.
   - The website and API addresses: if you don't know them yet, leave them blank, let it deploy once, then fill them in:
   - **shop-web → Environment:** set `VITE_API_URL` = the shop-api address, e.g. `https://shop-api-xxxx.onrender.com`. Then click **Manual Deploy**.
   - **shop-api → Environment:** set both `CORS_ORIGINS` and `PUBLIC_SITE_URL` = the shop-web address, e.g. `https://shop-web-xxxx.onrender.com`. Then click **Manual Deploy**.
4. Free plans are slow to wake up, and the free database is temporary. For the real shop, switch `shop-db` and `shop-api` to a paid plan. Check render.com for current prices.

### B3. Load the stock online
1. Open your website address and add `/staff` to the end.
2. Log in, go to **Import stock → Marg ERP stock report**, and choose `PRODUCT_LIST.XLS`.
3. Click **Check file**, then **Save to database**.

### B4. Print the QR code
1. Go to **Staff → QR code** and click **Open print page**.
2. Click **Print**, or download the **PNG** (for printing at home) or **SVG** (for a print shop).
3. Scan it with two different phones and make sure it opens the website.
4. Print it A5 or larger and put it at the counter.

**Optional:** buy a domain such as `shivasharanadistributor.in` and connect it to `shop-web` in Render (Settings → Custom Domain). Then set `PUBLIC_SITE_URL=https://shivasharanadistributor.in` and print the QR again. With your own domain, the printed QR keeps working even if you change hosting later.

---

## Part C: Daily use

| When | What to do |
|---|---|
| **Every day, or after big purchases or sales** | In Marg, export the **Stock & Sales Analysis** report up to today to Excel, the same way you made PRODUCT_LIST.XLS. Upload it on the website: **Staff → Import stock → Check file → Save**. The website shows the new date as "Stock as of …". |
| A new company or product appears in Marg | Nothing to do. The next upload adds it automatically. |
| A product should not be shown publicly | Go to **Inventory**, click the product, **Edit medicine**, and untick "Show on the public website". |
| Give an employee access | Go to **Staff → Users → Add a user** with the role "staff". Staff can't change stock or settings. |
| Check expiring stock | The **Dashboard** lists low stock, stock expiring within 90 days, and expired stock. |

Things to know:

- **The website shows Marg's closing stock exactly.** Items with negative stock in Marg are shown as 0. The upload lists those items so you can fix them in Marg.
- **Expiry shown is the earliest expiry (M.EXP)** of the stock held. The Marg report has no batch numbers, so none are shown or invented.
- **The report has no prices**, so the website doesn't show prices. If you ever bill from the website instead of Marg, set each product's sale price first under **Inventory → product → Edit**.
- **Uploading the same report twice changes nothing.** Uploading a newer report updates the quantities.
