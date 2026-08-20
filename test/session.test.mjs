/* Session cache + startup decision. Run: npm test
   Pure logic — no DOM, no network. */
import { test } from "node:test";
import assert from "node:assert/strict";

// session.js touches localStorage at module scope only inside try/catch,
// so a minimal stub is enough to import it under node.
globalThis.localStorage = {
  _d: {},
  getItem(k) { return k in this._d ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};

const {
  readSession, writeSession, clearSession,
  isExpired, isWithinGrace, graceDaysRemaining, resolveStartup,
} = await import("../src/assets/js/auth/session.js");

const user = { id: "u1", email: "a@example.com", handle: "BrassKestrel482" };
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const ahead = (ms) => new Date(Date.now() + ms).toISOString();
const DAY = 86400000;

test("round-trips a session and clears it", () => {
  clearSession();
  assert.equal(readSession(), null);
  writeSession(user, ahead(30 * DAY));
  assert.equal(readSession().user.handle, "BrassKestrel482");
  clearSession();
  assert.equal(readSession(), null);
});

test("stores no token — only a display profile and timestamps", () => {
  clearSession();
  writeSession(user, ahead(30 * DAY));
  const raw = JSON.stringify(readSession());
  // The real session is an HttpOnly cookie; nothing token-shaped should
  // ever appear in localStorage.
  assert.ok(!/token|secret|bearer/i.test(raw), raw);
  assert.deepEqual(Object.keys(readSession()).sort(), ["expiresAt", "lastVerifiedAt", "user"]);
});

test("survives corrupt storage instead of crashing the boot", () => {
  localStorage.setItem("tt:session.v1", "{not json");
  assert.equal(readSession(), null);
  clearSession();
});

test("expiry is honoured", () => {
  assert.equal(isExpired({ user, expiresAt: ago(DAY) }), true);
  assert.equal(isExpired({ user, expiresAt: ahead(DAY) }), false);
  assert.equal(isExpired({ user }), false); // unknown expiry is not expiry
});

test("grace keeps a verified session usable offline", () => {
  assert.equal(isWithinGrace({ lastVerifiedAt: ago(3 * DAY) }), true);
  assert.equal(isWithinGrace({ lastVerifiedAt: ago(20 * DAY) }), false);
  assert.equal(graceDaysRemaining({ lastVerifiedAt: ago(4 * DAY) }), 10);
  assert.equal(graceDaysRemaining({ lastVerifiedAt: ago(99 * DAY) }), 0);
});

test("startup: no session means anonymous, which is a full experience here", () => {
  assert.deepEqual(resolveStartup(null), { state: "signed-out" });
});

test("startup: a fresh session paints immediately and revalidates behind the scenes", () => {
  const r = resolveStartup({ user, expiresAt: ahead(30 * DAY), lastVerifiedAt: ago(DAY) });
  assert.equal(r.state, "signed-in");
  assert.equal(r.revalidate, true);
});

test("startup: past grace, verify before trusting", () => {
  const r = resolveStartup({ user, expiresAt: ahead(30 * DAY), lastVerifiedAt: ago(20 * DAY) });
  assert.equal(r.state, "verify");
});

test("startup: a hard-expired session signs out regardless of grace", () => {
  const r = resolveStartup({ user, expiresAt: ago(DAY), lastVerifiedAt: ago(1000) });
  assert.equal(r.state, "signed-out");
  assert.equal(r.reason, "expired");
});
