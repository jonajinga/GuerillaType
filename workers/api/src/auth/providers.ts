import { HttpError } from "../http.js";
import type { Env } from "../env.js";

export type ProviderName = "google" | "github";
export const isProviderName = (v: string): v is ProviderName => v === "google" || v === "github";

export interface NormalizedProfile {
  providerUserId: string;   // the provider's stable id -- never the email
  email: string;            // provider-VERIFIED only. See below.
  name: string | null;
  avatarUrl: string | null;
}

/* Derived from the REQUEST url, not from config, so it can never drift
   away from what is registered in the provider console. */
export const redirectUri = (requestUrl: URL, provider: ProviderName) =>
  `${requestUrl.origin}/auth/callback/${provider}`;

export function authorizeUrl(provider: ProviderName, env: Env, requestUrl: URL, state: string): string {
  if (provider === "google") {
    const p = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri(requestUrl, "google"),
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  }
  const p = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: redirectUri(requestUrl, "github"),
    scope: "read:user user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${p}`;
}

/* The Worker is a CONFIDENTIAL client: the code exchange happens
   server-side and no client ever sees a provider secret. */
export async function exchangeCode(
  provider: ProviderName, env: Env, requestUrl: URL, code: string,
): Promise<string> {
  const isGoogle = provider === "google";
  const url = isGoogle ? "https://oauth2.googleapis.com/token" : "https://github.com/login/oauth/access_token";
  const body = new URLSearchParams({
    client_id: isGoogle ? env.GOOGLE_CLIENT_ID : env.GITHUB_CLIENT_ID,
    client_secret: isGoogle ? env.GOOGLE_CLIENT_SECRET : env.GITHUB_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri(requestUrl, provider),
    ...(isGoogle ? { grant_type: "authorization_code" } : {}),
  });
  const res = await fetch(url, {
    method: "POST",
    // GitHub needs both of these or it answers with form-encoded text
    // and rejects the request outright.
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json", "User-Agent": "guerillatype-api" },
    body,
  });
  if (!res.ok) throw new HttpError(502, "provider_error", "Sign-in provider rejected the exchange.");
  const data = await res.json<{ access_token?: string }>();
  if (!data.access_token) throw new HttpError(502, "provider_error", "Sign-in provider returned no token.");
  return data.access_token;
}

export async function fetchProfile(
  provider: ProviderName, accessToken: string,
): Promise<NormalizedProfile> {
  return provider === "google" ? googleProfile(accessToken) : githubProfile(accessToken);
}

/* Read the userinfo endpoint rather than verifying the id_token. Sound
   here precisely BECAUSE the exchange already happened server-side over
   TLS -- it saves a JWKS fetch and a JOSE dependency for no loss. */
async function googleProfile(token: string): Promise<NormalizedProfile> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new HttpError(502, "provider_error", "Could not read Google profile.");
  const u = await res.json<{ sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string }>();
  if (!u.email || u.email_verified !== true) {
    // Load-bearing. Account linking below matches on email, so an
    // UNVERIFIED address would let anyone who can set an email at one
    // provider take over an existing account at another.
    throw new HttpError(403, "email_unverified", "Your Google email address is not verified.");
  }
  return { providerUserId: u.sub, email: u.email, name: u.name ?? null, avatarUrl: u.picture ?? null };
}

async function githubProfile(token: string): Promise<NormalizedProfile> {
  const headers = { Authorization: `Bearer ${token}`, "User-Agent": "guerillatype-api", Accept: "application/vnd.github+json" };
  const [uRes, eRes] = await Promise.all([
    fetch("https://api.github.com/user", { headers }),
    fetch("https://api.github.com/user/emails", { headers }),
  ]);
  if (!uRes.ok) throw new HttpError(502, "provider_error", "Could not read GitHub profile.");
  const u = await uRes.json<{ id: number; login: string; name?: string; avatar_url?: string }>();

  let email: string | null = null;
  if (eRes.ok) {
    const emails = await eRes.json<Array<{ email: string; primary: boolean; verified: boolean }>>();
    email = emails.find((e) => e.primary && e.verified)?.email ?? emails.find((e) => e.verified)?.email ?? null;
  }
  if (!email) throw new HttpError(403, "email_unverified", "Your GitHub account has no verified email address.");

  return { providerUserId: String(u.id), email, name: u.name ?? u.login, avatarUrl: u.avatar_url ?? null };
}
