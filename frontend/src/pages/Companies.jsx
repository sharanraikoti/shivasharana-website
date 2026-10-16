import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ButtonLink, Empty, ErrorBox, Loading, Pagination, SampleBadge, SearchInput, inputClass } from "../components/ui";
import { useApi, useDebounced, useTitle } from "../lib/hooks";

const PAGE_SIZE = 24;

export default function Companies() {
  useTitle("Companies");
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const order = params.get("order") === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const debounced = useDebounced(q.trim());

  useEffect(() => {
    if ((params.get("q") || "") === debounced) return;
    const next = new URLSearchParams(params);
    debounced ? next.set("q", debounced) : next.delete("q");
    next.delete("page");
    setParams(next, { replace: true });
  }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key, value) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };

  const query = new URLSearchParams({ order, page: String(page), page_size: String(PAGE_SIZE) });
  if (params.get("q")) query.set("q", params.get("q"));
  const { data, error, loading, reload } = useApi(`/api/companies?${query}`);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">Pharmaceutical companies</h1>
      <p className="mt-2 text-ink-soft">Choose a company to see the medicines we stock from it.</p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <SearchInput value={q} onChange={setQ} placeholder="Search by company name" className="flex-1" />
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <span className="whitespace-nowrap">Sort</span>
          <select className={inputClass + " sm:w-40"} value={order} onChange={(e) => update("order", e.target.value === "desc" ? "desc" : "")}>
            <option value="asc">A to Z</option>
            <option value="desc">Z to A</option>
          </select>
        </label>
      </div>

      <div className="mt-6" aria-live="polite">
        {loading && !data && <Loading label="Loading companies…" />}
        <ErrorBox error={error} onRetry={reload} />
        {data && (
          <>
            <p className="mb-3 text-sm text-ink-mute">
              {data.total} {data.total === 1 ? "company" : "companies"}
              {params.get("q") ? ` matching “${params.get("q")}”` : ""}
            </p>
            {data.items.length === 0 ? (
              <Empty title="No companies match your search">
                Check the spelling or try fewer letters.{" "}
                <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setQ("")}>
                  Clear search
                </button>
              </Empty>
            ) : (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.items.map((c) => (
                  <li key={c.id}>
                    <CompanyCard c={c} />
                  </li>
                ))}
              </ul>
            )}
            <Pagination page={data.page} pages={data.pages} onPage={(p) => update("page", p > 1 ? String(p) : "")} />
          </>
        )}
      </div>
    </div>
  );
}

function CompanyCard({ c }) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-line bg-white p-5">
      <div className="flex items-start gap-3">
        {c.logo_url ? (
          <img src={c.logo_url} alt="" className="h-11 w-11 shrink-0 rounded object-contain ring-1 ring-line" />
        ) : (
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-brand-50 text-lg font-semibold text-brand-700">
            {c.name.trim()[0]?.toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-semibold leading-snug text-ink">
            <Link to={`/companies/${c.slug}`} className="hover:text-brand-700">
              {c.name}
            </Link>
          </h2>
          {c.is_sample && <div className="mt-1"><SampleBadge /></div>}
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md bg-paper px-3 py-2">
          <dt className="text-ink-mute">Products</dt>
          <dd className="text-lg font-semibold text-ink">{c.product_count}</dd>
        </div>
        <div className="rounded-md bg-paper px-3 py-2">
          <dt className="text-ink-mute">In stock</dt>
          <dd className="text-lg font-semibold text-ink">{c.in_stock_count}</dd>
        </div>
      </dl>
      <ButtonLink to={`/companies/${c.slug}`} variant="secondary" className="mt-4 w-full" aria-label={`View stock for ${c.name}`}>
        View Stock
      </ButtonLink>
    </article>
  );
}
