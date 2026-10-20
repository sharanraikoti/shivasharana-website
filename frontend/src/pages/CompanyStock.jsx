import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BackLink, Empty, ErrorBox, Loading, SampleBadge, SearchInput, inputClass } from "../components/ui";
import { PageHero } from "../components/Layout";
import { WhatsAppButton } from "../components/WhatsApp";
import { tintFor } from "../lib/brand";
import { filterRows, formatDate, plural } from "../lib/format";
import { useApi, useShop, useTitle } from "../lib/hooks";

/** Public list of products for one company: medicine name and pack only. */
export default function CompanyStock() {
  const { slug } = useParams();
  const shop = useShop();
  const { data, error, loading, reload } = useApi(`/api/companies/${encodeURIComponent(slug)}`);
  useTitle(data?.company.name || "Company products");
  const [q, setQ] = useState("");
  const [dir, setDir] = useState("asc");

  // One row per medicine (the API may return one row per batch).
  const rows = useMemo(() => {
    if (!data) return [];
    const seen = new Map();
    for (const r of filterRows(data.rows, q)) if (!seen.has(r.medicine_id)) seen.set(r.medicine_id, r);
    const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
    return dir === "desc" ? list.reverse() : list;
  }, [data, q, dir]);

  if (loading) return <div className="mx-auto max-w-6xl px-4"><Loading label="Loading products…" /></div>;
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
  const total = new Set(data.rows.map((r) => r.medicine_id)).size;
  const label = (r) => [r.name, r.strength].filter(Boolean).join(" ");

  return (
    <>
      <PageHero
        eyebrow="Company products"
        title={
          <span className="flex items-center gap-3">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-bold ${tintFor(company.name)}`} aria-hidden="true">
              {company.name.trim()[0]?.toUpperCase()}
            </span>
            <span className="min-w-0 break-words">{company.name}</span>
          </span>
        }
        top={
          <Link to="/companies" className="mb-4 inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white ring-1 ring-white/20 hover:bg-white/20">
            ← All companies
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-medium">{plural(total, "product")}</span>
          {data.stock_as_of && (
            <span className="rounded-full bg-aqua-400/20 px-3 py-1 text-sm font-medium text-aqua-100">List updated {formatDate(data.stock_as_of)}</span>
          )}
          {company.is_sample && <SampleBadge />}
        </div>
      </PageHero>

      <div className="mx-auto max-w-4xl px-4 pb-12">
        <div className="relative -mt-6 grid gap-3 rounded-2xl bg-white p-3 shadow-lift sm:grid-cols-[1fr_auto]">
          <SearchInput value={q} onChange={setQ} placeholder={`Search medicines from ${company.name}`} label="Search medicines" />
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <span className="whitespace-nowrap">Sort</span>
            <select className={inputClass + " sm:w-36"} value={dir} onChange={(e) => setDir(e.target.value)}>
              <option value="asc">A to Z</option>
              <option value="desc">Z to A</option>
            </select>
          </label>
        </div>

        <div className="mt-6" aria-live="polite">
          {total === 0 ? (
            <Empty title="No medicines listed yet">The shop has not added products for this company.</Empty>
          ) : rows.length === 0 ? (
            <Empty title="No medicines match">Check the spelling or try fewer letters.</Empty>
          ) : (
            <>
              <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
                <table className="w-full text-left text-[15px]">
                  <caption className="sr-only">Products from {company.name}</caption>
                  <thead className="bg-gradient-to-r from-brand-900 to-brand-700 text-xs uppercase tracking-[0.14em] text-white">
                    <tr>
                      <th scope="col" className="w-12 px-4 py-3 font-semibold sm:w-16">#</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Medicine</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Pack</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((r, i) => (
                      <tr key={r.medicine_id} className="odd:bg-white even:bg-brand-50/40 hover:bg-aqua-50">
                        <td className="px-4 py-3 text-sm tabular-nums text-ink-mute">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-ink">{label(r)}</td>
                        <td className="px-4 py-3 text-right">
                          {r.pack_size ? (
                            <span className="inline-flex rounded-full bg-aqua-100 px-3 py-1 text-sm font-semibold text-aqua-700">{r.pack_size}</span>
                          ) : (
                            <span className="text-ink-mute">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-sm text-ink-mute">
                Showing {rows.length} of {plural(total, "product")}.
              </p>
            </>
          )}
        </div>

        <div className="mt-8 flex flex-col items-start gap-4 rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-brand-950">Need a medicine from {company.name}?</p>
            <p className="mt-1 text-sm text-ink-soft">Send us a message on WhatsApp to check availability and price.</p>
          </div>
          <WhatsAppButton shop={shop} text={`Hello Shivasharana Distributor, I would like to enquire about medicines from ${company.name}.`} />
        </div>
      </div>
    </>
  );
}
