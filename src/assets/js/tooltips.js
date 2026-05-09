/* Tooltips — powered by Tippy.js (Popper.js) loaded lazily from
   esm.sh. Any element with `data-tip="..."` (or a `title` attribute,
   which we promote to data-tip on first bind) gets a popover with
   the same look as the rest of the editorial UI. The library is only
   fetched when at least one [data-tip] exists on the page, so plain
   pages don't pay the network cost. */

const TIPPY_CDN = "https://esm.sh/tippy.js@6";

let _tippy = null;
let _bindQueue = [];
let _loadPromise = null;

async function loadTippy() {
  if (_tippy) return _tippy;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    try {
      const mod = await import(/* @vite-ignore */ TIPPY_CDN);
      _tippy = mod.default || mod.tippy || mod;
      return _tippy;
    } catch (err) {
      // Network failure — fall back to native title="" so the user
      // still sees a tooltip on hover. Promote data-tip → title on
      // every queued and future element.
      console.warn("[tooltips] Tippy load failed; falling back to native title.", err);
      document.querySelectorAll("[data-tip]").forEach((el) => {
        if (!el.hasAttribute("title")) el.setAttribute("title", stripTags(el.dataset.tip || ""));
      });
      return null;
    }
  })();
  return _loadPromise;
}

function stripTags(s) {
  return String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function bindElement(el) {
  if (!_tippy || el.dataset._tipBound === "1") return;
  el.dataset._tipBound = "1";
  // Promote any leftover title to data-tip + remove it so the browser
  // doesn't double-render.
  const t = el.getAttribute("title");
  if (t && !el.getAttribute("data-tip")) el.setAttribute("data-tip", t);
  if (t) el.removeAttribute("title");
  const content = el.getAttribute("data-tip");
  if (!content) return;
  // Per-element placement override via data-tip-placement="bottom"
  // (or "left" / "right"). Falls back to "top" -- the editorial default.
  const placement = el.getAttribute("data-tip-placement") || "top";
  _tippy(el, {
    content,
    allowHTML: true,
    placement,
    arrow: true,
    theme: "guerilla",
    delay: [80, 60],
    duration: [120, 80],
    maxWidth: 280,
    offset: [0, 8],
    interactive: false,
    appendTo: () => document.body,
    // Touch devices: only show after a 500 ms hold, and hide the
    // moment the user stops holding. Without this, every tap on a
    // tooltip-bound element fires the tooltip *and* the underlying
    // click handler -- which on mobile causes flicker, reads as a
    // misfire, and blocks the user's actual tap target. The "hold"
    // mode mirrors how Android long-press shows tooltips natively.
    touch: ["hold", 500],
  });
}

function bindAll(root = document) {
  // Bind both elements that explicitly opt in via data-tip AND any
  // element with a plain title attribute. Native title tooltips are
  // ugly + browser-styled; promoting them to Tippy gives consistent
  // editorial popovers across the entire site (header icons,
  // streak chip, theme toggle, etc.).
  const targets = Array.from(root.querySelectorAll("[data-tip], [title]"))
    .filter((el) => el.dataset._tipBound !== "1");
  if (!targets.length) return;
  if (!_tippy) {
    targets.forEach((el) => _bindQueue.push(el));
    loadTippy().then((mod) => {
      if (!mod) return;
      _bindQueue.splice(0).forEach(bindElement);
    });
    return;
  }
  targets.forEach(bindElement);
}

document.addEventListener("DOMContentLoaded", () => bindAll());
// Re-bind on dynamic DOM changes (e.g. mode-bar variant fieldsets
// toggling visibility, megamenu featured slots populating).
new MutationObserver(() => bindAll()).observe(document.body, { childList: true, subtree: true });
// Eager-load if any [data-tip] is already in the DOM.
if (document.querySelector("[data-tip]")) loadTippy();

window.tippyHide = function () {
  if (!_tippy) return;
  document.querySelectorAll("[data-tippy-root]").forEach((el) => {
    const inst = el._tippy;
    if (inst && inst.hide) inst.hide();
  });
};
