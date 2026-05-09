/* Per-finger error + speed chart. Reads profile.perFinger (10 buckets).
   Three-column layout — error-rate bar on the left, finger label in the
   center, avg-ms bar on the right. Each column has its own x-range so
   bars and text never overlap. Each row gets a data-tip for tippy. */

import { FINGER_BUCKETS, bucketLabel } from "../engine/layouts.js";

const NS = "http://www.w3.org/2000/svg";

export function renderPerFinger(svg, perFinger) {
  const W = 720, ROW_H = 22, GAP = 8;
  const ERR_BAR_W = 180, ERR_VAL_W = 56;
  const LABEL_W = 110;
  const MS_BAR_W = 220;
  const ERR_X0 = 0;
  const ERR_X1 = ERR_X0 + ERR_VAL_W + ERR_BAR_W;
  const LABEL_X = ERR_X1 + 6;
  const MS_X0 = LABEL_X + LABEL_W;
  const TOP = 22;
  const H = TOP + FINGER_BUCKETS.length * (ROW_H + GAP);

  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "chart__svg");
  svg.innerHTML = "";

  const rows = FINGER_BUCKETS.map((b) => {
    const e = perFinger[b] || { n: 0, errors: 0, sumMs: 0 };
    return {
      bucket: b,
      label: bucketLabel(b),
      n: e.n,
      errors: e.errors,
      errRate: e.n > 0 ? (e.errors / e.n) : 0,
      avgMs: e.n > 0 && e.sumMs > 0 ? (e.sumMs / e.n) : 0,
    };
  });

  const errHead = el("text", { x: ERR_X1 - 6, y: 14, class: "chart__tick", "text-anchor": "end" });
  errHead.textContent = "← error rate";
  svg.appendChild(errHead);
  const msHead = el("text", { x: MS_X0 + 6, y: 14, class: "chart__tick", "text-anchor": "start" });
  msHead.textContent = "avg ms · samples →";
  svg.appendChild(msHead);

  const maxAvg = Math.max(...rows.map((r) => r.avgMs), 1);
  const maxErr = Math.max(...rows.map((r) => r.errRate), 0.05);

  // Severity classes for the err bar -- low (<2%) / med / high (>5%).
  const sevClass = (rate) => rate >= 0.05 ? "chart__bar--bad" : rate >= 0.02 ? "chart__bar--warn" : "chart__bar--ok";

  rows.forEach((r, i) => {
    const y = TOP + i * (ROW_H + GAP);
    const midY = y + ROW_H / 2 + 4;

    // Group wrapper carries the data-tip so hovering anywhere on the
    // row surfaces the full breakdown via the page-wide tippy promoter.
    const g = el("g");
    if (r.n > 0) {
      g.setAttribute("data-tip",
        `${r.label}: ${r.errors} of ${r.n} keys mistyped (${(r.errRate * 100).toFixed(2)}%) · avg ${Math.round(r.avgMs)} ms`);
    } else {
      g.setAttribute("data-tip", `${r.label}: no samples yet -- this finger hasn't been used in a tracked session.`);
    }
    svg.appendChild(g);

    const lab = el("text", { x: LABEL_X + LABEL_W / 2, y: midY, class: "chart__bar-label", "text-anchor": "middle" });
    lab.textContent = r.label;
    g.appendChild(lab);

    if (r.n === 0) {
      const muted = el("text", { x: MS_X0 + 12, y: midY, class: "chart__bar-label muted", opacity: ".55" });
      muted.textContent = "no samples yet";
      g.appendChild(muted);
      return;
    }

    const errW = (r.errRate / maxErr) * ERR_BAR_W;
    const errBar = el("rect", {
      x: ERR_X1 - errW - ERR_VAL_W, y, width: errW, height: ROW_H,
      class: `chart__bar ${sevClass(r.errRate)}`,
    });
    g.appendChild(errBar);
    const errVal = el("text", { x: ERR_X1 - 4, y: midY, class: "chart__bar-label", "text-anchor": "end" });
    errVal.textContent = `${(r.errRate * 100).toFixed(1)}%`;
    g.appendChild(errVal);

    const msW = (r.avgMs / maxAvg) * MS_BAR_W;
    const msBar = el("rect", { x: MS_X0, y, width: msW, height: ROW_H, class: "chart__bar" });
    g.appendChild(msBar);
    const msVal = el("text", { x: MS_X0 + msW + 6, y: midY, class: "chart__bar-label" });
    msVal.textContent = `${Math.round(r.avgMs)} ms · ${r.n}`;
    g.appendChild(msVal);
  });
}

/* Worst-finger summary -- a one-liner above the chart that names the
   finger with the highest error rate. Shown only when there's enough
   data to be meaningful (>= 50 samples on at least one finger). */
export function summarizePerFinger(perFinger) {
  const rows = FINGER_BUCKETS
    .map((b) => {
      const e = perFinger[b] || { n: 0, errors: 0 };
      return { label: bucketLabel(b), n: e.n, rate: e.n > 0 ? e.errors / e.n : 0 };
    })
    .filter((r) => r.n >= 50);
  if (!rows.length) return null;
  const worst = rows.reduce((a, b) => (b.rate > a.rate ? b : a));
  if (worst.rate < 0.01) return { worst: null, message: "All fingers under 1% error rate -- clean across the board." };
  return {
    worst,
    message: `${worst.label} is your weakest finger right now -- ${(worst.rate * 100).toFixed(1)}% error rate over ${worst.n} samples.`,
  };
}

function el(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  return e;
}
