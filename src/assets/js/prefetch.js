/* instant.page-style same-origin prefetcher.
   On link mouseenter (after a brief grace period) or touchstart, inject
   a <link rel="prefetch"> for the destination so navigation feels
   instantaneous. Skips external links, downloads, and the current page. */

const HOVER_DELAY = 65;
const prefetched = new Set();

function isPrefetchable(a, href) {
  if (!a || !href) return false;
  if (a.target === "_blank") return false;
  if (a.hasAttribute("download")) return false;
  if (a.dataset.noPrefetch !== undefined) return false;
  if (href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#")) return false;
  let u;
  try { u = new URL(href, location.href); } catch { return false; }
  if (u.origin !== location.origin) return false;
  if (u.pathname === location.pathname && u.search === location.search) return false;
  return true;
}

function prefetch(href) {
  if (prefetched.has(href)) return;
  prefetched.add(href);
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.href = href;
  link.as = "document";
  link.fetchPriority = "low";
  document.head.appendChild(link);
}

let hoverTimer = null;
let hoveredHref = null;
document.addEventListener("mouseover", (e) => {
  const a = e.target.closest("a[href]");
  if (!a) return;
  const href = a.href;
  if (!isPrefetchable(a, href)) return;
  if (hoveredHref === href) return;
  hoveredHref = href;
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => prefetch(href), HOVER_DELAY);
});
document.addEventListener("mouseout", (e) => {
  if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
  hoveredHref = null;
});
document.addEventListener("touchstart", (e) => {
  const a = e.target.closest && e.target.closest("a[href]");
  if (a && isPrefetchable(a, a.href)) prefetch(a.href);
}, { passive: true });

// Honor data-saver / save-data hint.
if (navigator.connection && (navigator.connection.saveData || /(2|slow-2)g/.test(navigator.connection.effectiveType || ""))) {
  document.removeEventListener("mouseover", () => {});
  document.removeEventListener("touchstart", () => {});
}
