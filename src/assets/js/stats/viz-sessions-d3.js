/* D3-powered recent-sessions list.
   Each session is a row with: date stamp, mode label, a sparkline
   of per-word WPM over the session (if available), final WPM (big
   number), final accuracy. Sortable by date / WPM / accuracy /
   duration. Scrollable. */

import { loadD3 } from "./d3-loader.js";

let _sortBy = "date";    // date | wpm | acc | duration

export async function renderSessionsD3(host, sessions) {
  const d3 = await loadD3();
  if (!d3) return false;

  if (!sessions || !sessions.length) {
    host.innerHTML = `<p class="muted">No sessions yet -- go type something.</p>`;
    return true;
  }

  const all = sessions.slice(0, 60).map((s, i) => ({
    i,
    at: new Date(s.at),
    mode: s.mode || "?",
    duration: s.duration || (s.ms ? Math.round(s.ms / 1000) : 0),
    wpm: s.wpm || 0,
    acc: s.acc || 0,
    cons: s.cons || 0,
    chars: s.chars || 0,
    perWord: Array.isArray(s.perWordWpm) ? s.perWordWpm : [],
  }));

  all.sort((a, b) => {
    if (_sortBy === "wpm") return b.wpm - a.wpm;
    if (_sortBy === "acc") return b.acc - a.acc;
    if (_sortBy === "duration") return b.duration - a.duration;
    return b.at - a.at;  // date desc
  });

  // Scale max WPM across all sparklines so they're comparable.
  const globalMaxWpm = d3.max(all, (s) => Math.max(s.wpm, d3.max(s.perWord) || 0)) || 100;
  const accColor = d3.scaleLinear()
    .domain([60, 80, 95, 100])
    .range(["#d76050", "#e3b873", "#8fbf90", "#6ba9b3"])
    .clamp(true);

  host.innerHTML = `
    <div class="sessions-d3__toolbar">
      <button type="button" class="sessions-d3__sort" data-sort="date" data-tip="Most recent first.">By date</button>
      <button type="button" class="sessions-d3__sort" data-sort="wpm" data-tip="Sort by WPM, fastest first.">By WPM</button>
      <button type="button" class="sessions-d3__sort" data-sort="acc" data-tip="Sort by accuracy.">By accuracy</button>
      <button type="button" class="sessions-d3__sort" data-sort="duration" data-tip="Longest first.">By duration</button>
    </div>
    <div class="sessions-d3__scroll" id="sessions-d3-scroll"></div>
  `;
  host.querySelectorAll(".sessions-d3__sort").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.sort === _sortBy);
    btn.addEventListener("click", async () => {
      _sortBy = btn.dataset.sort;
      await renderSessionsD3(host, sessions);
    });
  });

  const scrollEl = host.querySelector("#sessions-d3-scroll");
  scrollEl.innerHTML = all.map((s, idx) => `
    <article class="session-row" data-idx="${idx}">
      <div class="session-row__head">
        <div class="session-row__when">
          <div class="session-row__date">${s.at.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
          <div class="session-row__time">${s.at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
        <div class="session-row__mode">${escape(s.mode)}${s.duration ? ` · ${s.duration}s` : ""}</div>
        <svg class="session-row__spark" viewBox="0 0 180 32" preserveAspectRatio="none"></svg>
        <div class="session-row__metric">
          <span class="session-row__wpm" style="color:var(--accent)">${Math.round(s.wpm)}</span>
          <span class="session-row__wpm-label">wpm</span>
        </div>
        <div class="session-row__acc" style="color:${accColor(s.acc)}">${Math.round(s.acc)}%</div>
      </div>
    </article>
  `).join("");

  // Paint each sparkline.
  scrollEl.querySelectorAll(".session-row").forEach((row) => {
    const idx = +row.dataset.idx;
    const s = all[idx];
    const spark = row.querySelector(".session-row__spark");
    paintSpark(d3, spark, s, globalMaxWpm);
  });

  return true;
}

function paintSpark(d3, svg, s, globalMaxWpm) {
  if (!svg) return;
  d3.select(svg).selectAll("*").remove();
  const data = s.perWord.filter(Number.isFinite);
  if (!data.length) {
    d3.select(svg).append("text")
      .attr("x", 90).attr("y", 20).attr("text-anchor", "middle")
      .attr("class", "chart__tick").attr("style", "fill:var(--fg-3);font-size:9px")
      .text("no per-word data");
    return;
  }
  const x = d3.scaleLinear().domain([0, data.length - 1]).range([2, 178]);
  const y = d3.scaleLinear().domain([0, globalMaxWpm]).range([30, 4]);
  const line = d3.line().x((_, i) => x(i)).y((v) => y(v)).curve(d3.curveMonotoneX);
  const area = d3.area().x((_, i) => x(i)).y0(30).y1((v) => y(v)).curve(d3.curveMonotoneX);
  d3.select(svg).append("path").datum(data)
    .attr("d", area).attr("fill", "var(--accent)").attr("fill-opacity", .18);
  d3.select(svg).append("path").datum(data)
    .attr("d", line).attr("fill", "none").attr("stroke", "var(--accent)").attr("stroke-width", 1.4);
}

function escape(s) {
  return String(s == null ? "" : s).replace(/[<>&"]/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;"}[c]));
}
