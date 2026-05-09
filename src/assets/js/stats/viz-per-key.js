/* Per-key bar chart — top-N slowest keys by avg key time. */

export function renderPerKey(svg, perKey, opts = {}) {
  const data = [];
  for (const ch of Object.keys(perKey)) {
    const e = perKey[ch];
    if (!e || e.n < 2) continue;
    data.push({ ch, avg: e.sumMs / e.n, n: e.n, errors: e.errors });
  }
  data.sort((a, b) => b.avg - a.avg);
  const top = data.slice(0, opts.n || 12);

  const W = 600, BAR_H = 18, GAP = 6, PAD_L = 26, PAD_R = 50;
  const H = top.length * (BAR_H + GAP) + 4;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "chart__svg");
  svg.innerHTML = "";

  if (!top.length) {
    const t = el("text", { x: W / 2, y: 24, "text-anchor": "middle", class: "chart__tick" });
    t.textContent = "Type a few sessions to see per-key data";
    svg.appendChild(t);
    return;
  }
  const maxAvg = top[0].avg;
  top.forEach((d, i) => {
    const y = i * (BAR_H + GAP);
    const w = (d.avg / maxAvg) * (W - PAD_L - PAD_R);
    const bar = el("rect", { x: PAD_L, y, width: w, height: BAR_H, class: "chart__bar" });
    svg.appendChild(bar);
    const lab = el("text", { x: PAD_L - 4, y: y + BAR_H / 2 + 1, "text-anchor": "end", class: "chart__bar-label" });
    lab.textContent = d.ch === " " ? "␣" : d.ch;
    svg.appendChild(lab);
    const val = el("text", { x: PAD_L + w + 4, y: y + BAR_H / 2 + 1, class: "chart__bar-label" });
    val.textContent = `${Math.round(d.avg)} ms · ${d.n}`;
    svg.appendChild(val);
  });
}
function el(tag, attrs = {}) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  return e;
}
