/* Merge laws. Run: npm test
   Uses node:test — no new dependency, matching the project's
   no-build-tooling posture. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeProfiles, unionById, mergeSlots, flattenSlots, toSlots,
  flattenCounterSlots, toCounterSlots, lwwFields, recomputeStreak, deriveLifetime,
  MODEL_SPEC, BUCKET_SPEC, MISS_SPEC,
} from "../src/assets/js/sync/merge.js";

const eq = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));

function session(id, at, over = {}) {
  return { id, at, mode: "time", wpm: 60, acc: 97, chars: 100, correctChars: 97, ms: 30000, suspect: false, ...over };
}

function profile(over = {}) {
  return {
    version: 5, id: "p1", name: "Default", createdAt: "2026-01-01T00:00:00.000Z",
    settings: { theme: "dark", layout: "qwerty" }, preferences: { soundTheme: "off" },
    lifetime: { sessions: 0, chars: 0, correctChars: 0, totalMs: 0, bestWpm: 0, bestAccuracy: 0, streakDays: 0, lastDay: null },
    perKey: {}, perBigram: {}, perFinger: {}, perCharDetail: {},
    missedWords: {}, missedWordsPeak: 0, sessions: [], daily: {}, hourly: {},
    achievements: [], modeBests: {}, challengeBests: {}, lessonResults: [],
    sessionsByLesson: {}, bookProgress: {}, corpusProgress: {},
    gameStats: { rounds: 0, totalCaught: 0, highScore: 0, bestStreak: 0, byMode: {} },
    ...over,
  };
}

/* Two devices, genuinely disjoint work — the real-world case. */
const laptop = profile({
  sessions: [session("s1", "2026-03-01T10:00:00.000Z"), session("s2", "2026-03-02T10:00:00.000Z", { wpm: 80 })],
  daily: toSlots({ "2026-03-01": { sessions: 1, timeMs: 30000, chars: 100 }, "2026-03-02": { sessions: 1, timeMs: 30000, chars: 100 } }, "devA"),
  perKey: toCounterSlots({ a: { n: 10, errors: 2, sumMs: 1200 } }, "devA"),
  achievements: ["first-steps"], missedWords: toSlots({ the: { n: 3, last: 1000 } }, "devA"),
  modeBests: { "time:60": { wpm: 80, acc: 97, at: "2026-03-02T10:00:00.000Z" } },
});
const phone = profile({
  sessions: [session("s3", "2026-03-03T10:00:00.000Z", { wpm: 70 })],
  daily: toSlots({ "2026-03-03": { sessions: 1, timeMs: 30000, chars: 100 } }, "devB"),
  perKey: toCounterSlots({ a: { n: 5, errors: 1, sumMs: 600 } }, "devB"),
  achievements: ["night-owl"], missedWords: toSlots({ the: { n: 2, last: 2000 } }, "devB"),
  modeBests: { "time:60": { wpm: 70, acc: 99, at: "2026-03-03T10:00:00.000Z" } },
});

test("commutative — merge(a,b) === merge(b,a)", () => {
  eq(mergeProfiles(laptop, phone), mergeProfiles(phone, laptop));
});

test("associative — grouping does not matter", () => {
  const c = profile({ sessions: [session("s4", "2026-03-04T10:00:00.000Z")],
    daily: toSlots({ "2026-03-04": { sessions: 1, timeMs: 30000, chars: 100 } }, "devC") });
  eq(mergeProfiles(mergeProfiles(laptop, phone), c), mergeProfiles(laptop, mergeProfiles(phone, c)));
});

test("idempotent — merging a profile with itself changes nothing", () => {
  // The law that protects against a retried flush inflating stats.
  // Stated over the MERGED form: merge normalizes (derives lifetime,
  // recomputes the streak, sorts achievements), whereas merge(a, null)
  // is a documented short-circuit that returns `a` untouched. Comparing
  // against that would test the short-circuit, not the law.
  const m = mergeProfiles(laptop, laptop);
  eq(mergeProfiles(m, m), m);
  eq(flattenCounterSlots(m.perKey), { a: { n: 10, errors: 2, sumMs: 1200 } });
  assert.equal(m.lifetime.sessions, 2);
});

test("idempotent — replaying the same merge is a no-op", () => {
  const once = mergeProfiles(laptop, phone);
  eq(mergeProfiles(once, phone), once);
  eq(mergeProfiles(once, laptop), once);
  eq(mergeProfiles(once, once), once);
});

test("sessions union by id, never double-counted", () => {
  const m = mergeProfiles(laptop, phone);
  assert.equal(m.sessions.length, 3);
  assert.equal(m.lifetime.sessions, 3);
  // Replay must not turn 3 into 6.
  assert.equal(mergeProfiles(m, phone).lifetime.sessions, 3);
});

test("adaptive model sums ACROSS devices but replaces WITHIN a device", () => {
  const m = mergeProfiles(laptop, phone);
  eq(flattenCounterSlots(m.perKey), { a: { n: 15, errors: 3, sumMs: 1800 } });
  // Same device pushing again replaces its own slot — no inflation.
  const again = mergeProfiles(m, phone);
  eq(flattenCounterSlots(again.perKey), { a: { n: 15, errors: 3, sumMs: 1800 } });
  // A device revising its own counters upward replaces, not adds.
  const grown = profile({ perKey: toCounterSlots({ a: { n: 9, errors: 1, sumMs: 900 } }, "devB") });
  eq(flattenCounterSlots(mergeProfiles(m, grown).perKey), { a: { n: 19, errors: 3, sumMs: 2100 } });
});

test("streak is recomputed from merged days, not carried over", () => {
  // The bug this fixes: laptop Mon+Tue, phone Wed. Each device alone
  // thinks the streak broke; together it is 3 consecutive days.
  const m = mergeProfiles(laptop, phone);
  assert.equal(m.lifetime.streakDays, 3);
  assert.equal(m.lifetime.lastDay, "2026-03-03");
});

test("streak stops at a gap", () => {
  const r = recomputeStreak({
    "2026-03-01": { sessions: 1 }, "2026-03-02": { sessions: 1 },
    "2026-03-05": { sessions: 1 }, "2026-03-06": { sessions: 1 },
  });
  assert.equal(r.streakDays, 2);
  assert.equal(r.lastDay, "2026-03-06");
});

test("personal bests take the whole record, not per-field maxima", () => {
  // 80wpm/97% and 70wpm/99% must not become a fictional 80wpm/99%.
  const m = mergeProfiles(laptop, phone);
  eq(m.modeBests["time:60"], { wpm: 80, acc: 97, at: "2026-03-02T10:00:00.000Z" });
});

test("suspect sessions never set a personal best", () => {
  const cheat = profile({ sessions: [session("s9", "2026-03-09T10:00:00.000Z", { wpm: 400, suspect: true })] });
  assert.equal(deriveLifetime(cheat.sessions, {}).bestWpm, 0);
});

test("achievements union; missedWords counts add and recency takes the later", () => {
  const m = mergeProfiles(laptop, phone);
  eq(m.achievements, ["first-steps", "night-owl"]);
  eq(flattenSlots(m.missedWords, MISS_SPEC).the, { n: 5, last: 2000 });
});

test("settings are LWW per field, not per blob", () => {
  // Theme changed on the laptop, sound on the phone. Both must survive.
  const out = lwwFields(
    { theme: "dark", sound: false }, { theme: "dark", sound: true },
    { theme: "2026-03-05T00:00:00Z", sound: "2026-03-01T00:00:00Z" },
    { theme: "2026-03-01T00:00:00Z", sound: "2026-03-05T00:00:00Z" },
  );
  eq(out, { theme: "dark", sound: true });
});

test("unionById keeps the newest on an id collision and honours the cap", () => {
  const a = [session("x", "2026-01-01T00:00:00Z", { wpm: 10 })];
  const b = [session("x", "2026-06-01T00:00:00Z", { wpm: 99 })];
  assert.equal(unionById(a, b)[0].wpm, 99);
  assert.equal(unionById(a, b).length, 1);
  const many = Array.from({ length: 40 }, (_, i) => session("s" + i, `2026-03-${String(i + 1).padStart(2, "0")}T00:00:00Z`));
  assert.equal(unionById(many, [], "id", 10).length, 10);
});

test("merge tolerates a null or empty counterpart", () => {
  eq(mergeProfiles(laptop, null), laptop);
  eq(mergeProfiles(null, phone), phone);
});

test("counter slots from unrelated devices never collide", () => {
  const merged = mergeSlots(
    { a: { d1: { n: 1, errors: 0, sumMs: 100 } } },
    { a: { d2: { n: 2, errors: 1, sumMs: 200 } } },
  );
  assert.deepEqual(Object.keys(merged.a).sort(), ["d1", "d2"]);
  eq(flattenCounterSlots(merged), { a: { n: 3, errors: 1, sumMs: 300 } });
});

test("slotted counters fold correctly and stay commutative", () => {
  const a = toSlots({ cat: { n: 1, last: 5 } }, "d1");
  const b = toSlots({ cat: { n: 4, last: 2 } }, "d2");
  eq(mergeSlots(a, b), mergeSlots(b, a));
  // n sums across devices, last takes the most recent.
  eq(flattenSlots(mergeSlots(a, b), MISS_SPEC).cat, { n: 5, last: 5 });
});

test("daily buckets never double-count on replay", () => {
  const m = mergeProfiles(laptop, phone);
  const day = flattenSlots(m.daily, BUCKET_SPEC)["2026-03-03"];
  eq(day, { sessions: 1, timeMs: 30000, chars: 100 });
  // The bug the idempotence law caught: this used to become 2 / 60000.
  const replayed = flattenSlots(mergeProfiles(m, phone).daily, BUCKET_SPEC)["2026-03-03"];
  eq(replayed, day);
});

test("two devices active on the SAME day sum, rather than collapsing", () => {
  const a = { ...laptop, daily: toSlots({ "2026-04-01": { sessions: 1, timeMs: 1000, chars: 10 } }, "devA") };
  const b = { ...phone,  daily: toSlots({ "2026-04-01": { sessions: 2, timeMs: 2000, chars: 20 } }, "devB") };
  const day = flattenSlots(mergeProfiles(a, b).daily, BUCKET_SPEC)["2026-04-01"];
  eq(day, { sessions: 3, timeMs: 3000, chars: 30 });
});
