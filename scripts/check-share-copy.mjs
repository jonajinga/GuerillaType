#!/usr/bin/env node
/* The site's promises about privacy must survive the Share button.

   Background: every page on this site used to say some version of
   "nothing leaves your device". Sharing makes that false the moment a
   reader presses Share -- a link is built, it goes to other people, and
   the numbers in it reach a server. A second claim, "analytics are wired
   in but disabled by default", had already been false since Umami was
   switched on in src/_data/site.js.

   Two facts about analytics, both settled on 2026-09-16 and both
   easy to get wrong in copy: the share page loads no analytics at all
   (base.njk skips the trackers when a page sets noAnalytics, and /r/
   does), and everywhere else the tracker carries data-exclude-search
   and data-exclude-hash, so what it records is a path with no query
   and no fragment. An earlier draft of this page said Umami recorded
   the share link's query string; it does not, and a privacy page that
   over-reports is as wrong as one that under-reports.

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

/* Round 4. "browsers never send it to a server" is an overreach, and
   it was on nine pages. What is true: the fragment is never in an HTTP
   request to THIS site, which is a fact about how browsers work. What
   is not true: that no server anywhere ever holds your words. Pick
   Telegram or email in the share sheet and the whole link, fragment and
   all, IS the message -- the service carrying it has the text, because
   the recipient has to be able to read it. So a page may say "to this
   site", and it may say where the words travel, but it may not promise
   "anywhere", "anyone" or "a server". */
const OVERREACH = [
  /browsers?\s+(?:never\s+sends?|do(?:es)?\s+not\s+send)[^.]{0,40}\b(?:any\s+server|a\s+server|anyone|anywhere)\b/i,
  /never\s+reaches?\s+a\s+server/i,
  /a\s+server\s+never\s+sees/i,
];
const overreaching = [];
for (const f of files) {
  const t = visibleText(readFileSync(f, "utf8"));
  for (const re of OVERREACH) {
    const m = t.match(re);
    if (m) overreaching.push(`${f.slice(SITE.length)}: "${m[0]}"`);
  }
}
chk(overreaching.length === 0,
  "no page promises the part after # reaches no server at all (it reaches whoever you send the link to)",
  overreaching.slice(0, 4).join(" | "));

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
  ["/privacy/", "Then the mode, the word list, the keyboard layout, whether the run was a personal best, whether a challenge was cleared, the date, a version number for the link format, and a public content id"],
  ["/privacy/", "That is everything the site puts before the #."],
  ["/privacy/", "It never carries the text you typed, the title of a custom text, or your keystrokes."],
  ["/privacy/", "every whole number of wpm up to 200, one card for anything faster"],
  ["/privacy/", "Browsers never send that part to this site"],
  ["/privacy/", "It travels with the link itself, though, so it reaches whoever you send the link to, and whatever service carries it on the way."],
  ["/privacy/", "A share link is public."],
  ["/privacy/", "Nothing is drawn per visitor"],
  ["/privacy/", "Cloudflare's standard edge logs record the request for a share link"],
  ["/privacy/", "That still holds for a shared result, and the share page goes further: it loads no analytics at all, so nothing on it is counted or reported."],
  ["/privacy/", "The page a share link opens loads no analytics at all, so nothing about a shared result is counted or reported."],
  ["/privacy/", "The tracker is loaded with data-exclude-search and data-exclude-hash, so /practice/?book=custom:c_9f3a1b is recorded as /practice/."],
  ["/privacy/", "The pre-built preview image can never show a custom text"],
  ["/privacy/", "Umami is the only analytics this site runs."],
  ["/about/", "Nothing leaves your device unless you press Share."],
  ["/about/", "Cloudflare Web Analytics is wired in and switched off."],
  ["/about/", "The site runs Umami for cookieless page-view analytics"],
  ["/about/", "ride after the #, which browsers never send to this site. They travel with the link, so they go where you send it."],
  ["/faq/", "What is in a share link?"],
  ["/faq/", "Can I share a custom text?"],
  ["/faq/", "So this site never sees your words. Where you send the link is your choice, and whoever opens it sees everything in it."],
  ["/faq/", "Nothing goes anywhere unless you press Share"],
  ["/faq/", "the mode, the word list, the keyboard layout, whether it was a personal best, whether a challenge was cleared, the date, a version number for the link format"],
  ["/faq/", "The page that opens a share link loads no analytics at all, so nothing about the run is counted or reported."],
  ["/features/", "unless you press Share"],
  ["/guide/", "Nothing leaves your device unless you press Share."],
  ["/guide/", "Cloudflare Web Analytics is wired in and switched off."],
  ["/tech-stack/", "it never sees the part of the link after #"],
  ["/cost/", "Share preview images"],
  ["/cost/", "roughly 140 MB added to each deploy"],
  ["/cost/", "every whole number of wpm up to 200, one card for anything faster"],
  ["/cost/", "No application server"],
  ["/", "The keys you press never leave your device unless you press Share."],
  ["/blog/custom-text/", "The one way the words travel is a share link you build yourself"],
  ["/blog/custom-text/", "The text stays on your device unless you share a run of it"],
  ["/settings/", "until you export it, or share a result"],
  ["/analytics/", "Analytics never receives it."],
  ["/analytics/", "every route a visitor lands on, without the query string and without the part after #"],
  ["/why-contribute/", "nothing you actually type ever leaves your browser unless you press Share"],
  ["/blog/modes-explained/", "the words ride in the part of the link after the #"],
  ["/roadmap/", "Share your result, or share any page."],
  ["/roadmap/", "the word list, the keyboard layout, whether it was a personal best or a cleared challenge"],
  ["/roadmap/", "Session replay."],
  ["/changelog/", "Sharing, auto-advance everywhere, custom books by chapter, and a page that stops jolting"],
  ["/changelog/", "What a share link carries, exactly"],
];
for (const [route, sentence] of MUST) {
  const t = pageText(route);
  if (t === null) { chk(false, `${route} was built`, "missing"); continue; }
  chk(t.includes(sentence), `${route} says "${sentence.slice(0, 58)}${sentence.length > 58 ? "…" : ""}"`);
}

/* A list that says "that is everything" has to match the thing that
   decides what a link may carry. lib/og/validate.js is that thing: every
   key it accepts must be named in the privacy page's enumeration, or the
   page is telling the reader a shorter story than the code allows. This
   caught the first version of this copy, which stopped at "the mode, the
   date, and a public content id" and left out lang, lay, pb and ok. */
const VALIDATOR_KEYS = {
  wpm: "wpm", raw: "raw wpm", acc: "accuracy", con: "consistency", dur: "duration",
  n: "character counts", err: "character counts", mode: "the mode",
  lang: "the word list", lay: "the keyboard layout",
  pb: "personal best", ok: "challenge was cleared",
  d: "the date", src: "public content id",
  v: "version number",
};
const validatorSrc = readFileSync(resolve(ROOT, "lib/og/validate.js"), "utf8");
/* Three shapes in that file: the num/pick/date helpers take the key as
   a literal, `src` is read with params.has("src") + parseSrc, and the
   format version is read with params.get("v") (validate.js:87,
   `if (params.get("v") !== "1") return null`). Miss the second and the
   gate would never check that "which item you typed" is documented;
   miss the third, as the first version of this check did, and the
   accepted list is 14 keys where the link carries 15. The bare
   `params.get(key)` calls inside the helpers take a variable, not a
   literal, so they do not match and do not need to. */
const accepted = [...new Set([
  ...[...validatorSrc.matchAll(/(?:num|pick|date)\(params, "([a-z]+)"/g)].map((m) => m[1]),
  ...[...validatorSrc.matchAll(/params\.has\("([a-z]+)"\)/g)].map((m) => m[1]),
  ...[...validatorSrc.matchAll(/params\.get\("([a-z]+)"\)/g)].map((m) => m[1]),
])];
chk(accepted.length >= 15, "read the accepted query keys out of lib/og/validate.js", accepted.join(" "));
chk(accepted.includes("v"), "the format version is among them (it is read with params.get, not num/pick/date)");
chk(accepted.includes("lang") && accepted.includes("lay") && accepted.includes("pb") && accepted.includes("ok") && accepted.includes("src"),
  "the four keys the first draft of this copy missed are among them", "lang lay pb ok src");
const undocumented = accepted.filter((k) => !(k in VALIDATOR_KEYS));
chk(undocumented.length === 0, "every key validate.js accepts has a phrase this gate knows about", undocumented.join(", "));

/* The privacy page must explain the fragment, and it must do it in the
   sharing section. Checking the whole page is not enough: the word
   "fragments" is in the mega-menu on every page of this site (Punctuation
   Storm), so a page-wide `includes("fragment")` passes on the OLD privacy
   page, which said nothing about sharing at all. Measured, not guessed --
   it passed on the reverted build. */
const priv = pageText("/privacy/") || "";
const secStart = priv.indexOf("Sharing a result or a page");
const secEnd = priv.indexOf("Optional aggregate analytics", secStart + 1);
const shareSection = secStart === -1 ? "" : priv.slice(secStart, secEnd === -1 ? priv.length : secEnd);
chk(shareSection.length > 800, "the sharing section is a real section, not a heading with nothing under it", `${shareSection.length} chars`);
chk(shareSection.includes("after #") || shareSection.includes("fragment"), "the sharing section explains the part after # / the fragment");
chk(shareSection.includes("after #") && shareSection.includes("fragment"), "the sharing section uses both 'after #' and 'fragment'");

const missingFromCopy = [...new Set(accepted.map((k) => VALIDATOR_KEYS[k]).filter(Boolean))]
  .filter((phrase) => !shareSection.toLowerCase().includes(phrase.toLowerCase()));
chk(missingFromCopy.length === 0,
  "the sharing section names every field validate.js lets into a link", missingFromCopy.join(", "));

/* Which destinations get the fragment is a privacy claim, so read it out
   of the share sheet instead of trusting the copy. share.js marks every
   target `variant: "full"` (the whole link, fragment included, because
   it goes to a person) or `variant: "short"` (query only, no words). A
   target flipped from short to full would quietly start carrying the
   reader's own text to that service while this page still said it did
   not -- the same failure the validate.js cross-check above exists for. */
const shareSrc = readFileSync(resolve(ROOT, "src/assets/js/share/share.js"), "utf8");
const targets = [...shareSrc.matchAll(/id:\s*"([a-z]+)",\s*label:\s*"([^"]+)",[^\n]*?variant:\s*"(short|full)"/g)]
  .map((m) => ({ label: m[2], variant: m[3] }));
chk(targets.length >= 10, "read the share sheet's destinations out of src/assets/js/share/share.js",
  targets.map((t) => `${t.label}:${t.variant}`).join(" "));

const btnStart = priv.indexOf("Which buttons carry your words");
const btnEnd = priv.indexOf("The preview image", btnStart + 1);
const btnPara = btnStart === -1 || btnEnd === -1 ? "" : priv.slice(btnStart, btnEnd);
/* Split by sentence, not at a phrase: the names sit BEFORE "get a link
   with nothing after the #", so slicing at that phrase files every one
   of them on the wrong side. That is what the first version did, and
   the check caught it. */
const btnSentences = btnPara.split(/(?<=\.)\s+/);
const carriesFragment = btnSentences.filter((x) => /whole link/i.test(x)).join(" ");
const carriesNothing = btnSentences.filter((x) => /nothing after the #/i.test(x)).join(" ");
chk(carriesFragment.length > 80 && carriesNothing.length > 40,
  "the privacy page splits the destinations into the ones that carry the fragment and the ones that do not",
  `${carriesFragment.length} / ${carriesNothing.length} chars`);
const named = (hay, label) => new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(hay);
const misfiled = targets.filter((t) => (t.variant === "full"
  ? !named(carriesFragment, t.label) || named(carriesNothing, t.label)
  : !named(carriesNothing, t.label) || named(carriesFragment, t.label)));
chk(misfiled.length === 0, "every share destination is named on the right side of that split",
  misfiled.map((t) => `${t.label} is "${t.variant}" in share.js`).join(", "));

/* The fragment carries three things, not two. The words and the replay
   were always in the copy; the five practice settings were not, and
   they are what makes a replay exact -- the same keystrokes under
   different rules produce a different screen (codec.js:60-72). Read the
   bits out of codec.js so a sixth one cannot be added silently, and
   require every one of them in the paragraph that describes the part
   after the #, not merely somewhere on the page. */
const PREF_PHRASES = {
  stopOnError: "stop cursor on error", spaceSkipsWords: "space skips words",
  forgiveErrors: "forgive errors", ignoreCapitalization: "ignore capitalization",
  skipPunctuation: "skip punctuation",
};
const codecSrc = readFileSync(resolve(ROOT, "src/assets/js/share/codec.js"), "utf8");
const prefBits = [...codecSrc.matchAll(/\["([A-Za-z]+)",\s*\d+\]/g)].map((m) => m[1]);
chk(prefBits.length >= 5, "read the practice settings out of src/assets/js/share/codec.js", prefBits.join(" "));
const undocumentedBits = prefBits.filter((k) => !(k in PREF_PHRASES));
chk(undocumentedBits.length === 0, "every setting the fragment carries has a phrase this gate knows about",
  undocumentedBits.join(", "));

const fragStart = priv.indexOf("What travels after the #");
const fragEnd = priv.indexOf("Which buttons carry your words", fragStart + 1);
const fragPara = fragStart === -1 || fragEnd === -1 ? "" : priv.slice(fragStart, fragEnd);
chk(fragPara.length > 400, "the fragment paragraph is a real paragraph", `${fragPara.length} chars`);
const missingBits = prefBits.map((k) => PREF_PHRASES[k]).filter(Boolean)
  .filter((phrase) => !fragPara.toLowerCase().includes(phrase));
chk(missingBits.length === 0,
  "the fragment paragraph names every practice setting that travels after the #", missingBits.join(", "));

const faqFrag = (pageText("/faq/") || "");
const faqStart = faqFrag.indexOf("After the # comes anything the site cannot look up for itself");
const faqPara = faqStart === -1 ? "" : faqFrag.slice(faqStart, faqStart + 400);
const faqMissing = prefBits.map((k) => PREF_PHRASES[k]).filter(Boolean)
  .filter((phrase) => !faqPara.toLowerCase().includes(phrase));
chk(faqMissing.length === 0, "the FAQ's answer names them too", faqMissing.join(", ") || (faqStart === -1 ? "the FAQ paragraph was not found" : ""));

/* Two destinations are NOT in INTENTS, so the loop above never sees
   them: Copy link is a call site (`const url = (c && c.fullUrl) ||
   location.href`) and the native sheet builds its own payload
   (`url: ctx.fullUrl`). Flip both to shortUrl and every check above
   stays green while /privacy/ still promises they carry the whole
   link -- the "helper wired into one of four call sites" failure, in
   miniature. The side is derived from share.js, not assumed, and an
   unrecognised call site fails rather than passing quietly. */
const CALL_SITES = [
  { what: "Copy link", label: "Copy link",
    full: /const url = \(c && c\.fullUrl\)/, short: /const url = \(c && c\.shortUrl\)/ },
  { what: "the native share sheet", label: "share sheet",
    full: /url: ctx\.fullUrl/, short: /url: ctx\.shortUrl/ },
];
for (const cs of CALL_SITES) {
  const isFull = cs.full.test(shareSrc), isShort = cs.short.test(shareSrc);
  const side = isFull && !isShort ? "full" : (isShort && !isFull ? "short" : "unknown");
  const onFull = named(carriesFragment, cs.label), onShort = named(carriesNothing, cs.label);
  const ok = side === "full" ? (onFull && !onShort) : side === "short" ? (onShort && !onFull) : false;
  chk(ok, `${cs.what} carries the link share.js gives it, and /privacy/ files it on that side`,
    side === "unknown"
      ? "neither the fullUrl nor the shortUrl form of that call site is in share.js -- refusing to guess"
      : `share.js: ${side}; /privacy/: ${onFull ? "with the whole link" : onShort ? "with the short link" : "not named at all"}`);
}

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

const strays = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (basename(p) === "og-default.svg") strays.push(p.slice(SITE.length));
  }
})(SITE);
chk(strays.length === 0, "og-default.svg is not in _site",
  strays.length ? strays.join(", ") + "  (Eleventy does not prune passthrough copies between builds — if you just reverted src/, run `npm run clean` and build again)" : "");
chk(!existsSync(resolve(ROOT, "src/assets/img/og-default.svg")), "og-default.svg is not in src/assets/img either");
chk(existsSync(resolve(ROOT, "src/assets/img/og-default.png")), "the PNG that replaced it IS still there (deleting both is not a pass)");

let refs = [];
for (const f of files) {
  if (readFileSync(f, "utf8").includes("og-default.svg")) refs.push(f.slice(SITE.length));
}
chk(refs.length === 0, "no built page mentions og-default.svg", refs.slice(0, 3).join(", "));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
