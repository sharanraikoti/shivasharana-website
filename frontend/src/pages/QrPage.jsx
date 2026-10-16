import { useSearchParams } from "react-router-dom";
import { Button, ErrorBox, Loading, Notice } from "../components/ui";
import { API_URL } from "../lib/api";
import { useApi, useShop, useTitle } from "../lib/hooks";

/** Print-friendly QR code page. Opens /qr (website) or /qr?company=<slug>. */
export default function QrPage() {
  useTitle("QR code");
  const shop = useShop();
  const [params] = useSearchParams();
  const company = params.get("company");
  const qs = company ? `?company=${encodeURIComponent(company)}` : "";
  const { data, error, loading, reload } = useApi(`/api/qr/info${qs}`);
  const sep = qs ? "&" : "?";

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      {loading && <Loading />}
      <ErrorBox error={error} onRetry={reload} />
      {data && !data.ready && (
        <Notice kind="warn">
          <p className="font-semibold">The QR code is not ready yet.</p>
          <p className="mt-1">{data.problem}</p>
          <p className="mt-2">A printed QR code must point to the published website, not to this computer.</p>
        </Notice>
      )}
      {data?.ready && (
        <div className="rounded-lg border border-line bg-white p-8 text-center print:border-0 print:p-0">
          <h1 className="text-2xl font-bold text-ink">{shop?.name}</h1>
          <p className="mt-1 text-ink-soft">Scan to see our companies and medicine stock</p>
          <img src={`${API_URL}/api/qr/code.png${qs}`} alt={`QR code for ${data.url}`} className="mx-auto mt-6 w-72 max-w-full" />
          <p className="mt-4 break-all font-mono text-sm text-ink-soft">{data.url}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3 print:hidden">
            <Button onClick={() => window.print()}>Print</Button>
            <Button as="a" variant="secondary" href={`${API_URL}/api/qr/code.png${qs}${sep}download=true&size=30`}>
              Download PNG
            </Button>
            <Button as="a" variant="secondary" href={`${API_URL}/api/qr/code.svg${qs}${sep}download=true`}>
              Download SVG
            </Button>
          </div>
          <p className="mt-6 text-xs text-ink-mute print:hidden">Before printing many copies, scan it with two different phones to check it opens the website.</p>
        </div>
      )}
    </div>
  );
}
