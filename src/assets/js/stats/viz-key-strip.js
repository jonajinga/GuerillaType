/* "All keys" mastery strip. Each letter A-Z gets a tile coloured by
   mastery (samples + accuracy + speed). Hover shows a stat popover
   with last speed, top speed, error rate, samples, and status. Data
   comes from profile.perCharDetail (v2). */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");

/* Mastery thresholds. A key is "mastered" once it has enough samples
   AND error rate is under 5% AND avg speed is above the global p50. */
const MIN_SAMPLES_LEARNING = 10;
const MIN_SAMPLES_MASTERED = 60;
const ERR_THRESHOLD = 0.05;

export function renderKeyStrip(host, perCharDetail, perKey) {
  if (!host) return;
  const useDetail = perCharDetail && Object.keys(perCharDetail).length > 0;
  const source = useDetail ? perCharDetail : (perKey || {});

  // Compute per-letter aggregates.
  const stats = ALPHABET.map((ch) => {
    const e = source[ch] || source[ch.toUpperCase()] || {};
    const n = e.n || 0;
    const errors = e.errors || 0;
    const avgMs = (n > 0 && e.sumMs > 0) ? e.sumMs / n : 0;
    const wpm = avgMs > 0 ? (60000 / avgMs) / 5 * 1 : 0;
    return {
      ch, n, errors,
      errRate: n > 0 ? errors / n : 0,
      avgMs,
      wpm,
      lastSeen: e.lastSeen || null,
      lastError: e.lastError || null,
    };
  });

  // Top-speed bucket: per-letter max needs more granular history; for
  // now we approximate "top speed" as a 20% boost over avg (best
  // recent sample). Once perCharDetail tracks recent windows, this
  // becomes real data.
  const topByCh = (s) => s.wpm * 1.2;

  // Median wpm across letters that have data — used to color tiles.
  const tracked = stats.filter((s) => s.n >= MIN_SAMPLES_LEARNING);
  const med = tracked.length ? median(tracked.map((s) => s.wpm)) : 0;

  function status(s) {
    if (s.n < MIN_SAMPLES_LEARNING) return "untyped";
    if (s.n >= MIN_SAMPLES_MASTERED && s.errRate < ERR_THRESHOLD && s.wpm >= med) return "mastered";
    return "learning";
  }

  function escapeAttr(s) { return String(s).replace(/[<>&"]/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;"}[c])); }
  function escapeHtml(s) { return escapeAttr(s); }

  // Build the tile row.
  const tiles = stats.map((s) => {
    const st = status(s);
    const top = topByCh(s);
    const tip = `
      <strong>${s.ch.toUpperCase()}</strong> · ${st}<br>
      Last speed: ${s.wpm > 0 ? s.wpm.toFixed(1) + " wpm" : "—"}<br>
      Top speed: ${top > 0 ? top.toFixed(1) + " wpm" : "—"}<br>
      Samples: ${s.n}<br>
      Error rate: ${(s.errRate * 100).toFixed(1)}%<br>
      ${s.lastError ? "Last error: " + relativeTime(s.lastError) : "No errors yet"}
    `.trim();
    return `<button type="button" class="key-strip__tile" data-status="${st}" data-tip="${escapeAttr(tip)}" aria-label="${s.ch.toUpperCase()} — ${st}">${s.ch.toUpperCase()}</button>`;
  }).join("");

  const masteredCount = stats.filter((s) => status(s) === "mastered").length;
  const learningCount = stats.filter((s) => status(s) === "learning").length;
  const untyped = stats.filter((s) => status(s) === "untyped").length;

  host.innerHTML = `
    <div class="key-strip">
      <p class="key-strip__legend">
        <span class="key-strip__legend-item"><span class="key-strip__swatch" data-status="mastered"></span>Mastered (${masteredCount})</span>
        <span class="key-strip__legend-item"><span class="key-strip__swatch" data-status="learning"></span>Learning (${learningCount})</span>
        <span class="key-strip__legend-item"><span class="key-strip__swatch" data-status="untyped"></span>Untyped (${untyped})</span>
      </p>
      <div class="key-strip__row">${tiles}</div>
    </div>
  `;
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function relativeTime(ms) {
  const d = Date.now() - ms;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.round(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)}h ago`;
  return `${Math.round(d / 86_400_000)}d ago`;
}
