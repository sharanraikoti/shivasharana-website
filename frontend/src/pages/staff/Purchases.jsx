import { useState } from "react";
import { AdminOnly, PageTitle } from "../../components/StaffLayout";
import { Button, Card, ErrorBox, Field, Loading, Notice, inputClass } from "../../components/ui";
import { api } from "../../lib/api";
import { formatDate, money } from "../../lib/format";
import { useApi, useTitle } from "../../lib/hooks";

const today = () => new Date().toISOString().slice(0, 10);
const blankLine = () => ({ key: Math.random().toString(36).slice(2), medicine_id: "", batch_no: "", expiry_date: "", quantity: "", mrp: "", sale_price: "", purchase_price: "" });

export default function Purchases() {
  useTitle("Receive stock");
  return (
    <AdminOnly>
      <PurchaseScreen />
    </AdminOnly>
  );
}

function PurchaseScreen() {
  const meds = useApi("/api/admin/medicines", { auth: true });
  const recent = useApi("/api/admin/purchases?limit=20", { auth: true });
  const [head, setHead] = useState({ supplier_name: "", invoice_no: "", purchase_date: today(), notes: "" });
  const [lines, setLines] = useState([blankLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);

  const byCompany = (meds.data || []).reduce((acc, m) => {
    (acc[m.company_name] ||= []).push(m);
    return acc;
  }, {});
  const setLine = (key, k, v) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [k]: v } : l)));
  const total = lines.reduce((s, l) => s + (Number(l.purchase_price) || 0) * (Number(l.quantity) || 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const res = await api("/api/admin/purchases", {
        method: "POST",
        auth: true,
        body: {
          ...head,
          invoice_no: head.invoice_no || null,
          notes: head.notes || null,
          items: lines.map((l) => ({
            medicine_id: Number(l.medicine_id),
            batch_no: l.batch_no,
            expiry_date: l.expiry_date,
            quantity: Number(l.quantity),
            sale_price: l.sale_price,
            mrp: l.mrp === "" ? null : l.mrp,
            purchase_price: l.purchase_price === "" ? null : l.purchase_price,
          })),
        },
      });
      setSaved(res);
      setLines([blankLine()]);
      setHead({ supplier_name: head.supplier_name, invoice_no: "", purchase_date: today(), notes: "" });
      recent.reload();
      meds.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageTitle>Receive stock</PageTitle>
      {meds.loading && <Loading />}
      <ErrorBox error={meds.error} onRetry={meds.reload} />
      {saved && (
        <Notice kind="success" className="mb-4">
          Saved purchase #{saved.id}: {saved.items.length} line(s) added to stock.
        </Notice>
      )}
      {meds.data && meds.data.length === 0 && <Notice kind="warn">Add the medicines in Inventory (or import a CSV) before receiving stock.</Notice>}
      {meds.data && meds.data.length > 0 && (
        <form onSubmit={submit} className="space-y-5">
          <Card className="grid gap-4 p-4 sm:grid-cols-4">
            <Field label="Supplier / distributor">
              <input className={inputClass} value={head.supplier_name} onChange={(e) => setHead({ ...head, supplier_name: e.target.value })} required maxLength={200} />
            </Field>
            <Field label="Invoice no (optional)">
              <input className={inputClass} value={head.invoice_no} onChange={(e) => setHead({ ...head, invoice_no: e.target.value })} maxLength={80} />
            </Field>
            <Field label="Purchase date">
              <input type="date" className={inputClass} value={head.purchase_date} max={today()} onChange={(e) => setHead({ ...head, purchase_date: e.target.value })} required />
            </Field>
            <Field label="Notes (optional)">
              <input className={inputClass} value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} maxLength={2000} />
            </Field>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 font-semibold text-ink">Items received</h2>
            <div className="space-y-4">
              {lines.map((l, i) => (
                <div key={l.key} className="grid gap-3 border-b border-line pb-4 last:border-0 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_0.8fr_0.8fr_0.8fr_0.8fr_auto]">
                  <Field label={`Medicine ${i + 1}`}>
                    <select className={inputClass} value={l.medicine_id} onChange={(e) => setLine(l.key, "medicine_id", e.target.value)} required>
                      <option value="">Choose…</option>
                      {Object.entries(byCompany).map(([company, ms]) => (
                        <optgroup key={company} label={company}>
                          {ms.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} {m.strength} {m.dosage_form && `(${m.dosage_form})`}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </Field>
                  <Field label="Batch no">
                    <input className={inputClass} value={l.batch_no} onChange={(e) => setLine(l.key, "batch_no", e.target.value)} required maxLength={80} />
                  </Field>
                  <Field label="Expiry">
                    <input type="date" className={inputClass} value={l.expiry_date} min={today()} onChange={(e) => setLine(l.key, "expiry_date", e.target.value)} required />
                  </Field>
                  <Field label="Quantity">
                    <input type="number" min="1" step="1" className={inputClass} value={l.quantity} onChange={(e) => setLine(l.key, "quantity", e.target.value)} required />
                  </Field>
                  <Field label="MRP">
                    <input type="number" min="0" step="0.01" className={inputClass} value={l.mrp} onChange={(e) => setLine(l.key, "mrp", e.target.value)} />
                  </Field>
                  <Field label="Sale price">
                    <input type="number" min="0" step="0.01" className={inputClass} value={l.sale_price} onChange={(e) => setLine(l.key, "sale_price", e.target.value)} required />
                  </Field>
                  <Field label="Cost price">
                    <input type="number" min="0" step="0.01" className={inputClass} value={l.purchase_price} onChange={(e) => setLine(l.key, "purchase_price", e.target.value)} />
                  </Field>
                  <div className="flex items-end">
                    <Button variant="ghost" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={`Remove line ${i + 1}`}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <Button variant="secondary" onClick={() => setLines((ls) => [...ls, blankLine()])}>
                Add another item
              </Button>
              <span className="text-sm text-ink-soft">
                Cost total: <strong className="tabular-nums text-ink">{money(total)}</strong>
              </span>
            </div>
          </Card>
          <ErrorBox error={error} />
          <div className="flex justify-end">
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? "Saving…" : "Save and add to stock"}
            </Button>
          </div>
        </form>
      )}

      {recent.data?.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-semibold text-ink">Recent purchases</h2>
          <Card className="divide-y divide-line">
            {recent.data.map((p) => (
              <details key={p.id} className="px-4 py-3 text-sm">
                <summary className="flex cursor-pointer flex-wrap justify-between gap-2">
                  <span className="font-medium text-ink">
                    #{p.id} · {p.supplier_name} {p.invoice_no && `· ${p.invoice_no}`}
                  </span>
                  <span className="text-ink-soft">
                    {formatDate(p.purchase_date)} · {p.items.length} items · {money(p.total_cost)}
                  </span>
                </summary>
                <ul className="mt-2 space-y-1 text-ink-soft">
                  {p.items.map((it, i) => (
                    <li key={i}>
                      {it.medicine_name} · {it.batch_no || "—"} · exp {formatDate(it.expiry_date)} · +{it.quantity}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </Card>
        </section>
      )}
    </>
  );
}
