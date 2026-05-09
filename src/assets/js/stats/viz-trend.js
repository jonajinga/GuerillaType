/* Trend line — last N sessions, plot WPM over index. */

export function renderTrend(svg, sessions, opts = {}) {
  const W = 600, H = 160, PAD_L = 36, PAD_R = 12, PAD_T = 12, PAD_B = 22;
  const data = (sessions || []).slice(0, opts.n || 30).reverse();
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "chart__svg");
  svg.innerHTML = "";

  if (!data.length) {
    const t = el("text", { x: W / 2, y: H / 2, "text-anchor": "middle", class: "chart__tick" });
    t.textContent = "Not enough data yet";
    svg.appendChild(t);
    return;
  }

  const wpms = data.map((s) => s.wpm);
  const min = Math.max(0, Math.min(...wpms) - 5);
  const max = Math.max(...wpms) + 5;
  const span = max - min || 1;

  const x = (i) => PAD_L + (i / Math.max(1, data.length - 1)) * (W - PAD_L - PAD_R);
  const y = (v) => PAD_T + (1 - (v - min) / span) * (H - PAD_T - PAD_B);

  // Axes
  svg.appendChild(el("line", { x1: PAD_L, y1: H - PAD_B, x2: W - PAD_R, y2: H - PAD_B, class: "chart__axis" }));
  svg.appendChild(el("line", { x1: PAD_L, y1: PAD_T, x2: PAD_L, y2: H - PAD_B, class: "chart__axis" }));

  // Y ticks
  for (const t of [min, (min + max) / 2, max]) {
    const yt = y(t);
    const ln = el("line", { x1: PAD_L, y1: yt, x2: W - PAD_R, y2: yt, class: "chart__axis", "stroke-dasharray": "2,4", "stroke-opacity": ".25" });
    svg.appendChild(ln);
    const tx = el("text", { x: PAD_L - 6, y: yt + 3, "text-anchor": "end", class: "chart__tick" });
    tx.textContent = Math.round(t);
    svg.appendChild(tx);
  }

  // Area + line
  let path = "";
  data.forEach((s, i) => { path += (i === 0 ? "M" : "L") + x(i) + "," + y(s.wpm); });
  const area = path + `L${x(data.length - 1)},${H - PAD_B} L${PAD_L},${H - PAD_B} Z`;
  svg.appendChild(el("path", { d: area, class: "chart__area" }));
  svg.appendChild(el("path", { d: path, class: "chart__line" }));

  // Points -- data-tip for the page-wide tippy promoter so the
  // tooltip styling matches the rest of the stats page.
  data.forEach((s, i) => {
    const c = el("circle", { cx: x(i), cy: y(s.wpm), r: 2.5, fill: "currentColor", class: "chart__line" });
    c.setAttribute("data-tip", `${s.wpm} wpm · ${s.acc}% · ${s.mode}`);
    svg.appendChild(c);
  });
}
function el(tag, attrs = {}) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  return e;
}
