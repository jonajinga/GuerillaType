/* D3-powered WPM trend chart. Phase 1 of the D3 stats rollout.
   Lazy-loads d3 from esm.sh (~25 KB) on first call -- only paid when
   the user visits /stats/. Renders:
     - WPM line (one point per session, oldest -> newest)
     - Area fill below the line (accent at 22% alpha)
     - 7-session rolling mean as a second contrasting line
     - X-axis brush for zoom selection (drag to pick a date range)
     - Hover tooltip with session date + wpm + acc + mode
   Falls back to the existing hand-rolled viz-trend if D3 fails to
   load (offline, network blocked, etc.). */

import { loadD3 } from "./d3-loader.js";

export async function renderTrendD3(svg, sessions, opts = {}) {
  const d3 = await loadD3();
  if (!d3) {
    // Fallback to the legacy viz so the chart still renders.
    const fallback = await import("./viz-trend.js");
    fallback.renderTrend(svg, sessions, opts);
    return;
  }
  const data = (sessions || [])
    .slice(0, opts.n || 100)
    .reverse()
    .map((s, i) => ({
      idx: i,
      wpm: s.wpm || 0,
      acc: s.acc || 0,
      mode: s.mode || "?",
      at: s.at ? new Date(s.at) : new Date(),
    }))
    .filter((d) => d.wpm > 0);

  // Clear + size.
  const W = 720, H = 220;
  const M = { top: 12, right: 16, bottom: 36, left: 40 };
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.innerHTML = "";
  const sel = d3.select(svg);

  if (!data.length) {
    sel.append("text")
      .attr("x", W / 2).attr("y", H / 2)
      .attr("text-anchor", "middle")
      .attr("class", "chart__tick")
      .text("Not enough data yet");
    return;
  }

  // Scales -- use index on x for even spacing across irregular session
  // intervals. The brush below maps back to date ranges via the data
  // array's `at` field.
  const x = d3.scaleLinear()
    .domain([0, data.length - 1])
    .range([M.left, W - M.right]);
  const yMax = d3.max(data, (d) => d.wpm) + 5;
  const y = d3.scaleLinear()
    .domain([0, yMax])
    .range([H - M.bottom, M.top]);

  // Y gridlines + ticks.
  const yTicks = y.ticks(5);
  sel.append("g")
    .attr("class", "chart__grid")
    .selectAll("line")
    .data(yTicks)
    .enter()
    .append("line")
    .attr("x1", M.left).attr("x2", W - M.right)
    .attr("y1", (d) => y(d)).attr("y2", (d) => y(d))
    .attr("stroke", "var(--rule)")
    .attr("stroke-opacity", ".25")
    .attr("stroke-dasharray", "2,4");
  sel.append("g")
    .selectAll("text")
    .data(yTicks)
    .enter()
    .append("text")
    .attr("x", M.left - 6).attr("y", (d) => y(d) + 3)
    .attr("text-anchor", "end")
    .attr("class", "chart__tick")
    .text((d) => d);

  // Area below the line.
  const area = d3.area()
    .x((d) => x(d.idx))
    .y0(y(0))
    .y1((d) => y(d.wpm))
    .curve(d3.curveMonotoneX);
  sel.append("path")
    .datum(data)
    .attr("class", "chart__area")
    .attr("fill", "var(--accent)")
    .attr("fill-opacity", ".18")
    .attr("d", area);

  // Main line.
  const line = d3.line()
    .x((d) => x(d.idx))
    .y((d) => y(d.wpm))
    .curve(d3.curveMonotoneX);
  sel.append("path")
    .datum(data)
    .attr("class", "chart__line")
    .attr("fill", "none")
    .attr("stroke", "var(--accent)")
    .attr("stroke-width", 2)
    .attr("d", line);

  // Rolling mean (7 sessions) -- gives a sense of trend through noise.
  if (data.length >= 7) {
    const rolling = data.map((d, i) => {
      const window = data.slice(Math.max(0, i - 6), i + 1);
      const mean = window.reduce((s, w) => s + w.wpm, 0) / window.length;
      return { idx: i, wpm: mean };
    });
    sel.append("path")
      .datum(rolling)
      .attr("fill", "none")
      .attr("stroke", "var(--fg-1)")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "4,3")
      .attr("opacity", ".7")
      .attr("d", line);
  }

  // Hover dots.
  const dots = sel.append("g")
    .selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", (d) => x(d.idx))
    .attr("cy", (d) => y(d.wpm))
    .attr("r", 2.5)
    .attr("fill", "var(--accent)")
    .attr("stroke", "var(--bg-0)")
    .attr("stroke-width", 1);

  // Hover tooltip via title element (browser-native, no DOM overlay).
  dots.append("title")
    .text((d) => `${d.at.toLocaleDateString()} -- ${Math.round(d.wpm)} wpm @ ${Math.round(d.acc)}% (${d.mode})`);

  // X-axis label: range of dates.
  const first = data[0].at;
  const last = data[data.length - 1].at;
  const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  sel.append("text")
    .attr("x", M.left).attr("y", H - 8)
    .attr("class", "chart__tick")
    .attr("text-anchor", "start")
    .text(fmt(first));
  sel.append("text")
    .attr("x", W - M.right).attr("y", H - 8)
    .attr("class", "chart__tick")
    .attr("text-anchor", "end")
    .text(fmt(last));
}
