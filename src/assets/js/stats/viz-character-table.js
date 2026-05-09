/* Character report — sortable per-character table. Reads from
   perCharDetail (v2) with a fallback to perKey (v1). Rows show
   samples, errors, error %, avg ms, last error time. Click any
   column header to sort by that column; click again to reverse. */

const SORTS = {
  char:    (a, b) => a.ch.localeCompare(b.ch),
  samples: (a, b) => b.n - a.n,
  errors:  (a, b) => b.errors - a.errors,
  errRate: (a, b) => b.errRate - a.errRate,
  avgMs:   (a, b) => b.avgMs - a.avgMs,
  lastErr: (a, b) => (b.lastError || 0) - (a.lastError || 0),
};

export function renderCharacterTable(host, perCharDetail, perKey) {
  if (!host) return;
  const useDetail = perCharDetail && Object.keys(perCharDetail).length > 0;
  const source = useDetail ? perCharDetail : (perKey || {});
  const rows = Object.keys(source).map((ch) => {
    const e = source[ch] || {};
    const n = e.n || 0;
    return {
      ch,
      n,
      errors: e.errors || 0,
      errRate: n > 0 ? (e.errors || 0) / n : 0,
      avgMs: (n > 0 && e.sumMs > 0) ? e.sumMs / n : 0,
      lastSeen: e.lastSeen || null,
      lastError: e.lastError || null,
    };
  }).filter((r) => r.n > 0);

  if (!rows.length) {
    host.innerHTML = `<p class="muted" style="padding:var(--space-3) 0">Type a few sessions to see a per-character breakdown — every key you press lands here with samples, error rate, and average press time.</p>`;
    return;
  }

  const total = rows.reduce((n, r) => n + r.n, 0);
  const totalErr = rows.reduce((n, r) => n + r.errors, 0);
  const overall = total > 0 ? (totalErr / total) * 100 : 0;

  // Build the static skeleton ONCE, then re-paint just the <tbody>
  // on resort so column-header listeners survive.
  host.innerHTML = `
    <p class="muted" style="margin:0 0 var(--space-3);font-size:var(--fs-200)">
      ${rows.length} characters · ${total.toLocaleString()} total samples · ${totalErr.toLocaleString()} errors (${overall.toFixed(2)}% overall)
      ${useDetail ? "" : "<span class=\"muted\" style=\"opacity:.7\"> · v1 data (limited fields)</span>"}
    </p>
    <div class="char-table__wrap">
      <table class="char-table">
        <thead>
          <tr>
            <th data-sort="char">Char</th>
            <th data-sort="samples" class="num">Samples</th>
            <th data-sort="errors" class="num">Errors</th>
            <th data-sort="errRate" class="num is-desc">Error %</th>
            <th data-sort="avgMs" class="num">Avg ms</th>
            <th data-sort="lastErr">Last error</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  `;
  const tbody = host.querySelector("tbody");
  let sortKey = "errRate";
  let sortDesc = true;

  function paintBody() {
    const sorted = [...rows].sort(SORTS[sortKey] || SORTS.errRate);
    if (!sortDesc) sorted.reverse();
    tbody.innerHTML = sorted.map((r) => `
      <tr>
        <td class="char-table__char">${escapeHtml(r.ch === " " ? "␣" : r.ch)}</td>
        <td class="num tabular">${r.n}</td>
        <td class="num tabular">${r.errors}</td>
        <td class="num tabular">${(r.errRate * 100).toFixed(1)}%</td>
        <td class="num tabular">${r.avgMs > 0 ? Math.round(r.avgMs) : "—"}</td>
        <td class="char-table__when">${r.lastError ? relativeTime(r.lastError) : "—"}</td>
      </tr>
    `).join("");
    host.querySelectorAll("th[data-sort]").forEach((th) => {
      th.classList.remove("is-asc", "is-desc");
      if (th.dataset.sort === sortKey) th.classList.add(sortDesc ? "is-desc" : "is-asc");
    });
  }

  host.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const k = th.dataset.sort;
      if (k === sortKey) sortDesc = !sortDesc;
      else { sortKey = k; sortDesc = true; }
      paintBody();
    });
  });
  paintBody();
}

function relativeTime(ms) {
  const d = Date.now() - ms;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.round(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.round(d / 3_600_000)}h ago`;
  return `${Math.round(d / 86_400_000)}d ago`;
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
