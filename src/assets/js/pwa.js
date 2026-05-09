/* PWA wiring -- service-worker registration plus a custom install
   prompt. The browser fires `beforeinstallprompt` when the site
   meets PWA criteria; we capture it, suppress the default mini-bar,
   and show our own opt-in chip in the corner. The user can dismiss
   permanently (stored in localStorage) so we never nag.

   The service worker is at /sw.js and must be served from the
   root scope so it can intercept all navigations. */

const PROMPT_KEY = "tt:pwa-install-dismissed";
const INSTALLED_KEY = "tt:pwa-installed";

// ── Service worker registration ──────────────────────────────────
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  // Defer until after first paint so registration doesn't compete
  // with critical resources for bandwidth on the initial load.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[pwa] SW registration failed:", err);
    });
  });
}

// ── Install prompt capture ───────────────────────────────────────
let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  // Skip if user already dismissed or already installed.
  try {
    if (localStorage.getItem(PROMPT_KEY) === "true") return;
    if (localStorage.getItem(INSTALLED_KEY) === "true") return;
  } catch {}
  deferredPrompt = e;
  showInstallChip();
});

window.addEventListener("appinstalled", () => {
  hideInstallChip();
  try { localStorage.setItem(INSTALLED_KEY, "true"); } catch {}
});

// ── UI: a slim chip pinned to the bottom-right, dismissable ─────
function buildChip() {
  let el = document.getElementById("pwa-install-chip");
  if (el) return el;
  el = document.createElement("div");
  el.id = "pwa-install-chip";
  el.className = "pwa-chip";
  el.hidden = true;
  el.innerHTML = `
    <span class="pwa-chip__copy">Install Guerilla Type for offline practice and faster startup.</span>
    <button type="button" class="btn btn--small btn--primary" data-pwa-install>Install</button>
    <button type="button" class="pwa-chip__close" aria-label="Dismiss" data-pwa-dismiss>×</button>
  `;
  document.body.appendChild(el);
  el.querySelector("[data-pwa-install]").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === "accepted") {
      try { localStorage.setItem(INSTALLED_KEY, "true"); } catch {}
    }
    hideInstallChip();
  });
  el.querySelector("[data-pwa-dismiss]").addEventListener("click", () => {
    try { localStorage.setItem(PROMPT_KEY, "true"); } catch {}
    hideInstallChip();
  });
  return el;
}

function showInstallChip() {
  const el = buildChip();
  el.hidden = false;
  // Defer the visible state so the entrance transition runs.
  requestAnimationFrame(() => { el.dataset.show = "true"; });
}
function hideInstallChip() {
  const el = document.getElementById("pwa-install-chip");
  if (!el) return;
  el.dataset.show = "false";
  setTimeout(() => { el.hidden = true; }, 220);
}
