/* Profile merge — the rule that makes multi-device work.

   Typing data is append-mostly and commutative, so merging two devices
   is not a conflict to resolve; it's an arithmetic problem. Every field
   declares HOW it combines, and one table drives the whole thing.

   Three laws every field must satisfy, and the tests enforce all three:

     commutative   merge(a, b)      === merge(b, a)
     associative   merge(merge(a,b), c) === merge(a, merge(b,c))
     idempotent    merge(a, a)      === a

   Idempotence is the one that bites. A flush can be retried — the tab
   closed mid-request, the network dropped, the user has two tabs open —
   so a merge that isn't idempotent silently inflates someone's lifetime
   stats every time a payload is replayed.

   That is exactly why the adaptive model is NOT summed directly. Its
   counters are capped (n<=200 per key, 100 per bigram) and past the cap
   the model switches to exponential decay, so plain addition would both
   double-count on replay and blow past the cap. Instead each device owns
   a slot, a push REPLACES that device's slot, and the value is the sum
   across slots. Replacing is idempotent; summing across independent
   slots is commutative and associative. See mergeCounterSlots.
*/

/* ---------------- primitive merge functions ---------------- */

export const max = (a, b) => (num(a) >= num(b) ? num(a) : num(b));
const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);

/* Union of two arrays of records keyed by id. Later `at` wins on
   collision so an edited record can still be corrected. */
export function unionById(a = [], b = [], idKey = "id", cap = Infinity, sortKey = "at") {
  const byId = new Map();
  for (const r of [...toArr(a), ...toArr(b)]) {
    if (!r || r[idKey] == null) continue;
    const prev = byId.get(r[idKey]);
    if (!prev || String(r[sortKey] || "") > String(prev[sortKey] || "")) byId.set(r[idKey], r);
  }
  const out = [...byId.values()];
  // Newest first, matching how the app stores these (unshift).
  out.sort((x, y) => String(y[sortKey] || "").localeCompare(String(x[sortKey] || "")));
  return cap === Infinity ? out : out.slice(0, cap);
}

/* Per-key max, for records like {wpm, acc, at} where "best" is the
   whole record, not each field independently — taking max per field
   would invent a personal best that never happened. */
export function maxByField(a = {}, b = {}, field = "wpm") {
  const out = {};
  for (const k of keys(a, b)) {
    const x = a && a[k], y = b && b[k];
    if (!x) { out[k] = y; continue; }
    if (!y) { out[k] = x; continue; }
    out[k] = num(y[field]) > num(x[field]) ? y : x;
  }
  return out;
}

/* ---------------- the slot rule ----------------

   EVERY accumulating counter is stored per device:

       { itemKey: { deviceId: {...counters} } }

   A push REPLACES that device's slot and never touches another's, so
   replaying a payload is a no-op. The displayed value is the fold across
   slots. Replace-within + fold-across is idempotent, commutative and
   associative — which plain addition is not.

   This was found the hard way: an earlier draft summed `daily` buckets
   and `missedWords` counts directly, and the idempotence test caught it
   turning one session into two and a miss count of 5 into 7 on replay.
   Anything that accumulates goes through here. */
export function mergeSlots(a = {}, b = {}) {
  const out = {};
  for (const k of keys(a, b)) out[k] = { ...(a[k] || {}), ...(b[k] || {}) };
  return out;
}

/* Fold slots back to the flat shape the app reads. `spec` maps each
   field to how it combines across devices: "sum" or "max". */
export function flattenSlots(slotted = {}, spec) {
  const fields = Object.keys(spec);
  const out = {};
  for (const k of Object.keys(slotted)) {
    const acc = {};
    for (const f of fields) acc[f] = 0;
    for (const dev of Object.keys(slotted[k] || {})) {
      const s = slotted[k][dev] || {};
      for (const f of fields) acc[f] = spec[f] === "max" ? max(acc[f], s[f]) : acc[f] + num(s[f]);
    }
    out[k] = acc;
  }
  return out;
}

/* Lift a flat map into this device's slot, for pushing. */
export function toSlots(flat = {}, deviceId) {
  const out = {};
  for (const k of Object.keys(flat || {})) out[k] = { [deviceId]: flat[k] };
  return out;
}

/* Field specs for the three slotted shapes. */
export const MODEL_SPEC  = { n: "sum", errors: "sum", sumMs: "sum" };
export const BUCKET_SPEC = { sessions: "sum", timeMs: "sum", chars: "sum" };
export const MISS_SPEC   = { n: "sum", last: "max" };

// The adaptive model is just the model-shaped slot; keep the old names.
export const mergeCounterSlots = mergeSlots;
export const toCounterSlots = toSlots;
export const flattenCounterSlots = (x) => flattenSlots(x, MODEL_SPEC);

/* Last-write-wins per FIELD, not per blob. Changing the theme on a
   laptop and the sound on a phone must not clobber each other, which a
   whole-object LWW would do. `ts` maps field -> ISO timestamp; without
   one we keep the local value rather than guess. */
export function lwwFields(a = {}, b = {}, tsA = {}, tsB = {}) {
  const out = { ...a };
  for (const k of keys(a, b)) {
    const ta = String(tsA[k] || ""), tb = String(tsB[k] || "");
    if (k in b && tb > ta) out[k] = b[k];
    else if (k in a) out[k] = a[k];
    else out[k] = b[k];
  }
  return out;
}

export const unionSet = (a = [], b = []) => [...new Set([...toArr(a), ...toArr(b)])];

const toArr = (v) => (Array.isArray(v) ? v : []);
const keys = (a, b) => new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);

/* ---------------- caps, mirrored from the writers ---------------- */
export const CAPS = { sessions: 500, lessonResults: 1000, sessionsByLesson: 200, missedWords: 500 };

/* Same recency-weighted ranking session-recorder.js uses, so a merged
   profile trims to the same 500 words a local one would. */
function weightedMissScore(entry, nowMs) {
  const ageMs = Math.max(0, nowMs - (entry.last || 0));
  return (entry.n || 0) * Math.pow(0.5, ageMs / (14 * 24 * 60 * 60 * 1000));
}
/* Rank on the folded view but prune the SLOTTED map, so trimming can't
   quietly resurrect a word by dropping only one device's contribution. */
function capMissedWordSlots(slotted, nowMs) {
  const kx = Object.keys(slotted);
  if (kx.length <= CAPS.missedWords) return slotted;
  const flat = flattenSlots(slotted, MISS_SPEC);
  kx.sort((x, y) => weightedMissScore(flat[y], nowMs) - weightedMissScore(flat[x], nowMs));
  const out = {};
  for (const k of kx.slice(0, CAPS.missedWords)) out[k] = slotted[k];
  return out;
}

/* ---------------- derived state ---------------- */

/* Streak is RECOMPUTED, never merged. The live writer increments from
   lifetime.lastDay, which diverges the moment a second device is in
   play — practise on a laptop Monday and a phone Tuesday and the streak
   resets instead of reaching 2. Derived from the union of active days,
   it is simply correct. */
export function recomputeStreak(daily = {}) {
  const days = Object.keys(daily).filter((d) => daily[d] && (daily[d].sessions || 0) > 0).sort();
  if (!days.length) return { streakDays: 0, lastDay: null };
  let streak = 1;
  for (let i = days.length - 1; i > 0; i--) {
    if (dayBefore(days[i]) === days[i - 1]) streak++;
    else break;
  }
  return { streakDays: streak, lastDay: days[days.length - 1] };
}
function dayBefore(iso) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* Lifetime totals are DERIVED from the session union, not summed.
   Summing double-counts every session both devices already knew about;
   the union counts each session exactly once, which is also what makes
   the whole merge idempotent. */
export function deriveLifetime(sessions = [], prev = {}) {
  const lt = { sessions: 0, chars: 0, correctChars: 0, totalMs: 0, bestWpm: 0, bestAccuracy: 0 };
  for (const s of sessions) {
    lt.sessions++;
    lt.chars += num(s.chars);
    lt.correctChars += num(s.correctChars);
    lt.totalMs += num(s.ms || s.durMs);
    if (!s.suspect) lt.bestWpm = max(lt.bestWpm, s.wpm);
    lt.bestAccuracy = max(lt.bestAccuracy, s.acc);
  }
  // The local session list is capped at 500, so a long-lived account's
  // true totals live on the server. Never let a derived total go
  // BACKWARDS past what we already recorded.
  lt.bestWpm = max(lt.bestWpm, prev.bestWpm);
  lt.bestAccuracy = max(lt.bestAccuracy, prev.bestAccuracy);
  lt.sessions = max(lt.sessions, prev.sessions);
  lt.chars = max(lt.chars, prev.chars);
  lt.correctChars = max(lt.correctChars, prev.correctChars);
  lt.totalMs = max(lt.totalMs, prev.totalMs);
  return lt;
}

/* ---------------- the whole profile ---------------- */

export function mergeProfiles(a, b, { now = 0 } = {}) {
  if (!a) return b;
  if (!b) return a;

  const sessions = unionById(a.sessions, b.sessions, "id", CAPS.sessions);
  const daily = mergeSlots(a.daily, b.daily);
  // Streak reads the folded day totals, not the raw slots.
  const streak = recomputeStreak(flattenSlots(daily, BUCKET_SPEC));

  return {
    ...a,
    version: max(a.version, b.version),
    // Earliest creation wins — the account is as old as its oldest device.
    createdAt: (a.createdAt || "") < (b.createdAt || "") ? a.createdAt : b.createdAt,

    sessions,
    daily,
    hourly: mergeSlots(a.hourly, b.hourly),

    lifetime: { ...deriveLifetime(sessions, { ...a.lifetime, ...pickMax(a.lifetime, b.lifetime) }), ...streak },

    perKey:        mergeSlots(a.perKey, b.perKey),
    perBigram:     mergeSlots(a.perBigram, b.perBigram),
    perFinger:     mergeSlots(a.perFinger, b.perFinger),
    perCharDetail: mergeSlots(a.perCharDetail, b.perCharDetail),

    missedWords: capMissedWordSlots(mergeSlots(a.missedWords, b.missedWords), now),
    missedWordsPeak: max(a.missedWordsPeak, b.missedWordsPeak),

    achievements:   unionSet(a.achievements, b.achievements).sort(),
    modeBests:      maxByField(a.modeBests, b.modeBests, "wpm"),
    challengeBests: maxByField(a.challengeBests, b.challengeBests, "wpm"),

    lessonResults:    unionById(a.lessonResults, b.lessonResults, "sessionId", CAPS.lessonResults),
    sessionsByLesson: mergeIdLists(a.sessionsByLesson, b.sessionsByLesson, CAPS.sessionsByLesson),

    bookProgress:   mergeBookProgress(a.bookProgress, b.bookProgress),
    corpusProgress: mergeNested(a.corpusProgress, b.corpusProgress, "wpm"),
    gameStats:      mergeGameStats(a.gameStats, b.gameStats),

    settings:    lwwFields(a.settings, b.settings, a.settingsAt, b.settingsAt),
    preferences: lwwFields(a.preferences, b.preferences, a.preferencesAt, b.preferencesAt),
  };
}

function pickMax(a = {}, b = {}) {
  const o = {};
  for (const k of ["sessions", "chars", "correctChars", "totalMs", "bestWpm", "bestAccuracy"]) {
    o[k] = max(a[k], b[k]);
  }
  return o;
}
function mergeIdLists(a = {}, b = {}, cap) {
  const out = {};
  for (const k of keys(a, b)) out[k] = unionSet(a[k], b[k]).slice(0, cap);
  return out;
}
function mergeNested(a = {}, b = {}, field) {
  const out = {};
  for (const k of keys(a, b)) out[k] = maxByField(a[k], b[k], field);
  return out;
}
function mergeBookProgress(a = {}, b = {}) {
  const out = {};
  for (const slug of keys(a, b)) {
    const x = a[slug] || {}, y = b[slug] || {};
    out[slug] = {
      typed: maxByField(x.typed, y.typed, "wpm"),
      // Furthest read position wins; a device that fell behind must not
      // drag the reader back to an earlier chapter.
      lastChapter: max(x.lastChapter, y.lastChapter),
      lastParagraphId: max(x.lastParagraphId, y.lastParagraphId),
    };
  }
  return out;
}
function mergeGameStats(a = {}, b = {}) {
  const byMode = {};
  for (const m of keys(a.byMode, b.byMode)) {
    const x = (a.byMode && a.byMode[m]) || {}, y = (b.byMode && b.byMode[m]) || {};
    byMode[m] = {
      highScore: max(x.highScore, y.highScore),
      bestStreak: max(x.bestStreak, y.bestStreak),
      // Rounds/caught are lifetime tallies, so max (not sum) — summing
      // would double-count every round both devices already knew about.
      rounds: max(x.rounds, y.rounds),
      totalCaught: max(x.totalCaught, y.totalCaught),
      lastPlayedAt: max(x.lastPlayedAt, y.lastPlayedAt),
    };
  }
  return {
    rounds: max(a.rounds, b.rounds),
    totalCaught: max(a.totalCaught, b.totalCaught),
    highScore: max(a.highScore, b.highScore),
    bestStreak: max(a.bestStreak, b.bestStreak),
    byMode,
  };
}
