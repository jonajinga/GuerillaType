import { DAY_MS, isoIn, nowIso, randomToken, sha256Hex } from "../crypto.js";
import { HttpError } from "../http.js";
import { isDev, sessionTtlDays, type Env } from "../env.js";

export interface SessionUser {
  id: string; email: string; handle: string; name: string | null; avatarUrl: string | null;
}

export const cookieName = (env: Env) => (isDev(env) ? "gt_session" : "__Host-gt_session");

/* SameSite=Lax, NOT Strict. The OAuth callback is a cross-site top-level
   navigation back from Google/GitHub, and Strict withholds the cookie on
   exactly that hop -- the user would land signed-out every time.

   No Domain attribute: guerillatype.com -> api.guerillatype.com is
   same-SITE, which is what __Host- requires and what makes the cookie
   work across the two hostnames. */
export function sessionCookie(env: Env, token: string, expiresAt: string): string {
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
  const parts = [`${cookieName(env)}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (!isDev(env)) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(env: Env): string {
  const parts = [`${cookieName(env)}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (!isDev(env)) parts.push("Secure");
  return parts.join("; ");
}

export async function mintSession(env: Env, userId: string, userAgent: string | null) {
  const token = randomToken(32);                 // 256 bits
  const id = await sha256Hex(token);             // the PK *is* the hash
  const expiresAt = isoIn(sessionTtlDays(env) * DAY_MS);
  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, userId, nowIso(), expiresAt, nowIso(), (userAgent ?? "").slice(0, 255)).run();
  // The raw token is returned once and never persisted anywhere.
  return { token, expiresAt };
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("Cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/* Two carriers, ONE verifier. Bearer wins over the cookie so a stale
   cookie can never shadow an explicit token. */
export async function authenticate(
  request: Request, env: Env, ctx?: ExecutionContext,
): Promise<{ user: SessionUser; expiresAt: string } | null> {
  const bearer = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const token = bearer || readCookie(request, cookieName(env));
  if (!token) return null;

  const row = await env.DB.prepare(
    `SELECT s.id AS sid, s.expires_at, s.revoked_at,
            u.id, u.email, u.handle, u.name, u.avatar_url
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
  ).bind(await sha256Hex(token)).first<any>();

  if (!row || row.revoked_at || Date.parse(row.expires_at) <= Date.now()) return null;

  // Best-effort liveness stamp. Deliberately not awaited -- a failed
  // write must never cost the user their request -- but handed to
  // waitUntil so it is not cancelled when the response settles.
  const touch = env.DB.prepare(`UPDATE sessions SET last_seen_at = ? WHERE id = ?`)
    .bind(nowIso(), row.sid).run().catch(() => {});
  if (ctx) ctx.waitUntil(touch);

  return {
    user: { id: row.id, email: row.email, handle: row.handle, name: row.name, avatarUrl: row.avatar_url },
    expiresAt: row.expires_at,
  };
}

export async function requireUser(request: Request, env: Env, ctx?: ExecutionContext) {
  const s = await authenticate(request, env, ctx);
  if (!s) throw new HttpError(401, "unauthenticated", "Sign in to continue.");
  return s;
}

/* Instant revocation is the whole reason sessions are opaque rows rather
   than JWTs: "sign out everywhere" has to actually work. */
export async function revokeSession(env: Env, token: string): Promise<void> {
  await env.DB.prepare(`UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`)
    .bind(nowIso(), await sha256Hex(token)).run();
}

export async function revokeAllForUser(env: Env, userId: string): Promise<void> {
  await env.DB.prepare(`UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`)
    .bind(nowIso(), userId).run();
}

export const readSessionToken = (request: Request, env: Env) =>
  request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || readCookie(request, cookieName(env));
