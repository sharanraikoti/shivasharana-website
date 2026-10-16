import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, getToken, setToken } from "./api";

/** Load data from the API with loading / error / reload. */
export function useApi(path, { auth = false, skip = false } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: !skip });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (skip || !path) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api(path, { auth })
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => {
      alive = false;
    };
  }, [path, auth, skip, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useTitle(title) {
  const shop = useShop();
  useEffect(() => {
    const name = shop?.name || "Medical Shop";
    document.title = title ? `${title} · ${name}` : name;
  }, [title, shop?.name]);
}

// ---------------------------------------------------------------- shop details
const ShopContext = createContext(null);

export function ShopProvider({ children }) {
  const { data, error, loading, reload } = useApi("/api/shop");
  return <ShopContext.Provider value={{ shop: data, error, loading, reload }}>{children}</ShopContext.Provider>;
}

export function useShopState() {
  return useContext(ShopContext);
}

export function useShop() {
  return useContext(ShopContext)?.shop ?? null;
}

// ---------------------------------------------------------------- staff sign-in
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current || !getToken()) return;
    checked.current = true;
    api("/api/auth/me", { auth: true })
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    const out = () => setUser(null);
    window.addEventListener("shop:signed-out", out);
    return () => window.removeEventListener("shop:signed-out", out);
  }, []);

  const signIn = async (username, password) => {
    const res = await api("/api/auth/login", { method: "POST", body: { username, password } });
    setToken(res.access_token);
    setUser(res.user);
    return res.user;
  };
  const signOut = () => {
    setToken(null);
    setUser(null);
  };
  return <AuthContext.Provider value={{ user, checking, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
