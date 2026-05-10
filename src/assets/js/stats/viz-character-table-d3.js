/* D3-powered character report.
   For every character the user has typed: samples, errors, error
   rate %, average keystroke ms. Rendered as a dense sortable grid
   where each row has inline bar visualisations for error rate and
   speed so the user can scan the worst offenders at a glance. */

import { loadD3 } from "./d3-loader.js";

let _sortBy = "errorRate";   // errorRate | n | avgMs | char

export async function renderCharacterTableD3(host, perCharDetail, perKey) {
  const d3 = await loadD3();
  if (!d3) return false;

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
  }).filter((r) => r.n >= 3);

  if (!rows.length) {
    host.innerHTML = `<p class="muted">Type a few sessions and per-character stats will appear here.</p>`;
    return true;
  }

  rows.sort((a, b) => {
    if (_sortBy === "n") return b.n - a.n;
    if (_sortBy === "avgMs") return b.avgMs - a.avgMs;
    if (_sortBy === "char") return a.ch.localeCompare(b.ch);
    return b.errorRate - a.errorRate;
  });

  const maxN = d3.max(rows, (r) => r.n) || 1;
  const maxMs = d3.max(rows, (r) => r.avgMs) || 1;
  const maxErr = Math.max(5, d3.max(rows, (r) => r.errorRate) || 0);
  const errColor = d3.scaleSequential()
    .domain([0, maxErr])
    .interpolator(d3.interpolateRgbBasis(["#8fbf90", "#e3b873", "#d76050"]));
  const msColor = d3.scaleSequential()
    .domain([0, maxMs])
    .interpolator(d3.interpolateRgbBasis(["#6ba9b3", "#e3b873", "#e58060"]));

  host.innerHTML = `
    <div class="chart-table__toolbar">
      <button type="button" class="chart-table__sort" data-sort="errorRate" data-tip="Hardest first.">By error rate</button>
      <button type="button" class="chart-table__sort" data-sort="avgMs" data-tip="Slowest first.">By speed</button>
      <button type="button" class="chart-table__sort" data-sort="n" data-tip="Most-typed first.">By samples</button>
      <button type="button" class="chart-table__sort" data-sort="char" data-tip="Alphabetical.">A → Z</button>
    </div>
    <div class="chart-table__scroll">
      <table class="chart-table">
        <thead>
          <tr>
            <th>Char</th>
            <th>Samples</th>
            <th>Errors</th>
            <th class="chart-table__bar-col">Error rate</th>
            <th class="chart-table__bar-col">Avg keystroke</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => {
            const errPct = Math.max(2, Math.min(100, (r.errorRate / maxErr) * 100));
            const msPct = Math.max(2, Math.min(100, (r.avgMs / maxMs) * 100));
            const display = r.ch === " " ? "␣" : escape(r.ch);
            return `
              <tr>
                <td class="chart-table__char">${display}</td>
                <td class="chart-table__num">${r.n}</td>
                <td class="chart-table__num" style="color:var(--bad)">${r.errors}</td>
                <td class="chart-table__bar-cell">
                  <span class="chart-table__bar">
                    <span class="chart-table__bar-fill" style="width:${errPct}%;background:${errColor(r.errorRate)}"></span>
                  </span>
                  <span class="chart-table__bar-val">${r.errorRate.toFixed(1)}%</span>
                </td>
                <td class="chart-table__bar-cell">
                  <span class="chart-table__bar">
                    <span class="chart-table__bar-fill" style="width:${msPct}%;background:${msColor(r.avgMs)}"></span>
                  </span>
                  <span class="chart-table__bar-val">${r.avgMs}ms</span>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
  host.querySelectorAll(".chart-table__sort").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.sort === _sortBy);
    btn.addEventListener("click", async () => {
      _sortBy = btn.dataset.sort;
      await renderCharacterTableD3(host, perCharDetail, perKey);
    });
  });
  return true;
}

function escape(s) {
  return String(s == null ? "" : s).replace(/[<>&"]/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;"}[c]));
}
