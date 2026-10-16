import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth, useShop } from "../lib/hooks";
import { ShopMark } from "./Layout";
import { Loading, cx } from "./ui";

const LINKS = [
  { to: "/staff", label: "Dashboard", end: true },
  { to: "/staff/billing", label: "New bill" },
  { to: "/staff/bills", label: "Bills" },
  { to: "/staff/inventory", label: "Inventory" },
  { to: "/staff/purchases", label: "Receive stock", admin: true },
  { to: "/staff/import", label: "Import stock", admin: true },
  { to: "/staff/shop", label: "Shop details", admin: true },
  { to: "/staff/users", label: "Users", admin: true },
  { to: "/staff/qr", label: "QR code", admin: true },
];

export default function StaffLayout() {
  const { user, checking, signOut } = useAuth();
  const shop = useShop();
  const location = useLocation();

  if (checking) return <div className="px-4"><Loading label="Checking sign-in…" /></div>;
  if (!user) return <Navigate to="/staff/login" replace state={{ from: location.pathname }} />;

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white print:hidden">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
          <Link to="/staff" className="flex min-w-0 items-center gap-2">
            <ShopMark shop={shop} size={28} />
            <span className="truncate font-semibold text-ink">{shop?.name || "Medical Shop"}</span>
            <span className="hidden rounded bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 sm:inline">Staff</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink-soft sm:inline">
              {user.full_name || user.username} · {user.role}
            </span>
            <Link to="/" className="text-brand-700 hover:underline">
              Public site
            </Link>
            <button type="button" onClick={signOut} className="rounded-md px-2 py-1 font-medium text-ink-soft ring-1 ring-line hover:bg-paper">
              Sign out
            </button>
          </div>
        </div>
        <nav aria-label="Staff" className="mx-auto max-w-7xl overflow-x-auto px-2">
          <ul className="flex gap-1 whitespace-nowrap">
            {LINKS.filter((l) => !l.admin || user.role === "admin").map((l) => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  end={l.end}
                  className={({ isActive }) =>
                    cx("block border-b-2 px-3 py-2.5 text-sm font-medium", isActive ? "border-brand-600 text-brand-700" : "border-transparent text-ink-soft hover:text-ink")
                  }
                >
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

export function AdminOnly({ children }) {
  const { user } = useAuth();
  if (user?.role !== "admin") return <p className="text-ink-soft">Only the shop admin can open this page.</p>;
  return children;
}

export function PageTitle({ children, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-bold text-ink sm:text-2xl">{children}</h1>
      {actions}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div className="print-modal fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 print:static print:bg-white print:p-0" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx("mt-8 w-full rounded-lg bg-white shadow-xl outline-none print:mt-0 print:shadow-none", wide ? "max-w-3xl" : "max-w-lg")}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3 print:hidden">
          <h2 className="font-semibold text-ink">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-ink-mute hover:bg-paper hover:text-ink">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
