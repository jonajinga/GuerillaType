/* Live ticker — keystroke pulse strip + WPM ribbon.
   Each keystroke pushes a colored cell (green=correct, red=incorrect)
   onto the right of the strip. After 40 cells, oldest fall off.
   The WPM number is driven by the engine's tick callback so it
   matches the toolbar exactly (same cumulative net-WPM calculation). */

const MAX_CELLS = 40;

let strip = null;
let wpmEl = null;
let visible = false;

export function mountLiveTicker() {
  strip = document.getElementById("tt-live-ticker-strip");
  wpmEl = document.getElementById("tt-live-ticker-wpm");
}

export function showLiveTicker(on) {
  visible = !!on;
  const host = document.getElementById("tt-live-ticker");
  if (host) host.hidden = !on;
}

/* Push a green/red cell for the keystroke. Cell carries data-tip
   instead of native title so the tooltip is rendered by the site's
   Tippy binder -- placement=bottom keeps it from overlapping the
   WPM tip that sits above the bar. */
export function recordKeystroke(ok, ms) {
  if (!visible || !strip) return;
  const cell = document.createElement("span");
  cell.className = "live-ticker__cell" + (ok ? " is-ok" : " is-bad");
  cell.setAttribute("data-tip", `${ok ? "ok" : "miss"} -- ${Math.round(ms || 0)}ms`);
  cell.setAttribute("data-tip-placement", "bottom");
  strip.appendChild(cell);
  while (strip.children.length > MAX_CELLS) strip.firstChild.remove();
}

/* updateWpm(w) — called by the engine's onTick. Mirrors the toolbar's
   live WPM so the two never drift. */
export function updateWpm(wpm) {
  if (wpmEl) wpmEl.textContent = `${Math.round(wpm)} wpm`;
}

export function resetTicker() {
  if (strip) strip.innerHTML = "";
  if (wpmEl) wpmEl.textContent = "— wpm";
}
