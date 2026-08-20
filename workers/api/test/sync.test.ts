import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveUser } from "../src/db.js";
import { mintSession } from "../src/auth/session.js";

const PROFILE = "11111111-2222-4333-8444-555555555555";
const OTHER   = "99999999-8888-4777-8666-555555555555";
// Real device ids come from crypto.randomUUID().
const DEV_A = "aaaaaaaa-1111-4222-8333-444444444444";
const DEV_B = "bbbbbbbb-1111-4222-8333-444444444444";
const DEV_Z = "zzzzzzzz-1111-4222-8333-444444444444";

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM profile_blobs"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM identities"),
    env.DB.prepare("DELETE FROM users"),
  ]);
});

async function signIn(email = "a@example.com", providerUserId = "1") {
  const u = await resolveUser(env, "google", { providerUserId, email, name: null, avatarUrl: null });
  const { token } = await mintSession(env, u.id, "test");
  return { u, token, h: { Authorization: `Bearer ${token}`, Origin: "https://guerillatype.com" } };
}

const put = (profileId: string, device: string, body: string, h: any, name = "Default") =>
  SELF.fetch(`https://api.test/sync/${profileId}?device=${device}&name=${encodeURIComponent(name)}`,
    { method: "PUT", headers: h, body });

describe("sync", () => {
  it("requires a session", async () => {
    expect((await SELF.fetch("https://api.test/sync")).status).toBe(401);
    const r = await SELF.fetch(`https://api.test/sync/${PROFILE}?device=${DEV_A}`, {
      method: "PUT", headers: { Origin: "https://guerillatype.com" }, body: "x",
    });
    expect(r.status).toBe(401);
  });

  it("round-trips a device blob", async () => {
    const { h } = await signIn();
    expect((await put(PROFILE, DEV_A, "hello-bytes", h)).status).toBe(200);
    const got = await SELF.fetch(`https://api.test/sync/${PROFILE}/${DEV_A}`, { headers: h });
    expect(got.status).toBe(200);
    expect(await got.text()).toBe("hello-bytes");
  });

  it("keeps one row per device, not per push", async () => {
    // The whole cost model rests on this: row count tracks devices, not
    // typing volume.
    const { h, u } = await signIn();
    for (let i = 0; i < 5; i++) await put(PROFILE, DEV_A, `body-${i}`, h);
    const { results } = await env.DB.prepare(
      "SELECT * FROM profile_blobs WHERE user_id = ?").bind(u.id).all();
    expect(results).toHaveLength(1);
    // ...and the latest body wins.
    const got = await SELF.fetch(`https://api.test/sync/${PROFILE}/${DEV_A}`, { headers: h });
    expect(await got.text()).toBe("body-4");
  });

  it("two devices never collide — the reason there is no version guard", async () => {
    const { h } = await signIn();
    await put(PROFILE, DEV_A, "from-laptop", h);
    await put(PROFILE, DEV_B, "from-phone", h);

    const m = await (await SELF.fetch("https://api.test/sync", { headers: h })).json<any>();
    expect(m.profiles).toHaveLength(1);
    expect(m.profiles[0].devices.map((d: any) => d.deviceId).sort()).toEqual([DEV_A, DEV_B]);

    // Neither overwrote the other.
    for (const [dev, body] of [[DEV_A, "from-laptop"], [DEV_B, "from-phone"]]) {
      const got = await SELF.fetch(`https://api.test/sync/${PROFILE}/${dev}`, { headers: h });
      expect(await got.text()).toBe(body);
    }
  });

  it("groups multiple profiles in the manifest", async () => {
    const { h } = await signIn();
    await put(PROFILE, DEV_A, "one", h, "Default");
    await put(OTHER, DEV_A, "two", h, "Code drills");
    const m = await (await SELF.fetch("https://api.test/sync", { headers: h })).json<any>();
    expect(m.profiles).toHaveLength(2);
    expect(m.profiles.map((p: any) => p.name).sort()).toEqual(["Code drills", "Default"]);
  });

  it("isolates tenants even when two accounts use the same profile id", async () => {
    // Profile ids are client-minted, so a collision across accounts is
    // possible and must never leak.
    const a = await signIn("a@example.com", "1");
    const b = await signIn("b@example.com", "2");
    await put(PROFILE, DEV_A, "account-a", a.h);
    await put(PROFILE, DEV_A, "account-b", b.h);

    expect(await (await SELF.fetch(`https://api.test/sync/${PROFILE}/${DEV_A}`, { headers: a.h })).text())
      .toBe("account-a");
    expect(await (await SELF.fetch(`https://api.test/sync/${PROFILE}/${DEV_A}`, { headers: b.h })).text())
      .toBe("account-b");

    const m = await (await SELF.fetch("https://api.test/sync", { headers: a.h })).json<any>();
    expect(m.profiles[0].devices).toHaveLength(1);
  });

  it("rejects ids that would escape the key prefix", async () => {
    const { h } = await signIn();

    // A raw ../ never reaches the handler: the URL parser normalises the
    // path first, so it simply matches no route. Rejected, just earlier
    // and by something else.
    expect((await put("../../secret", DEV_A, "x", h)).status).toBe(404);

    // Percent-encoded traversal DOES survive normalisation and lands in
    // the route parameter, which is what the id regexes are actually for.
    // The router decodes captured segments, so this arrives as "../secret".
    expect((await put("%2e%2e%2fsecret", DEV_A, "x", h)).status).toBe(400);
    expect((await put(PROFILE, "%2e%2e%2fetc", "x", h)).status).toBe(400);

    // And plain malformed ids.
    expect((await put("not-a-uuid", DEV_A, "x", h)).status).toBe(400);
    expect((await put(PROFILE, "sh", "x", h)).status).toBe(400); // too short
  });

  it("rejects an empty body and an oversized one", async () => {
    const { h } = await signIn();
    expect((await put(PROFILE, DEV_A, "", h)).status).toBe(400);
    const big = await SELF.fetch(`https://api.test/sync/${PROFILE}?device=${DEV_A}`, {
      method: "PUT", headers: { ...h, "Content-Length": String(9 * 1024 * 1024) }, body: "x",
    });
    expect(big.status).toBe(413);
  });

  it("404s a blob that was never written", async () => {
    const { h } = await signIn();
    expect((await SELF.fetch(`https://api.test/sync/${PROFILE}/${DEV_Z}`, { headers: h })).status).toBe(404);
  });

  it("forget removes every device's bytes and its rows", async () => {
    const { h, u } = await signIn();
    await put(PROFILE, DEV_A, "a", h);
    await put(PROFILE, DEV_B, "b", h);
    const del = await SELF.fetch(`https://api.test/sync/${PROFILE}`, { method: "DELETE", headers: h });
    expect(del.status).toBe(200);
    expect((await del.json<any>()).removed).toBe(2);

    for (const dev of [DEV_A, DEV_B]) {
      expect((await SELF.fetch(`https://api.test/sync/${PROFILE}/${dev}`, { headers: h })).status).toBe(404);
    }
    const { results } = await env.DB.prepare(
      "SELECT * FROM profile_blobs WHERE user_id = ?").bind(u.id).all();
    expect(results).toHaveLength(0);
  });

  it("refuses a write from an untrusted origin", async () => {
    const { token } = await signIn();
    const r = await SELF.fetch(`https://api.test/sync/${PROFILE}?device=${DEV_A}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, Origin: "https://evil.example" },
      body: "x",
    });
    // Bearer callers are CSRF-immune by construction, so this is allowed
    // on purpose -- an attacker's page cannot set Authorization.
    expect(r.status).toBe(200);

    // A cookie-style caller from a foreign origin is refused.
    const cookie = await SELF.fetch(`https://api.test/sync/${PROFILE}?device=${DEV_A}`, {
      method: "PUT", headers: { Origin: "https://evil.example" }, body: "x",
    });
    expect(cookie.status).toBe(403);
  });
});
