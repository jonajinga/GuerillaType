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

/* The curriculum is 300 lessons. Four columns with no row cap meant a
   section 12,000px tall -- about fourteen screens -- for exactly the
   user who has practiced the most, which is the opposite of the problem
   this chart was rewritten to solve. Cap the grid at the lessons the
   reader has touched most recently and say so on the chart.

   This is a different thing from the truncation it replaced: the old
   chart drew every lesson and then cut the LEGEND off at eight, so the
   extra series were still on screen, overlapping, unlabelled and
   unidentifiable. Here the set is chosen, bounded, and stated. */
const MAX_PANELS = 24;

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
  /* A pinned custom text is recorded under "custom:<id>", which would
     otherwise render as "Lesson custom:c_ab7f". The caller passes the
     titles; truncate them because a panel is 168px wide and a novel's
     title is not. */
  const labels = opts.labels || {};
  const nameOf = (id) => {
    const given = labels[id];
    if (!given) return `Lesson ${id}`;
    return given.length > 18 ? given.slice(0, 17).trimEnd() + "\u2026" : given;
  };

  const byLesson = Array.from(groups.entries()).map(([id, arr]) => ({
    id,
    label: nameOf(id),
    lastAt: String(arr[arr.length - 1].at || ""),
    points: arr.map((r) => ({ wpm: num(r.wpm), acc: num(r.acc), at: r.at })),
  }));

  /* Curriculum lessons in numeric order first, then anything named
     (pinned custom texts) alphabetically. Without the first clause a
     "custom:" id compares as a string against "5" and lands in the
     middle of the curriculum. */
  const inLessonOrder = (a, b) => {
    const na = Number(a.id), nb = Number(b.id);
    const aNum = Number.isFinite(na), bNum = Number.isFinite(nb);
    if (aNum && bNum) return na - nb;
    if (aNum !== bNum) return aNum ? -1 : 1;
    return String(a.label).localeCompare(String(b.label));
  };

  // Most recently practiced first, keep MAX_PANELS, then draw them in
  // curriculum order so the grid reads the way the lesson list does.
  const total = byLesson.length;
  const truncated = total > MAX_PANELS;
  const series = (truncated
    ? byLesson.slice().sort((a, b) => b.lastAt.localeCompare(a.lastAt)).slice(0, MAX_PANELS)
    : byLesson).sort(inLessonOrder);

  // Scales come from what is DRAWN. Deriving them from lessons that are
  // not on screen would label an axis maximum no panel reaches.
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
  if (truncated) {
    legend.appendChild(text(W - 4, 11,
      `${MAX_PANELS} most recently practiced of ${total} lessons`,
      "chart__tick chart__panel-caption", "end"));
  }
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
    /* NOT .chart__line -- that class sets fill:none, and a CSS property
       beats the presentation attribute, so a fill="" here paints
       nothing and the marker renders as a hollow ring. Same override
       that catches `stroke`; it catches `fill` too. */
    const variant = /--acc/.test(attrs.class || "") ? "chart__point--acc" : "chart__point--wpm";
    return el("circle", { cx: pts[0][0], cy: pts[0][1], r: 2.4, class: "chart__point " + variant });
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
