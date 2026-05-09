export function bigramsOf(word) {
  const out = [];
  const w = String(word || "");
  for (let i = 0; i < w.length - 1; i++) out.push(w[i] + w[i + 1]);
  return out;
}
export function topByScore(map, scoreFn, k = 20) {
  const entries = [];
  for (const key of Object.keys(map)) {
    const s = scoreFn(key, map[key]);
    if (s > 0) entries.push([key, s]);
  }
  entries.sort((a, b) => b[1] - a[1]);
  return entries.slice(0, k);
}
