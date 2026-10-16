import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { ShopMark } from "../../components/Layout";
import { Button, ErrorBox, Field, inputClass } from "../../components/ui";
import { useAuth, useShop, useTitle } from "../../lib/hooks";

export default function Login() {
  useTitle("Staff sign in");
  const { user, signIn } = useAuth();
  const shop = useShop();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from || "/staff"} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
      navigate(location.state?.from || "/staff", { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3">
          <ShopMark shop={shop} />
          <span className="font-semibold text-ink">{shop?.name || "Medical Shop"}</span>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-lg border border-line bg-white p-6">
          <h1 className="text-lg font-bold text-ink">Staff sign in</h1>
          <ErrorBox error={error} />
          <Field label="Username">
            <input className={inputClass} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </Field>
          <Field label="Password">
            <input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link to="/" className="text-brand-700 hover:underline">
            Back to the website
          </Link>
        </p>
      </div>
    </div>
  );
}
