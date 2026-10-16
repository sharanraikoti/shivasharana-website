import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { fullAddress } from "../lib/format";
import { useShop } from "../lib/hooks";
import { cx } from "./ui";

export function ShopMark({ shop, size = 36 }) {
  if (shop?.logo_url) {
    return <img src={shop.logo_url} alt="" width={size} height={size} className="rounded object-contain" />;
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center rounded-md bg-brand-600 text-white"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="currentColor">
        <path d="M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z" />
      </svg>
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
    cx("rounded-md px-3 py-2 text-[15px] font-medium", isActive ? "text-brand-700" : "text-ink-soft hover:text-ink");

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
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <ShopMark shop={shop} />
            <span className="truncate text-[17px] font-semibold text-ink">{shop?.name || "Medical Shop"}</span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
            {NAV.map((n) =>
              n.hash ? (
                <a key={n.to} href={n.to} className="rounded-md px-3 py-2 text-[15px] font-medium text-ink-soft hover:text-ink">
                  {n.label}
                </a>
              ) : (
                <NavLink key={n.to} to={n.to} end={n.end} className={linkCls}>
                  {n.label}
                </NavLink>
              )
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
        {open && (
          <nav id="mobile-nav" aria-label="Main" className="border-t border-line px-4 py-2 sm:hidden">
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
          </nav>
        )}
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer shop={shop} />
    </div>
  );
}

function Footer({ shop }) {
  const address = fullAddress(shop);
  return (
    <footer id="contact" className="border-t border-line bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-3">
            <ShopMark shop={shop} size={30} />
            <span className="font-semibold text-ink">{shop?.name || "Medical Shop"}</span>
          </div>
          {shop?.drug_licence_no && <p className="mt-3 text-sm text-ink-mute">Drug licence no: {shop.drug_licence_no}</p>}
          {shop?.gstin && <p className="mt-1 text-sm text-ink-mute">GSTIN: {shop.gstin}</p>}
        </div>
        <div className="text-sm">
          <h2 className="mb-2 font-semibold text-ink">Visit us</h2>
          <p className="text-ink-soft">{address || "Address will be added by the shop."}</p>
          {shop?.opening_hours && <p className="mt-2 whitespace-pre-line text-ink-soft">{shop.opening_hours}</p>}
        </div>
        <div className="text-sm">
          <h2 className="mb-2 font-semibold text-ink">Contact</h2>
          {shop?.phone && (
            <p>
              <a className="text-brand-700 hover:underline" href={`tel:${shop.phone.replace(/\s/g, "")}`}>
                {shop.phone}
              </a>
            </p>
          )}
          {shop?.email && (
            <p className="mt-1">
              <a className="text-brand-700 hover:underline" href={`mailto:${shop.email}`}>
                {shop.email}
              </a>
            </p>
          )}
          {!shop?.phone && !shop?.email && <p className="text-ink-mute">Contact details will be added by the shop.</p>}
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-ink-mute">
          <span>Stock shown is for information. Please confirm availability with the shop. Medicines are sold as per prescription rules.</span>
          <Link to="/staff" className="hover:text-ink">
            Staff sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}
