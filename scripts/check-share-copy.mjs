#!/usr/bin/env node
/* The site's promises about privacy must survive the Share button.

   Background: every page on this site used to say some version of
   "nothing leaves your device". Sharing makes that false the moment a
   reader presses Share -- a link is built, it goes to other people, and
   the numbers in it reach a server. A second claim, "analytics are wired
   in but disabled by default", had already been false since Umami was
   switched on in src/_data/site.js.

   So this gate reads the BUILT site, not the sources, because what a
   reader sees is _site: markdown becomes HTML, tinyhtml minifies it, and
   a gate grepping the .md files would pass while the published page said
   something else. Two consequences:

     - HTML is turned back into visible text before anything is asserted
       (section A proves the extractor works on a fixture, so this file
       cannot pass by seeing nothing).
     - A stale _site tests the previous commit, so section A refuses to
       run if _site is older than the copy it is about to check.

   What it enforces:

     B. Phrases that are now simply wrong ("no backend", "disabled by
        default", "nothing is sent to a server") appear on no page.
     C. Phrases that are true only with the Share exception ("leaves your
        device" and its relatives) appear only in a sentence that names
        Share.
     D. The new copy is actually there, as exact sentences, on the pages
        that owe the reader an explanation.
     E. The copy that must SURVIVE is still there, so nothing passes B-D
        by deleting a page.
     F. og-default.svg is gone from _site and from src, and the PNG that
        replaced it is still there.

   No browser, no server: plain Node over files on disk.

   Run: OG_SKIP=1 npm run build && npm run share-copy */
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, basename } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SITE = resolve(ROOT, "_site");

let pass = 0, fail = 0;
const chk = (ok, n, x = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); ok ? pass++ : fail++; };
const die = (msg) => { console.log(`  FAIL  ${msg}`); console.log("\nRUN ABORTED — counts below are partial."); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1); };

/* ── HTML → the words a reader sees ──────────────────────────────────
   Scripts and styles go first (the analytics page inlines a JSON blob
   that would otherwise be "text"). Then tags, then the handful of
   entities this site's copy actually uses, then whitespace. */
const ENTITIES = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'",
  "&nbsp;": " ", "&mdash;": "—", "&ndash;": "–", "&rarr;": "→", "&larr;": "←",
  "&middot;": "·", "&times;": "×", "&hellip;": "…", "&check;": "✓", "&copy;": "©",
};
function visibleText(html) {
  let s = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  /* Block-level tags become a space so two paragraphs do not weld into
     one word; inline tags vanish so "after the <code>#</code>." reads as
     "after the #." and a sentence stays a sentence. */
  s = s.replace(/<\/?(p|div|section|article|header|footer|nav|li|ul|ol|h[1-6]|br|tr|td|th|table|blockquote|figure|main|aside|dl|dt|dd)\b[^>]*>/gi, " ");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&[a-z#0-9]+;/gi, (m) => (m in ENTITIES ? ENTITIES[m] : (/^&#(\d+);$/.test(m) ? String.fromCodePoint(Number(m.slice(2, -1))) : m)));
  return s.replace(/\s+/g, " ").trim();
}

function htmlFiles(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) htmlFiles(p, acc);
    else if (e.name.endsWith(".html")) acc.push(p);
  }
  return acc;
}

const cache = new Map();
function pageText(route) {
  if (cache.has(route)) return cache.get(route);
  const f = route === "/" ? join(SITE, "index.html") : join(SITE, route.replace(/^\/|\/$/g, ""), "index.html");
  if (!existsSync(f)) return null;
  const t = visibleText(readFileSync(f, "utf8"));
  cache.set(route, t);
  return t;
}

/* The sentence an occurrence sits in, so "unless you press Share" has to
   be in the same breath as the claim, not somewhere else on the page. */
function sentenceAround(text, idx) {
  const before = text.lastIndexOf(". ", idx);
  const startCandidates = [before, text.lastIndexOf("! ", idx), text.lastIndexOf("? ", idx)].filter((n) => n >= 0);
  const start = startCandidates.length ? Math.max(...startCandidates) + 2 : 0;
  const rest = text.slice(idx);
  const end = rest.search(/[.!?](\s|$)/);
  return text.slice(start, end === -1 ? text.length : idx + end + 1);
}

// ── A. the gate is looking at something real ────────────────────────
console.log("\nA. build freshness and the text extractor");

if (!existsSync(join(SITE, "index.html"))) die("_site/index.html is missing — run `OG_SKIP=1 npm run build` first.");

const SOURCES = [
  "src/privacy.md", "src/about.md", "src/faq.md", "src/features.md", "src/guide.md",
  "src/tech-stack.md", "src/cost.md", "src/index.njk", "src/analytics.md",
  "src/posts/custom-text.md", "src/posts/contribute-system.md", "src/roadmap.njk",
  "src/why-contribute.njk", "src/posts/modes-explained.md",
  "src/_data/changelog.js", "src/_data/site.js",
];
const builtAt = statSync(join(SITE, "index.html")).mtimeMs;
const newestSrc = Math.max(...SOURCES.map((f) => statSync(resolve(ROOT, f)).mtimeMs));
chk(builtAt >= newestSrc, "_site is newer than the copy it is about to check",
  builtAt >= newestSrc ? "" : `_site is ${Math.round((newestSrc - builtAt) / 1000)}s stale`);
if (builtAt < newestSrc) die("stale build — every assertion below would describe the previous commit.");

/* If the extractor is broken, every "phrase is absent" check below
   passes for the wrong reason. So prove it on a fixture first. */
const fx = visibleText(
  `<style>p{color:red}</style><script>var x="no backend";</script>` +
  `<p>Nothing leaves your device <b>unless</b> you press Share.</p>` +
  `<p>The words ride after the <code>#</code>.&nbsp;A share link is public.</p>` +
  `<ul><li>one</li><li>two</li></ul>`
);
chk(fx === "Nothing leaves your device unless you press Share. The words ride after the #. A share link is public. one two",
  "extractor turns minified HTML into the sentence a reader sees", JSON.stringify(fx));
chk(!fx.includes("no backend"), "extractor drops script bodies (a banned phrase in JS must not count as copy)");
chk(sentenceAround(fx, fx.indexOf("leaves your device")) === "Nothing leaves your device unless you press Share.",
  "sentenceAround returns the sentence, not the paragraph", JSON.stringify(sentenceAround(fx, fx.indexOf("leaves your device"))));
const fx2 = "Nothing leaves your device. Sharing is a separate feature.";
chk(!/share/i.test(sentenceAround(fx2, fx2.indexOf("leaves your device"))),
  "sentenceAround does NOT reach into the next sentence for its qualifier", JSON.stringify(sentenceAround(fx2, fx2.indexOf("leaves your device"))));

const files = htmlFiles(SITE);
chk(files.length > 200, "html pages scanned", `${files.length} files`);

// ── B. phrases that are now simply false, anywhere on the site ──────
console.log("\nB. claims that are no longer true at all");

/* Each of these was on the site on 2026-09-16 and each is wrong now:
   Umami is on (site.js umami.enabled), and a share link does reach a
   server. There is no qualified form of them, so they are banned. */
const BANNED = [
  "disabled by default",
  "wired in but disabled",
  "no backend",
  "Nothing is sent to a server",
  "None of it leaves your browser",
];
for (const phrase of BANNED) {
  const hits = [];
  for (const f of files) {
    const t = visibleText(readFileSync(f, "utf8"));
    if (t.toLowerCase().includes(phrase.toLowerCase())) hits.push(f.slice(SITE.length));
  }
  chk(hits.length === 0, `no page says "${phrase}"`, hits.slice(0, 4).join(", "));
}

// ── C. phrases that are true only with the Share exception ──────────
console.log("\nC. every 'nothing leaves' claim carries the Share exception");

const QUALIFIED = [
  "leaves your device",
  "leave your device",
  "leaves the device",
  "leaves this device",
  "leaves your browser",
  "leave your browser",
];
let unqualified = [];
let qualifiedSeen = 0;
for (const f of files) {
  const t = visibleText(readFileSync(f, "utf8"));
  for (const phrase of QUALIFIED) {
    let i = t.toLowerCase().indexOf(phrase);
    while (i !== -1) {
      const sentence = sentenceAround(t, i);
      if (/share/i.test(sentence)) qualifiedSeen++;
      else unqualified.push(`${f.slice(SITE.length)}: "${sentence.slice(0, 110)}"`);
      i = t.toLowerCase().indexOf(phrase, i + phrase.length);
    }
  }
}
chk(qualifiedSeen >= 6, "the qualified claims are still on the site (this gate is not passing on an empty site)", `${qualifiedSeen} occurrences`);
chk(unqualified.length === 0, "no page claims nothing leaves the device without naming Share", unqualified.slice(0, 4).join(" | "));

// ── D. the new copy, as exact sentences, on the pages that owe it ───
console.log("\nD. what the pages now say");

const MUST = [
  ["/privacy/", "Sharing a result or a page"],
  ["/privacy/", "Nothing leaves your device unless you press Share."],
  ["/privacy/", "the words ride in the fragment, the part of a link after #"],
  ["/privacy/", "It never carries the text you typed, the title of a custom text, or your keystrokes."],
  ["/privacy/", "Browsers never send that part to any server"],
  ["/privacy/", "A share link is public."],
  ["/privacy/", "Nothing is drawn per visitor"],
  ["/privacy/", "Cloudflare's standard edge logs record the request for a share link"],
  ["/privacy/", "and never the part after #, because a browser does not send it."],
  ["/privacy/", "The pre-built preview image can never show a custom text"],
  ["/privacy/", "Umami is the only analytics this site runs."],
  ["/about/", "Nothing leaves your device unless you press Share."],
  ["/about/", "Cloudflare Web Analytics is wired in and switched off."],
  ["/about/", "The site runs Umami for cookieless page-view analytics"],
  ["/about/", "ride after the #, which browsers never send to anyone"],
  ["/faq/", "What is in a share link?"],
  ["/faq/", "Can I share a custom text?"],
  ["/faq/", "So a server never sees your words, and anyone you send the link to sees everything in it."],
  ["/faq/", "Nothing goes anywhere unless you press Share"],
  ["/features/", "unless you press Share"],
  ["/guide/", "Nothing leaves your device unless you press Share."],
  ["/guide/", "Cloudflare Web Analytics is wired in and switched off."],
  ["/tech-stack/", "It never sees the part of the link after #"],
  ["/cost/", "Share preview images"],
  ["/cost/", "roughly 140 MB added to each deploy"],
  ["/cost/", "No application server"],
  ["/", "The keys you press never leave your device unless you press Share."],
  ["/blog/custom-text/", "The one way the words travel is a share link you build yourself"],
  ["/analytics/", "Analytics never receives it."],
  ["/why-contribute/", "nothing you actually type ever leaves your browser unless you press Share"],
  ["/blog/modes-explained/", "the words ride in the part of the link after the #"],
  ["/roadmap/", "Share your result, or share any page."],
  ["/roadmap/", "Session replay."],
  ["/changelog/", "Sharing, auto-advance everywhere, custom books by chapter, and a page that stops jolting"],
  ["/changelog/", "What a share link carries, exactly"],
];
for (const [route, sentence] of MUST) {
  const t = pageText(route);
  if (t === null) { chk(false, `${route} was built`, "missing"); continue; }
  chk(t.includes(sentence), `${route} says "${sentence.slice(0, 58)}${sentence.length > 58 ? "…" : ""}"`);
}

/* The task asks specifically that the privacy page explain the
   fragment, in words a non-technical reader meets twice. */
const priv = pageText("/privacy/") || "";
chk(priv.includes("after #") || priv.includes("fragment"), "privacy page explains the part after # / the fragment");
chk(priv.includes("after #") && priv.includes("fragment"), "privacy page uses both 'after #' and 'fragment'");

/* about.md's stale analytics claim, checked on its own because it is the
   one the task names. */
const about = pageText("/about/") || "";
chk(!/disabled by default/i.test(about), "about page no longer says analytics are disabled by default");
chk(!/Umami and Cloudflare Web Analytics are wired in/i.test(about), "about page no longer lumps Umami in with the switched-off one");

// ── E. what must have survived ──────────────────────────────────────
console.log("\nE. the copy that must not have been deleted to pass");

const SURVIVE = [
  ["/privacy/", "No accounts. No signup. No email collection."],
  ["/privacy/", "This site uses no cookies."],
  ["/privacy/", "None of these include user-typed text"],
  ["/privacy/", "Export — Settings → Export JSON gives you your full profile."],
  ["/about/", "Profiles, sessions, daily activity, custom texts"],
  ["/faq/", "Where is my data stored?"],
  ["/faq/", "Why is paste disabled?"],
  ["/faq/", "Can I sync between devices?"],
  ["/cost/", "No database"],
  ["/tech-stack/", "Cloudflare Pages"],
  ["/features/", "Everything lives in your browser's localStorage on this device."],
  ["/guide/", "No cookies for tracking, sessions, or fingerprinting."],
  ["/blog/custom-text/", "There is no upload, no sync, no telemetry."],
  ["/roadmap/", "Scanned books come out clean."],
  ["/changelog/", "Tape (ticker) mode"],
];
for (const [route, sentence] of SURVIVE) {
  const t = pageText(route);
  if (t === null) { chk(false, `${route} was built`, "missing"); continue; }
  chk(t.includes(sentence), `${route} still says "${sentence.slice(0, 48)}${sentence.length > 48 ? "…" : ""}"`);
}

const faq = pageText("/faq/") || "";
chk((readFileSync(join(SITE, "faq", "index.html"), "utf8").match(/<h2\b/gi) || []).length >= 17,
  "the FAQ still has every entry, plus the two new ones",
  String((readFileSync(join(SITE, "faq", "index.html"), "utf8").match(/<h2\b/gi) || []).length));
chk(faq.length > 4000, "the FAQ page is a full page, not a stub", `${faq.length} chars`);

// ── F. the SVG share card is gone ───────────────────────────────────
console.log("\nF. og-default.svg");

const svgInSite = files.length && htmlFiles(SITE).length ? [] : [];
const strays = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (basename(p) === "og-default.svg") strays.push(p.slice(SITE.length));
  }
})(SITE);
chk(strays.length === 0, "og-default.svg is not in _site", strays.join(", ") + svgInSite.join(""));
chk(!existsSync(resolve(ROOT, "src/assets/img/og-default.svg")), "og-default.svg is not in src/assets/img either");
chk(existsSync(resolve(ROOT, "src/assets/img/og-default.png")), "the PNG that replaced it IS still there (deleting both is not a pass)");

let refs = [];
for (const f of files) {
  if (readFileSync(f, "utf8").includes("og-default.svg")) refs.push(f.slice(SITE.length));
}
chk(refs.length === 0, "no built page mentions og-default.svg", refs.slice(0, 3).join(", "));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
