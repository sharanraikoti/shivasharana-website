// Small wrapper around fetch for the backend API.
export const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const TOKEN_KEY = "shop_staff_token";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: stay signed in for this tab only */
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function messageFrom(body, status) {
  if (!body) return `Request failed (${status})`;
  if (typeof body.detail === "string") return body.detail;
  if (Array.isArray(body.detail)) {
    // FastAPI validation errors
    return body.detail
      .map((d) => {
        const field = (d.loc || []).filter((x) => x !== "body").join(" → ");
        return field ? `${field}: ${d.msg}` : d.msg;
      })
      .join("; ");
  }
  return `Request failed (${status})`;
}

export async function api(path, { method = "GET", body, auth = false, form, raw = false } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError("Cannot reach the server. Check your internet connection and try again.", 0);
  }
  if (res.status === 401 && auth) {
    setToken(null);
    window.dispatchEvent(new Event("shop:signed-out"));
  }
  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* not JSON */
    }
    throw new ApiError(messageFrom(data, res.status), res.status);
  }
  if (raw) return res;
  if (res.status === 204) return null;
  return res.json();
}
