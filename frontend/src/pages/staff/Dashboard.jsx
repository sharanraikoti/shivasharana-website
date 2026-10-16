import { Link } from "react-router-dom";
import { PageTitle } from "../../components/StaffLayout";
import { ButtonLink, Card, ErrorBox, Loading, Notice } from "../../components/ui";
import { formatDate, money } from "../../lib/format";
import { useApi, useShop, useTitle } from "../../lib/hooks";

export default function Dashboard() {
  useTitle("Staff dashboard");
  const shop = useShop();
  const { data, error, loading, reload } = useApi("/api/admin/summary", { auth: true });

  return (
    <>
      <PageTitle actions={<ButtonLink to="/staff/billing">New bill</ButtonLink>}>Dashboard</PageTitle>
      {shop?.is_sample && (
        <Notice kind="warn" className="mb-5">
          The website is showing <strong>sample data</strong>. Add the real shop details under <Link className="underline" to="/staff/shop">Shop details</Link> and
          import the real stock, then remove the sample data (see the README).
        </Notice>
      )}
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile label="Sales today" value={money(data.sales_today)} sub={`${data.bills_today} bills`} />
            <Tile label="Companies" value={data.companies} />
            <Tile label="Medicines" value={data.medicines} sub={`${data.saleable_units.toLocaleString("en-IN")} saleable units`} />
            <Tile label="Low stock" value={data.low_stock.length} warn={data.low_stock.length > 0} />
            <Tile label="Out of stock" value={data.out_of_stock} warn={data.out_of_stock > 0} />
          </div>
          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            <ListCard title="Low stock" empty="Nothing is running low.">
              {data.low_stock.map((m) => (
                <Row key={m.id} left={`${m.name} ${m.strength}`} sub={m.company_name} right={`${m.saleable_quantity} ${m.unit}`} />
              ))}
            </ListCard>
            <ListCard title="Expiring soon" empty="No saleable batches expire soon.">
              {data.near_expiry.map((b) => (
                <Row key={b.batch_id} left={b.medicine} sub={[b.company, b.batch_no].filter(Boolean).join(" · ")} right={formatDate(b.expiry_date)} />
              ))}
            </ListCard>
            <ListCard title="Expired, still on shelf" empty="No expired stock is held." danger>
              {data.expired_with_stock.map((b) => (
                <Row key={b.batch_id} left={b.medicine} sub={[b.company, b.batch_no, formatDate(b.expiry_date)].filter(Boolean).join(" · ")} right={`${b.quantity} ${b.unit}`} />
              ))}
            </ListCard>
          </div>
          {data.expired_with_stock.length > 0 && (
            <p className="mt-3 text-sm text-ink-mute">Expired stock can never be billed. Remove it from the shelf and record it with a stock adjustment in Inventory.</p>
          )}
        </>
      )}
    </>
  );
}

function Tile({ label, value, sub, warn }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-ink-mute">{label}</p>
      <p className={"mt-1 text-2xl font-bold tabular-nums " + (warn ? "text-amber-700" : "text-ink")}>{value}</p>
      {sub && <p className="text-xs text-ink-mute">{sub}</p>}
    </Card>
  );
}

function ListCard({ title, empty, children, danger }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <Card>
      <h2 className={"border-b border-line px-4 py-3 font-semibold " + (danger ? "text-red-800" : "text-ink")}>{title}</h2>
      {has ? <ul className="max-h-80 divide-y divide-line overflow-y-auto">{children}</ul> : <p className="px-4 py-6 text-sm text-ink-mute">{empty}</p>}
    </Card>
  );
}

function Row({ left, sub, right }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium text-ink">{left}</p>
        <p className="truncate text-xs text-ink-mute">{sub}</p>
      </div>
      <span className="shrink-0 tabular-nums text-ink-soft">{right}</span>
    </li>
  );
}
