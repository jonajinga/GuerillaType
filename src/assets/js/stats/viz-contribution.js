/* Contribution grid — GitHub-style. Phase 2.3 upgrade:
   - Cells are now interactive (click to drill down).
   - Year / Month / Week views select what range the grid renders.
   - Hourly heatmap (24×1) shown when a single day is drilled into.

   Public API:
     renderContribution(svg, dailyMap, { onSelect, view, anchorIso, hourlyMap })
       - svg          target <svg>
       - dailyMap     profile.daily         { "YYYY-MM-DD": {sessions,timeMs,chars} }
       - onSelect     callback(iso) when a cell is clicked (used to open the
                      drill-down panel below)
       - view         "year" | "month" | "week"  (default "year")
       - anchorIso    optional anchor date for month/week views; defaults to
                      today
       - hourlyMap    profile.hourly        { "YYYY-MM-DDTHH": {…} }   used
                      by the per-day strip rendered separately. */

const NS = "http://www.w3.org/2000/svg";

export function renderContribution(svg, dailyMap, opts = {}) {
  const view = opts.view || "year";
  // Build anchor from a YYYY-MM-DD string with LOCAL midnight so the
  // grid alignment matches the local-tz keys in dailyMap. Using
  // "T00:00:00Z" before would shift a Dec-31 anchor to a Jan-1 row in
  // east-of-UTC zones.
  const anchor = opts.anchorIso
    ? (() => { const [y, m, d] = opts.anchorIso.split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); })()
    : new Date();
  const onSelect = opts.onSelect || null;

  if (view === "year") return renderYear(svg, dailyMap, onSelect, anchor);
  if (view === "month") return renderMonth(svg, dailyMap, onSelect, anchor);
  if (view === "week") return renderWeek(svg, dailyMap, onSelect, anchor);
  return renderYear(svg, dailyMap, onSelect, anchor);
}

const bucket = (ms) => {
  if (!ms) return 0;
  if (ms < 3 * 60_000) return 1;
  if (ms < 10 * 60_000) return 2;
  if (ms < 25 * 60_000) return 3;
  return 4;
};

function renderYear(svg, dailyMap, onSelect, today) {
  const cell = 11, gap = 2;
  const cols = 53, rows = 7;
  const W = cols * (cell + gap) + 30;
  const H = rows * (cell + gap) + 18;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "contrib__svg");
  svg.innerHTML = "";

  // Walk the grid in LOCAL time so cells align with the local calendar
  // and lookup keys match the local-tz dailyMap keys produced by the
  // session recorder.
  const dow = today.getDay();
  const start = new Date(today);
  start.setDate(start.getDate() - (cols - 1) * 7 - dow);

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const d = new Date(start);
      d.setDate(d.getDate() + c * 7 + r);
      if (d > today) continue;
      const iso = ymdLocal(d);
      const day = dailyMap[iso];
      const lvl = bucket(day?.timeMs);
      const x = c * (cell + gap) + 18;
      const y = r * (cell + gap);
      const rect = el("rect", { x, y, width: cell, height: cell, class: "contrib__cell", "data-level": String(lvl), "data-iso": iso, role: "button", tabindex: 0 });
      rect.setAttribute("data-tip", day
        ? `<strong>${iso}</strong><br>${day.sessions} session${day.sessions === 1 ? "" : "s"} · ${(day.timeMs / 60_000).toFixed(0)} min · ${day.chars.toLocaleString()} chars`
        : `<strong>${iso}</strong><br>No activity`);
      if (onSelect) {
        rect.addEventListener("click", () => onSelect(iso));
        rect.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(iso); } });
      }
      svg.appendChild(rect);
    }
  }

  ["", "Mon", "", "Wed", "", "Fri", ""].forEach((label, r) => {
    if (!label) return;
    const t = el("text", { x: 0, y: r * (cell + gap) + cell - 1, class: "chart__tick" });
    t.textContent = label;
    svg.appendChild(t);
  });
}

function renderMonth(svg, dailyMap, onSelect, anchor) {
  // Calendar grid for the anchor's month: 6 rows × 7 cols. Local-tz
  // throughout so the grid aligns with the user's calendar.
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cell = 36, gap = 4;
  const cols = 7, rows = 6;
  const W = cols * (cell + gap) + 8;
  const H = rows * (cell + gap) + 26;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "contrib__svg");
  svg.innerHTML = "";

  const dowLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  dowLabels.forEach((lbl, i) => {
    const t = el("text", { x: i * (cell + gap) + cell / 2, y: 12, class: "chart__tick", "text-anchor": "middle" });
    t.textContent = lbl;
    svg.appendChild(t);
  });

  for (let i = 0; i < rows * cols; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const dayNum = i - startDow + 1;
    if (dayNum < 1 || dayNum > daysInMonth) continue;
    const d = new Date(year, month, dayNum);
    const iso = ymdLocal(d);
    const day = dailyMap[iso];
    const lvl = bucket(day?.timeMs);
    const x = c * (cell + gap);
    const y = r * (cell + gap) + 18;
    const rect = el("rect", { x, y, width: cell, height: cell, class: "contrib__cell contrib__cell--lg", "data-level": String(lvl), "data-iso": iso, role: "button", tabindex: 0 });
    rect.setAttribute("data-tip", day
      ? `<strong>${iso}</strong><br>${day.sessions} session${day.sessions === 1 ? "" : "s"} · ${(day.timeMs / 60_000).toFixed(0)} min · ${day.chars.toLocaleString()} chars`
      : `<strong>${iso}</strong><br>No activity`);
    if (onSelect) {
      rect.addEventListener("click", () => onSelect(iso));
      rect.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(iso); } });
    }
    svg.appendChild(rect);
    const lbl = el("text", { x: x + 5, y: y + 14, class: "chart__tick contrib__cell-num" });
    lbl.textContent = String(dayNum);
    svg.appendChild(lbl);
  }
}

function renderWeek(svg, dailyMap, onSelect, anchor) {
  // Anchor week (Sunday → Saturday containing anchor) in local time.
  const dow = anchor.getDay();
  const start = new Date(anchor);
  start.setDate(start.getDate() - dow);

  const cell = 86, gap = 6;
  const cols = 7, rows = 1;
  const W = cols * (cell + gap);
  const H = rows * (cell + gap) + 26;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "contrib__svg");
  svg.innerHTML = "";

  const dowLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let c = 0; c < 7; c++) {
    const d = new Date(start);
    d.setDate(d.getDate() + c);
    const iso = ymdLocal(d);
    const day = dailyMap[iso];
    const lvl = bucket(day?.timeMs);
    const x = c * (cell + gap);
    const y = 18;
    const rect = el("rect", { x, y, width: cell, height: cell * 0.55, class: "contrib__cell contrib__cell--lg", "data-level": String(lvl), "data-iso": iso, role: "button", tabindex: 0 });
    rect.setAttribute("data-tip", day
      ? `<strong>${iso}</strong><br>${day.sessions} session${day.sessions === 1 ? "" : "s"} · ${(day.timeMs / 60_000).toFixed(0)} min · ${day.chars.toLocaleString()} chars`
      : `<strong>${iso}</strong><br>No activity`);
    if (onSelect) {
      rect.addEventListener("click", () => onSelect(iso));
      rect.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(iso); } });
    }
    svg.appendChild(rect);
    const lbl = el("text", { x: x + cell / 2, y: 12, class: "chart__tick", "text-anchor": "middle" });
    lbl.textContent = `${dowLabels[c]} ${d.getDate()}`;
    svg.appendChild(lbl);
  }
}

/* Per-day hourly strip — 24 columns, rendered into a separate <svg>
   when a day cell is selected. */
export function renderDayStrip(svg, hourlyMap, iso) {
  const cell = 22, gap = 2;
  const W = 24 * (cell + gap);
  const H = cell + 18;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "contrib__svg");
  svg.innerHTML = "";

  for (let h = 0; h < 24; h++) {
    const key = `${iso}T${String(h).padStart(2, "0")}`;
    const e = hourlyMap[key];
    const lvl = bucket(e?.timeMs);
    const x = h * (cell + gap);
    const rect = el("rect", { x, y: 0, width: cell, height: cell, class: "contrib__cell", "data-level": String(lvl) });
    rect.setAttribute("data-tip", e
      ? `<strong>${h}:00</strong><br>${e.sessions} session${e.sessions === 1 ? "" : "s"} · ${(e.timeMs / 60_000).toFixed(0)} min`
      : `<strong>${h}:00</strong><br>No activity`);
    svg.appendChild(rect);
    if (h % 3 === 0) {
      const lbl = el("text", { x: x + cell / 2, y: cell + 12, class: "chart__tick", "text-anchor": "middle" });
      lbl.textContent = `${h}`;
      svg.appendChild(lbl);
    }
  }
}

function el(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  return e;
}

/* Local-tz "YYYY-MM-DD" -- avoids the UTC drift of toISOString() so
   a 9 PM Dec 31 EST session shows up under Dec 31, not Jan 1. Must
   match the key shape produced by util/format.js's todayIso(). */
function ymdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
