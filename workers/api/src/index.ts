import { errorResponse, json, preflight, HttpError } from "./http.js";
import * as auth from "./auth/routes.js";
import * as sync from "./sync/routes.js";
import type { Env } from "./env.js";

/* Tiny matcher: ":name" segments capture. Enough for this surface, and
   it keeps the Worker dependency-free (no framework, no cold-start tax). */
function match(path: string, pattern: string): Record<string, string> | null {
  const p = path.split("/").filter(Boolean);
  const q = pattern.split("/").filter(Boolean);
  if (p.length !== q.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < q.length; i++) {
    const seg = q[i]!;
    if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(p[i]!);
    else if (seg !== p[i]) return null;
  }
  return params;
}

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { pathname } = new URL(request.url);
  const m = request.method;

  if (m === "GET" && pathname === "/health") return json({ ok: true }, request, env);
  if (m === "GET" && pathname === "/auth/login") return auth.login(request, env);
  if (m === "GET" && pathname === "/auth/me") return auth.me(request, env, ctx);
  if (m === "POST" && pathname === "/auth/logout") return auth.logout(request, env);
  if (m === "POST" && pathname === "/auth/logout-all") return auth.logoutAll(request, env, ctx);
  if (m === "DELETE" && pathname === "/auth/account") return auth.deleteAccount(request, env, ctx);

  const cb = match(pathname, "/auth/callback/:provider");
  if (cb && m === "GET") return auth.callback(request, env, cb.provider!);

  if (m === "GET" && pathname === "/sync") return sync.manifest(request, env, ctx);

  const one = match(pathname, "/sync/:profileId");
  if (one && m === "PUT") return sync.push(request, env, ctx, one.profileId!);
  if (one && m === "DELETE") return sync.forget(request, env, ctx, one.profileId!);

  const blob = match(pathname, "/sync/:profileId/:deviceId");
  if (blob && m === "GET") return sync.pull(request, env, ctx, blob.profileId!, blob.deviceId!);

  throw new HttpError(404, "not_found", "No such endpoint.");
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request, env);
    try {
      return await route(request, env, ctx);
    } catch (error) {
      // Single funnel: no handler ever builds an error response or has to
      // remember to attach CORS headers.
      return errorResponse(error, request, env);
    }
  },
} satisfies ExportedHandler<Env>;
