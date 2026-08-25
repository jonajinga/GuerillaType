/* Adaptive model. Holds two stores:
     perKey   — { ch: {n, errors, sumMs} }
     perBigram— { ab: {n, errors, sumMs} }
   Updated each keystroke via record(prev, ch, correct, keyMs).
   Derives weak() / weakBigram() rates that the wordpicker consumes. */

import { bigramsOf } from "./bigrams.js";
import { laplaceRate, mean, stdev, clamp } from "../util/stats-math.js";
import { fingerForKey } from "./layouts.js";

const MAX_KEY_N = 200;
const MAX_BG_N = 100;

export class AdaptiveModel {
  constructor(state, opts = {}) {
    this.perKey = state?.perKey || {};
    this.perBigram = state?.perBigram || {};
    // v2 stores — populated as the user types. Carry-forward existing
    // values so per-profile data accrues across sessions.
    this.perFinger = state?.perFinger || {};
    this.perCharDetail = state?.perCharDetail || {};
    this.layout = opts.layout || (state?.settings && state.settings.layout) || "qwerty";
  }

  record(prev, ch, correct, keyMs) {
    if (typeof ch !== "string") return;
    if (!ch || ch === "" ) return;
    // Per-key
    const e = this.perKey[ch] || { n: 0, errors: 0, sumMs: 0 };
    if (e.n < MAX_KEY_N) {
      e.n++;
      if (!correct) e.errors++;
      if (Number.isFinite(keyMs) && keyMs > 0 && keyMs < 2000) e.sumMs += keyMs;
    } else {
      // Rolling: bias old data slightly down, then add new sample.
      e.n = MAX_KEY_N;
      e.errors = e.errors * 0.95 + (correct ? 0 : 1);
      if (Number.isFinite(keyMs) && keyMs > 0 && keyMs < 2000) e.sumMs = e.sumMs * 0.95 + keyMs;
    }
    this.perKey[ch] = e;
    // Per-finger (v2). Maps the char to its 10-bucket finger via the
    // active layout. Skipped for unmapped chars (uppercase, accents,
    // unusual symbols) so the buckets stay clean.
    const finger = fingerForKey(ch, this.layout);
    if (finger) {
      const f = this.perFinger[finger] || { n: 0, errors: 0, sumMs: 0 };
      f.n++;
      if (!correct) f.errors++;
      if (Number.isFinite(keyMs) && keyMs > 0 && keyMs < 2000) f.sumMs += keyMs;
      this.perFinger[finger] = f;
    }
    // Per-char detail (v2). Mirrors perKey but adds lastSeen + lastError
    // for the character report's "recently failed" surfacing.
    const d = this.perCharDetail[ch] || { n: 0, errors: 0, sumMs: 0, lastSeen: null, lastError: null };
    d.n++;
    if (Number.isFinite(keyMs) && keyMs > 0 && keyMs < 2000) d.sumMs += keyMs;
    d.lastSeen = Date.now();
    if (!correct) { d.errors++; d.lastError = d.lastSeen; }
    this.perCharDetail[ch] = d;
    // Bigram
    if (prev && typeof prev === "string" && prev.length === 1) {
      const ab = prev + ch;
      const b = this.perBigram[ab] || { n: 0, errors: 0, sumMs: 0 };
      if (b.n < MAX_BG_N) {
        b.n++;
        if (!correct) b.errors++;
        if (Number.isFinite(keyMs) && keyMs > 0 && keyMs < 2000) b.sumMs += keyMs;
      } else {
        b.n = MAX_BG_N;
        b.errors = b.errors * 0.95 + (correct ? 0 : 1);
        if (Number.isFinite(keyMs) && keyMs > 0 && keyMs < 2000) b.sumMs = b.sumMs * 0.95 + keyMs;
      }
      this.perBigram[ab] = b;
    }
  }

  // Returns { keyScores, meanMs, stdevMs }
  keySnapshot() {
    const keys = Object.keys(this.perKey);
    const avgs = [];
    for (const k of keys) {
      const e = this.perKey[k];
      if (e.n >= 5 && e.sumMs > 0) avgs.push(e.sumMs / e.n);
    }
    const m = mean(avgs);
    const sd = stdev(avgs) || 1;
    return { meanMs: m, stdevMs: sd };
  }

  weak(ch) {
    const e = this.perKey[ch];
    if (!e || e.n < 5) return 0;
    const errRate = laplaceRate(e.errors, e.n);
    const avg = e.sumMs / e.n;
    const { meanMs, stdevMs } = this.keySnapshot();
    const norm = clamp((avg - meanMs) / (stdevMs || 1), 0, 3) / 3;
    return 0.6 * errRate + 0.4 * norm;
  }

  weakBigram(ab) {
    const e = this.perBigram[ab];
    if (!e || e.n < 5) return 0;
    const errRate = laplaceRate(e.errors, e.n);
    const avg = e.sumMs / e.n;
    const { meanMs, stdevMs } = this.keySnapshot();
    const norm = clamp((avg - meanMs) / (stdevMs || 1), 0, 3) / 3;
    return 0.7 * errRate + 0.3 * norm;
  }

  weakChars(k = 15) {
    const out = [];
    for (const ch of Object.keys(this.perKey)) {
      const w = this.weak(ch);
      if (w > 0) out.push([ch, w]);
    }
    out.sort((a, b) => b[1] - a[1]);
    return out.slice(0, k);
  }

  weakBigrams(k = 30) {
    const out = [];
    for (const ab of Object.keys(this.perBigram)) {
      const w = this.weakBigram(ab);
      if (w > 0) out.push([ab, w]);
    }
    out.sort((a, b) => b[1] - a[1]);
    return out.slice(0, k);
  }

  /* ── Weighting within one lesson's key set ─────────────────────
     weakChars()/weakBigrams() rank the WHOLE keyboard and keep a
     global top-N. When the user's data is dominated by the keys they
     are currently drilling, that top-15 does contain the lesson's own
     keys and the whole-keyboard picker works fine on a restricted
     lesson — measured, it lifts lesson 5's worst key from 4.4% to 6.1%
     as errors climb.

     It fails when at least fifteen OUT-OF-SET keys are weaker than the
     lesson's weakest IN-SET key, which pushes every key the lesson
     actually uses out of the top-15. Then the weak map matches nothing
     in the filtered word list, every word scores only scoreWord()'s
     `0.05 * length` floor, and the draw collapses to length-weighted
     uniform. That is the normal state for anyone whose lifetime
     profile is dominated by digits and symbols — someone working the
     lessons out of order, or returning to the basics after the number
     drills.

     keyWeights()/bigramWeights() score every key in the set directly
     instead of ranking it against the keyboard, so a set of two keys
     and a set of twenty-six both get a signal, and out-of-set weakness
     can never crowd the lesson's own keys out. */
  keyWeights(keys) {
    const chars = Array.from(new Set(Array.from(keys || "")));
    return normalizeWeights(chars.map((c) => [c, this.weak(c)]));
  }

  bigramWeights(keys) {
    const set = new Set(Array.from(keys || ""));
    const entries = [];
    for (const ab of Object.keys(this.perBigram)) {
      if (ab.length !== 2) continue;
      if (!set.has(ab[0]) || !set.has(ab[1])) continue;
      entries.push([ab, this.weakBigram(ab)]);
    }
    return normalizeWeights(entries);
  }

  serialize() {
    return {
      perKey: this.perKey,
      perBigram: this.perBigram,
      perFinger: this.perFinger,
      perCharDetail: this.perCharDetail,
    };
  }
}

/* weight(c) = 1 + WEIGHT_GAIN * weak(c).

   Linear in ABSOLUTE weakness, deliberately. The obvious alternative —
   scaling each key against its own set's mean — was implemented first
   and is broken: rel = n*w/(w + S) tends to n as w grows, because the
   mean rises along with the key you are measuring. Measured on lesson
   5, weak(k) climbing 0.406 -> 0.700 moved rel only 10.32 -> 10.97, so
   the response was already pinned at its ceiling before the sweep even
   started and a key with 100 errors drilled no harder than one with 2.
   That is saturating by construction, not because of any clamp.

   The linear form also matches the whole-keyboard picker this
   generalises. scoreWord() scores a word `sum(weak) + 0.05*length`, so
   for a four-letter word carrying one weak char its edge over a clean
   word is (0.2 + w)/0.2 = 1 + 5w — the same shape, with the gain fixed
   by word length instead of stated outright. WEIGHT_GAIN = 6 keeps the
   response at or above that across the whole error range (see the
   sweep in the handoff) while being length-independent, which is what
   lets the synthetic drills use it too.

   Equal weakness across the set gives equal weights, so a set nobody
   has a problem with is drawn uniformly. */
const WEIGHT_GAIN = 6;

/* weak() is 0.6*errRate + 0.4*normalisedSlowness, both of which are
   defined on [0, 1], so a legitimate weakness is always in range and
   this clamp is a no-op for it. It exists for CORRUPT persisted state:
   a NaN must read as "unknown" (neutral), and an Infinity as "as weak
   as it gets" (maximum). Letting either through unhandled used to give
   the key weight 1 — the MINIMUM — so the single worst key in the set
   became the least practised one. Degrade to neutral or to maximum,
   never to minimum. */
function sanitizeWeakness(w) {
  const n = Number(w);
  if (Number.isNaN(n)) return 0;
  if (n === Infinity) return 1;
  return clamp(n, 0, 1);
}

/* [key, rawWeakness][] → Map<key, weight>, every weight a finite
   number >= 1.

   The base of 1 is load-bearing twice over: every key in the set keeps
   appearing no matter how clean it is, and a model with no samples
   (all weaknesses 0) produces all-1s, i.e. a uniform draw.

   The spread is then capped so the strongest weight is at most
   `entries.length` times the weakest. Past that ratio one key takes
   over half the drill and the lesson stops being about its key set —
   the real risk on a two-key alternation drill, where the cap holds it
   to 2:1. It is scaled to set size because it is only ever meant to
   bind on tiny sets. Measured: it binds only for sets of six keys or
   fewer, and even then holds the worst key to at most 67% of a
   synthetic draw; from seven keys up the cap sits at or above the
   maximum weight 1 + WEIGHT_GAIN can produce, so it cannot bind at
   all. It does not bind anywhere in the measured sweep. */
function normalizeWeights(entries) {
  const out = new Map();
  if (!entries.length) return out;
  const scored = entries.map(([k, w]) => [k, 1 + WEIGHT_GAIN * sanitizeWeakness(w)]);
  let lo = Infinity;
  for (const [, w] of scored) if (w < lo) lo = w;
  const cap = lo * entries.length;
  for (const [k, w] of scored) out.set(k, Math.min(w, cap));
  return out;
}

/* Word score for the key-set picker: a base of 1 plus the EXCESS
   weight each char and bigram carries over the neutral 1.

   Summing the excess rather than the weights themselves is what keeps
   this length-neutral. A clean nine-letter word and a clean two-letter
   word both score exactly 1, so the lesson's word-length mix is left
   alone (shifting it is the job of the "short"/"long" speed builders).
   Averaging instead of summing was tried and is too blunt: it rewards
   words with a high *fraction* of weak keys, so words dense in one
   weak key crowd out the other weak keys in the same set, and the
   weak-key group as a whole barely gains any exposure.

   Because keyWeights is linear in weak(), this inherits its monotonic
   response: a word's score keeps climbing with the weakness of the
   keys in it rather than pinning at a ceiling. */
export function scoreInKeySet(word, keyMap, bgMap) {
  const chars = Array.from(String(word || ""));
  if (!chars.length) return 1;
  let s = 1;
  for (const c of chars) s += (keyMap.get(c) ?? 1) - 1;
  if (bgMap && bgMap.size) {
    for (const ab of bigramsOf(word)) s += (bgMap.get(ab) ?? 1) - 1;
  }
  return s;
}

export function scoreWord(word, weakMap, weakBgMap) {
  let s = 0;
  for (const c of word) {
    const v = weakMap.get(c);
    if (v) s += v;
  }
  for (const ab of bigramsOf(word)) {
    const v = weakBgMap.get(ab);
    if (v) s += 2 * v;
  }
  s += 0.05 * word.length;
  return s;
}
