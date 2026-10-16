import { useState } from "react";
import { AdminOnly, PageTitle } from "../../components/StaffLayout";
import { Button, Card, ErrorBox, Notice } from "../../components/ui";
import { api } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { useShopState, useTitle } from "../../lib/hooks";

export default function ImportData() {
  useTitle("Import stock");
  const { shop } = useShopState() || {};
  return (
    <AdminOnly>
      <PageTitle>Import stock</PageTitle>
      {shop?.stock_as_of && (
        <p className="mb-4 text-sm text-ink-soft">
          The website currently shows stock as of <strong className="text-ink">{formatDate(shop.stock_as_of)}</strong>.
        </p>
      )}
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <Uploader
          title="Marg ERP stock report (recommended)"
          endpoint="/api/admin/import/marg"
          accept=".xls,.xlsx"
          steps={
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                In Marg, open the <strong>Stock &amp; Sales Analysis</strong> report up to today and export it to Excel, the same way you made PRODUCT_LIST.XLS.
              </li>
              <li>Choose the file here and click <strong>Check file</strong>, then <strong>Save to database</strong>.</li>
              <li>Each item's closing stock becomes its stock on the website. Earliest expiry (M.EXP) is shown too.</li>
              <li>Do this daily (or whenever stock changes). Uploading the same report twice changes nothing.</li>
            </ol>
          }
        />
        <Uploader
          title="CSV file (with batch numbers and prices)"
          endpoint="/api/admin/import"
          accept=".csv,text/csv"
          template
          steps={
            <ol className="list-decimal space-y-1 pl-5">
              <li>Download the template and fill it in Excel, one row per batch. Save as CSV.</li>
              <li>Required: company, medicine. For stock: batch_no, expiry_date, quantity, sale_price (or mrp).</li>
              <li>Expiry can be 2027-08-31, 31-08-2027 or 08/2027.</li>
              <li>Nothing is saved if any row has a problem.</li>
            </ol>
          }
        />
      </div>
    </AdminOnly>
  );
}

function Uploader({ title, endpoint, accept, steps, template }) {
  const shopState = useShopState();
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const send = async (dryRun) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api(`${endpoint}?dry_run=${dryRun}`, { method: "POST", auth: true, form });
      setResult(res);
      if (!dryRun) shopState?.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const res = await api("/api/admin/import/template", { auth: true, raw: true });
      const url = URL.createObjectURL(await res.blob());
      Object.assign(document.createElement("a"), { href: url, download: "stock_template.csv" }).click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e);
    }
  };

  const ok = result && result.errors.length === 0;
  return (
    <Card className="space-y-4 p-5 text-sm text-ink-soft">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {steps}
      {template && (
        <button type="button" className="font-medium text-brand-700 hover:underline" onClick={downloadTemplate}>
          Download the CSV template
        </button>
      )}
      <input
        type="file"
        accept={accept}
        aria-label={`${title} file`}
        onChange={(e) => {
          setFile(e.target.files?.[0] || null);
          setResult(null);
        }}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:font-medium file:text-brand-700"
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!file || busy} onClick={() => send(true)}>
          {busy ? "Working…" : "Check file"}
        </Button>
        <Button disabled={!file || busy || !ok || !result.dry_run} onClick={() => send(false)}>
          Save to database
        </Button>
      </div>
      <ErrorBox error={error} />
      {result && (
        <Notice kind={ok ? "success" : "warn"}>
          <p className="font-semibold">
            {!ok ? "Problems found. Nothing was saved." : result.dry_run ? "File looks good. Click “Save to database”." : "Saved. The website now shows this stock."}
          </p>
          <p className="mt-1">
            {result.rows_read} items · {result.companies_created} new companies · {result.medicines_created} new medicines · {result.batches_created} new stock rows ·{" "}
            {result.batches_topped_up} quantities changed
            {result.stock_as_of && <> · stock as of {formatDate(result.stock_as_of)}</>}
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5">
              {result.errors.slice(0, 50).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {result.warnings?.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer">{result.warnings.length} note(s) to check</summary>
              <ul className="mt-1 list-disc pl-5">
                {result.warnings.slice(0, 100).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </Notice>
      )}
    </Card>
  );
}
