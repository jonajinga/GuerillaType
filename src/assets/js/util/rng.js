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
