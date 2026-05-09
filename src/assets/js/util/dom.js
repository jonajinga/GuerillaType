export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export function on(el, ev, fn, opts) { if (el) el.addEventListener(ev, fn, opts); return () => el && el.removeEventListener(ev, fn, opts); }
export function htmlEscape(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
export function toast(msg, kind) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("toast--bad", kind === "bad");
  el.hidden = false;
  el.dataset.show = "true";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.dataset.show = "false"; setTimeout(() => { el.hidden = true; }, 240); }, 2400);
}
