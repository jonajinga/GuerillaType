/* Sync scheduler. Run: npm test
   No DOM, no real network — the point is the retry/failure policy. */
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.localStorage = {
  _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; },
  get length() { return Object.keys(this._d).length; },
  key(i) { return Object.keys(this._d)[i] ?? null; },
};
// Node provides a real crypto global (getter-only), and it already has
// randomUUID -- which is what getDeviceId() needs.

const calls = [];
let handler = async () => ({ ok: true });
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), method: (init && init.method) || "GET" });
  return handler(String(url), init);
};
globalThis.document = { querySelector: () => null };

const res = (status, body = {}) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});

const { markDirty, flush, pendingCount, __reset } = await import("../src/assets/js/sync/outbox.js");

const PROFILE = { id: "p-1", name: "Default", perKey: { a: { n: 1, errors: 0, sumMs: 10 } }, daily: {}, hourly: {}, missedWords: {}, perBigram: {}, perFinger: {}, perCharDetail: {} };
const getProfiles = () => [PROFILE];

function reset() { __reset(); calls.length = 0; handler = async () => res(200); }

test("nothing to push means nothing sent", async () => {
  reset();
  const r = await flush(getProfiles);
  assert.equal(r.pushed, 0);
  assert.equal(calls.length, 0);
});

test("a dirty profile is pushed once and cleared", async () => {
  reset();
  markDirty("p-1");
  assert.equal(pendingCount(), 1);
  const r = await flush(getProfiles);
  assert.equal(r.pushed, 1);
  assert.equal(pendingCount(), 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "PUT");
  assert.match(calls[0].url, /\/sync\/p-1\?device=/);
});

test("the pushed body is in the slotted shape, keyed by device", async () => {
  reset();
  let seen = null;
  handler = async (_u, init) => { seen = JSON.parse(init.body); return res(200); };
  markDirty("p-1");
  await flush(getProfiles);
  // Counters must arrive under this device's slot, not flat -- that is
  // what makes a repeated push idempotent server-side.
  const slot = Object.keys(seen.perKey.a)[0];
  assert.equal(typeof slot, "string");
  assert.deepEqual(seen.perKey.a[slot], { n: 1, errors: 0, sumMs: 10 });
});

test("a failed push stays dirty so the next trigger retries", async () => {
  reset();
  handler = async () => { throw new TypeError("network down"); };
  markDirty("p-1");
  const r = await flush(getProfiles);
  assert.equal(r.pushed, 0);
  assert.equal(pendingCount(), 1, "must remain queued");

  // Recover, and the retry succeeds. Retry is free because the server
  // stores one blob per device and re-sending is a no-op.
  handler = async () => res(200);
  const r2 = await flush(getProfiles);
  assert.equal(r2.pushed, 1);
  assert.equal(pendingCount(), 0);
});

test("a 5xx stops the run but keeps the work queued", async () => {
  reset();
  handler = async () => res(503, { error: "unavailable" });
  markDirty("p-1");
  const r = await flush(getProfiles);
  assert.equal(r.pushed, 0);
  assert.equal(pendingCount(), 1);
});

test("a 401 clears the queue — signed out, nothing to retry", async () => {
  reset();
  handler = async () => res(401, { error: "unauthenticated" });
  markDirty("p-1");
  await flush(getProfiles);
  assert.equal(pendingCount(), 0, "retrying a signed-out push forever helps nobody");
});

test("pushing repeatedly does not duplicate work", async () => {
  reset();
  markDirty("p-1"); markDirty("p-1"); markDirty("p-1");
  assert.equal(pendingCount(), 1, "the queue is a set");
  await flush(getProfiles);
  assert.equal(calls.length, 1);
});

test("a profile that vanished is dropped rather than retried forever", async () => {
  reset();
  markDirty("p-gone");
  const r = await flush(getProfiles);
  assert.equal(r.pushed, 0);
  assert.equal(pendingCount(), 0);
  assert.equal(calls.length, 0);
});

test("overlapping flushes collapse instead of double-sending", async () => {
  reset();
  let release;
  handler = async () => { await new Promise((r) => { release = r; }); return res(200); };
  markDirty("p-1");
  const a = flush(getProfiles);
  const b = await flush(getProfiles);   // must no-op while a is in flight
  assert.equal(b.pushed, 0);
  release();
  await a;
  assert.equal(calls.length, 1);
});
