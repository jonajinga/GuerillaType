/* The email-verification branch. The implementation this is ported from
   referenced a providers.test.ts that did not exist, leaving this
   untested -- and it is the account-linking SECURITY boundary: db.ts
   links a second provider to an existing account by matching email, so
   accepting an UNVERIFIED address would let anyone who can set an email
   at one provider take over an account at another. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchProfile } from "../src/auth/providers.js";

const jsonRes = (body: unknown, ok = true) =>
  new Response(JSON.stringify(body), { status: ok ? 200 : 401, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("google", () => {
  it("accepts a verified email", async () => {
    vi.stubGlobal("fetch", async () => jsonRes({ sub: "g1", email: "a@example.com", email_verified: true, name: "A" }));
    const p = await fetchProfile("google", "tok");
    expect(p).toMatchObject({ providerUserId: "g1", email: "a@example.com" });
  });

  it("REJECTS an unverified email", async () => {
    vi.stubGlobal("fetch", async () => jsonRes({ sub: "g1", email: "a@example.com", email_verified: false }));
    await expect(fetchProfile("google", "tok")).rejects.toMatchObject({ status: 403, code: "email_unverified" });
  });

  it("rejects a missing email", async () => {
    vi.stubGlobal("fetch", async () => jsonRes({ sub: "g1", email_verified: true }));
    await expect(fetchProfile("google", "tok")).rejects.toMatchObject({ code: "email_unverified" });
  });

  it("treats a merely truthy email_verified as unverified", async () => {
    // Google has historically sent the string "true"; === true is the
    // only check that cannot be fooled by a loose value.
    vi.stubGlobal("fetch", async () => jsonRes({ sub: "g1", email: "a@example.com", email_verified: "true" }));
    await expect(fetchProfile("google", "tok")).rejects.toMatchObject({ code: "email_unverified" });
  });
});

describe("github", () => {
  const stub = (emails: unknown) => vi.stubGlobal("fetch", async (url: string) =>
    String(url).endsWith("/user/emails")
      ? jsonRes(emails)
      : jsonRes({ id: 42, login: "octo", name: "Octo", avatar_url: "http://img" }));

  it("prefers the primary verified address", async () => {
    stub([{ email: "other@x.com", primary: false, verified: true }, { email: "main@x.com", primary: true, verified: true }]);
    const p = await fetchProfile("github", "tok");
    expect(p).toMatchObject({ providerUserId: "42", email: "main@x.com" });
  });

  it("falls back to any verified address when none is primary", async () => {
    stub([{ email: "only@x.com", primary: false, verified: true }]);
    expect((await fetchProfile("github", "tok")).email).toBe("only@x.com");
  });

  it("REJECTS when the primary address is unverified and no other is verified", async () => {
    stub([{ email: "main@x.com", primary: true, verified: false }]);
    await expect(fetchProfile("github", "tok")).rejects.toMatchObject({ status: 403, code: "email_unverified" });
  });

  it("rejects an empty email list", async () => {
    stub([]);
    await expect(fetchProfile("github", "tok")).rejects.toMatchObject({ code: "email_unverified" });
  });
});
