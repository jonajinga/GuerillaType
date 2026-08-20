/* The ONLY place in the client that talks to the network.

   The project has never had scattered fetch calls and should not start
   now: one chokepoint means one place that knows about credentials, one
   place that decides what a 401 means, and one place to look when
   something is talking to the wrong host. */

// Same-origin by default so a Pages preview deployment talks to its own
// API. Overridden by <meta name="gt-api" content="..."> for local dev
// against `wrangler dev --port 8791`.
function base() {
  const meta = document.querySelector('meta[name="gt-api"]');
  const v = meta && meta.getAttribute("content");
  return (v || "").replace(/\/$/, "");
}

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
  /* "The network is gone" and "the server said no" demand completely
     different handling -- one is a retry, the other is a sign-out. */
  get offline() { return this.status === 0; }
}

let onUnauthenticated = null;
export function setUnauthenticatedHandler(fn) { onUnauthenticated = fn; }

export async function apiFetch(path, init = {}) {
  let res;
  try {
    res = await fetch(base() + path, {
      ...init,
      // Cookie auth: the session rides here, never in JS-readable storage.
      credentials: "include",
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) },
    });
  } catch (e) {
    throw new ApiError(0, "network_error", "Could not reach the server.");
  }

  if (res.status === 401) {
    // `quiet` exists so the startup probe can interpret its own 401
    // without triggering a redirect loop.
    if (!init.quiet && onUnauthenticated) onUnauthenticated();
    throw new ApiError(401, "unauthenticated", "Sign in to continue.");
  }

  if (!res.ok) {
    let code = "http_" + res.status, message = res.statusText;
    try {
      const body = await res.json();
      code = body.error || code;
      message = body.message || message;
    } catch {}
    throw new ApiError(res.status, code, message);
  }

  return res.status === 204 ? null : res.json();
}

export const getMe = (opts = {}) => apiFetch("/auth/me", { ...opts });
export const logout = () => apiFetch("/auth/logout", { method: "POST" });
export const logoutAll = () => apiFetch("/auth/logout-all", { method: "POST" });

/* Sign-in is a full-page navigation, not a fetch -- the OAuth dance needs
   real redirects. */
export function beginLogin(provider, returnPath) {
  const p = new URLSearchParams({ provider, redirect: returnPath || location.pathname });
  location.assign(`${base()}/auth/login?${p}`);
}
