import { useState } from "react";
import { AdminOnly, PageTitle } from "../../components/StaffLayout";
import { Button, Card, ErrorBox, Field, Loading, inputClass } from "../../components/ui";
import { api } from "../../lib/api";
import { useApi, useAuth, useTitle } from "../../lib/hooks";

export default function Users() {
  useTitle("Users");
  return (
    <AdminOnly>
      <UserScreen />
    </AdminOnly>
  );
}

function UserScreen() {
  const { user: me } = useAuth();
  const users = useApi("/api/admin/users", { auth: true });
  const [f, setF] = useState({ username: "", full_name: "", password: "", role: "staff" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/users", { method: "POST", auth: true, body: { ...f, full_name: f.full_name || null } });
      setF({ username: "", full_name: "", password: "", role: "staff" });
      users.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const update = async (u, body) => {
    setError(null);
    try {
      await api(`/api/admin/users/${u.id}`, { method: "PUT", auth: true, body });
      users.reload();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <>
      <PageTitle>Users</PageTitle>
      <p className="mb-4 max-w-2xl text-sm text-ink-soft">
        <strong>Staff</strong> can make bills and accept returns. <strong>Admins</strong> can also change stock, prices, shop details and users, and cancel bills.
      </p>
      <ErrorBox error={error} />
      {users.loading && <Loading />}
      {users.data && (
        <Card className="mt-3 divide-y divide-line">
          {users.data.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <span>
                <span className="font-medium text-ink">{u.username}</span> {u.full_name && <span className="text-ink-mute">· {u.full_name}</span>} · {u.role}
                {!u.is_active && <span className="text-red-700"> · disabled</span>}
              </span>
              {u.id !== me.id && (
                <span className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => update(u, { role: u.role === "admin" ? "staff" : "admin" })}>
                    Make {u.role === "admin" ? "staff" : "admin"}
                  </Button>
                  <Button size="sm" variant={u.is_active ? "danger" : "secondary"} onClick={() => update(u, { is_active: !u.is_active })}>
                    {u.is_active ? "Disable" : "Enable"}
                  </Button>
                </span>
              )}
            </div>
          ))}
        </Card>
      )}
      <form onSubmit={create} className="mt-8 max-w-2xl">
        <h2 className="mb-3 font-semibold text-ink">Add a user</h2>
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Username" hint="Letters, numbers, . _ -">
            <input className={inputClass} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required minLength={3} pattern="[A-Za-z0-9_.\-]+" autoComplete="off" />
          </Field>
          <Field label="Full name (optional)">
            <input className={inputClass} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
          </Field>
          <Field label="Password" hint="At least 8 characters">
            <input className={inputClass} type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={8} autoComplete="new-password" />
          </Field>
          <Field label="Role">
            <select className={inputClass} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              Add user
            </Button>
          </div>
        </Card>
      </form>
    </>
  );
}
