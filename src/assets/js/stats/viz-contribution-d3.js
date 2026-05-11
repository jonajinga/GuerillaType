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

  // Week view = 14 days in a single horizontal row with big
  // square cells and date labels under each. Year + Month use a
  // 7-row grid sized to the data.
  const CELL = view === "week" ? 56 : (view === "month" ? 32 : 12);
  const GAP = view === "week" ? 8 : (view === "month" ? 4 : 2);
  const ROWS = view === "week" ? 1 : 7;
  // Trim Sunday-padding BEFORE computing column count so the SVG
  // width is sized to the actual cell count, not the padded
  // pre-trim total. Without this the week view rendered a 21-day-
  // wide viewBox but only painted the last 14 cells, leaving an
  // empty trailing band.
  if (view === "week") {
    while (cells.length > 14) cells.shift();
  }
  const cols = Math.ceil(cells.length / ROWS);
  const W = cols * (CELL + GAP) + 8;
  // Extra header room above for weekday labels, extra footer for
  // legend so it never overlaps the row of date labels above it.
  const H = ROWS * (CELL + GAP) + (view === "week" ? 70 : 56);
  // Override .chart__svg { width: 100% } so the short views render
  // at natural pixel size, centered. Set explicit width/height
  // pixels so the SVG resolves its size correctly -- without these
  // (when CSS width is "auto") the browser falls back to the
  // intrinsic 300x150 default and the chart looks tiny.
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  if (view === "year") {
    svg.style.width = "100%";
    svg.style.height = "auto";
    svg.style.marginInline = "0";
  } else {
    svg.style.width = W + "px";
    svg.style.height = H + "px";
    svg.style.maxWidth = "100%";
    svg.style.marginInline = "auto";
  }
  svg.style.display = "block";
  svg.innerHTML = "";
  const sel = d3.select(svg);

  const maxChars = d3.max(cells, (c) => c.chars) || 1;
  const color = d3.scaleSequential()
    .domain([0, maxChars])
    .interpolator(d3.interpolateRgbBasis(["#252836", "#f59c80", "#e58060", "#c1413c"]));

  // Cell row offset shifts down on Week view so the day-of-week
  // labels above each cell have room.
  const rowOffsetY = view === "week" ? 24 : 4;
  // Cells.
  const cellSel = sel.append("g")
    .selectAll("rect")
    .data(cells)
    .enter()
    .append("rect")
    .attr("x", (d, i) => Math.floor(i / ROWS) * (CELL + GAP) + 4)
    .attr("y", (d, i) => (i % ROWS) * (CELL + GAP) + rowOffsetY)
    .attr("width", CELL).attr("height", CELL)
    .attr("rx", view === "week" ? 6 : (view === "month" ? 3 : 2))
    .attr("ry", view === "week" ? 6 : (view === "month" ? 3 : 2))
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

  const gridBottom = rowOffsetY + ROWS * (CELL + GAP);
  const labelY = gridBottom + 14;

  if (view === "year") {
    // Year view -- month names along the bottom.
    let lastMonth = -1;
    cells.forEach((c, i) => {
      if (i % ROWS !== 0) return;
      const m = c.date.getMonth();
      if (m !== lastMonth) {
        lastMonth = m;
        sel.append("text")
          .attr("x", Math.floor(i / ROWS) * (CELL + GAP) + 4)
          .attr("y", labelY)
          .attr("class", "chart__tick")
          .attr("style", "font-size:10px;fill:var(--fg-3)")
          .text(c.date.toLocaleDateString(undefined, { month: "short" }));
      }
    });
  } else if (view === "month") {
    // Month view -- show ONE label per month boundary. Per-Sunday
    // labels were cramming "15Feb 22Mar 1Mar 8" together because each
    // column is only 36 px and the label text is wider than that.
    // Mirror year view: label whichever Sunday column contains the
    // 1st of a new month, or the first Sunday in the span.
    let lastMonth = -1;
    cells.forEach((c, i) => {
      if (i % ROWS !== 0) return; // only label Sunday cells
      const m = c.date.getMonth();
      // Label only when the month CHANGES across the span, or the
      // very first Sunday in the data (whose month introduces the
      // span). Skip otherwise.
      if (m === lastMonth) return;
      lastMonth = m;
      sel.append("text")
        .attr("x", Math.floor(i / ROWS) * (CELL + GAP) + 4 + CELL / 2)
        .attr("y", labelY)
        .attr("text-anchor", "middle")
        .attr("class", "chart__tick")
        .attr("style", "font-size:11px;fill:var(--fg-3);font-family:var(--font-mono);letter-spacing:.04em")
        .text(c.date.toLocaleDateString(undefined, { month: "short" }));
    });
  } else if (view === "week") {
    // Week view -- single horizontal strip of 14 cells. Above
    // each cell: weekday letter. Below: day-of-month number.
    const weekdayShort = ["S","M","T","W","T","F","S"];
    cells.forEach((c, i) => {
      const cx = i * (CELL + GAP) + 4 + CELL / 2;
      // Weekday letter above the cell.
      sel.append("text")
        .attr("x", cx).attr("y", 14)
        .attr("text-anchor", "middle")
        .attr("class", "chart__tick")
        .attr("style", "font-size:11px;fill:var(--fg-3);font-family:var(--font-mono);letter-spacing:.04em")
        .text(weekdayShort[c.date.getDay()]);
      // Date below the cell.
      sel.append("text")
        .attr("x", cx).attr("y", labelY + 2)
        .attr("text-anchor", "middle")
        .attr("class", "chart__tick")
        .attr("style", "font-size:11px;fill:var(--fg-2);font-family:var(--font-mono)")
        .text(c.date.getDate());
      // Month change marker between Apr 30 and May 1 etc.
      if (i === 0 || c.date.getDate() === 1) {
        sel.append("text")
          .attr("x", cx).attr("y", labelY + 18)
          .attr("text-anchor", "middle")
          .attr("class", "chart__tick")
          .attr("style", "font-size:9px;fill:var(--fg-3);font-family:var(--font-mono);letter-spacing:.08em;text-transform:uppercase")
          .text(c.date.toLocaleDateString(undefined, { month: "short" }));
      }
    });
  }

  // Legend strip below the labels, right-aligned. For Week view,
  // shift further down to clear the date + month markers.
  const legendCell = 10, legendGap = 3;
  const legendW = 5 * (legendCell + legendGap) + 64;
  const legendY = view === "week" ? labelY + 28 : labelY + 12;
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
    panel.innerHTML = `
      <div class="day-panel">
        <header class="day-panel__head">
          <h3 class="day-panel__title">${fmt}</h3>
          <p class="day-panel__sub muted">No sessions recorded that day.</p>
        </header>
      </div>`;
    panel.hidden = false;
    return;
  }
  const total = {
    chars: sessions.reduce((s, x) => s + (x.chars || 0), 0),
    ms: sessions.reduce((s, x) => s + (x.ms || 0), 0),
    bestWpm: Math.max(...sessions.map((s) => s.wpm || 0)),
    avgAcc: sessions.reduce((s, x) => s + (x.acc || 0), 0) / sessions.length,
  };
  // Sort newest first within the day so the most recent session
  // is at the top.
  const ordered = [...sessions].sort((a, b) => new Date(b.at) - new Date(a.at));
  const rows = ordered.map((s) => {
    const t = new Date(s.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const chars = s.chars || 0;
    const wpm = Math.round(s.wpm || 0);
    const acc = Math.round(s.acc || 0);
    // Color the accuracy chip by tier (cheap visual hierarchy).
    const accClass = acc >= 95 ? "good" : (acc >= 80 ? "ok" : "bad");
    return `
      <li class="day-panel__row">
        <span class="day-panel__time">${t}</span>
        <span class="day-panel__mode">${escapeText(s.mode || "?")}</span>
        <span class="day-panel__wpm tabular">${wpm}<span class="day-panel__unit">wpm</span></span>
        <span class="day-panel__acc day-panel__acc--${accClass} tabular">${acc}%</span>
        <span class="day-panel__chars tabular muted">${chars} <span class="day-panel__unit">chars</span></span>
      </li>`;
  }).join("");
  const summary = [
    `${sessions.length} session${sessions.length === 1 ? "" : "s"}`,
    `${total.chars.toLocaleString()} chars`,
    total.ms ? `${Math.round(total.ms / 60000)} min` : null,
    `best ${Math.round(total.bestWpm)} wpm`,
    `avg ${Math.round(total.avgAcc)}% acc`,
  ].filter(Boolean).join(" · ");
  panel.innerHTML = `
    <div class="day-panel">
      <header class="day-panel__head">
        <h3 class="day-panel__title">${fmt}</h3>
        <p class="day-panel__sub muted">${summary}</p>
      </header>
      <ul class="day-panel__list">${rows}</ul>
    </div>`;
  panel.hidden = false;
}

function escapeText(s) {
  return String(s == null ? "" : s).replace(/[<>&"]/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;"}[c]));
}
