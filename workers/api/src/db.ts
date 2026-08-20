import { nowIso } from "./crypto.js";
import { generateHandle } from "./auth/handle.js";
import type { Env } from "./env.js";
import type { NormalizedProfile, ProviderName } from "./auth/providers.js";
import type { SessionUser } from "./auth/session.js";

/* Account resolution, in strict order:
     1. known identity  -- this provider account has signed in before
     2. known email     -- a DIFFERENT provider already established this
                           address, so link rather than fork the account
     3. new account

   Step 2 is only safe because providers.ts refuses unverified addresses.
   Without that guarantee, anyone able to set an email at one provider
   could take over an existing account at another. */
export async function resolveUser(
  env: Env, provider: ProviderName, profile: NormalizedProfile,
): Promise<SessionUser> {
  const email = profile.email.toLowerCase();

  const known = await env.DB.prepare(
    `SELECT u.* FROM identities i JOIN users u ON u.id = i.user_id
      WHERE i.provider = ? AND i.provider_user_id = ?`,
  ).bind(provider, profile.providerUserId).first<any>();

  if (known) {
    // Refresh the cached display fields without clobbering them with null.
    await env.DB.prepare(
      `UPDATE users SET name = COALESCE(?, name), avatar_url = COALESCE(?, avatar_url), updated_at = ? WHERE id = ?`,
    ).bind(profile.name, profile.avatarUrl, nowIso(), known.id).run();
    return publicUser({ ...known, name: profile.name ?? known.name, avatar_url: profile.avatarUrl ?? known.avatar_url });
  }

  const byEmail = await env.DB.prepare(`SELECT * FROM users WHERE email = ?`).bind(email).first<any>();
  if (byEmail) {
    await env.DB.prepare(
      `INSERT INTO identities (provider, provider_user_id, user_id, email, created_at)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
    ).bind(provider, profile.providerUserId, byEmail.id, email, nowIso()).run();
    return publicUser(byEmail);
  }

  const id = crypto.randomUUID();
  const handle = await uniqueHandle(env);
  const ts = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, email, handle, name, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, email, handle, profile.name, profile.avatarUrl, ts, ts),
    env.DB.prepare(
      `INSERT INTO identities (provider, provider_user_id, user_id, email, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(provider, profile.providerUserId, id, email, ts),
  ]);
  return { id, email, handle, name: profile.name, avatarUrl: profile.avatarUrl };
}

/* handle is UNIQUE, so retry on collision. Bounded, then fall back to a
   wider discriminator rather than looping forever. */
async function uniqueHandle(env: Env): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const h = generateHandle();
    const taken = await env.DB.prepare(`SELECT 1 FROM users WHERE handle = ?`).bind(h).first();
    if (!taken) return h;
  }
  return generateHandle() + "-" + crypto.randomUUID().slice(0, 4);
}

export const publicUser = (u: any): SessionUser => ({
  id: u.id, email: u.email, handle: u.handle, name: u.name ?? null, avatarUrl: u.avatar_url ?? null,
});

export async function listIdentities(env: Env, userId: string): Promise<string[]> {
  const r = await env.DB.prepare(`SELECT provider FROM identities WHERE user_id = ? ORDER BY provider`)
    .bind(userId).all<{ provider: string }>();
  return (r.results ?? []).map((x) => x.provider);
}
