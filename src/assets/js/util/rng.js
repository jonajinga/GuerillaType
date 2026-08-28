export function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
export function pick(arr, rng = Math.random) {
  if (!arr || !arr.length) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}
export function sampleN(arr, n, rng = Math.random) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(pick(arr, rng));
  return out;
}
export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* Weighted pick-with-replacement. Returns a `choose()` closure so the
   cumulative table is built once and reused across many picks.
   Weights must line up index-for-index with `items`; negatives and
   NaN are treated as 0. If nothing has positive weight the chooser
   degrades to a uniform pick, so callers never have to special-case
   "no signal yet". */
export function weightedChooser(items, weights, rng = Math.random) {
  const list = items || [];
  const cum = new Array(list.length);
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    const w = Number(weights && weights[i]);
    total += Number.isFinite(w) && w > 0 ? w : 0;
    cum[i] = total;
  }
  if (!list.length) return () => undefined;
  if (!(total > 0)) return () => pick(list, rng);
  return function choose() {
    const r = rng() * total;
    for (let i = 0; i < cum.length; i++) if (r <= cum[i]) return list[i];
    return list[list.length - 1];
  };
}
