export interface Env {
  DB: D1Database;
  OAUTH_STATE: KVNamespace;
  SYNC: R2Bucket;
  AUTH_LIMIT?: RateLimit;

  APP_ORIGIN: string;
  SESSION_TTL_DAYS?: string;

  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}

export const sessionTtlDays = (env: Env) => Number(env.SESSION_TTL_DAYS || "30");

/* One switch drives both the `Secure` cookie attribute and the __Host-
   prefix, so localhost sign-in is actually testable without a second
   code path that could drift from production. */
export const isDev = (env: Env) => env.APP_ORIGIN.startsWith("http://");
