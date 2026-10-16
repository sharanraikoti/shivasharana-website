import { useState } from "react";
import { Modal, PageTitle } from "../../components/StaffLayout";
import { Button, Card, Empty, ErrorBox, Field, Loading, Notice, SampleBadge, SearchInput, StatusBadge, inputClass } from "../../components/ui";
import { api } from "../../lib/api";
import { batchText, formatDate, formatDateTime, money } from "../../lib/format";
import { useApi, useAuth, useDebounced, useTitle } from "../../lib/hooks";

export default function Inventory() {
  useTitle("Inventory");
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [companyId, setCompanyId] = useState("");
  const [q, setQ] = useState("");
  const term = useDebounced(q.trim());
  const companies = useApi("/api/admin/companies", { auth: true });
  const meds = useApi(`/api/admin/medicines?${new URLSearchParams({ ...(companyId && { company_id: companyId }), ...(term && { q: term }) })}`, { auth: true });
  const [dialog, setDialog] = useState(null);

  const company = companies.data?.find((c) => String(c.id) === companyId);
  const refresh = () => {
    companies.reload();
    meds.reload();
  };

  return (
    <>
      <PageTitle
        actions={
          isAdmin && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setDialog({ type: "company" })}>
                Add company
              </Button>
              <Button onClick={() => setDialog({ type: "medicine", medicine: companyId ? { company_id: Number(companyId) } : null })}>Add medicine</Button>
            </div>
          )
        }
      >
        Inventory
      </PageTitle>

      <div className="grid gap-3 md:grid-cols-[18rem_1fr]">
        <select aria-label="Company" className={inputClass} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">All companies</option>
          {companies.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.is_public ? "" : " (hidden)"}
            </option>
          ))}
        </select>
        <SearchInput value={q} onChange={setQ} placeholder="Search medicines" />
      </div>
      {company && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-ink-soft">
          <span>
            Web address: <code className="rounded bg-white px-1.5 py-0.5 ring-1 ring-line">/companies/{company.slug}</code>
          </span>
          {!company.is_public && <span className="text-amber-700">Hidden from the public site</span>}
          {isAdmin && (
            <Button size="sm" variant="ghost" onClick={() => setDialog({ type: "company", company })}>
              Edit company
            </Button>
          )}
        </div>
      )}

      <div className="mt-4">
        {meds.loading && !meds.data && <Loading />}
        <ErrorBox error={meds.error} onRetry={meds.reload} />
        {meds.data?.length === 0 && <Empty title="No medicines found">{isAdmin ? "Add a medicine or import a CSV file." : null}</Empty>}
        {meds.data?.length > 0 && (
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-paper text-xs uppercase tracking-wider text-ink-mute">
                <tr>
                  <th className="px-4 py-3">Medicine</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3 text-right">Saleable</th>
                  <th className="px-4 py-3 text-right">Expired</th>
                  <th className="px-4 py-3 text-right">Batches</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {meds.data.map((m) => (
                  <tr key={m.id} className="hover:bg-paper">
                    <td className="px-4 py-2.5">
                      <button type="button" className="text-left font-medium text-brand-700 hover:underline" onClick={() => setDialog({ type: "batches", medicine: m })}>
                        {m.name} {m.strength}
                      </button>
                      <span className="block text-xs text-ink-mute">
                        {[m.pack_size, m.dosage_form].filter(Boolean).join(" · ")} {m.is_public ? "" : "· hidden"} {m.is_sample && <SampleBadge />}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-ink-soft">{m.company_name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {m.saleable_quantity} <span className="text-xs text-ink-mute">{m.unit}</span>
                    </td>
                    <td className={"px-4 py-2.5 text-right tabular-nums " + (m.expired_quantity ? "text-red-700" : "text-ink-mute")}>{m.expired_quantity}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{m.batch_count}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={m.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {dialog?.type === "company" && <CompanyForm company={dialog.company} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); refresh(); }} />}
      {dialog?.type === "medicine" && (
        <MedicineForm medicine={dialog.medicine} companies={companies.data || []} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); refresh(); }} />
      )}
      {dialog?.type === "batches" && (
        <BatchesDialog medicine={dialog.medicine} isAdmin={isAdmin} onClose={() => setDialog(null)} onChanged={meds.reload} onEdit={() => setDialog({ type: "medicine", medicine: dialog.medicine })} />
      )}
    </>
  );
}

function useSubmit(fn, onDone) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      onDone?.(r);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

function CompanyForm({ company, onClose, onSaved }) {
  const [f, setF] = useState({ name: company?.name || "", logo_url: company?.logo_url || "", logo_source: company?.logo_source || "", is_public: company?.is_public ?? true });
  const { busy, error, submit } = useSubmit(
    () =>
      api(company ? `/api/admin/companies/${company.id}` : "/api/admin/companies", {
        method: company ? "PUT" : "POST",
        auth: true,
        body: { ...f, logo_url: f.logo_url || null, logo_source: f.logo_source || null },
      }),
    onSaved
  );
  const del = useSubmit(() => api(`/api/admin/companies/${company.id}`, { method: "DELETE", auth: true }), onSaved);
  return (
    <Modal title={company ? "Edit company" : "Add company"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Company name">
          <input className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={200} autoFocus />
        </Field>
        <Field label="Logo URL (optional)" hint="Only use a logo from the company's own website or with permission. Must start with https://">
          <input className={inputClass} value={f.logo_url} onChange={(e) => setF({ ...f, logo_url: e.target.value })} />
        </Field>
        {f.logo_url && (
          <Field label="Where the logo came from">
            <input className={inputClass} value={f.logo_source} onChange={(e) => setF({ ...f, logo_source: e.target.value })} />
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.is_public} onChange={(e) => setF({ ...f, is_public: e.target.checked })} /> Show on the public website
        </label>
        <ErrorBox error={error || del.error} />
        <div className="flex justify-between gap-2">
          {company ? (
            <Button variant="danger" onClick={del.submit} disabled={del.busy}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={busy}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const FORMS = ["Tablet", "Capsule", "Syrup", "Suspension", "Injection", "Ointment", "Cream", "Drops", "Inhaler", "Sachet", "Powder", "Liquid", "Gel", "Other"];
const UNITS = ["strips", "tablets", "capsules", "bottles", "boxes", "tubes", "vials", "sachets", "packs", "pieces"];

function MedicineForm({ medicine, companies, onClose, onSaved }) {
  const editing = !!medicine?.id;
  const [f, setF] = useState({
    company_id: medicine?.company_id ?? companies[0]?.id ?? "",
    name: medicine?.name || "",
    strength: medicine?.strength || "",
    dosage_form: medicine?.dosage_form || "Tablet",
    unit: medicine?.unit || "strips",
    pack_size: medicine?.pack_size || "",
    reorder_level: medicine?.reorder_level ?? 10,
    is_public: medicine?.is_public ?? true,
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const { busy, error, submit } = useSubmit(
    () =>
      api(editing ? `/api/admin/medicines/${medicine.id}` : "/api/admin/medicines", {
        method: editing ? "PUT" : "POST",
        auth: true,
        body: { ...f, company_id: Number(f.company_id), reorder_level: Number(f.reorder_level), pack_size: f.pack_size.trim() },
      }),
    onSaved
  );
  return (
    <Modal title={editing ? "Edit medicine" : "Add medicine"} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Company" className="sm:col-span-2">
          <select className={inputClass} value={f.company_id} onChange={set("company_id")} required>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Medicine name" className="sm:col-span-2">
          <input className={inputClass} value={f.name} onChange={set("name")} required maxLength={200} />
        </Field>
        <Field label="Strength" hint="e.g. 500 mg, 5 mg/5 ml">
          <input className={inputClass} value={f.strength} onChange={set("strength")} maxLength={80} />
        </Field>
        <Field label="Dosage form">
          <input className={inputClass} list="forms" value={f.dosage_form} onChange={set("dosage_form")} maxLength={80} />
          <datalist id="forms">{FORMS.map((x) => <option key={x} value={x} />)}</datalist>
        </Field>
        <Field label="Stock counted in">
          <input className={inputClass} list="units" value={f.unit} onChange={set("unit")} required maxLength={40} />
          <datalist id="units">{UNITS.map((x) => <option key={x} value={x} />)}</datalist>
        </Field>
        <Field label="Pack size (optional)" hint="e.g. 10 x 10">
          <input className={inputClass} value={f.pack_size} onChange={set("pack_size")} maxLength={80} />
        </Field>
        <Field label="Low stock at or below" hint="Shows “Low Stock” when saleable quantity reaches this">
          <input type="number" min="0" className={inputClass} value={f.reorder_level} onChange={set("reorder_level")} required />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={f.is_public} onChange={set("is_public")} /> Show on the public website
        </label>
        <div className="sm:col-span-2">
          <ErrorBox error={error} />
        </div>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" disabled={busy}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function BatchesDialog({ medicine, isAdmin, onClose, onChanged, onEdit }) {
  const batches = useApi(`/api/admin/medicines/${medicine.id}/batches`, { auth: true });
  const history = useApi(isAdmin ? `/api/admin/movements?medicine_id=${medicine.id}&limit=30` : null, { auth: true, skip: !isAdmin });
  const [adjust, setAdjust] = useState(null);
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState("");
  const changed = (text) => {
    setMsg(text);
    setAdjust(null);
    setEdit(null);
    batches.reload();
    history.reload();
    onChanged();
  };

  return (
    <Modal title={`${medicine.name} ${medicine.strength}`} onClose={onClose} wide>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-soft">
        <span>
          {medicine.company_name} · {medicine.dosage_form} · low stock at {medicine.reorder_level} {medicine.unit}
        </span>
        {isAdmin && (
          <Button size="sm" variant="ghost" onClick={onEdit}>
            Edit medicine
          </Button>
        )}
      </div>
      {msg && <Notice kind="success" className="mb-3">{msg}</Notice>}
      {batches.loading && <Loading />}
      <ErrorBox error={batches.error} />
      {batches.data?.length === 0 && <Empty title="No batches yet">{isAdmin ? "Use Receive stock to add a batch." : null}</Empty>}
      {batches.data?.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase text-ink-mute">
              <tr>
                <th className="py-2 pr-3">Batch</th>
                <th className="py-2 pr-3">Expiry</th>
                <th className="py-2 pr-3 text-right">Qty</th>
                <th className="py-2 pr-3 text-right">MRP</th>
                <th className="py-2 pr-3 text-right">Sale price</th>
                <th className="py-2 pr-3">Status</th>
                {isAdmin && <th className="py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {batches.data.map((b) => (
                <tr key={b.id}>
                  <td className="py-2 pr-3 font-mono text-xs">{b.batch_no || <span className="font-sans text-ink-mute">No batch no.</span>}</td>
                  <td className="py-2 pr-3">{formatDate(b.expiry_date)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{b.quantity}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(b.mrp)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{b.sale_price != null ? money(b.sale_price) : <span className="text-amber-700">Not set</span>}</td>
                  <td className="py-2 pr-3">
                    <StatusBadge status={b.status} />
                  </td>
                  {isAdmin && (
                    <td className="whitespace-nowrap py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => { setEdit(b); setAdjust(null); }}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setAdjust(b); setEdit(null); }}>
                        Adjust
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adjust && <AdjustForm batch={adjust} onCancel={() => setAdjust(null)} onDone={() => changed(`${batchText(adjust)}: quantity updated.`)} />}
      {edit && <BatchEditForm batch={edit} onCancel={() => setEdit(null)} onDone={() => changed(`${batchText(edit)}: saved.`)} />}

      {isAdmin && history.data?.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Stock history</summary>
          <ul className="mt-2 divide-y divide-line text-sm">
            {history.data.map((m) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>
                  <span className="font-medium">{m.kind.replace("_", " ")}</span>{m.batch_no && ` · ${m.batch_no}`}
                  {m.reason && <span className="text-ink-mute"> · {m.reason}</span>}
                </span>
                <span className="tabular-nums text-ink-soft">
                  <span className={m.change > 0 ? "text-emerald-700" : "text-red-700"}>{m.change > 0 ? `+${m.change}` : m.change}</span> → {m.quantity_after} · {formatDateTime(m.created_at)}
                  {m.user && ` · ${m.user}`}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Modal>
  );
}

function AdjustForm({ batch, onCancel, onDone }) {
  const [dir, setDir] = useState("-1");
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const { busy, error, submit } = useSubmit(
    () => api(`/api/admin/batches/${batch.id}/adjust`, { method: "POST", auth: true, body: { change: Number(dir) * Number(qty), reason } }),
    onDone
  );
  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-md border border-line bg-paper p-4 sm:grid-cols-3">
      <p className="text-sm font-semibold sm:col-span-3">Adjust {batch.batch_no ? `batch ${batch.batch_no}` : "stock"} (now {batch.quantity})</p>
      <select aria-label="Direction" className={inputClass} value={dir} onChange={(e) => setDir(e.target.value)}>
        <option value="-1">Remove stock</option>
        <option value="1">Add stock</option>
      </select>
      <input aria-label="Quantity" type="number" min="1" className={inputClass} value={qty} onChange={(e) => setQty(e.target.value)} required />
      <input aria-label="Reason" className={inputClass} placeholder="Reason, e.g. damaged, recount" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} />
      <div className="sm:col-span-3">
        <ErrorBox error={error} />
      </div>
      <div className="flex justify-end gap-2 sm:col-span-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Save adjustment
        </Button>
      </div>
    </form>
  );
}

function BatchEditForm({ batch, onCancel, onDone }) {
  const [f, setF] = useState({ batch_no: batch.batch_no ?? "", expiry_date: batch.expiry_date ?? "", mrp: batch.mrp ?? "", sale_price: batch.sale_price ?? "", purchase_price: batch.purchase_price ?? "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const { busy, error, submit } = useSubmit(
    () =>
      api(`/api/admin/batches/${batch.id}`, {
        method: "PUT",
        auth: true,
        body: {
          ...f,
          batch_no: f.batch_no.trim() || null,
          expiry_date: f.expiry_date || null,
          mrp: f.mrp === "" ? null : f.mrp,
          purchase_price: f.purchase_price === "" ? null : f.purchase_price,
        },
      }),
    onDone
  );
  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-md border border-line bg-paper p-4 sm:grid-cols-5">
      <p className="text-sm font-semibold sm:col-span-5">Correct batch details (quantity is changed with Adjust)</p>
      <Field label="Batch no">
        <input className={inputClass} value={f.batch_no} onChange={set("batch_no")} required={!!batch.batch_no} placeholder="Not recorded" />
      </Field>
      <Field label="Expiry">
        <input type="date" className={inputClass} value={f.expiry_date} onChange={set("expiry_date")} required={!!batch.batch_no} />
      </Field>
      <Field label="MRP">
        <input type="number" step="0.01" min="0" className={inputClass} value={f.mrp} onChange={set("mrp")} />
      </Field>
      <Field label="Sale price">
        <input type="number" step="0.01" min="0" className={inputClass} value={f.sale_price} onChange={set("sale_price")} required />
      </Field>
      <Field label="Purchase price">
        <input type="number" step="0.01" min="0" className={inputClass} value={f.purchase_price} onChange={set("purchase_price")} />
      </Field>
      <div className="sm:col-span-5">
        <ErrorBox error={error} />
      </div>
      <div className="flex justify-end gap-2 sm:col-span-5">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}
