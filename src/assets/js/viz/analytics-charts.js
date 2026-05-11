/* D3-driven charts for /analytics/ and /community-stats/. Reads
   a snapshot of Umami API data baked into the page at build time
   (window.__analyticsData) and renders each chart inside the
   `<div class="ac-chart" data-chart="..."> ` slots placed in the
   markup. D3 is lazy-loaded from esm.sh via the shared loader so
   the bundle stays small. */

import { loadD3 } from "../stats/d3-loader.js";

const COLORS = {
  accent: "var(--accent)",
  accent2: "var(--accent-soft, #e58060)",
  good: "var(--good, #76c893)",
  bad: "var(--bad, #c1413c)",
  ink: "var(--fg-0)",
  mute: "var(--fg-3)",
  rule: "var(--rule)",
  bg2: "var(--bg-2)",
};

function fmtNum(n) {
  const v = +n || 0;
  if (v >= 1000) return (v / 1000).toFixed(1) + "k";
  return String(Math.round(v));
}

function ensureSvg(host, w, h) {
  host.innerHTML = "";
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("class", "ac-chart__svg");
  svg.setAttribute("role", "img");
  host.appendChild(svg);
  return { svg, ns };
}

/* Horizontal bar chart. Best for top-N categorical lists
   (top pages, top countries, top books). Accepts data as
   [{ label, count }]. */
export async function horizontalBars(host, data, opts = {}) {
  const d3 = await loadD3();
  if (!d3 || !data || !data.length) {
    host.innerHTML = `<p class="ac-chart__empty">No data yet.</p>`;
    return;
  }
  const margin = { top: 8, right: 40, bottom: 8, left: opts.labelW || 140 };
  const rowH = opts.rowH || 26;
  const w = 720;
  const h = margin.top + margin.bottom + data.length * rowH;
  const { svg } = ensureSvg(host, w, h);
  const sel = d3.select(svg);
  const x = d3.scaleLinear()
    .domain([0, d3.max(data, (d) => d.count) || 1])
    .range([0, w - margin.left - margin.right]);
  const y = d3.scaleBand()
    .domain(data.map((_, i) => i))
    .range([margin.top, h - margin.bottom])
    .padding(0.18);

  // Labels (left)
  sel.append("g").selectAll("text").data(data).enter().append("text")
    .attr("x", margin.left - 8)
    .attr("y", (_, i) => y(i) + y.bandwidth() / 2)
    .attr("text-anchor", "end")
    .attr("dominant-baseline", "central")
    .attr("class", "ac-chart__label")
    .text((d) => d.label.length > 28 ? d.label.slice(0, 27) + "…" : d.label)
    .append("title").text((d) => d.label);

  // Bars
  sel.append("g").selectAll("rect").data(data).enter().append("rect")
    .attr("x", margin.left)
    .attr("y", (_, i) => y(i))
    .attr("width", (d) => x(d.count))
    .attr("height", y.bandwidth())
    .attr("rx", 3)
    .attr("class", "ac-chart__bar");

  // Count labels (right)
  sel.append("g").selectAll("text").data(data).enter().append("text")
    .attr("x", (d) => margin.left + x(d.count) + 6)
    .attr("y", (_, i) => y(i) + y.bandwidth() / 2)
    .attr("dominant-baseline", "central")
    .attr("class", "ac-chart__count")
    .text((d) => fmtNum(d.count));
}

/* Vertical bar chart with ordered buckets. Useful for distribution
   histograms (WPM bucket, accuracy bucket). */
export async function verticalBars(host, data, opts = {}) {
  const d3 = await loadD3();
  if (!d3 || !data || !data.length) {
    host.innerHTML = `<p class="ac-chart__empty">No data yet.</p>`;
    return;
  }
  const margin = { top: 24, right: 12, bottom: 36, left: 36 };
  const w = 720;
  const h = opts.height || 240;
  const { svg } = ensureSvg(host, w, h);
  const sel = d3.select(svg);
  const innerW = w - margin.left - margin.right;
  const innerH = h - margin.top - margin.bottom;
  const x = d3.scaleBand().domain(data.map((d) => d.label)).range([0, innerW]).padding(0.18);
  const maxY = d3.max(data, (d) => d.count) || 1;
  const y = d3.scaleLinear().domain([0, maxY]).range([innerH, 0]).nice();

  const g = sel.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  // Gridlines
  g.append("g").attr("class", "ac-chart__grid")
    .selectAll("line").data(y.ticks(4)).enter().append("line")
    .attr("x1", 0).attr("x2", innerW)
    .attr("y1", (d) => y(d)).attr("y2", (d) => y(d));

  // Bars
  g.selectAll("rect.bar").data(data).enter().append("rect")
    .attr("class", "ac-chart__bar")
    .attr("x", (d) => x(d.label))
    .attr("y", (d) => y(d.count))
    .attr("width", x.bandwidth())
    .attr("height", (d) => innerH - y(d.count))
    .attr("rx", 3);

  // Count labels above bars
  g.selectAll("text.count").data(data).enter().append("text")
    .attr("x", (d) => x(d.label) + x.bandwidth() / 2)
    .attr("y", (d) => y(d.count) - 4)
    .attr("text-anchor", "middle")
    .attr("class", "ac-chart__count-top")
    .text((d) => d.count > 0 ? fmtNum(d.count) : "");

  // X axis labels
  g.append("g").attr("transform", `translate(0,${innerH})`)
    .selectAll("text").data(data).enter().append("text")
    .attr("x", (d) => x(d.label) + x.bandwidth() / 2)
    .attr("y", 18)
    .attr("text-anchor", "middle")
    .attr("class", "ac-chart__axis")
    .text((d) => d.label);

  // Y axis labels
  g.append("g")
    .selectAll("text").data(y.ticks(4)).enter().append("text")
    .attr("x", -6)
    .attr("y", (d) => y(d))
    .attr("text-anchor", "end")
    .attr("dominant-baseline", "central")
    .attr("class", "ac-chart__axis")
    .text(fmtNum);
}

/* Daily line chart for pageview / session time series. Accepts
   { pageviews: [{ x, y }], sessions: [{ x, y }] } as returned by
   Umami's /pageviews endpoint. */
export async function timeLine(host, series, opts = {}) {
  const d3 = await loadD3();
  if (!d3 || !series || (!series.pageviews && !series.sessions)) {
    host.innerHTML = `<p class="ac-chart__empty">No data yet.</p>`;
    return;
  }
  const pageviews = (series.pageviews || []).map((p) => ({ t: new Date(p.x), v: +p.y || 0 }));
  const sessions = (series.sessions || []).map((p) => ({ t: new Date(p.x), v: +p.y || 0 }));
  const margin = { top: 16, right: 16, bottom: 32, left: 36 };
  const w = 720;
  const h = opts.height || 260;
  const { svg } = ensureSvg(host, w, h);
  const sel = d3.select(svg);
  const innerW = w - margin.left - margin.right;
  const innerH = h - margin.top - margin.bottom;
  const allPoints = pageviews.concat(sessions);
  if (!allPoints.length) {
    host.innerHTML = `<p class="ac-chart__empty">No data yet.</p>`;
    return;
  }
  const x = d3.scaleTime()
    .domain(d3.extent(allPoints, (p) => p.t))
    .range([0, innerW]);
  const maxY = d3.max(allPoints, (p) => p.v) || 1;
  const y = d3.scaleLinear().domain([0, maxY]).range([innerH, 0]).nice();
  const g = sel.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  // Grid
  g.append("g").attr("class", "ac-chart__grid")
    .selectAll("line").data(y.ticks(4)).enter().append("line")
    .attr("x1", 0).attr("x2", innerW)
    .attr("y1", (d) => y(d)).attr("y2", (d) => y(d));

  const line = d3.line().x((d) => x(d.t)).y((d) => y(d.v)).curve(d3.curveMonotoneX);
  const area = d3.area().x((d) => x(d.t)).y0(innerH).y1((d) => y(d.v)).curve(d3.curveMonotoneX);

  // Pageviews layer
  g.append("path").datum(pageviews).attr("class", "ac-chart__area").attr("d", area);
  g.append("path").datum(pageviews).attr("class", "ac-chart__line ac-chart__line--primary").attr("d", line);
  // Sessions layer
  g.append("path").datum(sessions).attr("class", "ac-chart__line ac-chart__line--secondary").attr("d", line);

  // Axes
  const xTicks = x.ticks(Math.min(6, allPoints.length));
  g.append("g").attr("transform", `translate(0,${innerH})`)
    .selectAll("text").data(xTicks).enter().append("text")
    .attr("x", (d) => x(d))
    .attr("y", 18)
    .attr("text-anchor", "middle")
    .attr("class", "ac-chart__axis")
    .text((d) => d3.timeFormat("%b %d")(d));
  g.append("g")
    .selectAll("text").data(y.ticks(4)).enter().append("text")
    .attr("x", -6)
    .attr("y", (d) => y(d))
    .attr("text-anchor", "end")
    .attr("dominant-baseline", "central")
    .attr("class", "ac-chart__axis")
    .text(fmtNum);
}

/* Donut for proportional dimensions (devices, browsers, OS). */
export async function donut(host, data, opts = {}) {
  const d3 = await loadD3();
  if (!d3 || !data || !data.length) {
    host.innerHTML = `<p class="ac-chart__empty">No data yet.</p>`;
    return;
  }
  const w = 280;
  const h = 280;
  const r = 110;
  const ir = 64;
  const { svg } = ensureSvg(host, w, h);
  const sel = d3.select(svg);
  const total = d3.sum(data, (d) => d.count) || 1;
  const palette = [COLORS.accent, "#e58060", "#e3b873", "#76c893", "#6c71c4", "#6ba9b3", "#d33682", "#268bd2"];
  const pie = d3.pie().value((d) => d.count).sort(null);
  const arc = d3.arc().innerRadius(ir).outerRadius(r);
  const g = sel.append("g").attr("transform", `translate(${w / 2}, ${h / 2})`);
  g.selectAll("path").data(pie(data)).enter().append("path")
    .attr("d", arc)
    .attr("fill", (_, i) => palette[i % palette.length])
    .append("title").text((d) => `${d.data.label}: ${d.data.count} (${(d.data.count / total * 100).toFixed(1)}%)`);
  g.append("text")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .attr("class", "ac-chart__donut-total")
    .text(fmtNum(total));
}

/* Auto-wire data to chart slots based on data-chart attribute. The
   page just drops <div class="ac-chart" data-chart="pages"></div>
   and we paint into it. */
export async function paintAll(data) {
  if (!data) return;
  const hosts = document.querySelectorAll(".ac-chart[data-chart]");
  for (const host of hosts) {
    const kind = host.dataset.chart;
    const series = host.dataset.series;
    if (kind === "horizontalBars" && data.dimensions && data.dimensions[series]) {
      await horizontalBars(host, data.dimensions[series]);
    } else if (kind === "verticalBars" && data[series]) {
      // Convert bucketMap (object) to ordered array of {label,count}
      const order = host.dataset.order ? host.dataset.order.split(",") : null;
      const map = data[series];
      const entries = order
        ? order.filter((k) => map[k] != null).map((k) => ({ label: k, count: map[k] }))
        : Object.entries(map).map(([label, count]) => ({ label, count }));
      await verticalBars(host, entries);
    } else if (kind === "timeLine") {
      await timeLine(host, data.pageviewSeries);
    } else if (kind === "donut" && data.dimensions && data.dimensions[series]) {
      await donut(host, data.dimensions[series]);
    }
  }
}
