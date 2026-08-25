/* Keyboard heatmap — renders an SVG keyboard and colors each key by
   error-rate or avg key time. Toggle via the `metric` arg. */

import { LAYOUTS, NUMPAD_KEYS } from "../engine/layouts.js";

const KEY_W = 38;
const KEY_H = 38;
const GAP = 4;

export function renderKeyboard(svg, perKey, opts = {}) {
  const layout = opts.layout || "qwerty";
  const metric = opts.metric || "errorRate"; // errorRate | avgMs
  const rows = LAYOUTS[layout] || LAYOUTS.qwerty;

  const isNumpad = layout === "numpad";
  const W = isNumpad
    ? 4 * (KEY_W + GAP) - GAP + 2 * GAP
    : Math.max(...rows.map((r) => r.length)) * (KEY_W + GAP) + 2 * KEY_W + GAP;
  const H = isNumpad
    ? 5 * (KEY_H + GAP) - GAP + 2 * GAP
    : rows.length * (KEY_H + GAP) + (KEY_H + GAP) /* space row */ + GAP;

  // Compute scores. Threshold drops to 2 samples for visualization (the
  // adaptive engine still uses ≥5 for scoring decisions).
  let max = 0;
  let totalSamples = 0;
  let keysWithData = 0;
  const scores = {};
  for (const ch of Object.keys(perKey)) {
    const e = perKey[ch];
    if (!e || e.n < 1) continue;
    totalSamples += e.n;
    if (e.n < 2) continue;
    keysWithData++;
    const v = metric === "errorRate" ? (e.errors / e.n) : (e.sumMs / e.n);
    scores[ch] = v;
    if (v > max) max = v;
  }
  // Expose summary for the caller to render alongside.
  svg.dataset.totalSamples = String(totalSamples);
  svg.dataset.keysWithData = String(keysWithData);

  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", isNumpad ? "kb__svg kb__svg--numpad" : "kb__svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Per-key " + (metric === "errorRate" ? "error rate" : "speed") + " heatmap");
  svg.innerHTML = "";

  if (isNumpad) {
    // The pad is drawn from its physical geometry rather than from the
    // derived row strings: the 0 cap is two columns wide, + and Enter
    // are two rows tall, and the top row starts in column 1. A numpad
    // has no spacebar, so none is drawn.
    for (const k of NUMPAD_KEYS) {
      const w = (k.w || 1) * (KEY_W + GAP) - GAP;
      const h = (k.h || 1) * (KEY_H + GAP) - GAP;
      const x = GAP + k.col * (KEY_W + GAP);
      const y = GAP + k.row * (KEY_H + GAP);
      const v = scores[k.ch];
      const g = el("g");
      const rect = el("rect", { x, y, width: w, height: h, class: "kb__key", "data-ch": k.ch });
      if (v != null) rect.style.fill = mix(max > 0 ? Math.min(1, v / max) : 0);
      const lbl = el("text", { x: x + w / 2, y: y + h / 2, class: "kb__keylabel" });
      lbl.textContent = k.label || k.ch;
      g.appendChild(rect);
      g.appendChild(lbl);
      g.setAttribute("data-tip", tipFor(k.label || k.ch, perKey[k.ch]));
      svg.appendChild(g);
    }
    return;
  }

  rows.forEach((row, ri) => {
    const indent = ri * (KEY_W * 0.4);
    Array.from(row).forEach((ch, ci) => {
      const x = ci * (KEY_W + GAP) + indent + GAP;
      const y = ri * (KEY_H + GAP) + GAP;
      const v = scores[ch];
      let fill = null;
      if (v != null) {
        // Even when max is 0 (perfect run), tint with the low-end "good"
        // color so users see the heatmap is actually populated.
        const t = max > 0 ? Math.min(1, v / max) : 0;
        fill = mix(t);
      }
      const g = el("g");
      const rect = el("rect", {
        x, y, width: KEY_W, height: KEY_H,
        class: "kb__key",
        "data-ch": ch,
      });
      // Inline style beats the .kb__key CSS rule's fill, which would
      // otherwise override an SVG fill attribute.
      if (fill) rect.style.fill = fill;
      const lbl = el("text", { x: x + KEY_W / 2, y: y + KEY_H / 2, class: "kb__keylabel" });
      lbl.textContent = ch;
      g.appendChild(rect);
      g.appendChild(lbl);
      // Tooltip via data-tip so the site's tippy.js layer renders
      // it instead of the browser's native SVG <title> chrome.
      g.setAttribute("data-tip", tipFor(ch === " " ? "space" : ch, perKey[ch]));
      svg.appendChild(g);
    });
  });

  // Space bar
  const spaceY = rows.length * (KEY_H + GAP) + GAP;
  const spaceX = (KEY_W + GAP) * 4 + GAP;
  const spaceW = (KEY_W + GAP) * 5;
  const spV = scores[" "];
  const spaceFill = spV != null && max > 0 ? mix(Math.min(1, spV / max)) : null;
  const sp = el("rect", { x: spaceX, y: spaceY, width: spaceW, height: KEY_H, class: "kb__key" });
  if (spaceFill) sp.style.fill = spaceFill;
  sp.setAttribute("data-tip", tipFor("space", perKey[" "]));
  svg.appendChild(sp);
  const splbl = el("text", { x: spaceX + spaceW / 2, y: spaceY + KEY_H / 2, class: "kb__keylabel" });
  splbl.textContent = "space";
  svg.appendChild(splbl);
}

function tipFor(label, e) {
  return e
    ? `<strong>${label}</strong><br>${e.n} samples · ${e.errors} errors · avg ${(e.sumMs / Math.max(1, e.n)).toFixed(0)} ms`
    : `<strong>${label}</strong><br>No samples yet`;
}

function mix(t) {
  // 0 = clean (sage green), 0.5 = accent (persimmon), 1 = bad (red).
  // Three-stop gradient so 0-error keys visibly shade green instead of
  // disappearing into the default gray when the heatmap is otherwise empty.
  const stops = [
    [0, [110, 145, 110]],
    [0.5, [229, 128, 96]],
    [1, [200, 70, 60]],
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const span = hi[0] - lo[0] || 1;
  const k = (t - lo[0]) / span;
  const r = Math.round(lo[1][0] + k * (hi[1][0] - lo[1][0]));
  const g = Math.round(lo[1][1] + k * (hi[1][1] - lo[1][1]));
  const b = Math.round(lo[1][2] + k * (hi[1][2] - lo[1][2]));
  return `rgb(${r},${g},${b})`;
}
function el(tag, attrs = {}) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  return e;
}
