import { useState } from "react";
import BillView from "../../components/BillView";
import { Modal, PageTitle } from "../../components/StaffLayout";
import { Button, Card, Empty, ErrorBox, Field, Loading, Notice, inputClass } from "../../components/ui";
import { api } from "../../lib/api";
import { formatDateTime, money } from "../../lib/format";
import { useApi, useAuth, useTitle } from "../../lib/hooks";

export default function Bills() {
  useTitle("Bills");
  const [day, setDay] = useState("");
  const { data, error, loading, reload } = useApi(`/api/billing/bills?limit=200${day ? `&day=${day}` : ""}`, { auth: true });
  const [open, setOpen] = useState(null);

  return (
    <>
      <PageTitle
        actions={
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            Date
            <input type="date" className={inputClass + " h-9 !w-auto"} value={day} onChange={(e) => setDay(e.target.value)} />
            {day && (
              <Button size="sm" variant="ghost" onClick={() => setDay("")}>
                All
              </Button>
            )}
          </label>
        }
      >
        Bills
      </PageTitle>
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && data.length === 0 && <Empty title="No bills yet" />}
      {data && data.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-paper text-xs uppercase tracking-wider text-ink-mute">
              <tr>
                <th className="px-4 py-3">Bill</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right">Items</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((b) => (
                <tr key={b.id} className="hover:bg-paper">
                  <td className="px-4 py-2.5">
                    <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setOpen(b)}>
                      {b.bill_no}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft">{formatDateTime(b.created_at)}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{b.customer_name || "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{b.items.length}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{money(b.total)}</td>
                  <td className="px-4 py-2.5">
                    {b.status === "cancelled" ? <span className="text-red-700">Cancelled</span> : b.items.some((i) => i.returned_quantity) ? <span className="text-amber-700">Part returned</span> : "Completed"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {open && (
        <BillDialog
          bill={open}
          onClose={() => setOpen(null)}
          onChange={(b) => {
            setOpen(b);
            reload();
          }}
        />
      )}
    </>
  );
}

function BillDialog({ bill, onClose, onChange }) {
  const { user } = useAuth();
  const [mode, setMode] = useState(null); // "return" | "cancel"
  const [reason, setReason] = useState("");
  const [qty, setQty] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState("");

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      let b;
      if (mode === "cancel") {
        b = await api(`/api/billing/bills/${bill.id}/cancel`, { method: "POST", auth: true, body: { reason } });
        setDone("Bill cancelled and stock restored.");
      } else {
        const items = Object.entries(qty)
          .filter(([, v]) => v > 0)
          .map(([id, v]) => ({ sale_item_id: Number(id), quantity: v }));
        if (!items.length) throw new Error("Enter a quantity to return.");
        b = await api(`/api/billing/bills/${bill.id}/return`, { method: "POST", auth: true, body: { reason, items } });
        setDone("Return saved and stock added back.");
      }
      setMode(null);
      setReason("");
      setQty({});
      onChange(b);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Bill ${bill.bill_no}`} onClose={onClose} wide>
      <BillView bill={bill} />
      {done && <Notice kind="success" className="mt-4 print:hidden">{done}</Notice>}
      {mode && (
        <div className="mt-5 space-y-3 rounded-md border border-line bg-paper p-4 print:hidden">
          {mode === "return" &&
            bill.items.map((it) => {
              const left = it.quantity - it.returned_quantity;
              if (!left) return null;
              return (
                <label key={it.id} className="flex items-center justify-between gap-3 text-sm">
                  <span>
                    {it.medicine_name} {it.strength} · {it.batch_no || "no batch no."} <span className="text-ink-mute">(max {left})</span>
                  </span>
                  <input type="number" min="0" max={left} className={inputClass + " h-9 !w-20 shrink-0 text-right"} value={qty[it.id] ?? 0} onChange={(e) => setQty((q) => ({ ...q, [it.id]: Math.max(0, Math.min(left, Math.floor(Number(e.target.value) || 0))) }))} />
                </label>
              );
            })}
          <Field label={mode === "cancel" ? "Why is this bill being cancelled?" : "Reason for return"}>
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
          <ErrorBox error={error} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMode(null)}>
              Back
            </Button>
            <Button variant={mode === "cancel" ? "danger" : "primary"} disabled={busy || reason.trim().length < 3} onClick={run}>
              {mode === "cancel" ? "Cancel bill" : "Save return"}
            </Button>
          </div>
        </div>
      )}
      {!mode && (
        <div className="mt-5 flex flex-wrap justify-end gap-2 print:hidden">
          <Button variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
          {bill.status === "completed" && bill.items.some((i) => i.quantity > i.returned_quantity) && (
            <Button variant="secondary" onClick={() => { setMode("return"); setDone(""); }}>
              Return items
            </Button>
          )}
          {bill.status === "completed" && user?.role === "admin" && (
            <Button variant="danger" onClick={() => { setMode("cancel"); setDone(""); }}>
              Cancel bill
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
