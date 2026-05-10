/* D3-powered per-finger viz.
   10 horizontal bars (L pinky -> R pinky), length = error rate %,
   color = avg keystroke ms (cool -> warm gradient). Hover tooltip
   shows samples + avg ms + error count for each finger. */

import { loadD3 } from "./d3-loader.js";

const FINGERS = [
  ["L_pinky",  "Left pinky"],
  ["L_ring",   "Left ring"],
  ["L_middle", "Left middle"],
  ["L_index",  "Left index"],
  ["L_thumb",  "Left thumb"],
  ["R_thumb",  "Right thumb"],
  ["R_index",  "Right index"],
  ["R_middle", "Right middle"],
  ["R_ring",   "Right ring"],
  ["R_pinky",  "Right pinky"],
];

export async function renderPerFingerD3(svg, perFinger) {
  const d3 = await loadD3();
  if (!d3) {
    const fallback = await import("./viz-per-finger.js");
    fallback.renderPerFinger(svg, perFinger || {});
    return;
  }
  const rows = FINGERS.map(([id, label]) => {
    const f = perFinger?.[id] || { n: 0, errors: 0, sumMs: 0 };
    return {
      id, label,
      n: f.n || 0,
      errors: f.errors || 0,
      errorRate: f.n ? (f.errors / f.n) * 100 : 0,
      avgMs: f.n ? Math.round(f.sumMs / f.n) : 0,
    };
  });

  const W = 720, H = 320;
  // Right margin is wide enough to fit the longest value label
  // ("X.X% · 999ms · 99999") without the trailing chars getting
  // clipped at the SVG's right edge.
  const M = { top: 12, right: 170, bottom: 28, left: 96 };
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = "";
  const sel = d3.select(svg);

  const total = rows.reduce((s, r) => s + r.n, 0);
  if (!total) {
    sel.append("text")
      .attr("x", W / 2).attr("y", H / 2)
      .attr("text-anchor", "middle")
      .attr("class", "chart__tick")
      .text("Type a session or two -- per-finger stats appear here.");
    return;
  }

  const y = d3.scaleBand()
    .domain(rows.map((r) => r.id))
    .range([M.top, H - M.bottom])
    .padding(0.2);

  const maxErrRate = Math.max(5, d3.max(rows, (r) => r.errorRate));
  const x = d3.scaleLinear()
    .domain([0, maxErrRate])
    .range([M.left, W - M.right]);

  // ms color: cool (fast) -> warm (slow).
  const msRange = d3.extent(rows.filter((r) => r.avgMs > 0), (r) => r.avgMs);
  const color = d3.scaleSequential()
    .domain([msRange[0] || 0, msRange[1] || 300])
    .interpolator(d3.interpolateRgbBasis(["#6ba9b3", "#e58060", "#d76050"]));

  // Y labels.
  sel.append("g")
    .selectAll("text")
    .data(rows)
    .enter()
    .append("text")
    .attr("x", M.left - 8).attr("y", (d) => y(d.id) + y.bandwidth() / 2 + 4)
    .attr("text-anchor", "end")
    .attr("class", "chart__tick")
    .text((d) => d.label);

  // Bars.
  const bar = sel.append("g")
    .selectAll("rect")
    .data(rows)
    .enter()
    .append("g");
  bar.append("rect")
    .attr("x", M.left)
    .attr("y", (d) => y(d.id))
    .attr("height", y.bandwidth())
    .attr("width", (d) => Math.max(2, x(d.errorRate) - M.left))
    .attr("fill", (d) => d.avgMs > 0 ? color(d.avgMs) : "var(--bg-2)")
    .attr("opacity", (d) => d.n > 0 ? 0.9 : 0.3);

  // Value labels at the end of each bar.
  bar.append("text")
    .attr("x", (d) => Math.max(M.left + 6, x(d.errorRate)) + 6)
    .attr("y", (d) => y(d.id) + y.bandwidth() / 2 + 4)
    .attr("class", "chart__tick")
    .text((d) => d.n > 0 ? `${d.errorRate.toFixed(1)}%  ·  ${d.avgMs}ms  ·  ${d.n}` : "no data");

  // Title on each bar group for hover tooltip.
  bar.append("title")
    .text((d) => `${d.label}\nsamples: ${d.n}\nerrors: ${d.errors}\nerror rate: ${d.errorRate.toFixed(2)}%\navg keystroke: ${d.avgMs}ms`);

  // X-axis label.
  sel.append("text")
    .attr("x", (M.left + (W - M.right)) / 2)
    .attr("y", H - 6)
    .attr("text-anchor", "middle")
    .attr("class", "chart__tick")
    .text("Error rate (%) -- bar color encodes avg keystroke ms (cool = fast, warm = slow)");
}
