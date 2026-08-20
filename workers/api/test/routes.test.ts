import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveUser } from "../src/db.js";
import { mintSession } from "../src/auth/session.js";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM identities"),
    env.DB.prepare("DELETE FROM users"),
  ]);
});

const signIn = async () => {
  const u = await resolveUser(env, "google", { providerUserId: "1", email: "a@example.com", name: "A", avatarUrl: null });
  const { token } = await mintSession(env, u.id, "test");
  return { u, token };
};

describe("routes", () => {
  it("GET /health is public", async () => {
    const r = await SELF.fetch("https://api.test/health");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it("GET /auth/me is 401 without a session", async () => {
    const r = await SELF.fetch("https://api.test/auth/me");
    expect(r.status).toBe(401);
    expect((await r.json<any>()).error).toBe("unauthenticated");
  });

  it("GET /auth/me returns the user, providers and expiresAt", async () => {
    const { token } = await signIn();
    const r = await SELF.fetch("https://api.test/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    expect(r.status).toBe(200);
    const body = await r.json<any>();
    expect(body.user.email).toBe("a@example.com");
    expect(body.user.providers).toEqual(["google"]);
    // Returned so the client sizes its offline grace from the truth
    // rather than assuming the default TTL.
    expect(typeof body.expiresAt).toBe("string");
  });

  it("a revoked session stops working immediately", async () => {
    const { token } = await signIn();
    await SELF.fetch("https://api.test/auth/logout", {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    const r = await SELF.fetch("https://api.test/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    expect(r.status).toBe(401);
  });

  it("logout is idempotent — signing out with no session still succeeds", async () => {
    // Browsers always send Origin on POST, so this is the real shape of
    // "already signed out, clicked sign out again".
    const r = await SELF.fetch("https://api.test/auth/logout", {
      method: "POST", headers: { Origin: "https://guerillatype.com" },
    });
    expect(r.status).toBe(200);
  });

  it("a state-changing request with NO Origin and no bearer token is refused", async () => {
    // Not a browser request. Fail closed rather than guess.
    const r = await SELF.fetch("https://api.test/auth/logout", { method: "POST" });
    expect(r.status).toBe(403);
  });

  it("logout-all revokes every session for the user", async () => {
    const { u } = await signIn();
    const a = await mintSession(env, u.id, "laptop");
    const b = await mintSession(env, u.id, "phone");
    await SELF.fetch("https://api.test/auth/logout-all", {
      method: "POST", headers: { Authorization: `Bearer ${a.token}` },
    });
    for (const t of [a.token, b.token]) {
      const r = await SELF.fetch("https://api.test/auth/me", { headers: { Authorization: `Bearer ${t}` } });
      expect(r.status).toBe(401);
    }
  });

  it("the raw session token is never stored", async () => {
    const { token } = await signIn();
    const row = await env.DB.prepare("SELECT id FROM sessions").first<any>();
    expect(row.id).not.toBe(token);
    expect(row.id).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
  });

  it("rejects an unknown provider", async () => {
    const r = await SELF.fetch("https://api.test/auth/login?provider=facebook");
    expect(r.status).toBe(400);
  });

  it("404s an unknown path", async () => {
    expect((await SELF.fetch("https://api.test/nope")).status).toBe(404);
  });

  it("state-changing requests from an untrusted origin are refused", async () => {
    const r = await SELF.fetch("https://api.test/auth/logout", {
      method: "POST", headers: { Origin: "https://evil.example" },
    });
    expect(r.status).toBe(403);
    expect((await r.json<any>()).error).toBe("forbidden_origin");
  });
});
