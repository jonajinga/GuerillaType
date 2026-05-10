/* D3-powered per-key bar chart.
   Horizontal bars per character, sortable by error rate / sample
   count / avg ms via a small toggle group at the top. Replaces /
   complements the legacy renderPerKey ring + table by giving a
   single dense overview of where time is being lost. */

import { loadD3 } from "./d3-loader.js";

let _sortBy = "errorRate";

export async function renderPerKeyD3(svg, perKey, perCharDetail) {
  const d3 = await loadD3();
  if (!d3) {
    const fallback = await import("./viz-per-key.js");
    fallback.renderPerKey(svg, perKey || {});
    return;
  }
  // Combine perKey (count + errors) with perCharDetail (sumMs).
  const rows = Object.keys(perKey || {}).map((ch) => {
    const k = perKey[ch] || { n: 0, errors: 0 };
    const d = (perCharDetail || {})[ch] || { sumMs: 0 };
    return {
      ch,
      n: k.n || 0,
      errors: k.errors || 0,
      errorRate: k.n ? (k.errors / k.n) * 100 : 0,
      avgMs: k.n && d.sumMs ? Math.round(d.sumMs / k.n) : 0,
    };
  }).filter((r) => r.n >= 5);  // hide barely-typed keys

  rows.sort((a, b) => {
    if (_sortBy === "errorRate") return b.errorRate - a.errorRate;
    if (_sortBy === "avgMs") return b.avgMs - a.avgMs;
    return b.n - a.n;
  });
  const top = rows.slice(0, 30);

  const W = 720, H = Math.max(280, 22 + top.length * 16);
  const M = { top: 32, right: 60, bottom: 8, left: 36 };
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = "";
  const sel = d3.select(svg);

  if (!top.length) {
    sel.append("text")
      .attr("x", W / 2).attr("y", H / 2)
      .attr("text-anchor", "middle")
      .attr("class", "chart__tick")
      .text("Type a few sessions and per-key stats fill in here.");
    return;
  }

  // Sort toggles (rendered as text buttons).
  const toggles = [
    ["errorRate", "Error rate"],
    ["n", "Samples"],
    ["avgMs", "Avg ms"],
  ];
  const tg = sel.append("g").attr("class", "chart__toggles");
  let xOff = M.left;
  toggles.forEach(([key, label]) => {
    const t = tg.append("text")
      .attr("x", xOff).attr("y", 16)
      .attr("class", "chart__tick")
      .attr("style", _sortBy === key ? "fill:var(--accent);font-weight:600;cursor:pointer" : "fill:var(--fg-2);cursor:pointer")
      .text(label);
    t.on("click", async () => {
      _sortBy = key;
      await renderPerKeyD3(svg, perKey, perCharDetail);
    });
    xOff += label.length * 7 + 18;
  });

  const y = d3.scaleBand()
    .domain(top.map((r) => r.ch))
    .range([M.top, H - M.bottom])
    .padding(0.18);

  const valueBy = (r) => _sortBy === "n" ? r.n : (_sortBy === "avgMs" ? r.avgMs : r.errorRate);
  const xMax = d3.max(top, valueBy) || 1;
  const x = d3.scaleLinear()
    .domain([0, xMax * 1.05])
    .range([M.left, W - M.right]);

  // Color encoding: error rate -> warm; samples -> neutral.
  const errColor = d3.scaleSequential()
    .domain([0, d3.max(top, (r) => r.errorRate) || 1])
    .interpolator(d3.interpolateRgbBasis(["#8fbf90", "#e3b873", "#d76050"]));

  const bar = sel.append("g").selectAll("g").data(top).enter().append("g");
  bar.append("rect")
    .attr("x", M.left)
    .attr("y", (d) => y(d.ch))
    .attr("height", y.bandwidth())
    .attr("width", (d) => Math.max(1, x(valueBy(d)) - M.left))
    .attr("fill", (d) => errColor(d.errorRate))
    .attr("opacity", .9);
  bar.append("text")
    .attr("x", M.left - 8).attr("y", (d) => y(d.ch) + y.bandwidth() / 2 + 4)
    .attr("text-anchor", "end")
    .attr("class", "chart__tick")
    .attr("style", "font-family:var(--font-mono);font-size:12px")
    .text((d) => d.ch === " " ? "␣" : d.ch);
  bar.append("text")
    .attr("x", (d) => Math.max(M.left + 6, x(valueBy(d))) + 6)
    .attr("y", (d) => y(d.ch) + y.bandwidth() / 2 + 4)
    .attr("class", "chart__tick")
    .text((d) => {
      if (_sortBy === "n") return `${d.n} hits`;
      if (_sortBy === "avgMs") return `${d.avgMs}ms`;
      return `${d.errorRate.toFixed(1)}%  ·  ${d.n} hits`;
    });
  bar.append("title")
    .text((d) => `'${d.ch}'\nsamples: ${d.n}\nerrors: ${d.errors}\nerror rate: ${d.errorRate.toFixed(2)}%\navg keystroke: ${d.avgMs}ms`);
}
