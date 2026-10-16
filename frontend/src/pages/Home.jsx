import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, ButtonLink, ErrorBox, Loading, SearchInput } from "../components/ui";
import { formatDate, fullAddress, plural } from "../lib/format";
import { useApi, useShopState, useTitle } from "../lib/hooks";

export default function Home() {
  useTitle("");
  const { shop, error, loading, reload } = useShopState();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const companies = useApi("/api/companies?page_size=6");

  const search = (e) => {
    e.preventDefault();
    navigate(q.trim() ? `/companies?q=${encodeURIComponent(q.trim())}` : "/companies");
  };

  if (loading) return <div className="mx-auto max-w-6xl px-4"><Loading /></div>;
  if (error?.status === 404)
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-ink">Website setup in progress</h1>
        <p className="mt-2 text-ink-soft">The shop's details have not been added yet.</p>
        <ButtonLink to="/companies" className="mt-6">View Companies</ButtonLink>
      </div>
    );
  if (error) return <div className="mx-auto max-w-6xl px-4 py-10"><ErrorBox error={error} onRetry={reload} /></div>;

  const address = fullAddress(shop);
  return (
    <>
      <section className="border-b border-line bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-12 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:py-16">
          <div>
            <h1 className="text-3xl font-bold leading-tight text-ink sm:text-4xl">{shop.name}</h1>
            {shop.tagline && <p className="mt-3 text-lg text-ink-soft">{shop.tagline}</p>}
            {shop.description && <p className="mt-4 max-w-xl leading-relaxed text-ink-soft">{shop.description}</p>}

            <form onSubmit={search} role="search" className="mt-8 flex max-w-xl flex-col gap-3 sm:flex-row">
              <SearchInput value={q} onChange={setQ} placeholder="Search pharmaceutical companies" className="flex-1" />
              <Button type="submit" variant="secondary">
                Search
              </Button>
            </form>
            <div className="mt-4">
              <ButtonLink to="/companies" size="lg">
                View Companies
              </ButtonLink>
            </div>
          </div>

          <aside aria-label="Shop details" className="self-start rounded-lg border border-line bg-paper p-6">
            <dl className="space-y-5 text-[15px]">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-ink-mute">Address</dt>
                <dd className="mt-1 text-ink">{address || <span className="text-ink-mute">To be added by the shop</span>}</dd>
              </div>
              {shop.opening_hours && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-ink-mute">Opening hours</dt>
                  <dd className="mt-1 whitespace-pre-line text-ink">{shop.opening_hours}</dd>
                </div>
              )}
              {shop.stock_as_of && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-ink-mute">Stock list updated</dt>
                  <dd className="mt-1 text-ink">{formatDate(shop.stock_as_of)}</dd>
                </div>
              )}
              {(shop.phone || shop.email) && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-ink-mute">Contact</dt>
                  <dd className="mt-1 space-y-1">
                    {shop.phone && (
                      <a className="block font-medium text-brand-700 hover:underline" href={`tel:${shop.phone.replace(/\s/g, "")}`}>
                        {shop.phone}
                      </a>
                    )}
                    {shop.email && (
                      <a className="block text-brand-700 hover:underline" href={`mailto:${shop.email}`}>
                        {shop.email}
                      </a>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </aside>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-xl font-semibold text-ink">Company-Wise Stock</h2>
          <Link to="/companies" className="text-sm font-medium text-brand-700 hover:underline">
            See all{companies.data ? ` ${companies.data.total}` : ""}
          </Link>
        </div>
        {companies.loading && <Loading />}
        <ErrorBox error={companies.error} onRetry={companies.reload} />
        {companies.data && (
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {companies.data.items.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/companies/${c.slug}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-4 py-3 hover:border-brand-600"
                >
                  <span className="min-w-0 truncate font-medium text-ink">{c.name}</span>
                  <span className="shrink-0 text-sm text-ink-mute">{plural(c.product_count, "product")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
