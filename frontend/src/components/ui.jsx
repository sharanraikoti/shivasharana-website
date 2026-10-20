import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { STATUS_STYLE } from "../lib/format";

const cx = (...c) => c.filter(Boolean).join(" ");

export function Button({ variant = "primary", size = "md", className, as: As = "button", ...props }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-[15px]", lg: "h-12 px-6 text-base" };
  const variants = {
    primary: "bg-gradient-to-r from-brand-700 to-brand-500 text-white shadow-sm hover:from-brand-800 hover:to-brand-600",
    secondary: "bg-white text-ink ring-1 ring-inset ring-line hover:bg-paper",
    ghost: "text-brand-700 hover:bg-brand-50",
    danger: "bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50",
  };
  const type = As === "button" && !props.type ? "button" : props.type;
  return <As className={cx(base, sizes[size], variants[variant], className)} {...props} type={type} />;
}

export function ButtonLink({ to, variant = "primary", size = "md", className, children, ...rest }) {
  return (
    <Button as={Link} to={to} variant={variant} size={size} className={className} {...rest}>
      {children}
    </Button>
  );
}

export const inputClass =
  "block w-full rounded-md border border-line bg-white px-3 h-10 text-[15px] text-ink placeholder:text-ink-mute focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20";

export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-mute">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}

export const SearchInput = forwardRef(function SearchInput({ value, onChange, placeholder, label, className, ...rest }, ref) {
  return (
    <div className={cx("relative", className)}>
      <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={ref}
        type="search"
        aria-label={label || placeholder}
        className={cx(inputClass, "pl-9")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        {...rest}
      />
    </div>
  );
});

export function StatusBadge({ status }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", STATUS_STYLE[status])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {status}
    </span>
  );
}

export function Loading({ label = "Loading…" }) {
  return (
    <div role="status" className="flex items-center gap-3 py-10 text-ink-mute">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-brand-600" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <span>{error.message || String(error)}</span>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Notice({ kind = "info", children, className }) {
  const s = {
    info: "border-brand-200 bg-brand-50 text-brand-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
  }[kind];
  return <div role={kind === "success" ? "status" : undefined} className={cx("rounded-md border px-4 py-3 text-sm", s, className)}>{children}</div>;
}

export function Empty({ title, children }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-white px-6 py-12 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-mute">{children}</div>}
    </div>
  );
}

export function SampleBadge() {
  return (
    <span className="inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
      Sample
    </span>
  );
}

export function Pagination({ page, pages, onPage }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-2">
      <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <span className="px-2 text-sm text-ink-soft">
        Page {page} of {pages}
      </span>
      <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </nav>
  );
}

export function Card({ className, children }) {
  return <div className={cx("rounded-lg border border-line bg-white", className)}>{children}</div>;
}

export function BackLink({ to, children }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
      <span aria-hidden="true">←</span> {children}
    </Link>
  );
}

export { cx };
