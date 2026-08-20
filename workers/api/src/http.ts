import type { Env } from "./env.js";

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message?: string) {
    super(message ?? code);
  }
}

/* Exact-origin allowlist. Doubles as the CSRF allowlist below -- one list,
   so the two can never disagree. Never "*": that is forbidden with
   credentials, and a wildcard here would also silently widen CSRF. */
function credentialedOrigins(env: Env): string[] {
  return [env.APP_ORIGIN, "http://localhost:8765", "http://127.0.0.1:8765", "http://localhost:8080"];
}

export function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  // Vary unconditionally whenever an Origin is present, or a cache could
  // hand one origin's ACAO to another.
  const h: Record<string, string> = { "Vary": "Origin" };
  if (credentialedOrigins(env).includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Credentials"] = "true";
  }
  return h;
}

export function preflight(request: Request, env: Env): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request, env),
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization,If-Match",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export function json(data: unknown, request: Request, env: Env, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(request, env),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

/* CSRF backstop for state-changing requests. A cross-origin page cannot
   set Authorization, so bearer callers are CSRF-immune by construction
   and return early. */
export function assertTrustedOrigin(request: Request, env: Env): void {
  if (request.headers.get("Authorization")) return;
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("Origin");
  if (!origin || !credentialedOrigins(env).includes(origin)) {
    throw new HttpError(403, "forbidden_origin", "Request origin is not allowed.");
  }
}

export function errorResponse(error: unknown, request: Request, env: Env): Response {
  if (error instanceof HttpError) {
    return json({ error: error.code, message: error.message }, request, env, { status: error.status });
  }
  // Never leak an internal message or stack to the client.
  console.error("[guerillatype-api] unhandled", error);
  return json({ error: "internal_error", message: "Something went wrong." }, request, env, { status: 500 });
}
