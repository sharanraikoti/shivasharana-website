import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { BackLink, Empty, ErrorBox, Loading, SampleBadge, SearchInput, StatusBadge, inputClass } from "../components/ui";
import { STATUSES, filterRows, formatDate, formatDateTime, plural, sortRows } from "../lib/format";
import { useApi, useTitle } from "../lib/hooks";

const SORTS = [
  { key: "name", label: "Medicine name" },
  { key: "quantity", label: "Quantity" },
  { key: "expiry", label: "Expiry date" },
];

export default function CompanyStock() {
  const { slug } = useParams();
  const { data, error, loading, reload } = useApi(`/api/companies/${encodeURIComponent(slug)}`);
  useTitle(data?.company.name || "Company stock");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("name");
  const [dir, setDir] = useState("asc");
  const [status, setStatus] = useState("");

  const rows = useMemo(() => {
    if (!data) return [];
    let r = filterRows(data.rows, q);
    if (status) r = r.filter((x) => x.status === status);
    return sortRows(r, sort, dir);
  }, [data, q, sort, dir, status]);

  const sortBy = (key) => {
    if (key === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir("asc");
    }
  };

  if (loading) return <div className="mx-auto max-w-6xl px-4"><Loading label="Loading stock…" /></div>;
  if (error)
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <BackLink to="/companies">All companies</BackLink>
        <div className="mt-6">
          {error.status === 404 ? (
            <Empty title="Company not found">This company may have been removed or the link is incorrect.</Empty>
          ) : (
            <ErrorBox error={error} onRetry={reload} />
          )}
        </div>
      </div>
    );

  const { company } = data;
  const qtyShown = data.show_quantities;
  const batchShown = data.show_batches && data.rows.some((r) => r.batch_no);
  const formShown = data.rows.some((r) => r.dosage_form);
  const packShown = data.rows.some((r) => r.pack_size);
  const earliestOnly = data.rows.some((r) => r.expiry_is_earliest && r.expiry_date);
  const counts = data.rows.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <BackLink to="/companies">All companies</BackLink>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">{company.name}</h1>
          <p className="mt-1 text-ink-soft">
            {plural(company.product_count, "product")} · {company.in_stock_count} in stock {company.is_sample && <SampleBadge />}
          </p>
        </div>
        <p className="text-sm text-ink-soft">
          {data.stock_as_of ? (
            <>
              Stock as of <strong className="text-ink">{formatDate(data.stock_as_of)}</strong>
            </>
          ) : (
            <span className="text-xs text-ink-mute">Updated {formatDateTime(data.generated_at)}</span>
          )}
        </p>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
        <SearchInput value={q} onChange={setQ} placeholder={`Search medicines from ${company.name}`} label="Search medicines" />
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <span className="w-12 md:w-auto">Status</span>
          <select className={inputClass + " md:w-40"} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {STATUSES.filter((s) => counts[s]).map((s) => (
              <option key={s} value={s}>
                {s} ({counts[s]})
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <span className="w-12 md:w-auto">Sort</span>
          <select className={inputClass + " md:w-40"} value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.filter((s) => s.key !== "quantity" || qtyShown).map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <select aria-label="Sort direction" className={inputClass + " md:w-36"} value={dir} onChange={(e) => setDir(e.target.value)}>
          <option value="asc">{sort === "name" ? "A to Z" : sort === "expiry" ? "Soonest first" : "Lowest first"}</option>
          <option value="desc">{sort === "name" ? "Z to A" : sort === "expiry" ? "Latest first" : "Highest first"}</option>
        </select>
      </div>

      <div className="mt-6" aria-live="polite">
        {data.rows.length === 0 ? (
          <Empty title="No medicines listed yet">The shop has not added stock for this company.</Empty>
        ) : rows.length === 0 ? (
          <Empty title="No medicines match">Try another name or clear the filters.</Empty>
        ) : (
          <>
            {/* Desktop and tablet: table */}
            <div className="hidden overflow-x-auto rounded-lg border border-line bg-white md:block">
              <table className="w-full text-left text-[15px]">
                <caption className="sr-only">Stock from {company.name}</caption>
                <thead className="border-b border-line bg-paper text-xs uppercase tracking-wider text-ink-mute">
                  <tr>
                    <SortTh label="Medicine" k="name" sort={sort} dir={dir} onSort={sortBy} />
                    {packShown && <th scope="col" className="px-4 py-3 font-semibold">Pack</th>}
                    {formShown && <th scope="col" className="px-4 py-3 font-semibold">Form</th>}
                    {batchShown && <th scope="col" className="px-4 py-3 font-semibold">Batch</th>}
                    {qtyShown && <SortTh label="Quantity" k="quantity" sort={sort} dir={dir} onSort={sortBy} right />}
                    <SortTh label="Expiry" k="expiry" sort={sort} dir={dir} onSort={sortBy} />
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={`${r.medicine_id}-${r.batch_id ?? "m"}`} className={r.status === "Expired" ? "bg-red-50/40" : undefined}>
                      <td className="px-4 py-3">
                        <span className="font-medium text-ink">{r.name}</span>
                        {r.strength && <span className="text-ink-soft"> {r.strength}</span>}
                      </td>
                      {packShown && <td className="px-4 py-3 text-ink-soft">{r.pack_size || "—"}</td>}
                      {formShown && <td className="px-4 py-3 text-ink-soft">{r.dosage_form || "—"}</td>}
                      {batchShown && <td className="px-4 py-3 font-mono text-sm text-ink-soft">{r.batch_no || "—"}</td>}
                      {qtyShown && (
                        <td className="px-4 py-3 text-right tabular-nums">
                          {r.quantity} <span className="text-sm text-ink-mute">{r.unit}</span>
                        </td>
                      )}
                      <td className="px-4 py-3 tabular-nums text-ink-soft">
                        {formatDate(r.expiry_date, { monthOnly: r.expiry_is_earliest })}
                        {r.expiry_is_earliest && r.expiry_date && <span aria-hidden="true">*</span>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phones: one card per row */}
            <ul className="space-y-3 md:hidden">
              {rows.map((r) => (
                <li key={`${r.medicine_id}-${r.batch_id ?? "m"}`} className="rounded-lg border border-line bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">
                        {r.name} {r.strength && <span className="font-normal text-ink-soft">{r.strength}</span>}
                      </p>
                      {(r.pack_size || r.dosage_form) && <p className="text-sm text-ink-mute">{[r.pack_size, r.dosage_form].filter(Boolean).join(" · ")}</p>}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    {qtyShown && (
                      <div>
                        <dt className="text-xs text-ink-mute">Quantity</dt>
                        <dd className="font-medium tabular-nums text-ink">
                          {r.quantity} <span className="font-normal text-ink-mute">{r.unit}</span>
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-xs text-ink-mute">Expiry</dt>
                      <dd className="tabular-nums text-ink">
                        {formatDate(r.expiry_date, { monthOnly: r.expiry_is_earliest })}
                        {r.expiry_is_earliest && r.expiry_date && <span aria-hidden="true">*</span>}
                      </dd>
                    </div>
                    {batchShown && (
                      <div>
                        <dt className="text-xs text-ink-mute">Batch</dt>
                        <dd className="break-all font-mono text-xs text-ink">{r.batch_no || "—"}</dd>
                      </div>
                    )}
                  </dl>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-ink-mute">
              Showing {rows.length} of {data.rows.length} {batchShown ? "batches" : "products"}.
            </p>
            {earliestOnly && <p className="mt-1 text-sm text-ink-mute">* Earliest expiry among the stock held. Other units may expire later.</p>}
          </>
        )}
      </div>

      <section aria-labelledby="legend" className="mt-8 rounded-lg border border-line bg-white p-5 text-sm">
        <h2 id="legend" className="font-semibold text-ink">What the labels mean</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <Legend s="In Stock">Available.</Legend>
          <Legend s="Low Stock">Available, but only a few left.</Legend>
          <Legend s="Near Expiry">Available, expires within the next few months.</Legend>
          <Legend s="Out of Stock">Not available right now.</Legend>
          <Legend s="Expired">Past expiry date. Not for sale.</Legend>
        </dl>
      </section>
    </div>
  );
}

function SortTh({ label, k, sort, dir, onSort, right }) {
  const active = sort === k;
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={"px-4 py-3 font-semibold" + (right ? " text-right" : "")}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-ink">
        {label}
        <span aria-hidden="true" className={active ? "text-brand-700" : "opacity-30"}>
          {active && dir === "desc" ? "▼" : "▲"}
        </span>
      </button>
    </th>
  );
}

function Legend({ s, children }) {
  return (
    <div className="flex items-center gap-3">
      <dt className="w-28 shrink-0">
        <StatusBadge status={s} />
      </dt>
      <dd className="text-ink-soft">{children}</dd>
    </div>
  );
}
