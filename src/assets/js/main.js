/* Site bootstrap — runs on every page. Handles theme toggle, hamburger
   nav, profile init, and back-to-top button. */

import { migrate } from "./storage.js";
import { getActive } from "./profiles.js";
import { Analytics } from "./analytics.js";
import "./megamenu.js";
import "./shortcuts.js";
import "./prefetch.js";
import "./info-modal.js";
import "./search.js";
import "./pwa.js";
import "./debug-overlay.js";

migrate();
const _profile = getActive(); // ensure default profile exists

/* Site-wide analytics. Umami auto-records pageviews; these add
   GuerillaType layer events (LCP buckets, uncaught errors,
   external-link clicks, PWA install). */
(function siteAnalytics() {
  const slug = document.body.dataset.page || "unknown";
  try {
    if ("PerformanceObserver" in window) {
      const po = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (!last) return;
        const ms = Math.round(last.renderTime || last.loadTime || last.startTime || 0);
        if (!ms) return;
        const bucket = ms < 1500 ? "good" : ms < 2500 ? "needs_improvement" : "poor";
        Analytics.perfTiming({ metric: "LCP", ms, bucket, page: slug });
        po.disconnect();
      });
      po.observe({ type: "largest-contentful-paint", buffered: true });
    }
  } catch {}
  window.addEventListener("error", (e) => {
    try { Analytics.jsError({ msg: String(e.message || "").slice(0, 200), page: slug }); } catch {}
  });
  window.addEventListener("unhandledrejection", (e) => {
    try {
      const r = (e.reason && (e.reason.message || String(e.reason))) || "promise";
      Analytics.jsError({ msg: String(r).slice(0, 200), page: slug, kind: "promise" });
    } catch {}
  });
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    try {
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
      const u = new URL(href, location.href);
      if (u.origin !== location.origin) {
        Analytics.externalLinkClicked({ host: u.hostname, page: slug });
      }
    } catch {}
  });
  window.addEventListener("appinstalled", () => Analytics.pwaInstalled({ page: slug }));
})();

// ── Apply user preferences that affect global CSS ────────────────
// data-whitespace drives the typing-surface space marker; data-cursor
// is reserved for future per-profile cursor styles.
(function applyPreferences() {
  const prefs = (_profile && _profile.preferences) || {};
  const root = document.documentElement;
  if (prefs.whitespaceMark) root.setAttribute("data-whitespace", prefs.whitespaceMark);
  if (prefs.cursorStyle) root.setAttribute("data-cursor", prefs.cursorStyle);
  if (prefs.typingFont && prefs.typingFont !== "jetbrains-mono") {
    root.setAttribute("data-typing-font", prefs.typingFont);
  }
  // Theme preset: only override the no-flash script's choice if the
  // user explicitly picked one.
  if (prefs.themePreset) root.setAttribute("data-theme", prefs.themePreset);
  if (prefs.keyboardFingerColors) root.setAttribute("data-finger-colors", "true");
})();

// ── Header height var ────────────────────────────────────────────
// The megamenu panel uses position:fixed and anchors itself just below
// the sticky header. Header height varies with font-load + viewport, so
// measure it and expose as --header-h.
function syncHeaderHeight() {
  const h = document.querySelector(".site-header");
  if (h) document.documentElement.style.setProperty("--header-h", h.offsetHeight + "px");
}
syncHeaderHeight();
window.addEventListener("load", syncHeaderHeight);
window.addEventListener("resize", syncHeaderHeight);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncHeaderHeight);

// Surface the daily streak in the header chip when ≥ 1.
(function showStreak() {
  const chip = document.getElementById("streak-chip");
  if (!chip) return;
  const days = (_profile && _profile.lifetime && _profile.lifetime.streakDays) || 0;
  if (days < 1) return;
  const num = chip.querySelector("[data-streak='num']");
  if (num) num.textContent = String(days);
  chip.hidden = false;
})();

// ── Settings modal pref bridge ───────────────────────────────────
// When the embedded /settings/ iframe broadcasts a preference change,
// apply it to the parent document live. This keeps font/theme picks
// visible behind the open modal so the user gets a real-time preview.
window.addEventListener("message", (e) => {
  if (e.origin !== location.origin) return;
  const data = e.data || {};
  if (data.type !== "tt:pref") return;
  const root = document.documentElement;
  if (data.name === "typingFont") {
    if (data.value && data.value !== "jetbrains-mono") root.setAttribute("data-typing-font", data.value);
    else root.removeAttribute("data-typing-font");
  } else if (data.name === "themePreset") {
    if (data.value) root.setAttribute("data-theme", data.value);
    else root.removeAttribute("data-theme");
  }
});

// ── Settings modal -- removed ──────────────────────────────────
// The site no longer overlays an iframe modal for /settings/. Click
// handlers fall through to native navigation. closeSettingsModal is
// kept as a no-op so any inline onclick referencing it does not throw.
window.closeSettingsModal = function () {};
window.openSettingsModal = function (e) {
  // The "modal" is now just a normal navigation. The earlier iframe
  // approach was unreliable across browsers (X-Frame-Options, sandbox
  // quirks, mobile soft-keyboard sizing, broken-image fallbacks) and
  // the trade-off was not worth keeping. The full-page /settings/
  // route renders identically -- the user just clicks back to return.
  // Returning true lets the click event continue to the native href
  // navigation; the inline onclick wrappers stay non-breaking.
  return true;
};

// ── Theme toggle + picker ────────────────────────────────────────
// Plain toggle kept for the settings page and any inline onclick
// callers that still call window.toggleTheme. Flips light <-> dark.
window.toggleTheme = function () {
  const root = document.documentElement;
  const cur = root.getAttribute("data-theme") || "dark";
  const next = cur === "dark" ? "light" : "dark";
  window.setTheme(next);
};

// Apply a named theme and persist it.
window.setTheme = function (theme) {
  if (!theme) return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  try { localStorage.setItem("tt:theme", theme); } catch {}
  syncBrandMarkTheme();
  syncThemePickerActive();
};

function syncThemePickerActive() {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  document.querySelectorAll(".theme-picker__item[data-theme-set]").forEach((el) => {
    el.setAttribute("aria-checked", el.dataset.themeSet === cur ? "true" : "false");
  });
}

window.toggleThemePicker = function (event) {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  const btn = document.getElementById("theme-toggle");
  const menu = document.getElementById("theme-picker-menu");
  if (!btn || !menu) return;
  const isOpen = btn.getAttribute("aria-expanded") === "true";
  if (isOpen) {
    btn.setAttribute("aria-expanded", "false");
    menu.hidden = true;
  } else {
    syncThemePickerActive();
    btn.setAttribute("aria-expanded", "true");
    menu.hidden = false;
  }
};

// Delegate clicks on any theme-picker item to setTheme + close.
document.addEventListener("click", (e) => {
  const item = e.target.closest && e.target.closest(".theme-picker__item[data-theme-set]");
  if (item) {
    e.preventDefault();
    window.setTheme(item.dataset.themeSet);
    const btn = document.getElementById("theme-toggle");
    const menu = document.getElementById("theme-picker-menu");
    if (btn && menu) { btn.setAttribute("aria-expanded", "false"); menu.hidden = true; }
    return;
  }
  // Click outside the picker closes the menu.
  const picker = document.getElementById("theme-picker");
  const menu = document.getElementById("theme-picker-menu");
  const btn = document.getElementById("theme-toggle");
  if (picker && menu && btn && !menu.hidden && !picker.contains(e.target)) {
    btn.setAttribute("aria-expanded", "false");
    menu.hidden = true;
  }
});

// Esc closes the picker.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const menu = document.getElementById("theme-picker-menu");
  const btn = document.getElementById("theme-toggle");
  if (menu && btn && !menu.hidden) {
    btn.setAttribute("aria-expanded", "false");
    menu.hidden = true;
    btn.focus();
  }
});

// Initialize the radio state on first paint so the active theme
// shows its checkmark when the menu opens.
syncThemePickerActive();

// ── Brand mark theme swap ────────────────────────────────────────
// The header + footer brand <img> elements have data-brand-mark.
// Each theme has either a dark or light background; the gorilla
// figure needs the opposite to stay readable. Done by JS (rather
// than CSS background-image) so the icon shows reliably even if
// the cache served a stale stylesheet.
//
// Themes whose `--bg-0` is a light color. Every other registered
// theme has a dark background. Keep this list in sync with the
// presets in tokens.css.
const LIGHT_BG_THEMES = new Set([
  "light",
  "solarized-light",
  "github-light",
]);
function syncBrandMarkTheme() {
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  const isLightBg = LIGHT_BG_THEMES.has(theme);
  // The "dark" PNG is the dark gorilla figure (for light backgrounds).
  // The "-light" PNG is the light gorilla figure (for dark backgrounds).
  const dark = "/assets/img/icon-192.png";
  const light = "/assets/img/icon-192-light.png";
  const target = isLightBg ? dark : light;
  document.querySelectorAll("[data-brand-mark]").forEach((img) => {
    if (img.getAttribute("src") !== target) img.setAttribute("src", target);
  });
}
syncBrandMarkTheme();
new MutationObserver(syncBrandMarkTheme).observe(document.documentElement, {
  attributes: true, attributeFilter: ["data-theme"],
});

// ── Fullscreen toggle ────────────────────────────────────────────
// Uses the standard Fullscreen API. The button's icons swap via the
// fullscreenchange event so the indicator stays accurate even when
// the user exits via Esc or F11. Fails silently when the API is
// unavailable (some embedded browsers / iframes).
//
// Browsers exit fullscreen on every cross-document navigation, so we
// persist the user's intent in sessionStorage. On the next page load
// the first user interaction (click, key, touch) re-enters fullscreen
// -- we can't do it automatically since requestFullscreen requires a
// fresh user gesture. The flag is cleared whenever the user exits
// fullscreen on purpose (button click or Esc).
const FS_INTENT_KEY = "tt:fullscreen-intent";
function fsIsActive() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
}
function fsRequest(root) {
  const fn = root.requestFullscreen || root.webkitRequestFullscreen || root.mozRequestFullScreen;
  if (!fn) return Promise.reject(new Error("no-api"));
  try {
    const p = fn.call(root);
    return (p && typeof p.then === "function") ? p : Promise.resolve();
  } catch (e) { return Promise.reject(e); }
}
function fsExit() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
  if (fn) try { fn.call(document); } catch {}
}
window.toggleFullscreen = function () {
  if (fsIsActive()) {
    try { sessionStorage.removeItem(FS_INTENT_KEY); } catch {}
    fsExit();
  } else {
    try { sessionStorage.setItem(FS_INTENT_KEY, "1"); } catch {}
    fsRequest(document.documentElement).catch(() => {
      try { sessionStorage.removeItem(FS_INTENT_KEY); } catch {}
    });
  }
};
function syncFullscreenIcon() {
  const btn = document.getElementById("header-fullscreen");
  if (!btn) return;
  const isFs = fsIsActive();
  btn.setAttribute("aria-label", isFs ? "Exit fullscreen" : "Toggle fullscreen");
  btn.setAttribute("title", isFs ? "Exit fullscreen" : "Fullscreen (F11 also works)");
}
function onFullscreenChange() {
  // Same-page exit (Esc, F11, programmatic exit) -- clear the intent
  // flag. Cross-document navigation exits don't fire this event on
  // the current document, so the flag survives the page transition
  // for the restore step below to pick up.
  if (!fsIsActive()) {
    try { sessionStorage.removeItem(FS_INTENT_KEY); } catch {}
  }
  syncFullscreenIcon();
}
document.addEventListener("fullscreenchange", onFullscreenChange);
document.addEventListener("webkitfullscreenchange", onFullscreenChange);

// Restore fullscreen on the next user interaction if the previous
// page had it active. Safe to call multiple times -- the listeners
// are one-shot.
(function restoreFullscreenIntent() {
  let want = false;
  try { want = sessionStorage.getItem(FS_INTENT_KEY) === "1"; } catch {}
  if (!want || fsIsActive()) return;
  function attempt(e) {
    // Don't grab fullscreen on Esc -- user is trying to escape.
    if (e && e.type === "keydown" && e.key === "Escape") { cleanup(); return; }
    cleanup();
    fsRequest(document.documentElement).catch(() => {
      try { sessionStorage.removeItem(FS_INTENT_KEY); } catch {}
    });
  }
  function cleanup() {
    window.removeEventListener("pointerdown", attempt, true);
    window.removeEventListener("keydown", attempt, true);
    window.removeEventListener("touchstart", attempt, true);
  }
  window.addEventListener("pointerdown", attempt, true);
  window.addEventListener("keydown", attempt, true);
  window.addEventListener("touchstart", attempt, true);
})();

// ── Hamburger panel ──────────────────────────────────────────────
const panel = document.getElementById("hamburger-panel");
const scrim = document.getElementById("nav-panel-scrim");
const ham = document.getElementById("hamburger-btn");

/* Paint the per-group item count once on mount so users can see at a
   glance how big each section is. Skipped when no panel is mounted. */
if (panel) {
  panel.querySelectorAll(".nav-panel__group").forEach((g) => {
    const count = g.querySelectorAll(".nav-panel__item").length;
    const slot = g.querySelector("[data-count]");
    if (slot) slot.textContent = count > 0 ? count : "";
  });
}

/* Profile card -- show streak / sessions / best-wpm if the user has any
   data. Reads localStorage directly to avoid loading the full profiles
   module here; the schema is stable enough to inspect inline. */
function paintNavProfileCard() {
  const card = document.getElementById("nav-panel-profile");
  if (!card) return;
  let lt;
  try {
    const raw = localStorage.getItem("tt:profiles");
    if (!raw) return;
    const ps = JSON.parse(raw);
    if (!Array.isArray(ps) || !ps.length) return;
    const activeId = localStorage.getItem("tt:active") || (ps[0] && ps[0].id);
    const p = ps.find((x) => x && x.id === activeId) || ps[0];
    lt = p && p.lifetime;
  } catch { return; }
  if (!lt || (lt.sessions || 0) === 0) return;
  card.hidden = false;
  const set = (k, v) => {
    const el = card.querySelector(`[data-pf="${k}"]`);
    if (el) el.textContent = v;
  };
  set("streak", `${lt.streakDays || 0}`);
  set("sessions", lt.sessions || 0);
  set("bestWpm", Math.round(lt.bestWpm || 0));
}

/* Live filter -- typing in the search box hides items that don't match
   and auto-expands any section with surviving children. Empty input
   restores everything (and re-collapses the auto-expanded sections). */
function wireNavSearch() {
  const input = document.getElementById("nav-panel-search");
  if (!panel || !input) return;
  const groups = Array.from(panel.querySelectorAll(".nav-panel__group"));
  const memoOpen = new Map(); // remember pre-search state
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      // Restore each section's pre-search open state.
      groups.forEach((g) => {
        if (memoOpen.has(g)) g.open = memoOpen.get(g);
        g.querySelectorAll(".nav-panel__item").forEach((li) => { li.hidden = false; });
      });
      memoOpen.clear();
      return;
    }
    if (!memoOpen.size) groups.forEach((g) => memoOpen.set(g, g.open));
    groups.forEach((g) => {
      let anyVisible = false;
      g.querySelectorAll(".nav-panel__item").forEach((li) => {
        const hay = (li.dataset.haystack || "") + " " + (li.textContent || "").toLowerCase();
        const hit = hay.includes(q);
        li.hidden = !hit;
        if (hit) anyVisible = true;
      });
      g.open = anyVisible;
      g.hidden = !anyVisible;
    });
  });
}

/* Focus trap -- once the panel is open, Tab cycles within the panel's
   focusable elements. Esc still closes (handled below). */
function trapFocus(e) {
  if (e.key !== "Tab" || !panel || panel.dataset.open !== "true") return;
  const focusables = panel.querySelectorAll(
    "a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex='-1'])"
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

window.openNavPanel = function () {
  if (!panel) return;
  panel.dataset.open = "true";
  panel.setAttribute("aria-hidden", "false");
  if (ham) ham.setAttribute("aria-expanded", "true");
  if (scrim) scrim.hidden = false;
  document.body.style.overflow = "hidden";
  paintNavProfileCard();
  // Place focus on the search field so keyboard users can immediately
  // start filtering. Falls back to the first focusable.
  // Mobile: skip the search-field focus. iOS Safari + Chrome Android
  // zoom into the page whenever a soft-keyboard rises -- focusing the
  // input on open caused the panel to feel like it was zooming itself
  // in. Touch users can tap the search field if they want to filter;
  // not auto-raising the keyboard is the lesser evil.
  const isMobile =
    typeof window.matchMedia === "function" &&
    (window.matchMedia("(max-width: 767px)").matches ||
     window.matchMedia("(hover: none) and (pointer: coarse)").matches);
  const search = document.getElementById("nav-panel-search");
  if (!isMobile && search) {
    search.focus();
  } else {
    const first = panel.querySelector("a, button");
    if (first) first.focus({ preventScroll: true });
  }
};
window.closeNavPanel = function () {
  if (!panel) return;
  panel.dataset.open = "false";
  panel.setAttribute("aria-hidden", "true");
  if (ham) ham.setAttribute("aria-expanded", "false");
  if (scrim) scrim.hidden = true;
  document.body.style.overflow = "";
  // Reset the search field on close so the next open starts clean.
  const search = document.getElementById("nav-panel-search");
  if (search && search.value) {
    search.value = "";
    search.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (ham) ham.focus();
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && panel && panel.dataset.open === "true") window.closeNavPanel();
});
document.addEventListener("keydown", trapFocus);
wireNavSearch();
// Auto-close when an in-panel link is clicked so the user lands on
// their destination with the panel cleared.
if (panel) {
  panel.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (a && a.href && !a.target) {
      // Same-tab link clicked -- panel will be hidden immediately so
      // the next page paints without the slide-in still on screen.
      window.closeNavPanel && window.closeNavPanel();
    }
  });
}
// Open the panel on Enter/Space when the hamburger button has focus —
// keyboard users tabbing through the header should be able to open the
// menu without a mouse click.
if (ham) {
  ham.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      window.openNavPanel && window.openNavPanel();
    }
  });
}

// ── Back to top ──────────────────────────────────────────────────
const back = document.getElementById("back-to-top");
if (back) {
  const sync = () => { back.hidden = window.scrollY < 600; };
  window.addEventListener("scroll", sync, { passive: true });
  sync();
}

// ── Page-specific boot via data-page on body ─────────────────────
// Each dynamic import URL carries the build's cssVersion as a query
// string so the service worker treats each new build as a fresh
// module URL and refetches instead of serving the previous build's
// cached copy. Without this the SW would happily keep serving last
// week's practice-boot.js while the user wonders why their freshly
// shipped fix never appeared.
const page = document.body.dataset.page;
const _v = window.__cssVersion ? "?v=" + window.__cssVersion : "";
const map = {
  practice: () => import("./pages/practice-boot.js" + _v),
  "practice-game": () => import("./pages/game-boot.js" + _v),
  index: () => import("./pages/home-boot.js" + _v),
  home: () => import("./pages/home-boot.js" + _v),
  lessons: () => import("./pages/lessons-boot.js" + _v),
  challenges: () => import("./pages/challenges-boot.js" + _v),
  drills: () => import("./pages/drills-boot.js" + _v),
  custom: () => import("./pages/custom-boot.js" + _v),
  settings: () => import("./pages/settings-boot.js" + _v),
  stats: () => import("./pages/stats-boot.js" + _v),
  quotes: () => import("./pages/quotes-boot.js" + _v),
  library: () => import("./pages/library-boot.js" + _v),
  contact: () => import("./pages/contact-boot.js" + _v),
  idioms: () => import("./pages/corpus-boot.js" + _v),
  parables: () => import("./pages/corpus-boot.js" + _v),
  poetry: () => import("./pages/corpus-boot.js" + _v),
};
if (map[page]) map[page]().catch((err) => console.warn("[boot]", page, err));
