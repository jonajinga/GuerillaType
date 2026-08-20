import { HttpError, assertTrustedOrigin, json } from "../http.js";
import { authorizeUrl, exchangeCode, fetchProfile, isProviderName, type ProviderName } from "./providers.js";
import { clearCookie, mintSession, readSessionToken, requireUser, revokeAllForUser, revokeSession, sessionCookie } from "./session.js";
import { listIdentities, resolveUser } from "../db.js";
import type { Env } from "../env.js";

const STATE_TTL_SECONDS = 600;

interface OAuthState { provider: ProviderName; redirect: string }

/* Only same-origin app paths. Blocks "//evil.com" (protocol-relative)
   and backslash tricks that some URL parsers normalise to a slash. */
function safeRedirectPath(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  return raw;
}

async function limit(env: Env, request: Request): Promise<void> {
  if (!env.AUTH_LIMIT) return;
  const key = request.headers.get("CF-Connecting-IP") ?? "anon";
  const { success } = await env.AUTH_LIMIT.limit({ key });
  if (!success) throw new HttpError(429, "rate_limited", "Too many attempts. Try again shortly.");
}

/* GET /auth/login?provider=&redirect= */
export async function login(request: Request, env: Env): Promise<Response> {
  await limit(env, request);
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") ?? "";
  if (!isProviderName(provider)) throw new HttpError(400, "bad_provider", "Unknown sign-in provider.");

  const state = crypto.randomUUID();
  const value: OAuthState = { provider, redirect: safeRedirectPath(url.searchParams.get("redirect")) };
  await env.OAUTH_STATE.put(`state:${state}`, JSON.stringify(value), { expirationTtl: STATE_TTL_SECONDS });

  return Response.redirect(authorizeUrl(provider, env, url, state), 302);
}

/* GET /auth/callback/:provider */
export async function callback(request: Request, env: Env, providerParam: string): Promise<Response> {
  await limit(env, request);
  const url = new URL(request.url);
  if (!isProviderName(providerParam)) throw new HttpError(400, "bad_provider", "Unknown sign-in provider.");

  const stateKey = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!stateKey || !code) return fail(env, "missing_code");

  const raw = await env.OAUTH_STATE.get(`state:${stateKey}`);
  // Burn the state BEFORE anything else can fail, so a replayed callback
  // can never be redeemed twice.
  await env.OAUTH_STATE.delete(`state:${stateKey}`);
  if (!raw) return fail(env, "expired_state");

  const state = JSON.parse(raw) as OAuthState;
  if (state.provider !== providerParam) return fail(env, "state_mismatch");

  let user;
  try {
    const token = await exchangeCode(providerParam, env, url, code);
    user = await resolveUser(env, providerParam, await fetchProfile(providerParam, token));
  } catch (e) {
    // An unverified email is the user's problem to fix, not a 500 --
    // send them back with something they can act on.
    if (e instanceof HttpError && e.code === "email_unverified") return fail(env, "email_unverified");
    throw e;
  }

  const { token: sessionToken, expiresAt } = await mintSession(env, user.id, request.headers.get("User-Agent"));
  return new Response(null, {
    status: 302,
    headers: {
      Location: env.APP_ORIGIN + state.redirect,
      "Set-Cookie": sessionCookie(env, sessionToken, expiresAt),
    },
  });
}

const fail = (env: Env, reason: string) =>
  Response.redirect(`${env.APP_ORIGIN}/?auth_error=${encodeURIComponent(reason)}`, 302);

/* GET /auth/me */
export async function me(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { user, expiresAt } = await requireUser(request, env, ctx);
  // expiresAt is returned so the client can size its offline grace
  // window from the truth instead of assuming the default TTL.
  return json({ user: { ...user, providers: await listIdentities(env, user.id) }, expiresAt }, request, env);
}

/* POST /auth/logout   — idempotent, even with an already-dead session. */
export async function logout(request: Request, env: Env): Promise<Response> {
  assertTrustedOrigin(request, env);
  const token = readSessionToken(request, env);
  if (token) await revokeSession(env, token);
  return json({ ok: true }, request, env, { headers: { "Set-Cookie": clearCookie(env) } });
}

/* POST /auth/logout-all — the payoff of opaque sessions. */
export async function logoutAll(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  assertTrustedOrigin(request, env);
  const { user } = await requireUser(request, env, ctx);
  await revokeAllForUser(env, user.id);
  return json({ ok: true }, request, env, { headers: { "Set-Cookie": clearCookie(env) } });
}
