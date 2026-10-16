import { useEffect, useState } from "react";
import { AdminOnly, PageTitle } from "../../components/StaffLayout";
import { Button, Card, ErrorBox, Field, Loading, Notice, inputClass } from "../../components/ui";
import { api } from "../../lib/api";
import { useApi, useShopState, useTitle } from "../../lib/hooks";

const TEXT = [
  ["name", "Shop name", { required: true }],
  ["tagline", "Tagline (optional)"],
  ["address_line1", "Address line 1"],
  ["address_line2", "Address line 2"],
  ["city", "City"],
  ["state", "State"],
  ["pincode", "PIN code"],
  ["phone", "Phone"],
  ["email", "Email", { type: "email" }],
  ["drug_licence_no", "Drug licence no"],
  ["gstin", "GSTIN"],
  ["logo_url", "Logo image URL (https://, optional)"],
];

export default function ShopDetails() {
  useTitle("Shop details");
  return (
    <AdminOnly>
      <ShopForm />
    </AdminOnly>
  );
}

function ShopForm() {
  const { data, error, loading, reload } = useApi("/api/admin/shop", { auth: true });
  const shopState = useShopState();
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setF(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v ?? ""])));
  }, [data]);

  if (loading || !f) return error ? <ErrorBox error={error} onRetry={reload} /> : <Loading />;

  const set = (k) => (e) => {
    setSaved(false);
    setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setSaveError(null);
    try {
      const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === "" ? null : v]));
      await api("/api/admin/shop", { method: "PUT", auth: true, body });
      setSaved(true);
      shopState.reload();
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-5">
      <PageTitle>Shop details</PageTitle>
      <p className="text-sm text-ink-soft">Everything here is shown on the public website. Leave a field empty to hide it.</p>
      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        {TEXT.map(([k, label, opts = {}]) => (
          <Field key={k} label={label} className={k === "name" || k === "logo_url" ? "sm:col-span-2" : undefined}>
            <input className={inputClass} value={f[k]} onChange={set(k)} required={opts.required} type={opts.type || "text"} />
          </Field>
        ))}
        <Field label="Opening hours" className="sm:col-span-2" hint="One line per day range, e.g. Mon–Sat 8:00 am – 10:00 pm">
          <textarea rows={3} className={inputClass + " h-auto py-2"} value={f.opening_hours} onChange={set("opening_hours")} />
        </Field>
        <Field label="Short description" className="sm:col-span-2">
          <textarea rows={4} className={inputClass + " h-auto py-2"} value={f.description} onChange={set("description")} />
        </Field>
      </Card>
      <Card className="space-y-3 p-5 text-sm">
        <h2 className="font-semibold text-ink">What the public can see</h2>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.show_quantities} onChange={set("show_quantities")} /> Show stock quantities
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.show_batches} onChange={set("show_batches")} /> Show batch numbers and per-batch expiry
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.is_sample} onChange={set("is_sample")} /> These are still sample details (shows a warning banner)
        </label>
      </Card>
      <ErrorBox error={saveError} />
      {saved && <Notice kind="success">Saved. The public website now shows these details.</Notice>}
      <Button type="submit" size="lg" disabled={busy}>
        {busy ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}
