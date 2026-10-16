import { fullAddress, formatDate, formatDateTime, money } from "../lib/format";
import { useShop } from "../lib/hooks";

/** Printable bill. */
export default function BillView({ bill }) {
  const shop = useShop();
  return (
    <div className="text-sm text-ink">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-3">
        <div>
          <p className="text-base font-bold">{shop?.name}</p>
          {fullAddress(shop) && <p className="text-ink-soft">{fullAddress(shop)}</p>}
          {shop?.phone && <p className="text-ink-soft">Phone: {shop.phone}</p>}
          {shop?.drug_licence_no && <p className="text-ink-soft">DL No: {shop.drug_licence_no}</p>}
          {shop?.gstin && <p className="text-ink-soft">GSTIN: {shop.gstin}</p>}
        </div>
        <div className="text-right">
          <p className="font-semibold">Bill {bill.bill_no}</p>
          <p className="text-ink-soft">{formatDateTime(bill.created_at)}</p>
          {bill.created_by && <p className="text-ink-soft">By {bill.created_by}</p>}
          {bill.status === "cancelled" && <p className="mt-1 font-bold text-red-700">CANCELLED</p>}
        </div>
      </div>
      {(bill.customer_name || bill.customer_phone) && (
        <p className="mt-2 text-ink-soft">
          Customer: {[bill.customer_name, bill.customer_phone].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-line text-xs uppercase text-ink-mute">
            <tr>
              <th className="py-2 pr-2">Item</th>
              <th className="py-2 pr-2">Batch / Exp</th>
              <th className="py-2 pr-2 text-right">Qty</th>
              <th className="py-2 pr-2 text-right">Rate</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {bill.items.map((it) => (
              <tr key={it.id}>
                <td className="py-2 pr-2">
                  <span className="font-medium">{it.medicine_name} {it.strength}</span>
                  {it.pack_size && <span className="text-ink-mute"> · {it.pack_size}</span>}
                  <span className="block text-xs text-ink-mute">{it.company_name}</span>
                </td>
                <td className="py-2 pr-2 text-xs text-ink-soft">
                  {it.batch_no || "—"}
                  <br />
                  {formatDate(it.expiry_date, { monthOnly: true })}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {it.quantity}
                  {it.returned_quantity > 0 && <span className="block text-xs text-amber-700">−{it.returned_quantity} returned</span>}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{money(it.unit_price)}</td>
                <td className="py-2 text-right tabular-nums">{money(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end border-t border-line pt-3 text-base font-bold">
        <span className="mr-6">Total</span>
        <span className="tabular-nums">{money(bill.total)}</span>
      </div>
      {bill.status === "cancelled" && bill.cancel_reason && <p className="mt-2 text-xs text-red-700">Cancelled: {bill.cancel_reason}</p>}
    </div>
  );
}
