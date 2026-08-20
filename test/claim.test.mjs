/* Claim + shape conversion. Run: npm test */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planClaim, applyClaim, isEmptyProfile, describeClaim } from "../src/assets/js/auth/claimLocal.js";
import { toSyncProfile, toLocalProfile, isSlotted, ensureSync, SPECS } from "../src/assets/js/sync/shape.js";
import { flattenSlots } from "../src/assets/js/sync/merge.js";

const eq = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));

function local(over = {}) {
  return {
    version: 5, id: "p-local", name: "Default", createdAt: "2026-01-01T00:00:00.000Z",
    settings: {}, preferences: {},
    lifetime: { sessions: 0, chars: 0, correctChars: 0, totalMs: 0, bestWpm: 0, bestAccuracy: 0, streakDays: 0, lastDay: null },
    perKey: {}, perBigram: {}, perFinger: {}, perCharDetail: {},
    missedWords: {}, missedWordsPeak: 0, sessions: [], daily: {}, hourly: {},
    achievements: [], modeBests: {}, challengeBests: {}, lessonResults: [],
    sessionsByLesson: {}, bookProgress: {}, corpusProgress: {},
    gameStats: { rounds: 0, totalCaught: 0, highScore: 0, bestStreak: 0, byMode: {} },
    ...over,
  };
}
const withWork = (over = {}) => local({
  sessions: [{ id: "s1", at: "2026-03-01T10:00:00.000Z", wpm: 60, acc: 97, chars: 100, correctChars: 97, ms: 30000, suspect: false }],
  lifetime: { ...local().lifetime, sessions: 1 },
  perKey: { a: { n: 10, errors: 2, sumMs: 1200 } },
  daily: { "2026-03-01": { sessions: 1, timeMs: 30000, chars: 100 } },
  ...over,
});

/* ---------------- shape ---------------- */

test("lifting to slotted then folding back is a round trip", () => {
  const p = withWork();
  const back = toLocalProfile(toSyncProfile(p, "devA"));
  eq(back.perKey, p.perKey);
  eq(back.daily, p.daily);
});

test("perCharDetail keeps lastSeen/lastError through the round trip", () => {
  // A generic model spec would silently drop these, and the adaptive
  // engine uses lastSeen to decay stale characters.
  const p = local({ perCharDetail: { a: { n: 3, errors: 1, sumMs: 300, lastSeen: 1700, lastError: 1650 } } });
  const back = toLocalProfile(toSyncProfile(p, "devA"));
  eq(back.perCharDetail.a, { n: 3, errors: 1, sumMs: 300, lastSeen: 1700, lastError: 1650 });
});

test("isSlotted distinguishes the two shapes", () => {
  assert.equal(isSlotted(withWork()), false);
  assert.equal(isSlotted(toSyncProfile(withWork(), "devA")), true);
  assert.equal(isSlotted(local()), false); // empty maps -> treated as flat
});

test("ensureSync is idempotent — double-lifting would zero the counters", () => {
  const once = ensureSync(withWork(), "devA");
  const twice = ensureSync(once, "devA");
  eq(twice, once);
  eq(flattenSlots(twice.perKey, SPECS.perKey), { a: { n: 10, errors: 2, sumMs: 1200 } });
});

/* ---------------- planning ---------------- */

test("first claim adds every local profile", () => {
  const plan = planClaim([withWork()], []);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].action, "add");
});

test("same id merges rather than duplicating", () => {
  // The second-device case: this profile was already claimed elsewhere.
  const plan = planClaim([withWork()], [local({ id: "p-local" })]);
  assert.equal(plan[0].action, "merge");
  assert.equal(plan[0].reason, "same-id");
});

test("two untouched Defaults with different ids merge", () => {
  // Both devices auto-created a "Default" at first run. Neither is real
  // work, so ending up with two "Default" profiles would be nonsense.
  const plan = planClaim([local({ id: "p-a" })], [local({ id: "p-b" })]);
  assert.equal(plan[0].action, "merge");
  assert.equal(plan[0].reason, "same-name-one-empty");
});

test("two Defaults that BOTH contain real work are kept separate", () => {
  // The dangerous case. Silently fusing two real practice histories
  // under one name would be unrecoverable, so we keep both.
  const plan = planClaim([withWork({ id: "p-a" })], [withWork({ id: "p-b" })]);
  assert.equal(plan[0].action, "add");
});

test("two local Defaults cannot both claim the same account profile", () => {
  const plan = planClaim([local({ id: "p-a" }), local({ id: "p-b" })], [local({ id: "p-acct" })]);
  assert.deepEqual(plan.map((s) => s.action), ["merge", "add"]);
});

test("malformed profiles are skipped, not thrown on", () => {
  const plan = planClaim([null, { name: "no id" }, withWork()], []);
  assert.deepEqual(plan.map((s) => s.action), ["skip", "skip", "add"]);
});

/* ---------------- applying ---------------- */

test("claim preserves ids so a second device does not double the data", () => {
  const laptopWork = withWork({ id: "p-1" });
  const first = applyClaim([laptopWork], [], "devA");
  assert.equal(first.profiles[0].id, "p-1");

  // Same work, claimed again from a second device.
  const second = applyClaim([laptopWork], first.profiles, "devB");
  assert.equal(second.profiles.length, 1, "must reconcile as one profile, not two");
  assert.equal(second.report.merged, 1);
  assert.equal(second.profiles[0].lifetime.sessions, 1, "session must not be counted twice");
});

test("claiming the same thing repeatedly is idempotent", () => {
  const p = withWork({ id: "p-1" });
  let acct = applyClaim([p], [], "devA").profiles;
  for (let i = 0; i < 3; i++) acct = applyClaim([p], acct, "devA").profiles;
  assert.equal(acct.length, 1);
  assert.equal(acct[0].lifetime.sessions, 1);
  eq(flattenSlots(acct[0].perKey, SPECS.perKey), { a: { n: 10, errors: 2, sumMs: 1200 } });
});

test("genuinely different work from two devices is summed, not lost", () => {
  const laptop = withWork({ id: "p-1" });
  const phone = withWork({
    id: "p-1",
    sessions: [{ id: "s2", at: "2026-03-05T10:00:00.000Z", wpm: 70, acc: 98, chars: 200, correctChars: 196, ms: 40000, suspect: false }],
    perKey: { a: { n: 5, errors: 1, sumMs: 600 } },
    daily: { "2026-03-05": { sessions: 1, timeMs: 40000, chars: 200 } },
  });
  const acct = applyClaim([laptop], [], "devA").profiles;
  const merged = applyClaim([phone], acct, "devB").profiles[0];

  assert.equal(merged.lifetime.sessions, 2);
  // Per-device slots, so the two models add up rather than clobbering.
  eq(flattenSlots(merged.perKey, SPECS.perKey), { a: { n: 15, errors: 3, sumMs: 1800 } });
});

test("the local profiles are never mutated", () => {
  const p = withWork({ id: "p-1" });
  const snapshot = JSON.parse(JSON.stringify(p));
  applyClaim([p], [local({ id: "p-1" })], "devA");
  eq(p, snapshot); // commitment 1: nothing is destroyed
});

test("one bad profile does not cost the others", () => {
  // Commitment 2: partial failure is reported, not swallowed.
  const poison = withWork({ id: "p-bad" });
  Object.defineProperty(poison, "sessions", { get() { throw new Error("boom"); } });
  const { profiles, report } = applyClaim([withWork({ id: "p-ok" }), poison], [], "devA");
  assert.equal(report.added, 1);
  assert.equal(report.failed.length, 1);
  assert.equal(report.failed[0].id, "p-bad");
  assert.equal(profiles.length, 1);
});

test("describeClaim tells the truth about failures", () => {
  assert.match(describeClaim({ merged: 0, added: 0, skipped: [], failed: [] }), /Nothing to move/);
  const msg = describeClaim({ merged: 1, added: 2, skipped: [], failed: [{ id: "x" }] });
  assert.match(msg, /2 profiles added/);
  assert.match(msg, /1 merged/);
  assert.match(msg, /still on this device/);
});

test("isEmptyProfile only counts real practice", () => {
  assert.equal(isEmptyProfile(local()), true);
  assert.equal(isEmptyProfile(withWork()), false);
  assert.equal(isEmptyProfile(null), true);
});
