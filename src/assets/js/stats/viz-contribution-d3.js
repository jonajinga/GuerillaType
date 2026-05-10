/* D3-powered contribution calendar.
   53 columns (weeks) x 7 rows (days). Each cell colored by total
   keystrokes that day, scale interpolating between bg-2 and accent.
   Hover for date + char count; click for a panel below with the
   day's sessions. Range = last 12 months. */

import { loadD3 } from "./d3-loader.js";

export async function renderContributionD3(svg, daily, panel, opts = {}) {
  const d3 = await loadD3();
  if (!d3) {
    const fallback = await import("./viz-contribution.js");
    fallback.renderContribution(svg, daily, opts);
    return;
  }

  // Pick the time window. "year" = 365 days, "month" = ~12 weeks
  // (84 days), "week" = 14 days for a wider visual on phones.
  const view = opts.view || "year";
  const span = view === "week" ? 14 : (view === "month" ? 84 : 364);

  const cells = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const start = new Date(now); start.setDate(now.getDate() - span);
  // Align start to Sunday so all 7-day rows line up.
  while (start.getDay() !== 0) start.setDate(start.getDate() - 1);
  for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const entry = (daily || {})[iso] || { sessions: 0, chars: 0, timeMs: 0 };
    cells.push({
      iso, date: new Date(d),
      sessions: entry.sessions || 0,
      chars: entry.chars || 0,
      timeMs: entry.timeMs || 0,
    });
  }

  // Bigger cells + more gap when there's less data (week/month
  // views) so the grid still reads well.
  const CELL = view === "week" ? 32 : (view === "month" ? 18 : 12);
  const GAP = view === "week" ? 6 : (view === "month" ? 3 : 2);
  const ROWS = 7;
  const cols = Math.ceil(cells.length / ROWS);
  const W = cols * (CELL + GAP) + 8;
  // Extra header room for month labels, extra footer room for the
  // legend strip so it never overlaps the labels above it.
  const H = ROWS * (CELL + GAP) + 50;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = "";
  const sel = d3.select(svg);

  const maxChars = d3.max(cells, (c) => c.chars) || 1;
  const color = d3.scaleSequential()
    .domain([0, maxChars])
    .interpolator(d3.interpolateRgbBasis(["#252836", "#f59c80", "#e58060", "#c1413c"]));

  // Cells.
  const cellSel = sel.append("g")
    .selectAll("rect")
    .data(cells)
    .enter()
    .append("rect")
    .attr("x", (d, i) => Math.floor(i / ROWS) * (CELL + GAP) + 4)
    .attr("y", (d, i) => (i % ROWS) * (CELL + GAP) + 4)
    .attr("width", CELL).attr("height", CELL)
    .attr("rx", 2).attr("ry", 2)
    .attr("fill", (d) => d.chars > 0 ? color(d.chars) : "var(--bg-2)")
    .attr("opacity", (d) => d.chars > 0 ? 0.95 : 0.5)
    .attr("style", "cursor:pointer");

  cellSel.append("title")
    .text((d) => {
      const dateStr = d.date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      if (!d.chars) return `${dateStr} -- no activity`;
      const mins = Math.round(d.timeMs / 60000);
      return `${dateStr}\n${d.chars.toLocaleString()} chars · ${d.sessions} sessions · ${mins} min`;
    });

  // Click handler -- show that day's sessions in the panel.
  if (panel) {
    cellSel.on("click", (event, d) => {
      const sessionsForDay = (window.__profileSessions || [])
        .filter((s) => {
          try { return new Date(s.at).toISOString().slice(0, 10) === d.iso; } catch { return false; }
        });
      renderDayPanel(panel, d, sessionsForDay);
    });
  }

  // Month labels along the bottom of the grid (Year/Month views
  // only -- Week is too narrow to need them, and the labels would
  // overlap the legend below). Skip in Week view.
  const gridBottom = 4 + ROWS * (CELL + GAP);
  const monthLabelY = gridBottom + 14;
  if (view !== "week") {
    let lastMonth = -1;
    cells.forEach((c, i) => {
      if (i % ROWS !== 0) return;
      const m = c.date.getMonth();
      if (m !== lastMonth) {
        lastMonth = m;
        sel.append("text")
          .attr("x", Math.floor(i / ROWS) * (CELL + GAP) + 4)
          .attr("y", monthLabelY)
          .attr("class", "chart__tick")
          .attr("style", "font-size:10px;fill:var(--fg-3)")
          .text(c.date.toLocaleDateString(undefined, { month: "short" }));
      }
    });
  }

  // Week view shows date labels above each cell column instead.
  if (view === "week") {
    cells.forEach((c, i) => {
      if (i % ROWS !== 0) return;
      sel.append("text")
        .attr("x", Math.floor(i / ROWS) * (CELL + GAP) + 4 + CELL / 2)
        .attr("y", monthLabelY)
        .attr("text-anchor", "middle")
        .attr("class", "chart__tick")
        .attr("style", "font-size:10px;fill:var(--fg-3)")
        .text(c.date.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
    });
  }

  // Legend strip on its own row, right-aligned, BELOW the month
  // labels so the two never overlap. Smaller squares so it
  // doesn't dominate at any view size.
  const legendCell = 10, legendGap = 3;
  const legendW = 5 * (legendCell + legendGap) + 64;
  const legendY = monthLabelY + 8;
  const legend = sel.append("g")
    .attr("transform", `translate(${Math.max(0, W - legendW - 4)}, ${legendY})`);
  legend.append("text")
    .attr("x", -4).attr("y", legendCell - 1)
    .attr("text-anchor", "end")
    .attr("class", "chart__tick")
    .attr("style", "font-size:9px;fill:var(--fg-3)")
    .text("Less");
  [0, 0.25, 0.5, 0.75, 1].forEach((t, idx) => {
    legend.append("rect")
      .attr("x", idx * (legendCell + legendGap)).attr("y", 0)
      .attr("width", legendCell).attr("height", legendCell)
      .attr("rx", 2).attr("ry", 2)
      .attr("fill", t === 0 ? "var(--bg-2)" : color(t * maxChars));
  });
  legend.append("text")
    .attr("x", 5 * (legendCell + legendGap) + 4).attr("y", legendCell - 1)
    .attr("class", "chart__tick")
    .attr("style", "font-size:9px;fill:var(--fg-3)")
    .text("More");
}

function renderDayPanel(panel, dayCell, sessions) {
  if (!panel) return;
  const fmt = dayCell.date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  if (!sessions.length) {
    panel.innerHTML = `<p class="muted"><strong>${fmt}</strong> -- no sessions recorded.</p>`;
    panel.hidden = false;
    return;
  }
  const total = {
    chars: sessions.reduce((s, x) => s + (x.chars || 0), 0),
    ms: sessions.reduce((s, x) => s + (x.ms || 0), 0),
    bestWpm: Math.max(...sessions.map((s) => s.wpm || 0)),
    avgAcc: sessions.reduce((s, x) => s + (x.acc || 0), 0) / sessions.length,
  };
  const rows = sessions.map((s) => {
    const t = new Date(s.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return `<tr><td>${t}</td><td>${s.mode || "?"}</td><td>${Math.round(s.wpm || 0)} wpm</td><td>${Math.round(s.acc || 0)}%</td><td>${Math.round((s.ms || 0) / 1000)}s</td></tr>`;
  }).join("");
  panel.innerHTML = `
    <h3 style="margin:0 0 .5rem">${fmt}</h3>
    <p class="muted" style="margin:0 0 .8rem">
      ${sessions.length} session${sessions.length === 1 ? "" : "s"} ·
      ${total.chars.toLocaleString()} chars ·
      ${Math.round(total.ms / 60000)} min ·
      best ${Math.round(total.bestWpm)} wpm ·
      avg ${Math.round(total.avgAcc)}% acc
    </p>
    <table class="data-table">
      <thead><tr><th>Time</th><th>Mode</th><th>WPM</th><th>Acc</th><th>Length</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  panel.hidden = false;
}
