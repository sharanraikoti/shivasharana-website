export const STATUSES = ["In Stock", "Low Stock", "Near Expiry", "Out of Stock", "Expired"];

export const STATUS_STYLE = {
  "In Stock": "bg-emerald-50 text-emerald-800 ring-emerald-200",
  "Low Stock": "bg-amber-50 text-amber-900 ring-amber-200",
  "Near Expiry": "bg-orange-50 text-orange-900 ring-orange-200",
  "Out of Stock": "bg-slate-100 text-slate-700 ring-slate-300",
  Expired: "bg-red-50 text-red-800 ring-red-200",
};

export function formatDate(iso, { monthOnly = false } = {}) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-IN", monthOnly ? { month: "short", year: "numeric" } : { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  const s = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z"; // server times are UTC
  return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;

export function money(v) {
  if (v === null || v === undefined || v === "") return "—";
  return "₹" + Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const batchText = (b) => b?.batch_no || "No batch no.";

export function medicineLabel(row) {
  return [row.name, row.strength].filter(Boolean).join(" ");
}

/** Sort stock rows by name, quantity or expiry. Missing values always go last. */
export function sortRows(rows, key, dir = "asc") {
  const mult = dir === "desc" ? -1 : 1;
  const val = (r) => {
    if (key === "quantity") return r.quantity;
    if (key === "expiry") return r.expiry_date;
    return medicineLabel(r).toLowerCase();
  };
  return [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1;
    if (y === null || y === undefined) return -1;
    if (x < y) return -1 * mult;
    if (x > y) return 1 * mult;
    return medicineLabel(a).localeCompare(medicineLabel(b));
  });
}

export function filterRows(rows, q) {
  const t = q.trim().toLowerCase();
  if (!t) return rows;
  return rows.filter((r) =>
    [r.name, r.strength, r.dosage_form, r.batch_no].filter(Boolean).join(" ").toLowerCase().includes(t)
  );
}

export function fullAddress(shop) {
  if (!shop) return "";
  const last = [shop.city, shop.state].filter(Boolean).join(", ");
  return [shop.address_line1, shop.address_line2, [last, shop.pincode].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

export function newRequestId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
