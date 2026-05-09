/* Lesson trends — line chart of WPM and accuracy across attempts of
   each lesson. One chart, multiple series (one per lesson the user has
   touched). Each series is a different stroke color. Tap a legend dot
   to isolate a series. */

const NS = "http://www.w3.org/2000/svg";

export function renderLessonTrends(svg, lessonResults, opts = {}) {
  if (!lessonResults || !lessonResults.length) {
    emptyState(svg, "Complete a lesson to start the trend graph.");
    return;
  }
  // Group by lessonId, oldest-first per lesson.
  const groups = new Map();
  for (const r of lessonResults) {
    if (!groups.has(r.lessonId)) groups.set(r.lessonId, []);
    groups.get(r.lessonId).push(r);
  }
  for (const arr of groups.values()) arr.sort((a, b) => a.at.localeCompare(b.at));

  const W = 700, H = 240, PAD_L = 40, PAD_R = 90, PAD_T = 18, PAD_B = 26;
  const series = Array.from(groups.entries()).map(([id, arr]) => ({
    id,
    label: `Lesson ${id}`,
    points: arr.map((r) => ({ wpm: r.wpm, acc: r.acc, at: r.at })),
  }));
  const allPoints = series.flatMap((s) => s.points);
  const maxN = Math.max(...series.map((s) => s.points.length), 2);
  const maxWpm = Math.max(...allPoints.map((p) => p.wpm), 30);
  const minWpm = Math.max(0, Math.min(...allPoints.map((p) => p.wpm), maxWpm) - 5);

  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "chart__svg");
  svg.innerHTML = "";

  // Axes
  const ax = el("line", { x1: PAD_L, y1: PAD_T, x2: PAD_L, y2: H - PAD_B, class: "chart__axis" });
  const bx = el("line", { x1: PAD_L, y1: H - PAD_B, x2: W - PAD_R, y2: H - PAD_B, class: "chart__axis" });
  svg.appendChild(ax); svg.appendChild(bx);

  // Y ticks (4 ticks)
  for (let i = 0; i <= 4; i++) {
    const v = minWpm + (i / 4) * (maxWpm - minWpm);
    const y = H - PAD_B - (i / 4) * (H - PAD_T - PAD_B);
    const t = el("text", { x: PAD_L - 6, y: y + 3, class: "chart__tick", "text-anchor": "end" });
    t.textContent = Math.round(v);
    svg.appendChild(t);
  }

  // X ticks (attempts 1..maxN, max 6 labels)
  const xStep = (W - PAD_L - PAD_R) / Math.max(1, maxN - 1);
  const xTickStride = Math.max(1, Math.floor(maxN / 6));
  for (let i = 0; i < maxN; i += xTickStride) {
    const x = PAD_L + i * xStep;
    const t = el("text", { x, y: H - PAD_B + 14, class: "chart__tick", "text-anchor": "middle" });
    t.textContent = `#${i + 1}`;
    svg.appendChild(t);
  }

  // Each series — palette cycles through accent / good / secondary / warn.
  const palette = ["var(--accent)", "var(--good)", "var(--secondary)", "var(--warn)", "var(--accent-soft)"];
  const legendItems = [];
  series.forEach((s, idx) => {
    const color = palette[idx % palette.length];
    let d = "";
    s.points.forEach((p, i) => {
      const x = PAD_L + i * xStep;
      const y = PAD_T + (1 - (p.wpm - minWpm) / (maxWpm - minWpm || 1)) * (H - PAD_T - PAD_B);
      d += (i === 0 ? "M " : " L ") + x + " " + y;
      const dot = el("circle", { cx: x, cy: y, r: 3, fill: color, class: "chart__dot" });
      dot.setAttribute("data-tip", `${s.label} · attempt ${i + 1} · ${p.wpm} wpm · ${p.acc}% acc`);
      svg.appendChild(dot);
    });
    const path = el("path", { d, fill: "none", stroke: color, "stroke-width": 1.6, class: "chart__line" });
    svg.appendChild(path);
    legendItems.push({ id: s.id, label: s.label, color });
  });

  // Legend (right margin column).
  const legX = W - PAD_R + 4;
  legendItems.slice(0, 8).forEach((it, i) => {
    const y = PAD_T + i * 14;
    const dot = el("circle", { cx: legX, cy: y, r: 3.5, fill: it.color });
    svg.appendChild(dot);
    const t = el("text", { x: legX + 8, y: y + 3, class: "chart__tick" });
    t.textContent = it.label;
    svg.appendChild(t);
  });
}

function emptyState(svg, msg) {
  svg.innerHTML = "";
  svg.setAttribute("viewBox", "0 0 600 80");
  const t = el("text", { x: 300, y: 44, "text-anchor": "middle", class: "chart__tick" });
  t.textContent = msg;
  svg.appendChild(t);
}
function el(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  return e;
}
