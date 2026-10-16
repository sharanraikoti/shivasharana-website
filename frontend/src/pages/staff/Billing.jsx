import { useEffect, useRef, useState } from "react";
import BillView from "../../components/BillView";
import { Modal, PageTitle } from "../../components/StaffLayout";
import { Button, Card, ErrorBox, Field, Loading, SearchInput, StatusBadge, inputClass } from "../../components/ui";
import { api } from "../../lib/api";
import { batchText, formatDate, money, newRequestId } from "../../lib/format";
import { useDebounced, useTitle } from "../../lib/hooks";

export default function Billing() {
  useTitle("New bill");
  const [q, setQ] = useState("");
  const term = useDebounced(q.trim(), 250);
  const [results, setResults] = useState({ rows: [], loading: false, error: null });
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [bill, setBill] = useState(null);
  // One id per attempt: a double click or a retry after a network error can't create two bills
  const requestId = useRef(newRequestId());
  const searchRef = useRef(null);

  useEffect(() => {
    requestId.current = newRequestId();
  }, [cart, customer]);

  useEffect(() => {
    if (!term) return setResults({ rows: [], loading: false, error: null });
    let alive = true;
    setResults((r) => ({ ...r, loading: true, error: null }));
    api(`/api/billing/search?q=${encodeURIComponent(term)}`, { auth: true })
      .then((rows) => alive && setResults({ rows, loading: false, error: null }))
      .catch((e) => alive && setResults({ rows: [], loading: false, error: e }));
    return () => {
      alive = false;
    };
  }, [term]);

  const inCart = (medicineId, batchId) =>
    cart.filter((l) => l.medicine.medicine_id === medicineId && (batchId == null || l.batchId === batchId)).reduce((s, l) => s + l.qty, 0);

  const add = (medicine, batchId, qty) => {
    setError(null);
    setCart((c) => {
      const i = c.findIndex((l) => l.medicine.medicine_id === medicine.medicine_id && l.batchId === batchId);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l));
      return [...c, { key: `${medicine.medicine_id}-${batchId ?? "auto"}`, medicine, batchId, qty }];
    });
    setQ("");
    searchRef.current?.focus();
  };

  const linePrice = (l) => {
    const b = l.batchId ? l.medicine.batches.find((x) => x.id === l.batchId) : null;
    return Number(b ? b.sale_price : l.medicine.next_price || 0);
  };
  const estimate = cart.reduce((s, l) => s + linePrice(l) * l.qty, 0);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api("/api/billing/bills", {
        method: "POST",
        auth: true,
        body: {
          client_request_id: requestId.current,
          customer_name: customer.name || null,
          customer_phone: customer.phone || null,
          items: cart.map((l) => ({ medicine_id: l.medicine.medicine_id, quantity: l.qty, batch_id: l.batchId })),
        },
      });
      setBill(res);
      setCart([]);
      setCustomer({ name: "", phone: "" });
      setResults({ rows: [], loading: false, error: null });
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageTitle>New bill</PageTitle>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <section aria-label="Find medicines">
          <SearchInput ref={searchRef} value={q} onChange={setQ} placeholder="Type a medicine or company name" autoFocus />
          <div className="mt-3 space-y-2">
            {results.loading && <Loading label="Searching…" />}
            <ErrorBox error={results.error} />
            {term && !results.loading && !results.error && results.rows.length === 0 && <p className="text-sm text-ink-mute">No medicines found.</p>}
            {results.rows.map((m) => (
              <ResultRow key={m.medicine_id} m={m} inCart={inCart} onAdd={add} />
            ))}
          </div>
        </section>

        <section aria-label="Bill">
          <Card className="p-4">
            <h2 className="font-semibold text-ink">Bill items</h2>
            {cart.length === 0 ? (
              <p className="py-6 text-sm text-ink-mute">Search for a medicine and add it here.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {cart.map((l) => {
                  const avail = l.batchId ? l.medicine.batches.find((b) => b.id === l.batchId)?.quantity ?? 0 : l.medicine.saleable_quantity;
                  return (
                    <li key={l.key} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink">
                          {l.medicine.name} {l.medicine.strength} {l.medicine.pack_size && <span className="font-normal text-ink-mute">· {l.medicine.pack_size}</span>}
                        </p>
                        <p className="truncate text-xs text-ink-mute">
                          {l.batchId ? batchText(l.medicine.batches.find((b) => b.id === l.batchId)) : "Earliest expiry first"} · {money(linePrice(l))}
                        </p>
                      </div>
                      <input
                        type="number"
                        min="1"
                        max={avail}
                        aria-label={`Quantity of ${l.medicine.name}`}
                        className={inputClass + " h-9 !w-20 shrink-0 text-right"}
                        value={l.qty}
                        onChange={(e) => {
                          const v = Math.max(1, Math.min(avail, Math.floor(Number(e.target.value) || 1)));
                          setCart((c) => c.map((x) => (x.key === l.key ? { ...x, qty: v } : x)));
                        }}
                      />
                      <button type="button" aria-label={`Remove ${l.medicine.name}`} className="rounded p-1 text-ink-mute hover:text-red-700" onClick={() => setCart((c) => c.filter((x) => x.key !== l.key))}>
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Customer name (optional)">
                <input className={inputClass} value={customer.name} onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))} maxLength={200} />
              </Field>
              <Field label="Phone (optional)">
                <input className={inputClass} inputMode="tel" value={customer.phone} onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))} maxLength={40} />
              </Field>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
              <span className="text-ink-soft">Estimated total</span>
              <span className="text-xl font-bold tabular-nums text-ink">{money(estimate)}</span>
            </div>
            <p className="mt-1 text-xs text-ink-mute">The final amount uses each batch's price and is confirmed when the bill is saved.</p>
            <div className="mt-3">
              <ErrorBox error={error} />
            </div>
            <Button className="mt-3 w-full" size="lg" disabled={cart.length === 0 || saving} onClick={submit}>
              {saving ? "Saving bill…" : "Save bill and reduce stock"}
            </Button>
          </Card>
        </section>
      </div>

      {bill && (
        <Modal title={`Bill ${bill.bill_no} saved`} onClose={() => setBill(null)} wide>
          <BillView bill={bill} />
          <div className="mt-5 flex justify-end gap-3 print:hidden">
            <Button variant="secondary" onClick={() => window.print()}>
              Print
            </Button>
            <Button onClick={() => setBill(null)}>New bill</Button>
          </div>
        </Modal>
      )}
    </>
  );
}

function ResultRow({ m, inCart, onAdd }) {
  const [qty, setQty] = useState(1);
  const [batchId, setBatchId] = useState("");
  const bid = batchId ? Number(batchId) : null;
  const avail = (bid ? m.batches.find((b) => b.id === bid)?.quantity ?? 0 : m.saleable_quantity) - inCart(m.medicine_id, bid);
  const priced = bid ? m.batches.find((b) => b.id === bid)?.sale_price != null : m.batches.every((b) => b.sale_price != null);
  const can = avail >= qty && qty > 0 && priced;
  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-ink">
            {m.name} {m.strength} <span className="font-normal text-ink-mute">{[m.pack_size, m.dosage_form].filter(Boolean).join(" · ")}</span>
          </p>
          <p className="text-xs text-ink-mute">{m.company_name}</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold tabular-nums text-ink">{m.next_price ? money(m.next_price) : m.saleable_quantity ? <span className="text-amber-700">Price not set</span> : "—"}</p>
          <p className={"text-xs " + (m.saleable_quantity ? "text-ink-mute" : "text-red-700")}>
            {m.saleable_quantity ? `${m.saleable_quantity} ${m.unit} saleable` : "No saleable stock"}
          </p>
        </div>
      </div>
      {m.saleable_quantity > 0 && (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (can) {
              onAdd(m, bid, qty);
              setQty(1);
            }
          }}
        >
          <select aria-label="Batch" className={inputClass + " h-9 !w-auto min-w-0 flex-1 text-sm"} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">Earliest expiry first</option>
            {m.batches.map((b) => (
              <option key={b.id} value={b.id}>
                {batchText(b)} · exp {formatDate(b.expiry_date, { monthOnly: true })} · {b.quantity} left · {b.sale_price ? money(b.sale_price) : "no price"}
              </option>
            ))}
          </select>
          <input type="number" min="1" aria-label="Quantity" className={inputClass + " h-9 !w-20 shrink-0 text-right"} value={qty} onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
          <Button type="submit" size="sm" disabled={!can}>
            Add
          </Button>
          {!priced && <span className="w-full text-xs text-amber-700">No sale price set. An admin can add it in Inventory.</span>}
          {priced && !can && <span className="w-full text-xs text-red-700">Only {Math.max(0, avail)} more can be added.</span>}
        </form>
      )}
      {m.batches.some((b) => b.status === "Near Expiry") && (
        <div className="mt-2">
          <StatusBadge status="Near Expiry" /> <span className="text-xs text-ink-mute">Sell these batches first.</span>
        </div>
      )}
    </Card>
  );
}
