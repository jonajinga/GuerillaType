# guerillatype-api

Auth for GuerillaType. Dependency-free Cloudflare Worker over D1 (identity)
and KV (short-lived OAuth state). No framework, no `nodejs_compat` — Web
Crypto and `fetch` only, which keeps cold starts cheap. Cold start is on
the critical path for a sign-in redirect, so that matters.

This is **M1: auth only**. Sync (`/sync`, segments, R2) lands in M3.

## Design notes worth knowing before you change anything

- **Sessions are opaque rows, not JWTs.** `sessions.id` *is*
  `sha256(token)`, so the primary key doubles as the hash index and the raw
  token is never stored anywhere. Costs one indexed D1 read per request;
  buys instant revocation, which is what makes "sign out everywhere" real.
- **`SameSite=Lax`, not `Strict`.** The OAuth callback is a cross-site
  top-level navigation back from Google/GitHub, and `Strict` withholds the
  cookie on exactly that hop — the user would land signed out every time.
- **No `Domain` on the cookie.** `guerillatype.com` → `api.guerillatype.com`
  is same-*site*, which is what the `__Host-` prefix requires.
- **Providers refuse unverified emails.** Load-bearing: account linking
  matches on email, so accepting an unverified address would let anyone who
  can set an email at one provider take over an account at another. Covered
  by `test/providers.test.ts`.
- **OAuth `state` is deleted before anything else runs**, so a replayed
  callback can never be redeemed twice.
- **Handles are generated, never typed.** `src/auth/handle.ts`. No username
  to moderate, no impersonation vector, no uniqueness UX. Users can reroll.
- **Rate limiting is on `/auth/*`.** `/auth/login` is unauthenticated and
  writes a KV key per call; on a free tier that limiter is the only thing
  between us and a bill.

## Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | — | liveness |
| GET | `/auth/login?provider=&redirect=` | — | mint `state`, 302 to provider |
| GET | `/auth/callback/:provider` | — | exchange code, set cookie, 302 to app |
| GET | `/auth/me` | yes | `{ user: {…, providers}, expiresAt }` |
| POST | `/auth/logout` | optional | revoke this session; idempotent |
| POST | `/auth/logout-all` | yes | revoke every session for the user |

## Local development

```sh
npm install
npm test          # 26 tests, miniflare — no Cloudflare account needed
npm run typecheck
```

`npm test` runs entirely locally against miniflare. You do **not** need to
be logged into Cloudflare to work on this.

## Setup that needs the Cloudflare account

Nothing below can run without `wrangler login` (browser OAuth).

```sh
npx wrangler login

# 1. D1 — copy the printed database_id into wrangler.jsonc
npx wrangler d1 create guerillatype

# 2. KV — copy the printed id into wrangler.jsonc
npx wrangler kv namespace create OAUTH_STATE

# 3. Apply the schema
npm run db:migrate:remote
```

### OAuth apps

Callback URL for both providers: `https://api.guerillatype.com/auth/callback/<provider>`
(and `http://localhost:8791/auth/callback/<provider>` for local testing).

- **Google** — <https://console.cloud.google.com/apis/credentials> → OAuth
  client ID → Web application. Scopes: `openid email profile`.
- **GitHub** — <https://github.com/settings/developers> → New OAuth App.
  Scopes: `read:user user:email`.

Then:

```sh
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler deploy
```

Finally uncomment the `routes` block in `wrangler.jsonc` and point
`api.guerillatype.com` at the Worker.

**Port 8791 is pinned deliberately.** Wrangler silently increments past a
busy port, and a sibling project lost time to the app quietly talking to
the wrong API.
