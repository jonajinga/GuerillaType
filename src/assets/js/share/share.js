/* The share sheet — one dialog, every destination.

   Contract (the whole site depends on exactly this):

     <button type="button" data-share
             data-share-title="…"
             data-share-text="…"
             data-share-url="<absolute canonical url>"
             data-share-image="<absolute png url>"
             data-share-kind="quote|idiom|parable|poem|book|post|result">

   Any such button, anywhere, on any page, opens the sheet. main.js
   calls wireShareButtons() once on load and the listener is delegated
   from the root, so buttons rendered later (the results card is built
   after a run finishes) need no wiring of their own.

   Two URLs travel with every share, and which one goes where is not
   cosmetic:
     - shortUrl  query only, no fragment. Social intents get this one.
       Bluesky caps a post at 300 graphemes and Threads at 500; a
       result link carrying a keystroke replay in its fragment does not
       fit, and the fragment is not sent to a server anyway, so a
       scraper could never expand it.
     - fullUrl   everything, fragment included. Copy link, the native
       share sheet, email and Telegram carry this, because those go to
       a person, not to a crawler.

   Privacy: analytics see {surface, kind, mode, target, variant} and
   nothing else. Never a title, never the text, never a URL, never a
   custom text's id. Typed content must not reach an intent URL either
   — call sites build `text` from numbers and mode names only.
*/

import { toast } from "../util/dom.js";
import { Analytics } from "../analytics.js";

const MASTODON_KEY = "tt:mastodon-instance";
const enc = encodeURIComponent;

/* ── accuracy bands ────────────────────────────────────────────────
   Mirror of bandFor() in lib/og/labels.js. That file is Node-side
   (satori runs there); this one ships to the browser. They must agree
   or a result links to a card that was never rendered — the file name
   is the contract between them. */
export function bandFor(acc) {
  const a = Number(acc);
  if (!Number.isFinite(a)) return "u80";
  if (a >= 100) return "100";
  if (a >= 98) return "98";
  if (a >= 95) return "95";
  if (a >= 90) return "90";
  if (a >= 80) return "80";
  return "u80";
}

/* wpm + accuracy -> the pre-rendered Free-plan result card that
   scripts/gen-og-images.mjs wrote into _site/og/result/. Anything
   over 200 wpm shares the "200p" (200+) card. */
export function resultImagePath(wpm, acc) {
  const w = Math.max(0, Math.round(Number(wpm) || 0));
  const seg = w > 200 ? "200p" : String(w);
  return `/og/result/${seg}-${bandFor(acc)}.png`;
}

/* ── icons ─────────────────────────────────────────────────────────
   Stroke-based, 20px, currentColor — the same vocabulary as the rest
   of the site's icons. Brand marks are approximations on purpose: a
   pixel-accurate logo is a trademark question and these read fine at
   20px next to their label. */
const S = (inner) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICONS = {
  native: S(`<path d="M12 16V4"/><path d="m8 8 4-4 4 4"/><path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/>`),
  x: S(`<path d="M4 4 20 20"/><path d="M20 4 4 20"/>`),
  facebook: S(`<path d="M15 4h-2a3 3 0 0 0-3 3v3H8v3h2v7h3v-7h2.5l.5-3h-3V7.6c0-.4.3-.6.7-.6H15z"/>`),
  linkedin: S(`<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="11" x2="8" y2="17"/><circle cx="8" cy="7.5" r="1" fill="currentColor" stroke="none"/><path d="M12 17v-4a2 2 0 0 1 4 0v4"/><line x1="12" y1="11" x2="12" y2="17"/>`),
  reddit: S(`<circle cx="12" cy="13.5" r="7.5"/><circle cx="9.3" cy="12.6" r=".9" fill="currentColor" stroke="none"/><circle cx="14.7" cy="12.6" r=".9" fill="currentColor" stroke="none"/><path d="M9.2 16.2c1.7 1.1 3.9 1.1 5.6 0"/><path d="m14.4 6.2-.9 4"/><circle cx="14.8" cy="5" r="1.4"/>`),
  bluesky: S(`<path d="M12 10.6C10.4 7.2 7.6 4.9 5.4 4.9c-1.4 0-2 1-2 2.4 0 2.5 1.6 5.2 3.9 6.2-2.3.3-2.9 1.5-1.6 2.8 1.3 1.3 3.8-.3 6.3-4 2.5 3.7 5 5.3 6.3 4 1.3-1.3.7-2.5-1.6-2.8 2.3-1 3.9-3.7 3.9-6.2 0-1.4-.6-2.4-2-2.4-2.2 0-5 2.3-6.6 5.7z"/>`),
  threads: S(`<path d="M16.3 10.4C15.6 8.3 13.9 7.2 12 7.2c-2.9 0-4.9 2-4.9 4.8s2 4.8 4.9 4.8c2.3 0 3.8-1.2 3.8-2.7 0-1.4-1.1-2.3-2.7-2.3-1.2 0-2 .6-2 1.4 0 .6.5 1 1.1 1"/><circle cx="12" cy="12" r="9.2"/>`),
  mastodon: S(`<path d="M5 9.5C5 6 7.6 4 12 4s7 2 7 5.5V14c0 1.6-1.2 2.6-2.8 2.8l-4.6.5"/><path d="M8.6 12.4V9.9a1.9 1.9 0 0 1 3.4-1.1 1.9 1.9 0 0 1 3.4 1.1v2.5"/><path d="M6.6 15.8c1 2.6 3.2 3.6 6 3.6 1.4 0 2.6-.2 3.6-.6"/>`),
  whatsapp: S(`<path d="M3.8 20.2 5 16.6a7.7 7.7 0 1 1 2.9 2.7z"/><path d="M9 9.4c0 2.6 2.4 5 5 5 .8 0 1.4-.5 1.4-1.2l-1.7-.8-.8.8a5.7 5.7 0 0 1-2.4-2.4l.8-.8-.8-1.7c-.7 0-1.5.5-1.5 1.4z"/>`),
  telegram: S(`<path d="M21 4 2.8 11.2l5.6 1.8L19 6.4l-8.2 8.3.3 5 2.7-3.7 4.4 3.2z"/>`),
  email: S(`<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 7 9-7"/>`),
  copy: S(`<rect x="2" y="9" width="9" height="6" rx="3"/><rect x="13" y="9" width="9" height="6" rx="3"/><line x1="8" y1="12" x2="16" y2="12"/>`),
  download: S(`<path d="M12 4v11"/><path d="m8 11 4 4 4-4"/><path d="M4 19h16"/>`),
};

/* ── intents ───────────────────────────────────────────────────────
   `variant` records which URL the destination receives, and it is the
   one analytics prop here that is not decorative: it is how we will
   see, later, whether the short-link destinations are the ones people
   actually use. */
const INTENTS = [
  {
    id: "x", label: "X", icon: ICONS.x, variant: "short",
    href: (c) => `https://x.com/intent/post?text=${enc(c.text)}&url=${enc(c.shortUrl)}`,
  },
  {
    id: "facebook", label: "Facebook", icon: ICONS.facebook, variant: "short",
    href: (c) => `https://www.facebook.com/sharer/sharer.php?u=${enc(c.shortUrl)}`,
  },
  {
    id: "linkedin", label: "LinkedIn", icon: ICONS.linkedin, variant: "short",
    href: (c) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(c.shortUrl)}`,
  },
  {
    id: "reddit", label: "Reddit", icon: ICONS.reddit, variant: "short",
    href: (c) => `https://www.reddit.com/submit?url=${enc(c.shortUrl)}&title=${enc(c.title)}`,
  },
  {
    /* 300 graphemes. The short URL is the only one that fits. */
    id: "bluesky", label: "Bluesky", icon: ICONS.bluesky, variant: "short",
    href: (c) => `https://bsky.app/intent/compose?text=${enc(c.text + " " + c.shortUrl)}`,
  },
  {
    /* 500 characters, same reasoning. */
    id: "threads", label: "Threads", icon: ICONS.threads, variant: "short",
    href: (c) => `https://www.threads.net/intent/post?text=${enc(c.text + " " + c.shortUrl)}`,
  },
  {
    id: "mastodon", label: "Mastodon", icon: ICONS.mastodon, variant: "short",
    /* Every instance is its own host, so there is no single intent URL.
       We ask once and remember the answer. */
    host: () => savedMastodonHost(),
    href: (c, host) => `https://${host}/share?text=${enc(c.text + " " + c.shortUrl)}`,
  },
  {
    id: "whatsapp", label: "WhatsApp", icon: ICONS.whatsapp, variant: "short",
    href: (c) => `https://wa.me/?text=${enc(c.text + " " + c.shortUrl)}`,
  },
  {
    /* Goes to a person in a chat, not to a crawler: full URL. */
    id: "telegram", label: "Telegram", icon: ICONS.telegram, variant: "full",
    href: (c) => `https://t.me/share/url?url=${enc(c.fullUrl)}&text=${enc(c.text)}`,
  },
  {
    id: "email", label: "Email", icon: ICONS.email, variant: "full",
    href: (c) => `mailto:?subject=${enc(c.title)}&body=${enc(c.text + "\n\n" + c.fullUrl)}`,
  },
];

/* ── mastodon instance memory ──────────────────────────────────── */
function savedMastodonHost() {
  try {
    return normalizeHost(localStorage.getItem(MASTODON_KEY) || "");
  } catch { return ""; }
}
/* Accepts "mastodon.social", "https://mastodon.social/", "@me@host".
   Returns "" for anything that is not a plausible host, so a typo
   cannot build a link to nowhere (or anywhere else). */
export function normalizeHost(raw) {
  let h = String(raw || "").trim().toLowerCase();
  h = h.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (h.indexOf("@") !== -1) h = h.slice(h.lastIndexOf("@") + 1);
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(h) ? h : "";
}
async function askMastodonHost() {
  let answer = null;
  try {
    const mod = await import("../util/modal.js");
    answer = await mod.promptModal({
      title: "Your Mastodon instance",
      label: "Instance host",
      message: "Mastodon has no single address. Enter the host you post from — it stays in this browser.",
      placeholder: "mastodon.social",
      confirmLabel: "Save",
    });
  } catch {
    try { answer = window.prompt("Your Mastodon instance host", "mastodon.social"); } catch {}
  }
  const host = normalizeHost(answer);
  if (!host) return "";
  try { localStorage.setItem(MASTODON_KEY, host); } catch {}
  return host;
}

/* ── the private-text card ─────────────────────────────────────────
   A result typed from a text of your own cannot be previewed by the
   server: the text is on this device and nowhere else. Download PNG for
   those runs draws the card in the browser instead
   (share/local-card.js), so the picture can include the words.

   The excerpt travels through this module-level slot rather than a
   data-share-* attribute, deliberately. Everything in that dataset is
   one careless template away from an intent url, and
   scripts/check-share-sheet.mjs asserts the whole dataset is free of
   anything typed. A page sets this when it renders a result and the
   sheet reads it; it never reaches a url, an analytics prop, or the
   dialog's own text.

     setLocalCard({ text, stats })   stats is the canonical share query
                                     (v=1&wpm=..&acc=..), the same shape
                                     lib/og/validate.js parses.
     setLocalCard(null)              forget it. */
let localCard = null;

export function setLocalCard(src) {
  localCard = src && src.text && src.stats
    ? { text: String(src.text), stats: String(src.stats) }
    : null;
}

/* ── the dialog ────────────────────────────────────────────────── */
let sheetEl = null;
let ctx = null;        // the share currently on screen
let opener = null;     // element focus returns to

function ensureSheet() {
  if (sheetEl) return sheetEl;
  const el = document.createElement("dialog");
  el.className = "share-sheet";
  el.id = "share-sheet";
  el.setAttribute("aria-label", "Share");
  el.innerHTML = `
    <div class="share-sheet__head">
      <h2 class="share-sheet__title" data-share-heading>Share</h2>
      <button type="button" class="share-sheet__close" aria-label="Close" data-share-close>&times;</button>
    </div>
    <div class="share-sheet__body">
      <p class="share-sheet__preview" data-share-preview></p>
      <button type="button" class="btn btn--primary share-sheet__native" data-share-native hidden>
        ${ICONS.native}<span>Share&hellip;</span>
      </button>
      <div class="share-sheet__grid" data-share-grid></div>
      <div class="share-sheet__row">
        <button type="button" class="btn share-sheet__action" data-share-copy>${ICONS.copy}<span>Copy link</span></button>
        <button type="button" class="btn share-sheet__action" data-share-download hidden>${ICONS.download}<span>Download PNG</span></button>
      </div>
      <p class="share-sheet__note">Links carry your numbers, never what you typed.</p>
      <p class="share-sheet__note share-sheet__note--local" data-share-local-note hidden>The picture includes your text and is made on your device</p>
    </div>
  `;
  document.body.appendChild(el);
  sheetEl = el;

  el.querySelector("[data-share-close]").addEventListener("click", () => el.close());
  el.addEventListener("click", (e) => { if (e.target === el) el.close(); });
  el.addEventListener("close", () => {
    /* Focus goes back where it came from. Without this the page loses
       the caret entirely and a keyboard user restarts at the top. */
    const back = opener;
    opener = null;
    if (back && document.contains(back)) { try { back.focus(); } catch {} }
  });
  /* <dialog>.showModal() traps Tab on its own in every browser that
     ships the top layer, but the trap is cheap and it is the kind of
     thing that silently regresses, so it is explicit here too. */
  el.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const f = focusables(el);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  el.querySelector("[data-share-native]").addEventListener("click", onNativeShare);
  el.querySelector("[data-share-copy]").addEventListener("click", () => copyLink(ctx));
  el.querySelector("[data-share-download]").addEventListener("click", onDownload);
  el.querySelector("[data-share-grid]").addEventListener("click", onGridClick);
  return el;
}

function focusables(root) {
  return Array.from(root.querySelectorAll(
    "a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])"
  )).filter((e) => !e.hidden && e.offsetParent !== null);
}

/* Same shape as practice-boot's emit(): call the named helper when the
   loaded analytics.js has it, fall back to Analytics.custom with the
   wire name when it does not. Every import now carries the build's
   ?v=, so a stale analytics.js should be impossible -- but a share
   that throws on the way to a dashboard would be a silly way to break
   the button, and Analytics.custom has always existed. */
const EMIT_NAMES = {
  shareOpened: "share_opened",
  shareTarget: "share_target",
  shareCopied: "share_copied",
  shareImageSaved: "share_image_saved",
};
function emit(name, p) {
  try {
    const fn = Analytics && Analytics[name];
    if (typeof fn === "function") fn(p);
    else if (Analytics && typeof Analytics.custom === "function") Analytics.custom(EMIT_NAMES[name] || name, p);
  } catch {}
}

/* Analytics props. Everything the sheet knows that is NOT in here —
   title, text, both URLs, the image URL — is either user content or
   points at it. Keep this function the only source of props. */
function props(extra) {
  const c = ctx || {};
  return Object.assign({ kind: c.kind || "page", mode: c.mode || "" }, extra || {});
}

function paintGrid() {
  const grid = sheetEl.querySelector("[data-share-grid]");
  grid.innerHTML = INTENTS.map((it) => {
    const host = it.host ? it.host() : null;
    const needsHost = !!it.host && !host;
    const href = needsHost ? "#" : it.href(ctx, host);
    return `<a class="share-sheet__target" data-share-target="${it.id}"
      href="${escapeAttr(href)}" target="_blank" rel="noopener"${needsHost ? " data-share-needs-host" : ""}>
      <span class="share-sheet__target-icon">${it.icon}</span>
      <span class="share-sheet__target-label">${it.label}</span>
    </a>`;
  }).join("");
}

function escapeAttr(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function onGridClick(e) {
  const a = e.target.closest && e.target.closest("[data-share-target]");
  if (!a) return;
  const id = a.dataset.shareTarget;
  const intent = INTENTS.find((i) => i.id === id);
  if (!intent) return;
  if (a.hasAttribute("data-share-needs-host")) {
    e.preventDefault();
    const host = await askMastodonHost();
    if (!host) return;
    const href = intent.href(ctx, host);
    a.setAttribute("href", href);
    a.removeAttribute("data-share-needs-host");
    emit("shareTarget", props({ target: id, variant: intent.variant }));
    /* The prompt broke the user-gesture chain, so window.open may be
       refused. If it is, the link is now live — say so rather than
       silently doing nothing. */
    const w = window.open(href, "_blank", "noopener");
    if (!w) toast("Instance saved — tap Mastodon again to post.");
    return;
  }
  emit("shareTarget", props({ target: id, variant: intent.variant }));
}

async function onNativeShare() {
  if (!navigator.share || !ctx) return;
  const payload = { title: ctx.title, text: ctx.text, url: ctx.fullUrl };
  /* A preview card that travels with the post is the whole point of
     the native sheet on a phone; it is also the only path that can
     attach a file at all. Everything here is best-effort: a failed
     fetch, an opaque response or a platform that refuses files must
     still leave a working text share behind. */
  try {
    if (ctx.imageUrl && typeof navigator.canShare === "function") {
      const res = await fetch(ctx.imageUrl);
      if (res.ok) {
        const blob = await res.blob();
        const file = new File([blob], fileName(ctx), { type: blob.type || "image/png" });
        if (navigator.canShare({ files: [file] })) payload.files = [file];
      }
    }
  } catch {}
  try {
    await navigator.share(payload);
    emit("shareTarget", props({ target: "native", variant: "full" }));
  } catch (err) {
    /* AbortError is the user closing the OS sheet — not a failure. */
    if (err && err.name === "AbortError") return;
    toast("Your browser would not open the share sheet.", "bad");
  }
}

function fileName(c) {
  return `guerillatype-${(c && c.kind) || "share"}.png`;
}

export async function copyLink(c) {
  const url = (c && c.fullUrl) || location.href;
  let ok = false;
  try {
    await navigator.clipboard.writeText(url);
    ok = true;
  } catch {
    /* Safari without permission, and any non-secure context. A
       textarea + execCommand still works in both. */
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:-9999px";
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand("copy");
      ta.remove();
    } catch { ok = false; }
  }
  if (ok) {
    toast("Link copied");
    emit("shareCopied", { kind: (c && c.kind) || "page", mode: (c && c.mode) || "" });
  } else {
    toast("Could not copy the link.", "bad");
  }
  return ok;
}

function saveBlob(blob) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName(ctx);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}

async function onDownload() {
  if (!ctx || !ctx.imageUrl) return;
  /* A result typed from your own text: draw the real card here, with
     the words in it. The module (and the 915 KB behind it) is imported
     on this click and never before. If any of it fails -- wasm blocked,
     a browser too old for the SVG path, numbers that do not validate --
     say what the user is about to get and fall through to the
     pre-rendered grid card, which is always a correct picture of the
     run; it just cannot show the text. */
  if (ctx.private && ctx.localCard) {
    try {
      const mod = await import("./local-card.js");
      saveBlob(await mod.renderCardPng(ctx.localCard));
      emit("shareImageSaved", { kind: ctx.kind || "page", mode: ctx.mode || "", method: "local" });
      return;
    } catch {
      toast("Saved the plain card — the picture will not include your text.", "bad");
    }
  }
  try {
    const res = await fetch(ctx.imageUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    saveBlob(await res.blob());
    /* "server" = the card the build pre-rendered; "local" = drawn in
       this browser by share/local-card.js. */
    emit("shareImageSaved", { kind: ctx.kind || "page", mode: ctx.mode || "", method: "server" });
  } catch {
    toast("Could not download the image.", "bad");
  }
}

/* ── public API ────────────────────────────────────────────────── */

export function openShareSheet(opts) {
  const o = opts || {};
  const full = o.fullUrl || o.shortUrl || location.href;
  ctx = {
    title: o.title || document.title,
    text: o.text || o.title || document.title,
    shortUrl: o.shortUrl || full,
    fullUrl: full,
    imageUrl: o.imageUrl || "",
    kind: o.kind || "page",
    mode: o.mode || "",
    surface: o.surface || (document.body && document.body.dataset.page) || "page",
    /* Private only when the caller says so AND a page actually left a
       text here. `imageUrl` stays the grid card either way: it is what
       goes into og:image, and a scraper must never be sent a picture of
       something the server has never seen. */
    private: !!o.private && !!localCard,
    localCard: o.private ? localCard : null,
  };
  const el = ensureSheet();
  el.querySelector("[data-share-heading]").textContent = o.heading || "Share";
  el.querySelector("[data-share-preview]").textContent = ctx.text;
  const native = el.querySelector("[data-share-native]");
  native.hidden = typeof navigator.share !== "function";
  const dl = el.querySelector("[data-share-download]");
  dl.hidden = !ctx.imageUrl;
  el.querySelector("[data-share-local-note]").hidden = !ctx.private;
  paintGrid();
  opener = o.opener || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  if (!el.open) el.showModal();
  const firstBtn = native.hidden ? el.querySelector("[data-share-target]") : native;
  if (firstBtn) setTimeout(() => { try { firstBtn.focus(); } catch {} }, 20);
  emit("shareOpened", { surface: ctx.surface, kind: ctx.kind, mode: ctx.mode });
  return el;
}

/* Read the share payload off a button, or off the nearest ancestor
   carrying one — a row of icons shares a single payload rather than
   repeating ten attributes per icon. */
export function shareOptsFrom(el) {
  const src = el.hasAttribute("data-share-url") || el.hasAttribute("data-share-title")
    ? el
    : (el.closest("[data-share-url], [data-share-title]") || el);
  const d = src.dataset;
  const full = d.shareUrl || location.href;
  return {
    title: d.shareTitle || document.title,
    text: d.shareText || d.shareTitle || document.title,
    shortUrl: d.shareShortUrl || full,
    fullUrl: full,
    imageUrl: d.shareImage || "",
    kind: d.shareKind || "page",
    mode: d.shareMode || "",
    surface: d.shareSurface || (document.body && document.body.dataset.page) || "page",
    /* A flag, not the text. The text is in setLocalCard(). */
    private: d.sharePrivate === "1",
    opener: el,
  };
}

/* Direct intents (the blog post's icon row). The row keeps its four
   icons; routing them through here is what makes their analytics fire
   and keeps one definition of every intent URL in the codebase. */
function wireRow(root) {
  root.querySelectorAll("a[data-share-intent], button[data-share-intent]").forEach((el) => {
    if (el.__ttShareWired) return;
    el.__ttShareWired = true;
    const id = el.dataset.shareIntent;
    if (id === "copy") {
      el.addEventListener("click", async (e) => {
        e.preventDefault();
        const ok = await copyLink(shareOptsFrom(el));
        if (!ok) return;
        el.classList.add("is-copied");
        setTimeout(() => el.classList.remove("is-copied"), 1600);
      });
      return;
    }
    const intent = INTENTS.find((i) => i.id === id);
    if (!intent) return;
    const c = shareOptsFrom(el);
    const host = intent.host ? intent.host() : null;
    if (intent.host && !host) {
      /* No instance known yet: let it open the sheet, which asks. */
      el.addEventListener("click", (e) => { e.preventDefault(); openShareSheet(c); });
      return;
    }
    if (el.tagName === "A") {
      el.setAttribute("href", intent.href(c, host));
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener");
      el.addEventListener("click", () => {
        emit("shareTarget", { kind: c.kind, mode: c.mode, target: id, variant: intent.variant });
      });
    } else {
      el.addEventListener("click", () => {
        emit("shareTarget", { kind: c.kind, mode: c.mode, target: id, variant: intent.variant });
        window.open(intent.href(c, host), "_blank", "noopener");
      });
    }
  });
}

const wiredRoots = new WeakSet();

/* Called from main.js on every page. Delegated from the root so a
   button that does not exist yet — the results card is rendered when
   a run ends — still works without anyone remembering to re-wire. */
export function wireShareButtons(root = document) {
  const target = root || document;
  if (!wiredRoots.has(target)) {
    wiredRoots.add(target);
    target.addEventListener("click", (e) => {
      const btn = e.target.closest && e.target.closest("button[data-share]");
      if (!btn || !target.contains(btn)) return;
      e.preventDefault();
      openShareSheet(shareOptsFrom(btn));
    });
  }
  /* Rows are wired eagerly because their anchors need real hrefs
     before anyone clicks (middle-click, copy-link-address, and the
     gate all read the href). */
  const scope = target.querySelectorAll ? target : document;
  wireRow(scope);
  return target;
}

/* Deliberately global: the results card is built as an HTML string and
   inline handlers are how every other button there is wired. */
try { window.ttOpenShareSheet = (opts) => openShareSheet(opts); } catch {}
