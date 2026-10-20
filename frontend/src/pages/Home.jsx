import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogoIcon, PhoneIcon } from "../components/Layout";
import { ButtonLink, ErrorBox, Loading } from "../components/ui";
import { WhatsAppButton, WhatsAppIcon } from "../components/WhatsApp";
import { BRAND, tintFor } from "../lib/brand";
import { formatDate, fullAddress, plural } from "../lib/format";
import { useApi, useShopState, useTitle } from "../lib/hooks";

export default function Home() {
  useTitle("");
  const { shop, error, loading, reload } = useShopState();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const companies = useApi("/api/companies?page_size=9");

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
  const total = companies.data?.total;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-950 via-brand-800 to-brand-600 text-white">
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1200 520" preserveAspectRatio="none" aria-hidden="true">
          <path d="M380 520C720 470 960 380 1200 170V520Z" fill="#fff" opacity=".06" />
          <path d="M560 520C820 480 1010 410 1200 260V520Z" fill="#fff" opacity=".07" />
          <path d="M330 520C690 465 950 370 1200 150" fill="none" stroke="#5ee3f2" strokeWidth="2" opacity=".7" />
        </svg>
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-aqua-400/20 blur-3xl" aria-hidden="true" />

        <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-14 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:py-20">
          <div>
            <div className="inline-flex items-center gap-3 rounded-2xl bg-white/10 p-2 pr-4 ring-1 ring-white/15 backdrop-blur">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
                <LogoIcon size={40} leaf="#3ec6d8" />
              </span>
              <span className="text-sm font-medium text-brand-100">{BRAND.role}</span>
            </div>

            <p className="mt-6 font-kannada text-3xl font-bold leading-tight text-aqua-300 sm:text-4xl">{BRAND.kannadaName}</p>
            <h1 className="mt-2 text-3xl font-bold uppercase leading-tight tracking-[0.12em] sm:text-[42px]">{shop.name}</h1>
            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-lg font-medium text-brand-100">
              {BRAND.tagline.map((t, i) => (
                <span key={t} className="flex items-center gap-3">
                  {i > 0 && <span className="h-1.5 w-1.5 rounded-full bg-aqua-400" aria-hidden="true" />}
                  {t}
                </span>
              ))}
            </p>

            <form onSubmit={search} role="search" className="mt-8 flex max-w-xl flex-col gap-3 rounded-2xl bg-white p-2 shadow-lift sm:flex-row">
              <label htmlFor="home-search" className="sr-only">Search pharmaceutical companies</label>
              <div className="relative flex-1">
                <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-mute" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  id="home-search"
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search a pharmaceutical company"
                  className="h-12 w-full rounded-xl border-0 bg-transparent pl-10 pr-3 text-[16px] text-ink placeholder:text-ink-mute focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>
              <button type="submit" className="h-12 rounded-xl bg-gradient-to-r from-brand-700 to-aqua-500 px-6 font-semibold text-white hover:opacity-95">
                Search
              </button>
            </form>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/companies" className="inline-flex h-12 items-center rounded-xl bg-white px-6 font-semibold text-brand-900 shadow-card hover:bg-brand-50">
                View all companies →
              </Link>
              {shop.phone && (
                <a
                  href={`tel:${shop.phone.replace(/\s/g, "")}`}
                  className="inline-flex h-12 items-center gap-2 rounded-xl px-6 font-semibold text-white ring-1 ring-white/40 hover:bg-white/10"
                >
                  <PhoneIcon /> {shop.phone}
                </a>
              )}
            </div>
          </div>

          {/* Shop details card */}
          <aside aria-label="Shop details" className="self-start rounded-3xl bg-white p-6 text-ink shadow-lift">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-aqua-600">Shop details</h2>
              <span className="h-2 w-12 rounded-full bg-gradient-to-r from-brand-600 to-aqua-400" aria-hidden="true" />
            </div>
            <dl className="mt-5 space-y-5 text-[15px]">
              <Detail icon="pin" label="Address">
                {address || <span className="text-ink-mute">To be added by the shop</span>}
              </Detail>
              {shop.opening_hours && (
                <Detail icon="clock" label="Opening hours">
                  <span className="whitespace-pre-line">{shop.opening_hours}</span>
                </Detail>
              )}
              {(shop.phone || shop.email) && (
                <Detail icon="phone" label="Contact">
                  {shop.phone && (
                    <a className="block font-semibold text-brand-700 hover:underline" href={`tel:${shop.phone.replace(/\s/g, "")}`}>
                      {shop.phone}
                    </a>
                  )}
                  {shop.email && (
                    <a className="block break-all text-brand-700 hover:underline" href={`mailto:${shop.email}`}>
                      {shop.email}
                    </a>
                  )}
                </Detail>
              )}
              {shop.stock_as_of && (
                <Detail icon="box" label="Stock list updated">
                  {formatDate(shop.stock_as_of)}
                </Detail>
              )}
            </dl>
          </aside>
        </div>
      </section>

      {/* Highlights */}
      <section className="mx-auto -mt-px max-w-6xl px-4 pt-10">
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Highlight tone="from-brand-600 to-brand-800" title={total != null ? `${total} companies` : "Many companies"} icon="building">
            Medicines from leading pharmaceutical companies, sorted by company.
          </Highlight>
          <Highlight tone="from-aqua-500 to-aqua-700" title="Full product list" icon="box">
            Browse every medicine and pack size we carry, company by company.
          </Highlight>
          <Highlight tone="from-emerald-500 to-emerald-700" title="Order on WhatsApp" icon="chat">
            Message us on WhatsApp, call, or visit us near Vishal Mart, Raichur.
          </Highlight>
        </ul>
      </section>

      {/* Sister concern */}
      <section className="mx-auto max-w-6xl px-4 pt-8">
        <div className="flex flex-col gap-3 rounded-2xl border border-aqua-200 bg-gradient-to-r from-aqua-50 via-white to-brand-50 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-aqua-700">Sister concern of</p>
            <p className="mt-1 text-xl font-bold text-brand-900">{BRAND.sister.name}</p>
          </div>
          <p className="text-[15px] font-medium text-ink-soft">{BRAND.sister.line}</p>
        </div>
      </section>

      {/* Companies */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-aqua-600">Browse</p>
            <h2 className="mt-1 text-2xl font-bold text-brand-950">Our Stock Sources</h2>
          </div>
          <Link to="/companies" className="rounded-full bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100">
            See all{total != null ? ` ${total}` : ""} →
          </Link>
        </div>
        {companies.loading && <Loading />}
        <ErrorBox error={companies.error} onRetry={companies.reload} />
        {companies.data && (
          <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {companies.data.items.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/companies/${c.slug}`}
                  className="group flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-card transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift"
                >
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold ${tintFor(c.name)}`} aria-hidden="true">
                    {c.name.trim()[0]?.toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink group-hover:text-brand-700">{c.name}</span>
                    <span className="block text-sm text-ink-mute">{plural(c.product_count, "product")}</span>
                  </span>
                  <span className="text-brand-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* WhatsApp */}
      <section className="mx-auto max-w-6xl px-4 pb-14">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-500 to-[#25D366] p-8 text-white shadow-lift sm:p-10">
          <WhatsAppIcon className="pointer-events-none absolute -right-8 -top-8 h-48 w-48 text-white/10" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100">Quick enquiry</p>
              <h2 className="mt-1 text-2xl font-bold sm:text-3xl">Message us on WhatsApp</h2>
              <p className="mt-2 max-w-xl text-emerald-50">
                Send your medicine list or ask about any product. We'll reply with availability and price.
              </p>
              <p className="mt-3 text-lg font-semibold">+91 {BRAND.whatsapp}</p>
            </div>
            <WhatsAppButton shop={shop} className="!h-14 shrink-0 !bg-white !px-8 text-lg !text-emerald-700 hover:!bg-emerald-50" />
          </div>
        </div>
      </section>
    </>
  );
}

const ICONS = {
  pin: "M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z",
  phone: "M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 10.4 3.5 2.1-.8 1.3L11 13V6h2z",
  box: "M21 7.5 12 3 3 7.5v9L12 21l9-4.5zM12 5.2l5.9 2.9L12 11 6.1 8.1zM5 9.7l6 3v6.1l-6-3zm8 9.1v-6.1l6-3v6.1z",
  chat: "M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2zm3 5v2h10V9zm0 4v2h7v-2z",
  building: "M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4h2a2 2 0 0 1 2 2v10h-6v-4h-4v4zm4-14v2h2V7zm4 0v2h2V7zm-4 4v2h2v-2zm4 0v2h2v-2z",
};

function Icon({ name, className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

function Detail({ icon, label, children }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon name={icon} className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wider text-ink-mute">{label}</dt>
        <dd className="mt-0.5 text-ink">{children}</dd>
      </div>
    </div>
  );
}

function Highlight({ tone, title, icon, children }) {
  return (
    <li className="flex gap-4 rounded-2xl border border-line bg-white p-5 shadow-card">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${tone} text-white shadow-card`}>
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <div>
        <h3 className="font-semibold text-brand-950">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{children}</p>
      </div>
    </li>
  );
}
