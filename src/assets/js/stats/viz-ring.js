/* Progress ring — port of math-direct/student-dashboard.js pattern.
   Pure SVG via stroke-dasharray math. */

export function renderRing(container, pct, opts = {}) {
  const r = opts.r || 52;
  const cx = 60, cy = 60;
  const C = 2 * Math.PI * r;
  const off = C * (1 - Math.max(0, Math.min(1, pct / 100)));
  container.innerHTML = `
    <svg class="ring__svg" viewBox="0 0 120 120" aria-hidden="true">
      <circle class="ring__track" cx="${cx}" cy="${cy}" r="${r}"/>
      <circle class="ring__progress" cx="${cx}" cy="${cy}" r="${r}"
              stroke-dasharray="${C}" stroke-dashoffset="${off}"/>
    </svg>
    <div class="ring__label">
      <span class="ring__value">${Math.round(pct)}%</span>
      <span class="ring__caption">${opts.caption || ""}</span>
    </div>`;
}
