import { Link } from "react-router-dom";
import { AdminOnly, PageTitle } from "../../components/StaffLayout";
import { Card, ErrorBox, Loading, Notice } from "../../components/ui";
import { API_URL } from "../../lib/api";
import { useApi, useTitle } from "../../lib/hooks";

export default function StaffQr() {
  useTitle("QR code");
  const info = useApi("/api/qr/info");
  const companies = useApi("/api/companies?page_size=100");
  return (
    <AdminOnly>
      <PageTitle>QR code</PageTitle>
      {info.loading && <Loading />}
      <ErrorBox error={info.error} onRetry={info.reload} />
      {info.data && !info.data.ready && (
        <Notice kind="warn" className="max-w-2xl">
          <p className="font-semibold">Not ready: {info.data.problem}</p>
          <p className="mt-2">
            Deploy the website (see the deployment guide in the README), then set <code>PUBLIC_SITE_URL</code> on the backend to the website's https:// address and restart it.
          </p>
        </Notice>
      )}
      {info.data?.ready && (
        <div className="grid gap-5 md:grid-cols-[auto_1fr]">
          <Card className="p-5 text-center">
            <img src={`${API_URL}/api/qr/code.png`} alt="Website QR code" className="mx-auto w-56" />
            <p className="mt-2 break-all font-mono text-xs text-ink-soft">{info.data.url}</p>
            <Link to="/qr" target="_blank" className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">
              Open print page
            </Link>
          </Card>
          <Card className="p-5">
            <h2 className="font-semibold text-ink">Company QR codes</h2>
            <p className="mt-1 text-sm text-ink-soft">Each opens that company's stock page directly.</p>
            <ul className="mt-3 divide-y divide-line text-sm">
              {companies.data?.items.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                  <span>{c.name}</span>
                  <Link to={`/qr?company=${c.slug}`} target="_blank" className="font-medium text-brand-700 hover:underline">
                    QR page
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </AdminOnly>
  );
}
