import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveUser, listIdentities } from "../src/db.js";

const profile = (over: Partial<any> = {}) => ({
  providerUserId: "1", email: "writer@example.com", name: "Writer", avatarUrl: null, ...over,
});

// isolatedStorage is per FILE, not per test, so reset between cases.
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM identities"),
    env.DB.prepare("DELETE FROM users"),
  ]);
});

describe("account resolution", () => {
  it("creates an account on first sign-in, with a generated handle", async () => {
    const u = await resolveUser(env, "google", profile());
    expect(u.email).toBe("writer@example.com");
    // Generated, never user-supplied: AdjectiveNoun###
    expect(u.handle).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{3}$/);
  });

  it("is idempotent — signing in again reuses the same account", async () => {
    const a = await resolveUser(env, "google", profile());
    const b = await resolveUser(env, "google", profile());
    expect(b.id).toBe(a.id);
    const { results } = await env.DB.prepare("SELECT id FROM users").all();
    expect(results).toHaveLength(1);
  });

  it("links a second provider by VERIFIED email instead of forking the account", async () => {
    const g = await resolveUser(env, "google", profile());
    const h = await resolveUser(env, "github", profile({ providerUserId: "99" }));
    expect(h.id).toBe(g.id);
    expect(await listIdentities(env, g.id)).toEqual(["github", "google"]);
  });

  it("never merges two different people", async () => {
    const a = await resolveUser(env, "google", profile({ email: "a@example.com" }));
    const b = await resolveUser(env, "google", profile({ providerUserId: "2", email: "b@example.com" }));
    expect(b.id).not.toBe(a.id);
  });

  it("matches email case-insensitively", async () => {
    const a = await resolveUser(env, "google", profile({ email: "Writer@Example.com" }));
    const b = await resolveUser(env, "github", profile({ providerUserId: "7", email: "writer@example.com" }));
    expect(b.id).toBe(a.id);
  });

  it("refreshes display fields without creating an account", async () => {
    const a = await resolveUser(env, "google", profile());
    const b = await resolveUser(env, "google", profile({ name: "New Name" }));
    expect(b.id).toBe(a.id);
    expect(b.name).toBe("New Name");
  });

  it("keeps the handle stable across sign-ins", async () => {
    const a = await resolveUser(env, "google", profile());
    const b = await resolveUser(env, "google", profile({ name: "x" }));
    expect(b.handle).toBe(a.handle);
  });
});
