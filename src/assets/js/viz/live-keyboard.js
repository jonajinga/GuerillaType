/* Live virtual keyboard. Renders an SVG of the active layout below the
   typing surface and highlights the next-expected key in the accent
   color. Below the keyboard, names the finger that should press it. */

import { keyMap, fingerForKey, bucketLabel, LAYOUTS, NUMPAD_KEYS } from "../engine/layouts.js";

const NS = "http://www.w3.org/2000/svg";

let svg = null;
let fingerEl = null;
let keyMapByChar = {};
let currentLayout = "qwerty";
let currentChar = null;

export function mountLiveKeyboard(layoutName = "qwerty") {
  svg = document.getElementById("tt-live-keyboard-svg");
  fingerEl = document.getElementById("tt-live-keyboard-finger");
  if (!svg) return;
  currentLayout = layoutName;
  buildSvg(layoutName);
}

export function showLiveKeyboard(visible) {
  const host = document.getElementById("tt-live-keyboard");
  if (host) host.hidden = !visible;
}

/* highlightChar(ch) — show the next expected key. Pass null to clear. */
export function highlightChar(ch) {
  if (!svg) return;
  // Clear previous.
  svg.querySelectorAll(".live-kb__key.is-next").forEach((k) => k.classList.remove("is-next"));
  if (!ch) {
    if (fingerEl) fingerEl.textContent = "";
    return;
  }
  currentChar = ch;
  // Space and Enter have no printable glyph, so their caps carry token
  // ids instead of the raw character.
  const target = ch === " " ? "_space" : ch === "\n" ? "_enter" : ch.toLowerCase();
  const keyEl = svg.querySelector(`[data-key="${cssEscape(target)}"]`);
  if (keyEl) keyEl.classList.add("is-next");
  if (fingerEl) {
    const f = fingerForKey(ch, currentLayout);
    fingerEl.textContent = f
      ? `Use ${bucketLabel(f)} for ${ch === " " ? "space" : `“${ch}”`}`
      : "";
  }
}

function buildSvg(layoutName) {
  if (!svg) return;
  svg.innerHTML = "";
  svg.classList.toggle("live-kb__svg--numpad", layoutName === "numpad");
  if (layoutName === "numpad") {
    return buildNumpad();
  }
  const rows = LAYOUTS[layoutName] || LAYOUTS.qwerty;
  const map = keyMap(layoutName);
  keyMapByChar = map;

  const cellW = 64, cellH = 56, gap = 6;
  const rowOffsets = [0, 26, 42, 84]; // visual stagger
  const W = 14 * (cellW + gap) + 40;
  const H = rows.length * (cellH + gap) + cellH + 24;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  rows.forEach((row, ri) => {
    Array.from(row).forEach((ch, ci) => {
      const x = (rowOffsets[ri] || 0) + ci * (cellW + gap);
      const y = ri * (cellH + gap);
      const finger = fingerForKey(ch, layoutName);
      const g = el("g", { class: "live-kb__key", "data-key": ch, "data-finger": finger || "" });
      g.appendChild(el("rect", { x, y, width: cellW, height: cellH, rx: 3, ry: 3, class: "live-kb__cap" }));
      const t = el("text", { x: x + cellW / 2, y: y + cellH / 2 + 5, "text-anchor": "middle", class: "live-kb__lbl" });
      t.textContent = ch;
      g.appendChild(t);
      svg.appendChild(g);
    });
  });

  // Spacebar
  const sx = rowOffsets[3] + 4 * (cellW + gap);
  const sy = rows.length * (cellH + gap) + 6;
  const sg = el("g", { class: "live-kb__key", "data-key": "_space", "data-finger": "R_thumb" });
  sg.appendChild(el("rect", { x: sx, y: sy, width: cellW * 5, height: cellH - 6, rx: 3, ry: 3, class: "live-kb__cap" }));
  const st = el("text", { x: sx + (cellW * 5) / 2, y: sy + cellH / 2, "text-anchor": "middle", class: "live-kb__lbl" });
  st.textContent = "space";
  sg.appendChild(st);
  svg.appendChild(sg);
}

/* The 10-key pad, drawn from the NUMPAD_KEYS geometry table so the
   caps, the char inventory and the finger map all come from one source.
   Every cap gets data-finger so the highlight styling can key off the
   finger the same way the main-board keyboard does. There is no
   spacebar on a numpad, so none is drawn. */
function buildNumpad() {
  const cellW = 60, cellH = 52, gap = 6, pad = 12;
  const cols = 4, rowCount = 5;
  const W = cols * (cellW + gap) - gap + pad * 2;
  const H = rowCount * (cellH + gap) - gap + pad * 2;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

  for (const k of NUMPAD_KEYS) {
    const w = (k.w || 1) * (cellW + gap) - gap;
    const h = (k.h || 1) * (cellH + gap) - gap;
    const x = pad + k.col * (cellW + gap);
    const y = pad + k.row * (cellH + gap);
    const finger = fingerForKey(k.ch, "numpad");
    const id = k.ch === "\n" ? "_enter" : k.ch;
    const g = el("g", { class: "live-kb__key", "data-key": id, "data-finger": finger || "" });
    g.appendChild(el("rect", { x, y, width: w, height: h, rx: 3, ry: 3, class: "live-kb__cap" }));
    const t = el("text", { x: x + w / 2, y: y + h / 2 + 7, "text-anchor": "middle", class: "live-kb__lbl live-kb__lbl--big" });
    t.textContent = k.label || k.ch;
    g.appendChild(t);
    svg.appendChild(g);
  }
}

function el(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
  return e;
}

function cssEscape(s) {
  return String(s).replace(/(["\\])/g, "\\$1");
}
