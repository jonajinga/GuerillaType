/* Word picker — given a word list and an AdaptiveModel, generates a
   stream of words that bias toward the user's weak chars/bigrams.
   Cold-start (no model data yet) falls back to uniform sampling. */
import { scoreWord } from "./adaptive.js";
import { sampleN, shuffle } from "../util/rng.js";

const POOL_SIZE = 500;

export function buildPicker(words, model) {
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

export function uniformText(words, n) {
  return shuffle(words).slice(0, n).join(" ");
}
