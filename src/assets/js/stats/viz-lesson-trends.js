/* Lesson trends — a small-multiples grid. One panel per lesson the user
   has practiced, each showing WPM and accuracy across attempts.

   This was one chart with every lesson overplotted as a series in a
   single pair of axes. Two things were wrong with that. It only ever
   plotted WPM -- accuracy appeared solely inside the hover tooltip, so
   the half of practice that matters most was invisible. And it did not
   scale: the legend cut off at 8 lessons, so someone working through a
   500-lesson curriculum got eight labelled lines and a tangle of
   unlabelled ones.

   Small multiples fix both. Every lesson gets its own panel, so nothing
   is truncated and nothing overlaps, and the WPM scale is SHARED across
   panels so the panels are comparable at a glance -- which is the whole
   point of the form. Accuracy shares a scale too, floored below the
   worst attempt rather than at zero, because the interesting range for
   a typist is 85-100 and a zero-based axis flattens it into a line. */

const NS = "http://www.w3.org/2000/svg";

const PANEL_W = 168, PANEL_H = 112;
const PAD_L = 26, PAD_R = 8, PAD_T = 22, PAD_B = 16;
const MAX_COLS = 4;

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
  for (const arr of groups.values()) arr.sort((a, b) => String(a.at).localeCompare(String(b.at)));

  /* Lessons in curriculum order where the id is numeric, so the grid
     reads the way the lesson list does rather than in the order the
     user happened to attempt them. */
  const series = Array.from(groups.entries())
    .map(([id, arr]) => ({
      id,
      label: `Lesson ${id}`,
      points: arr.map((r) => ({ wpm: num(r.wpm), acc: num(r.acc), at: r.at })),
    }))
    .sort((a, b) => {
      const na = Number(a.id), nb = Number(b.id);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a.id).localeCompare(String(b.id));
    });

  const all = series.flatMap((s) => s.points);
  // Shared domains. Comparability across panels is the point of the form.
  const maxWpm = Math.max(...all.map((p) => p.wpm), 30);
  const minWpm = Math.max(0, Math.min(...all.map((p) => p.wpm)) - 5);
  const minAcc = Math.max(0, Math.floor(Math.min(...all.map((p) => p.acc)) - 3));
  const maxAcc = 100;

  const cols = Math.min(MAX_COLS, series.length);
  const rows = Math.ceil(series.length / cols);
  const W = cols * PANEL_W;
  const H = rows * PANEL_H + 18;          // +18 for the legend strip

  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "chart__svg chart__svg--grid");
  svg.innerHTML = "";

  /* One legend for the whole grid, not one per panel. Solid is WPM,
     dashed is accuracy -- stated once so each panel stays uncluttered. */
  const legend = el("g", {});
  legend.appendChild(el("line", {
    x1: 4, y1: 8, x2: 20, y2: 8, stroke: "var(--accent)", "stroke-width": 1.8,
  }));
  legend.appendChild(text(24, 11, "WPM", "chart__tick"));
  legend.appendChild(el("line", {
    x1: 58, y1: 8, x2: 74, y2: 8, stroke: "var(--good)", "stroke-width": 1.6,
    "stroke-dasharray": "3 2",
  }));
  legend.appendChild(text(78, 11, `accuracy (${minAcc}-100%)`, "chart__tick"));
  svg.appendChild(legend);

  series.forEach((s, i) => {
    const ox = (i % cols) * PANEL_W;
    const oy = Math.floor(i / cols) * PANEL_H + 18;
    svg.appendChild(panel(s, ox, oy, { minWpm, maxWpm, minAcc, maxAcc }));
  });
}

function panel(s, ox, oy, scale) {
  const g = el("g", { transform: `translate(${ox} ${oy})`, class: "chart__panel" });

  const innerW = PANEL_W - PAD_L - PAD_R;
  const innerH = PANEL_H - PAD_T - PAD_B;
  const n = s.points.length;
  const xAt = (i) => PAD_L + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yWpm = (v) => PAD_T + (1 - (v - scale.minWpm) / (scale.maxWpm - scale.minWpm || 1)) * innerH;
  const yAcc = (v) => PAD_T + (1 - (v - scale.minAcc) / (scale.maxAcc - scale.minAcc || 1)) * innerH;

  // Panel frame: baseline + left axis, kept faint.
  g.appendChild(el("line", { x1: PAD_L, y1: PAD_T, x2: PAD_L, y2: PAD_T + innerH, class: "chart__axis" }));
  g.appendChild(el("line", { x1: PAD_L, y1: PAD_T + innerH, x2: PAD_L + innerW, y2: PAD_T + innerH, class: "chart__axis" }));

  // Title, and the latest reading — the number people actually look for.
  const last = s.points[n - 1];
  g.appendChild(text(2, 10, s.label, "chart__tick chart__panel-title"));
  g.appendChild(text(2, 19, `${Math.round(last.wpm)} wpm · ${Math.round(last.acc)}%`, "chart__tick chart__panel-caption"));

  // Shared WPM scale, so only the extremes need labelling per panel.
  g.appendChild(text(PAD_L - 4, yWpm(scale.maxWpm) + 3, String(Math.round(scale.maxWpm)), "chart__tick", "end"));
  g.appendChild(text(PAD_L - 4, yWpm(scale.minWpm) + 3, String(Math.round(scale.minWpm)), "chart__tick", "end"));

  g.appendChild(line(s.points.map((p, i) => [xAt(i), yAcc(p.acc)]), {
    stroke: "var(--good)", "stroke-width": 1.4, "stroke-dasharray": "3 2",
    class: "chart__line chart__line--acc",
  }));
  g.appendChild(line(s.points.map((p, i) => [xAt(i), yWpm(p.wpm)]), {
    stroke: "var(--accent)", "stroke-width": 1.8, class: "chart__line chart__line--wpm",
  }));

  s.points.forEach((p, i) => {
    const dot = el("circle", {
      cx: xAt(i), cy: yWpm(p.wpm), r: 2.4, fill: "var(--accent)", class: "chart__dot",
    });
    dot.setAttribute("data-tip", `${s.label} · attempt ${i + 1} · ${p.wpm} wpm · ${p.acc}% acc`);
    dot.setAttribute("data-lesson", String(s.id));
    dot.setAttribute("data-attempt", String(i + 1));
    g.appendChild(dot);
  });

  return g;
}

/* A single-attempt lesson has no line to draw, only a point. Emitting a
   one-point path leaves an invisible element and, worse, a panel that
   looks broken; draw the marker instead. */
function line(pts, attrs) {
  if (pts.length < 2) {
    return el("circle", { cx: pts[0][0], cy: pts[0][1], r: 2.2, fill: attrs.stroke, class: attrs.class || "" });
  }
  const d = pts.map(([x, y], i) => (i === 0 ? "M " : " L ") + x + " " + y).join("");
  return el("path", Object.assign({ d, fill: "none" }, attrs));
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function emptyState(svg, msg) {
  svg.innerHTML = "";
  svg.setAttribute("viewBox", "0 0 600 80");
  svg.appendChild(text(300, 44, msg, "chart__tick", "middle"));
}

function text(x, y, str, cls, anchor) {
  const t = el("text", { x, y, class: cls || "chart__tick" });
  if (anchor) t.setAttribute("text-anchor", anchor);
  t.textContent = str;
  return t;
}

function el(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  return e;
}
