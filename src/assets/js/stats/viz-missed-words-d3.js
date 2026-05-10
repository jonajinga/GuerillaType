/* D3-powered missed-words viz.
   Horizontal bars per word, length = miss count, color = recency
   (recent = warm red, old = cool gray). Sortable by count /
   recency / alphabetical via small toggle buttons. Scrollable
   region so every tracked word stays reachable. */

import { loadD3 } from "./d3-loader.js";

let _sortBy = "score";   // score | n | recent | alpha

export async function renderMissedWordsD3(host, missedWordsMap) {
  const d3 = await loadD3();
  if (!d3) return false;

  const now = Date.now();
  const halfLife = 14 * 24 * 60 * 60 * 1000;
  const rows = Object.entries(missedWordsMap || {})
    .map(([w, e]) => {
      const last = e.last || 0;
      const ageMs = Math.max(0, now - last);
      const decay = Math.pow(0.5, ageMs / halfLife);
      return {
        word: w,
        n: e.n || 0,
        last,
        ageMs,
        score: (e.n || 0) * decay,
      };
    })
    .filter((r) => r.n > 0);

  if (!rows.length) {
    host.innerHTML = `<p class="muted">No missed words tracked yet -- finish a session and any word you flub will land here.</p>`;
    return true;
  }

  rows.sort((a, b) => {
    if (_sortBy === "n") return b.n - a.n;
    if (_sortBy === "recent") return b.last - a.last;
    if (_sortBy === "alpha") return a.word.localeCompare(b.word);
    return b.score - a.score;
  });

  // Clip to a sensible max for memory, but allow scrolling through
  // all of them via the wrapper's overflow-y.
  const top = rows.slice(0, 500);
  const maxN = d3.max(top, (r) => r.n) || 1;
  const maxAge = d3.max(top, (r) => r.ageMs) || 1;

  // Recency color: recent (low age) -> warm red, old -> muted.
  const ageColor = d3.scaleSequential()
    .domain([0, maxAge])
    .interpolator(d3.interpolateRgbBasis(["#d76050", "#e58060", "#a39e8e", "#5e5a4f"]));

  // Build a single SVG sized to fit all rows; the parent host has
  // overflow:auto so the user scrolls through.
  // Layout columns:
  //   word label  | bar (flexes)  | count number (50 px) | last-seen (70 px)
  // The count + last-seen sit in their own fixed slots so the bar
  // can never overlap them (and the count never collides with the
  // "Last" column on long bars).
  const ROW = 24;
  const M = { top: 36, bottom: 8, left: 110 };
  const COUNT_W = 50;
  const LAST_W = 70;
  const W = 720;
  const BAR_END = W - COUNT_W - LAST_W - 16;
  const M_right = COUNT_W + LAST_W + 16;
  const H = M.top + top.length * ROW + M.bottom;

  host.innerHTML = `
    <div class="missed-d3__toolbar">
      <button type="button" class="missed-d3__sort" data-sort="score" data-tip="Recency-weighted score (default).">By score</button>
      <button type="button" class="missed-d3__sort" data-sort="n" data-tip="Sort by raw miss count.">By count</button>
      <button type="button" class="missed-d3__sort" data-sort="recent" data-tip="Most-recent first.">By recency</button>
      <button type="button" class="missed-d3__sort" data-sort="alpha" data-tip="Alphabetical.">A → Z</button>
    </div>
    <div class="missed-d3__scroll">
      <svg class="missed-d3__svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet"></svg>
    </div>
  `;
  // Wire toggles.
  host.querySelectorAll(".missed-d3__sort").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.sort === _sortBy);
    btn.addEventListener("click", async () => {
      _sortBy = btn.dataset.sort;
      await renderMissedWordsD3(host, missedWordsMap);
    });
  });

  const svg = host.querySelector(".missed-d3__svg");
  const sel = d3.select(svg);

  const y = d3.scaleBand()
    .domain(top.map((r) => r.word))
    .range([M.top, H - M.bottom])
    .padding(0.18);
  const x = d3.scaleLinear()
    .domain([0, maxN])
    .range([M.left, BAR_END]);

  // Header row.
  sel.append("text")
    .attr("x", M.left - 8).attr("y", M.top - 16)
    .attr("text-anchor", "end")
    .attr("class", "chart__tick")
    .attr("style", "font-size:10px;fill:var(--fg-3);letter-spacing:.08em;text-transform:uppercase")
    .text("Word");
  sel.append("text")
    .attr("x", M.left + 6).attr("y", M.top - 16)
    .attr("class", "chart__tick")
    .attr("style", "font-size:10px;fill:var(--fg-3);letter-spacing:.08em;text-transform:uppercase")
    .text("Miss count");
  sel.append("text")
    .attr("x", W - LAST_W - 12).attr("y", M.top - 16)
    .attr("text-anchor", "end")
    .attr("class", "chart__tick")
    .attr("style", "font-size:10px;fill:var(--fg-3);letter-spacing:.08em;text-transform:uppercase")
    .text("Count");
  sel.append("text")
    .attr("x", W - 6).attr("y", M.top - 16)
    .attr("text-anchor", "end")
    .attr("class", "chart__tick")
    .attr("style", "font-size:10px;fill:var(--fg-3);letter-spacing:.08em;text-transform:uppercase")
    .text("Last");

  // Rows.
  const g = sel.append("g")
    .selectAll("g")
    .data(top)
    .enter()
    .append("g");
  g.append("text")
    .attr("x", M.left - 8).attr("y", (d) => y(d.word) + y.bandwidth() / 2 + 4)
    .attr("text-anchor", "end")
    .attr("class", "chart__tick")
    .attr("style", "font-family:var(--font-mono);font-size:12px;fill:var(--fg-0)")
    .text((d) => d.word);
  g.append("rect")
    .attr("x", M.left)
    .attr("y", (d) => y(d.word))
    .attr("height", y.bandwidth())
    .attr("width", (d) => Math.max(2, x(d.n) - M.left))
    .attr("fill", (d) => ageColor(d.ageMs))
    .attr("opacity", .85);
  // Count value -- pinned to its own column slot, right-aligned,
  // so it never overlaps the bar or the Last column. Bar width is
  // already clamped to BAR_END.
  g.append("text")
    .attr("x", W - LAST_W - 12)
    .attr("y", (d) => y(d.word) + y.bandwidth() / 2 + 4)
    .attr("text-anchor", "end")
    .attr("class", "chart__tick")
    .attr("style", "font-family:var(--font-mono);font-size:12px;fill:var(--fg-1)")
    .text((d) => d.n);
  // Last-seen column -- right-aligned at the SVG's right edge.
  g.append("text")
    .attr("x", W - 6)
    .attr("y", (d) => y(d.word) + y.bandwidth() / 2 + 4)
    .attr("text-anchor", "end")
    .attr("class", "chart__tick")
    .attr("style", "font-size:11px;fill:var(--fg-2);font-family:var(--font-mono)")
    .text((d) => formatAgo(d.ageMs));
  g.append("title")
    .text((d) => `${d.word}\nmissed ${d.n} time${d.n === 1 ? "" : "s"}\nlast missed ${formatAgo(d.ageMs)} ago\nrecency-weighted score: ${d.score.toFixed(2)}`);

  return true;
}

function formatAgo(ms) {
  if (ms < 60 * 1000) return "just now";
  if (ms < 60 * 60 * 1000) return Math.floor(ms / 60000) + "m";
  if (ms < 24 * 60 * 60 * 1000) return Math.floor(ms / 3600000) + "h";
  if (ms < 30 * 24 * 60 * 60 * 1000) return Math.floor(ms / 86400000) + "d";
  return Math.floor(ms / (30 * 86400000)) + "mo";
}
