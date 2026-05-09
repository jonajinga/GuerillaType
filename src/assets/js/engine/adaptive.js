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

  serialize() {
    return {
      perKey: this.perKey,
      perBigram: this.perBigram,
      perFinger: this.perFinger,
      perCharDetail: this.perCharDetail,
    };
  }
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
