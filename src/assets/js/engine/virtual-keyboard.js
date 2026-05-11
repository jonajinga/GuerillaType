/* Interactive virtual keyboard for mobile users.
   Phase 1: QWERTY only (letters + numbers + common punct + utility row).
   Replaces the OS soft keyboard: when this is active we set
   inputmode="none" on the typing surface input so iOS / Android
   won't try to surface their own keyboard.
   Each key dispatches a synthetic keystroke directly into the live
   engine via window.__tt (the engine instance exposed by
   practice-boot.js on every startEngine). No autocomplete, no
   predictive bar, no autocorrect -- the user gets exactly what
   they tap. */

const ROWS_LETTERS = [
  ["q","w","e","r","t","y","u","i","o","p"],
  ["a","s","d","f","g","h","j","k","l"],
  ["z","x","c","v","b","n","m"],
];

const ROWS_NUMBERS = [
  ["1","2","3","4","5","6","7","8","9","0"],
  ["-","/",":",";","(",")","$","&","@","\""],
  [".",",","?","!","'"],
];

let host = null;
let layer = "letters";    // "letters" | "numbers"
let shift = false;        // one-shot capital
let caps = false;         // shift-lock
let nextKey = null;       // current expected char for accent highlight
let mounted = false;

export function mountVirtualKeyboard() {
  if (mounted && host && document.body.contains(host)) return;
  // Defensive: if a stale host is in the DOM from a previous mount
  // attempt, clean it up before re-mounting.
  const stale = document.getElementById("tt-vkbd");
  if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
  host = document.createElement("aside");
  host.className = "vkbd";
  host.id = "tt-vkbd";
  host.setAttribute("aria-label", "On-screen keyboard");
  host.setAttribute("role", "group");
  document.body.appendChild(host);
  render();
  bindEvents();
  mounted = true;
  document.body.classList.add("has-vkbd");
  // Suppress the OS soft keyboard on the input.
  const input = document.getElementById("tt-input");
  if (input) {
    input.setAttribute("inputmode", "none");
    input.setAttribute("readonly", "readonly");
  }
}

export function unmountVirtualKeyboard() {
  if (host && host.parentNode) host.parentNode.removeChild(host);
  host = null;
  mounted = false;
  document.body.classList.remove("has-vkbd");
  const input = document.getElementById("tt-input");
  if (input) {
    input.setAttribute("inputmode", "text");
    input.removeAttribute("readonly");
  }
}

export function highlightNextKey(ch) {
  if (!mounted || !host) return;
  nextKey = ch && typeof ch === "string" ? ch.toLowerCase() : null;
  host.querySelectorAll(".vkbd__key").forEach((k) => {
    const v = k.dataset.k || "";
    k.classList.toggle("vkbd__key--next", v.toLowerCase() === nextKey);
  });
}

function render() {
  if (!host) return;
  const rows = layer === "letters" ? ROWS_LETTERS : ROWS_NUMBERS;
  const upper = (s) => (shift || caps) ? s.toUpperCase() : s;
  const r1 = rows[0].map((k) => keyHTML(upper(k))).join("");
  const r2 = rows[1].map((k) => keyHTML(upper(k))).join("");
  const r3letters = `
    <button type="button" class="vkbd__key vkbd__key--mod ${caps ? "vkbd__key--locked" : ""} ${shift ? "vkbd__key--armed" : ""}" data-action="shift" aria-label="Shift">
      ${caps ? "&#x21EA;" : "&#x21E7;"}
    </button>
    ${rows[2].map((k) => keyHTML(upper(k))).join("")}
    <button type="button" class="vkbd__key vkbd__key--mod" data-action="backspace" aria-label="Backspace">&#x232B;</button>
  `;
  const r3numbers = `
    ${rows[2].map((k) => keyHTML(k)).join("")}
    <button type="button" class="vkbd__key vkbd__key--mod" data-action="backspace" aria-label="Backspace">&#x232B;</button>
  `;
  const capsCls = caps ? "vkbd__key--locked" : "";
  const utility = `
    <button type="button" class="vkbd__key vkbd__key--mod" data-action="layer" aria-label="${layer === 'letters' ? 'Switch to numbers' : 'Switch to letters'}">
      ${layer === "letters" ? "123" : "ABC"}
    </button>
    <button type="button" class="vkbd__key vkbd__key--mod ${capsCls}" data-action="caps" aria-label="Caps lock" aria-pressed="${caps ? "true" : "false"}">caps</button>
    <button type="button" class="vkbd__key vkbd__key--space" data-k=" " aria-label="Space">space</button>
    <button type="button" class="vkbd__key" data-k="." aria-label="Period">.</button>
  `;
  host.innerHTML = `
    <div class="vkbd__row">${r1}</div>
    <div class="vkbd__row">${r2}</div>
    <div class="vkbd__row vkbd__row--3">${layer === "letters" ? r3letters : r3numbers}</div>
    <div class="vkbd__row vkbd__row--util">${utility}</div>
  `;
  if (nextKey) highlightNextKey(nextKey);
}

function keyHTML(k) {
  // Escape ampersand / lt / gt / quote for safe attribute embedding.
  const safe = k.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<button type="button" class="vkbd__key" data-k="${safe}" aria-label="${safe}">${safe}</button>`;
}

function bindEvents() {
  if (!host) return;
  // Mobile path: pointerdown / pointerup just paint the pressed
  // state. NO preventDefault on pointerdown -- some iOS / Chrome
  // Android builds suppress the subsequent click when pointerdown
  // is preventDefaulted, which was the source of "keyboard taps
  // do nothing on mobile". The blur-handler in input-capture
  // already ignores blurs that target .vkbd, so we no longer
  // need pointerdown.preventDefault to keep the engine running.
  //
  // Desktop path: mousedown.preventDefault stops the focus shift
  // synchronously on desktop browsers that don't emit
  // pointerdown -> click bridge events correctly.
  host.addEventListener("mousedown", (e) => {
    if (!e.target.closest(".vkbd__key")) return;
    e.preventDefault();
  });
  host.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".vkbd__key");
    if (btn) btn.classList.add("vkbd__key--pressed");
  });
  host.addEventListener("pointerup", (e) => {
    const btn = e.target.closest(".vkbd__key");
    if (btn) btn.classList.remove("vkbd__key--pressed");
  });
  host.addEventListener("pointercancel", (e) => {
    const btn = e.target.closest(".vkbd__key");
    if (btn) btn.classList.remove("vkbd__key--pressed");
  });
  host.addEventListener("click", (e) => {
    const btn = e.target.closest(".vkbd__key");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    handleKey(btn);
  });
}

function handleKey(btn) {
  const action = btn.dataset.action;
  if (action === "shift") {
    // Quick tap = one-shot shift. Double-tap (within 320 ms) = caps lock.
    const now = Date.now();
    if (btn._lastTap && now - btn._lastTap < 320) {
      caps = !caps; shift = false;
    } else {
      shift = !shift; if (shift) caps = false;
    }
    btn._lastTap = now;
    render();
    return;
  }
  if (action === "caps") {
    // Dedicated caps-lock toggle. Independent from shift's
    // double-tap path so users can find it explicitly. Tapping
    // caps clears any one-shot shift state.
    caps = !caps;
    shift = false;
    render();
    return;
  }
  if (action === "layer") {
    layer = layer === "letters" ? "numbers" : "letters";
    shift = false;
    render();
    return;
  }
  if (action === "backspace") {
    const handler = window.__vkbdHandler;
    if (handler && typeof handler.onBackspace === "function") {
      handler.onBackspace();
      return;
    }
    const eng = window.__tt;
    if (eng && eng.onBackspace) eng.onBackspace(false);
    return;
  }
  if (action === "enter") {
    const eng = window.__tt;
    // Enter on the engine is "restart-armed-then-fire" via Tab+Enter
    // on desktop. On a virtual keyboard, treat Enter as a no-op for
    // now -- typing surface doesn't need a newline key.
    return;
  }
  const k = btn.dataset.k;
  if (k == null) return;
  let ch = k;
  if ((shift || caps) && layer === "letters") ch = ch.toUpperCase();
  // Optional caller-supplied dispatch (e.g. the typing game's
  // input field). Takes priority over the engine path so pages
  // without an engine can still consume the keyboard.
  const handler = window.__vkbdHandler;
  if (handler && typeof handler.onChar === "function") {
    handler.onChar(ch);
    if (shift && !caps) { shift = false; render(); }
    return;
  }
  const eng = window.__tt;
  if (!eng || !eng.onChar) return;
  // Resume any stray pause from a focus thrash before processing
  // the char so the live stats don't show the pause artifact.
  if (eng._pauseAt) eng.resumeTimer();
  eng.onChar(ch, performance.now());
  // Re-assert focus on the input element so the engine stays in
  // "running" state. Without this, occasional taps where the
  // browser does decide to shift focus to the button leave the
  // input blurred -> onBlur -> pauseTimer.
  try {
    const input = document.getElementById("tt-input");
    if (input && document.activeElement !== input) {
      input.focus({ preventScroll: true });
    }
  } catch {}
  // One-shot shift clears after a key. Caps-lock persists.
  if (shift && !caps) { shift = false; render(); }
}
