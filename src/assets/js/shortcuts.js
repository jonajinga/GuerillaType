/* Keyboard-shortcuts overlay. Open with ? or Ctrl+/.

   Navigation shortcuts use Alt+letter so they coexist with active typing
   on the practice surface — single-letter shortcuts would be eaten by
   the input-capture's "any printable key refocuses the typing input"
   behavior. Alt+key combinations don't conflict and work everywhere. */

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || "");
const ALT_LABEL = isMac ? "⌥" : "Alt";

const SHORTCUTS = [
  { group: "Practice surface", items: [
    { keys: ["Tab", "Enter"], desc: "Restart current test (Tab arms, Enter within 2s confirms)" },
    { keys: ["Esc"], desc: "End the session, save it, return to the toolbar" },
    { keys: ["Backspace"], desc: "Rewind one character" },
    { keys: ["Ctrl", "Backspace"], desc: "Rewind whole word" },
    { keys: ["any printable key"], desc: "Refocus the typing input" },
  ]},
  { group: "Site (works anywhere)", items: [
    { keys: ["Shift", "?"], desc: "Open this shortcuts overlay" },
    { keys: ["Ctrl", "/"], desc: "Open this shortcuts overlay (alternate)" },
    { keys: ["Ctrl", "K"], desc: "Open site search" },
    { keys: ["Esc"], desc: "Close any open overlay or modal" },
    { keys: [ALT_LABEL, "T"], desc: "Toggle day / night theme" },
  ]},
  { group: "Quick navigation", items: [
    { keys: [ALT_LABEL, "H"], desc: "Home" },
    { keys: [ALT_LABEL, "P"], desc: "Practice surface" },
    { keys: [ALT_LABEL, "L"], desc: "Lessons" },
    { keys: [ALT_LABEL, "D"], desc: "Drills" },
    { keys: [ALT_LABEL, "C"], desc: "Challenges" },
    { keys: [ALT_LABEL, "Q"], desc: "Quotes" },
    { keys: [ALT_LABEL, "B"], desc: "Library (books)" },
    { keys: [ALT_LABEL, "S"], desc: "Stats dashboard" },
    { keys: [ALT_LABEL, "U"], desc: "User guide" },
    { keys: [ALT_LABEL, "X"], desc: "Custom text" },
  ]},
];

const ROUTES = {
  h: "/", p: "/practice/", l: "/lessons/", d: "/drills/",
  c: "/challenges/", q: "/quotes/", b: "/library/",
  s: "/stats/", u: "/guide/", x: "/custom/",
};

let overlay = null;
function build() {
  if (overlay) return overlay;
  const el = document.createElement("dialog");
  el.id = "shortcuts-overlay";
  el.className = "shortcuts-overlay";
  el.setAttribute("aria-label", "Keyboard shortcuts");
  el.innerHTML = `
    <div class="shortcuts-overlay__head">
      <h2 class="shortcuts-overlay__title">Keyboard shortcuts</h2>
      <button type="button" class="shortcuts-overlay__close" aria-label="Close">×</button>
    </div>
    <div class="shortcuts-overlay__body">
      ${SHORTCUTS.map((g) => `
        <section class="shortcuts-group">
          <h3 class="shortcuts-group__title">${g.group}</h3>
          <dl class="shortcuts-list">
            ${g.items.map((item) => `
              <dt>${item.keys.map((k) => `<kbd>${escapeHtml(k)}</kbd>`).join("<span class=\"shortcuts__plus\">+</span>")}</dt>
              <dd>${escapeHtml(item.desc)}</dd>
            `).join("")}
          </dl>
        </section>
      `).join("")}
    </div>
    <div class="shortcuts-overlay__foot">
      <span>Press <kbd>Shift</kbd>+<kbd>?</kbd> any time to reopen this overlay.</span>
      <a href="/guide/" class="muted">Open the user guide →</a>
    </div>
  `;
  document.body.appendChild(el);
  el.querySelector(".shortcuts-overlay__close").addEventListener("click", () => close());
  el.addEventListener("click", (e) => { if (e.target === el) close(); });
  el.addEventListener("close", () => { overlay && overlay.classList.remove("is-open"); });
  overlay = el;
  return el;
}
function open() {
  const el = build();
  if (!el.open) el.showModal();
  el.classList.add("is-open");
}
function close() {
  if (overlay && overlay.open) overlay.close();
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}

document.addEventListener("keydown", (e) => {
  const tag = (e.target && e.target.tagName) || "";
  const editable = tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable);

  // Ctrl/Cmd+/ opens shortcuts overlay from anywhere — including while typing.
  const isCtrlSlash = e.key === "/" && (e.ctrlKey || e.metaKey);
  if (isCtrlSlash) { e.preventDefault(); e.stopPropagation(); open(); return; }

  // Cmd/Ctrl+K opens site search palette.
  if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey) && !e.altKey) {
    e.preventDefault(); e.stopPropagation();
    if (window.openSearch) window.openSearch();
    return;
  }

  // Plain `?` opens shortcuts — but ONLY when not focused on an input,
  // so typing "?" inside the typing surface or a search box passes through.
  const isQuestionMark = !editable && (e.key === "?" || (e.shiftKey && e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey));
  if (isQuestionMark) { e.preventDefault(); e.stopPropagation(); open(); return; }

  // Esc closes any open dialog (shortcuts overlay, search palette).
  if (e.key === "Escape") {
    const search = document.getElementById("site-search");
    if (search && search.open) { e.preventDefault(); search.close(); return; }
    if (overlay && overlay.open) { e.preventDefault(); close(); return; }
  }

  // Alt+letter navigation + actions work EVERYWHERE — including the
  // typing surface. Use e.code (KeyR) instead of e.key because some
  // platforms emit alternate glyphs for Alt+letter (e.g. Option+R = ®).
  // Alt+R was the legacy restart binding — replaced by Tab+Enter on
  // the practice surface (handled in input-capture.js) since Alt+R
  // collides with NVIDIA GeForce overlay and other gaming overlays.
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    const code = e.code || "";
    const letter = code.startsWith("Key") ? code.slice(3).toLowerCase() : (e.key || "").toLowerCase();
    if (letter === "t") { e.preventDefault(); e.stopPropagation(); window.toggleTheme && window.toggleTheme(); return; }
    if (ROUTES[letter]) { e.preventDefault(); e.stopPropagation(); window.location.href = ROUTES[letter]; return; }
  }
}, { capture: true });
