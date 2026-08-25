/* Word picker — given a word list and an AdaptiveModel, generates a
   stream of words that bias toward the user's weak chars/bigrams.
   Cold-start (no model data yet) falls back to uniform sampling.

   Two rankings, one picker:
     - no `opts.allowed`  → weakness ranked across the WHOLE keyboard
                            (top-15 chars / top-30 bigrams). This is the
                            whole-keyboard adaptive review, unchanged.
     - `opts.allowed` set → weakness ranked WITHIN that key set, so a
                            lesson over "fj" or "fjdksla;eitn" gets a
                            real signal instead of an empty top-15.
   Same weak() scores underneath either way. */
import { scoreWord, scoreInKeySet } from "./adaptive.js";
import { sampleN, shuffle, weightedChooser } from "../util/rng.js";

const POOL_SIZE = 500;

export function buildPicker(words, model, opts = {}) {
  if (opts.allowed) return keySetPicker(words, model, opts.allowed);
  const weakChars = model.weakChars(15);
  const weakBigrams = model.weakBigrams(30);
  const weakMap = new Map(weakChars);
  const weakBgMap = new Map(weakBigrams);
  const cold = weakMap.size === 0;

  if (cold) {
    return {
      cold: true,
      next(n) { return sampleN(words, n).join(" "); }
    };
  }

  const scored = [];
  for (const w of words) {
    const s = scoreWord(w, weakMap, weakBgMap);
    if (s > 0) scored.push([w, s]);
  }
  scored.sort((a, b) => b[1] - a[1]);
  const pool = scored.slice(0, POOL_SIZE);
  const total = pool.reduce((s, [, v]) => s + v, 0);

  function pickOne() {
    if (!pool.length) return words[Math.floor(Math.random() * words.length)];
    let r = Math.random() * total;
    for (const [w, s] of pool) {
      r -= s;
      if (r <= 0) return w;
    }
    return pool[0][0];
  }

  return {
    cold: false,
    weakChars, weakBigrams,
    next(n) {
      const out = [];
      let last = "";
      for (let i = 0; i < n; i++) {
        let w = pickOne();
        // Avoid two-in-a-row repeats.
        let tries = 0;
        while (w === last && tries < 4) { w = pickOne(); tries++; }
        out.push(w);
        last = w;
      }
      return out.join(" ");
    }
  };
}

/* Weighted picker over a list already restricted to one lesson's keys.
   No POOL_SIZE truncation here: every weight is >= 1 so no word is
   ever starved, and dropping the "cleanest" tail would quietly shrink
   the lesson's own key coverage — the opposite of the point. */
function keySetPicker(words, model, allowed) {
  const list = words || [];
  const keyMap = model.keyWeights(allowed);
  const bgMap = model.bigramWeights(allowed);
  const flat = !hasSpread(keyMap) && !hasSpread(bgMap);
  // flat === no usable in-set signal yet. All-1 weights make the
  // weighted draw identical to a uniform one, so there is no separate
  // cold branch to keep in sync — only an honest `cold` flag.
  const weights = list.map((w) => (flat ? 1 : scoreInKeySet(w, keyMap, bgMap)));
  const pickOne = weightedChooser(list, weights);

  return {
    cold: flat,
    keyWeights: keyMap,
    next(n) {
      const out = [];
      let last = "";
      for (let i = 0; i < n; i++) {
        let w = pickOne();
        // Avoid two-in-a-row repeats.
        let tries = 0;
        while (w === last && tries < 4) { w = pickOne(); tries++; }
        out.push(w);
        last = w;
      }
      return out.join(" ");
    }
  };
}

function hasSpread(map) {
  for (const v of map.values()) if (v > 1 + 1e-9) return true;
  return false;
}

export function uniformText(words, n) {
  return shuffle(words).slice(0, n).join(" ");
}
