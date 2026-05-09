export const sum = (a) => a.reduce((s, x) => s + x, 0);
export const mean = (a) => a.length ? sum(a) / a.length : 0;
export function stdev(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
export function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
export function consistency(perWordWpm) {
  if (perWordWpm.length < 2) return 100;
  const m = mean(perWordWpm);
  if (!m) return 0;
  const cv = (stdev(perWordWpm) / m) * 100;
  return clamp(100 - cv, 0, 100);
}
export function laplaceRate(errors, n) {
  if (n < 10) return (errors + 1) / (n + 2);
  return errors / n;
}
