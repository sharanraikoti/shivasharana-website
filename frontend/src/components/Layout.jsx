import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { BRAND } from "../lib/brand";
import { fullAddress } from "../lib/format";
import { useShop } from "../lib/hooks";
import { cx } from "./ui";
import { WhatsAppFloat } from "./WhatsApp";

/** The cross-and-leaf logo from the visiting card. */
export function LogoIcon({ size = 36, cross = "#fff", leaf = "#19b5c9", vein = "#fff" }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <path
        fill={cross}
        d="M38 8h24a6 6 0 0 1 6 6v24h24a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6H68v24a6 6 0 0 1-6 6H38a6 6 0 0 1-6-6V62H8a6 6 0 0 1-6-6V44a6 6 0 0 1 6-6h24V14a6 6 0 0 1 6-6z"
      />
      <g transform="rotate(45 50 50)">
        <path fill={leaf} d="M50 21C67 33 67 67 50 79 33 67 33 33 50 21Z" />
        <path d="M50 27v47" stroke={vein} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M50 44l8-7M50 55l-8-7M50 64l7-6" stroke={vein} strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}

export function ShopMark({ shop, size = 40 }) {
  if (shop?.logo_url) {
    return <img src={shop.logo_url} alt="" width={size} height={size} className="rounded object-contain" />;
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-900 to-brand-700 shadow-card"
      style={{ width: size, height: size }}
    >
      <LogoIcon size={size * 0.7} />
    </span>
  );
}

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/companies", label: "Companies" },
  { to: "#contact", label: "Contact", hash: true },
];

export function PublicLayout() {
  const shop = useShop();
  const [open, setOpen] = useState(false);
  const linkCls = ({ isActive }) =>
    cx(
      "rounded-full px-4 py-2 text-[15px] font-medium transition-colors",
      isActive ? "bg-brand-50 text-brand-800" : "text-ink-soft hover:bg-paper hover:text-ink"
    );

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      {shop?.is_sample && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">
          Preview with <strong>sample data</strong>. Shop details and stock shown here are placeholders, not real stock.
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between gap-4 px-4">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <ShopMark shop={shop} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[17px] font-semibold tracking-wide text-brand-950">{shop?.name || "Medical Shop"}</span>
              <span className="block truncate font-kannada text-[13px] font-semibold text-brand-600">{BRAND.kannadaName}</span>
            </span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
            {NAV.map((n) =>
              n.hash ? (
                <a key={n.to} href={n.to} className="rounded-full px-4 py-2 text-[15px] font-medium text-ink-soft hover:bg-paper hover:text-ink">
                  {n.label}
                </a>
              ) : (
                <NavLink key={n.to} to={n.to} end={n.end} className={linkCls}>
                  {n.label}
                </NavLink>
              )
            )}
            {shop?.phone && (
              <a
                href={`tel:${shop.phone.replace(/\s/g, "")}`}
                className="ml-2 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-700 to-aqua-500 px-4 py-2 text-[15px] font-semibold text-white shadow-card hover:opacity-95"
              >
                <PhoneIcon /> Call us
              </a>
            )}
          </nav>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink sm:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label="Menu"
            onClick={() => setOpen((o) => !o)}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
        <div className="h-[3px] bg-gradient-to-r from-brand-900 via-brand-500 to-aqua-400" aria-hidden="true" />
        {open && (
          <nav id="mobile-nav" aria-label="Main" className="border-t border-line bg-white px-4 py-2 sm:hidden">
            {NAV.map((n) =>
              n.hash ? (
                <a key={n.to} href={n.to} onClick={() => setOpen(false)} className="block rounded-md px-3 py-3 font-medium text-ink-soft">
                  {n.label}
                </a>
              ) : (
                <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)} className={(s) => cx(linkCls(s), "block py-3")}>
                  {n.label}
                </NavLink>
              )
            )}
            {shop?.phone && (
              <a href={`tel:${shop.phone.replace(/\s/g, "")}`} className="mt-1 block rounded-md px-3 py-3 font-semibold text-brand-700">
                Call {shop.phone}
              </a>
            )}
          </nav>
        )}
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer shop={shop} />
      <WhatsAppFloat shop={shop} />
    </div>
  );
}

export function PhoneIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
    </svg>
  );
}

function Footer({ shop }) {
  const address = fullAddress(shop);
  const phones = [...new Set([...(shop?.phone ? [shop.phone.replace(/\s/g, "")] : []), ...BRAND.phones])];
  return (
    <footer id="contact" className="relative overflow-hidden bg-brand-950 text-white">
      <svg className="pointer-events-none absolute -right-10 bottom-0 h-1/2 w-1/2 opacity-25" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 200C150 180 260 140 400 40V200Z" fill="#164a80" />
      </svg>
      <div className="h-[3px] bg-gradient-to-r from-brand-500 via-aqua-400 to-brand-500" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-3">
            <ShopMark shop={shop} size={42} />
            <span className="leading-tight">
              <span className="block font-semibold tracking-wide">{shop?.name || "Medical Shop"}</span>
              <span className="block font-kannada text-sm font-semibold text-aqua-300">{BRAND.kannadaName}</span>
            </span>
          </div>
          <p className="mt-4 text-sm text-brand-100">{BRAND.role}</p>
          <p className="mt-3 text-sm text-brand-200">
            Sister concern of <span className="font-semibold text-white">{BRAND.sister.name}</span>
            <br />
            {BRAND.sister.line}
          </p>
          {shop?.drug_licence_no && <p className="mt-3 text-xs text-brand-200">D.L. No: {shop.drug_licence_no}</p>}
          {shop?.gstin && <p className="mt-1 text-xs text-brand-200">GSTIN: {shop.gstin}</p>}
        </div>
        <div className="text-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-aqua-300">Visit us</h2>
          <p className="leading-relaxed text-brand-50">{address || "Address will be added by the shop."}</p>
          {shop?.opening_hours && <p className="mt-2 whitespace-pre-line text-brand-100">{shop.opening_hours}</p>}
        </div>
        <div className="text-sm">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-aqua-300">Contact</h2>
          <p className="font-semibold text-white">{BRAND.owner}</p>
          {phones.map((p) => (
            <p key={p} className="mt-1">
              <a className="text-[15px] font-medium text-brand-50 hover:text-aqua-300" href={`tel:${p}`}>
                {p}
              </a>
            </p>
          ))}
          {shop?.email && (
            <p className="mt-2 break-all">
              <a className="text-brand-50 hover:text-aqua-300" href={`mailto:${shop.email}`}>
                {shop.email}
              </a>
            </p>
          )}
        </div>
      </div>
      <div className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-brand-200">
          <span>Stock shown is for information. Please confirm availability with the shop. Medicines are sold as per prescription rules.</span>
          <Link to="/staff" className="hover:text-white">
            Staff sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}

/** Coloured page header band used on the public pages. */
export function PageHero({ eyebrow, title, children, top }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-950 via-brand-800 to-brand-600 text-white">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden="true">
        <path d="M500 200C800 180 1000 130 1200 40V200Z" fill="#fff" opacity=".07" />
        <path d="M430 200C760 175 990 120 1200 20" fill="none" stroke="#5ee3f2" strokeWidth="1.5" opacity=".6" />
      </svg>
      <div className="relative mx-auto max-w-6xl px-4 py-10">
        {top}
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.2em] text-aqua-300">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{title}</h1>
        {children && <div className="mt-2 text-brand-100">{children}</div>}
      </div>
    </section>
  );
}
