/* Sharing a result: the link, the landing page, and the line the
   fragment must never cross.

   The promise being guarded here is one sentence: **the server sees
   numbers and public ids, and nothing else.** Everything a person
   typed that is not already published on guerillatype.com, and the
   keystroke replay of how they typed it, live after the "#" in the
   URL, which no browser ever puts on the wire. A single fetch built
   from location.href would break that promise silently, and the page
   would look perfect.

   What must hold:

     A. codec.js round-trips a keystroke log, in Node, against the same
        file the browser loads: plain ASCII, non-ASCII, and a log full
        of backspaces and pauses. Then the budget ladder: a 20 KB log
        gives up timing precision first, then the replay, then the
        text, in that order and no other.
     B. result-link.build() for four runs. A words run has no `src` and
        carries its text in the fragment. A quote run has src=q:<id>
        and carries no text at all, because the landing page can look
        it up. A text of your own read by chapter has no `src`, no id
        and no title anywhere in the link. A challenge carries ok=1.
     C. /r/ opened with a fixture query and a fragment containing
        SECRET-ZEBRA: every request the page makes is inspected, and
        none of them carries the secret, the encoded replay, or a "#"
        at all. The numbers and the text render. The page says noindex.
     D. A query the validator refuses (wpm=9999) shows the plain
        "not a result we can show" state, and throws nothing.
     E. lib/og/r-meta.js in Node: a fixture query names the right
        pre-rendered card and a title with the wpm in it; a malformed
        query falls back to the default card.
     F. The real results card, after a real run typed at 70 ms/key:
        data-share-short-url is the query-only link, data-share-url
        adds the fragment, and Copy link puts the fragment-bearing one
        on the clipboard.

   Usage:
     npm run build && npm run share-page
*/
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

import { bandFor } from "../lib/og/labels.js";

/* The pure halves, imported rather than reimplemented: if the gate
   carried its own idea of the wire format or the band thresholds it
   would agree with itself and nothing else.

   Dynamic, and guarded, for one reason. A verifier's first move is to
   revert src/ and lib/ and run this file again, and at that point
   neither of these modules exists. A bare static import would answer
   with a Node stack trace about ERR_MODULE_NOT_FOUND; what a verifier
   should see is a FAIL with a count, naming what is missing. */
let codec, rMeta, canonicalQuery, resultCardPath, DEFAULT_IMAGE;
try {
  codec = await import("../src/assets/js/share/codec.js");
  const meta = await import("../lib/og/r-meta.js");
  ({ rMeta, canonicalQuery, resultCardPath, DEFAULT_IMAGE } = meta);
} catch (e) {
  console.log(`  FAIL  src/assets/js/share/codec.js and lib/og/r-meta.js are missing — ${e && e.message ? e.message : e}`);
  console.log("\nRUN ABORTED — the counts below are partial.");
  console.log("\n0 passed, 1 failed");
  process.exit(1);
}

/* Port from the task id, not from habit. 8080 is never ours, and
   8765 belongs to whatever the older gates expect to find there. */
const TASK = "share-result";
const PORT = Number(process.env.PORT) || 9495;
const ROOT = resolve("_site");
const SECRET = "SECRET-ZEBRA";

let pass = 0, fail = 0;
const chk = (ok, name, extra = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  ok ? pass++ : fail++;
};
process.on("unhandledRejection", (err) => {
  console.log(`  FAIL  unhandled rejection — ${err && err.message ? err.message : err}`);
  console.log("\nRUN ABORTED — the counts below are partial.");
  process.exit(1);
});

// =============================================================== A
console.log("\nA. the codec: a keystroke log survives the round trip");

const M = codec;
const ASCII_LOG = "the quick brown fox jumps".split("").map((c, i) => [c, i === 0 ? 0 : 60 + (i % 7) * 5]);
const UNICODE_LOG = [
  ["é", 0], ["t", 72], ["é", 66], ["中", 91],
  ["文", 58], ["😀", 140], [" ", 61], ["a", 70],
];
const MESSY_LOG = [
  ["h", 0], ["e", 80], ["l", 62], ["l", 300],
  [M.MARK_BACKSPACE, 210], [M.MARK_BACKSPACE, 95],
  ["l", 140], ["o", 70], [M.MARK_WORD_BACKSPACE, 380],
  ["h", 250], ["i", 71], [M.MARK_PAUSE, 4200], ["!", 900],
  [M.MARK_END, 120],
];

for (const [name, log] of [["ASCII", ASCII_LOG], ["non-ASCII", UNICODE_LOG], ["backspaces + pauses", MESSY_LOG]]) {
  const bytes = M.encodeLog(log, { quantum: 1 });
  let back = null, err = null;
  try { back = M.decodeLog(bytes); } catch (e) { err = e; }
  chk(!!back && JSON.stringify(back.entries) === JSON.stringify(log),
    `A. ${name}: decodeLog(encodeLog(log)) is the log`,
    err ? String(err.message) : `${bytes.length} bytes, ${log.length} entries`);
  const packed = await M.packLog(log, { quantum: 1 });
  const un = await M.unpackLog({ [packed.key]: packed.value });
  chk(!!un && JSON.stringify(un.entries) === JSON.stringify(log),
    `A. ${name}: base64url + deflate round trip`, `${packed.key}=${packed.bytes} chars`);
  chk(/^[A-Za-z0-9_-]*$/.test(packed.value),
    `A. ${name}: the encoding is base64url (no +, /, = or %)`, packed.value.slice(0, 24));
}

/* Every quantum, not only 1 ms.
   A verifier mutated `entries.push([ch, q * quantum])` to
   `entries.push([ch, q])` in decodeLog and the whole gate still passed
   137/0, because every round trip above runs at quantum 1 where the
   multiply is invisible. Deltas here are chosen so the quantisation
   bites: the expected value is the original ROUNDED to the quantum,
   computed here rather than read back from the decoder. */
{
  const TIMED = [
    ["a", 0], ["b", 61], ["c", 74], ["d", 130], ["e", 7], ["f", 3],
    [M.MARK_BACKSPACE, 255], ["g", 1001], [M.MARK_PAUSE, 4203],
    ["h", 999], ["é", 66], [M.MARK_END, 45],
  ];
  for (const q of M.QUANTA) {
    const want = TIMED.map(([ch, d]) => [ch, Math.round(d / q) * q]);
    const back = M.decodeLog(M.encodeLog(TIMED, { quantum: q }));
    chk(back.quantum === q, `A. quantum ${q}: the header says so`, String(back.quantum));
    chk(JSON.stringify(back.entries) === JSON.stringify(want),
      `A. quantum ${q}: deltas come back rounded to the quantum, not divided by it`,
      `${JSON.stringify(back.entries.slice(1, 4))} want ${JSON.stringify(want.slice(1, 4))}`);
    const packed = await M.packLog(TIMED, { quantum: q });
    const un = await M.unpackLog({ [packed.key]: packed.value });
    chk(!!un && JSON.stringify(un.entries) === JSON.stringify(want),
      `A. quantum ${q}: and survive the compressor too`, `${packed.key}=${packed.bytes} chars`);
  }
  /* A quantum the format does not define must be refused outright
     rather than quietly read as something else. */
  const bad = M.encodeLog(TIMED, { quantum: 1 });
  bad[1] = 3;
  let threw = false;
  try { M.decodeLog(bad); } catch { threw = true; }
  chk(threw, "A. a quantum byte that is not 1, 2, 4 or 8 is refused");
}

/* The uncompressed fallback has to decode too -- it is what Safari
   before 16.4 produces, and nobody has one of those to hand. */
{
  const raw = M.encodeLog(MESSY_LOG, { quantum: 1 });
  const un = await M.unpackLog({ ru: M.toBase64Url(raw) });
  chk(!!un && JSON.stringify(un.entries) === JSON.stringify(MESSY_LOG),
    "A. the `ru` (uncompressed) form decodes to the same log");
}

/* Rubbish in the replay parameter is "no replay", never a crash: a
   link truncated by a chat app is the normal way this happens. */
chk((await M.unpackLog({ r: "!!!!not base64!!!!" })) === null, "A. a corrupt `r` decodes to null, not an exception");
chk((await M.unpackLog({})) === null, "A. no replay parameter at all decodes to null");

/* The ladder. A deliberately incompressible log, because a synthetic
   one made of repeated keys deflates to nothing and would let a broken
   ladder pass. */
let seed = 20260916;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const BIG_LOG = [];
while (M.encodeLog(BIG_LOG, { quantum: 1 }).length < 20480) {
  BIG_LOG.push([String.fromCharCode(32 + Math.floor(rnd() * 95)), Math.floor(30 + rnd() * 500)]);
}
const bigBytes = M.encodeLog(BIG_LOG, { quantum: 1 }).length;
chk(bigBytes >= 20480, "A. the ladder fixture really is a 20 KB log", `${bigBytes} bytes, ${BIG_LOG.length} keys`);
const LADDER_TEXT = "x".repeat(500);

const sizes = {};
for (const q of M.QUANTA) sizes[q] = (await M.packLog(BIG_LOG, { quantum: q })).bytes;
chk(sizes[8] < sizes[1], "A. a coarser quantum really is smaller", `1ms ${sizes[1]} -> 8ms ${sizes[8]} chars`);

const rung = async (budget) => M.buildFragment({ keylog: BIG_LOG, text: LADDER_TEXT, prefs: 3, budget });
const roomy = await rung(sizes[1] + 2000);
chk(roomy.dropped.length === 0 && roomy.quantum === 1,
  "A. ladder 0: room for everything -> nothing dropped, 1 ms precision",
  `${roomy.fragment.length} chars, dropped ${JSON.stringify(roomy.dropped)}`);
const coarse = await rung(sizes[8] + 900);
chk(JSON.stringify(coarse.dropped) === '["precision"]' && coarse.quantum > 1,
  "A. ladder 1: precision goes first, the replay stays",
  `q=${coarse.quantum}, dropped ${JSON.stringify(coarse.dropped)}`);
chk(coarse.fragment.includes("&r=") || coarse.fragment.includes("&ru="),
  "A. ladder 1: the replay is still in the fragment");
const noReplay = await rung(1200);
chk(JSON.stringify(noReplay.dropped) === '["precision","replay"]',
  "A. ladder 2: then the replay goes, the text stays",
  JSON.stringify(noReplay.dropped));
chk(noReplay.fragment.includes("t=") && !/[?&]ru?=/.test(noReplay.fragment),
  "A. ladder 2: the text survives the replay being dropped", noReplay.fragment.slice(0, 60));
const nothing = await rung(60);
chk(JSON.stringify(nothing.dropped) === '["precision","replay","text"]',
  "A. ladder 3: the text goes last of all", JSON.stringify(nothing.dropped));
chk(!nothing.fragment.includes("t="), "A. ladder 3: and it really is gone", nothing.fragment);
for (const r of [roomy, coarse, noReplay, nothing]) {
  if (r.fragment.length > 60 && r === nothing) chk(false, "A. the last rung fits in any budget");
}
chk(nothing.fragment.length <= 60, "A. the last rung fits the smallest budget offered", `${nothing.fragment.length} chars`);

/* 8 KB is the number the plan names. Whatever the ladder does, the
   default budget must produce something that fits it. */
const dflt = await M.buildFragment({ keylog: BIG_LOG, text: LADDER_TEXT, prefs: 3 });
chk(dflt.fragment.length <= 8192, "A. the default budget is 8 KB and is honoured", `${dflt.fragment.length} chars`);

/* The preference mask: five booleans, and the same five back. */
{
  const prefs = { stopOnError: true, spaceSkipsWords: false, forgiveErrors: true, ignoreCapitalization: false, skipPunctuation: true };
  const mask = M.prefsMask(prefs);
  const back = M.prefsFromMask(mask);
  chk(mask === 1 + 4 + 16 && back.stopOnError && back.forgiveErrors && back.skipPunctuation
    && !back.spaceSkipsWords && !back.ignoreCapitalization,
    "A. the preference bitmask round-trips", `mask=${mask}`);
}

// =============================================================== E
// Run before the browser starts: it needs nothing but Node.
console.log("\nE. lib/og/r-meta.js: what a scraper is told");
{
  const good = "v=1&wpm=62&raw=70&acc=96&con=88&dur=30&n=180&err=7&mode=time&lang=en-1k&lay=qwerty&d=2026-09-16";
  const meta = rMeta(good, { origin: "https://guerillatype.com" });
  chk(meta.ok === true, "E. a good query validates");
  chk(meta.image === `https://guerillatype.com${resultCardPath(62, 96)}`
    && meta.image.endsWith(`/og/result/62-${bandFor(96)}.png`),
    "E. og:image is the pre-rendered card for these numbers", meta.image);
  chk(meta.title.includes("62") && /wpm/i.test(meta.title), "E. the title carries the wpm", meta.title);
  chk(meta.description.includes("96%"), "E. the description carries the accuracy", meta.description.slice(0, 70));
  chk(meta.url === `https://guerillatype.com/r/?${canonicalQuery(good)}`, "E. og:url is the canonical /r/ link", meta.url);

  const over = rMeta("v=1&wpm=260&acc=100&mode=words", { origin: "https://x.test" });
  chk(over.image.endsWith("/og/result/200p-100.png"), "E. over 200 wpm shares the 200+ card", over.image);

  for (const bad of ["v=1&wpm=9999", "v=1", "wpm=62", "v=1&wpm=62&src=q:../../x", "v=1&wpm=62&lang=BUY-NOW", ""]) {
    const m = rMeta(bad, { origin: "https://x.test" });
    chk(m.ok === false && m.image === `https://x.test${DEFAULT_IMAGE}`,
      `E. a malformed query falls back to the default card: ${JSON.stringify(bad).slice(0, 34)}`, m.image);
  }
  chk(rMeta("v=1&wpm=62&fbclid=abc&utm_source=x", { origin: "https://x.test" }).query === "v=1&wpm=62",
    "E. tracking parameters are dropped from the canonical query");
  const dyn = rMeta("v=1&wpm=62&acc=96", { origin: "https://x.test", dynamic: true });
  chk(dyn.image.startsWith("https://x.test/og/result.png?v=1&wpm=62"),
    "E. with OG_DYNAMIC the card is the on-demand renderer", dyn.image);
}

// =============================================================== G
/* The Functions bundle. This section is here because a verifier ran
   `wrangler pages dev _site` and found that the WHOLE Functions build
   failed -- /r/ included -- with `Could not resolve "fs"` from
   harfbuzzjs under satori. The cause was an `import("satori")` in
   functions/og/[[path]].js, behind a flag check that never runs.
   esbuild resolves a dynamic import statically; the guard bought
   nothing.
 
   Reading the file does not show this. Neither does node --check. So
   the rule is mechanical and so is the check: walk every file under
   functions/ and everything it reaches, and refuse anything outside a
   three-file allowlist. Cheap, offline, and it fires long before
   anybody gets as far as a preview deploy. */
console.log("\nG. nothing under functions/ may reach a bundler it cannot survive");
{
  const { readdir, readFile: rf } = await import("node:fs/promises");
  const { dirname, join: j, relative, resolve: r } = await import("node:path");
  const REPO = r(".");
  const ALLOW = [
    "lib/og/validate.js",
    "lib/og/labels.js",
    "lib/og/r-meta.js",
  ].map((p) => r(REPO, p));

  const walk = async (dir) => {
    let out = [];
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
      const full = j(dir, e.name);
      if (e.isDirectory()) out = out.concat(await walk(full));
      else if (/\.(js|mjs)$/.test(e.name)) out.push(full);
    }
    return out;
  };
  const roots = await walk(r(REPO, "functions"));
  chk(roots.length > 0, "G. there are Functions to check", roots.map((f) => relative(REPO, f)).join(", "));

  /* Comments first. The first version of this check read them, and
     `import("satori")` written inside a comment EXPLAINING why satori
     must never be imported failed the gate. esbuild does not read
     comments and neither should this. Quotes and template literals are
     tracked so that a "//" inside a string survives. */
  const stripComments = (src) => {
    let out = "", i = 0, q = null;
    while (i < src.length) {
      const c = src[i], n = src[i + 1];
      if (q) {
        if (c === "\\") { out += c + (n || ""); i += 2; continue; }
        if (c === q) q = null;
        out += c; i++; continue;
      }
      if (c === '"' || c === "'" || c === "`") { q = c; out += c; i++; continue; }
      if (c === "/" && n === "*") {
        const end = src.indexOf("*/", i + 2);
        i = end === -1 ? src.length : end + 2;
        out += " ";
        continue;
      }
      if (c === "/" && n === "/") {
        const end = src.indexOf("\n", i);
        i = end === -1 ? src.length : end;
        out += " ";
        continue;
      }
      out += c; i++;
    }
    return out;
  };

  /* Static imports, re-exports, dynamic imports and require(), because
     any of the four is a specifier esbuild will try to resolve. */
  const SPECS = [
    /\bimport\s+[^;]*?\bfrom\s*["']([^"']+)["']/g,
    /\bexport\s+[^;]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s+["']([^"']+)["']/g,
  ];
  const seen = new Set();
  const bad = [];
  const queue = roots.slice();
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    let src = "";
    try { src = stripComments(await rf(file, "utf8")); } catch { continue; }
    for (const re of SPECS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src))) {
        const spec = m[1];
        const where = relative(REPO, file);
        if (spec.startsWith("node:")) { bad.push(`${where} -> ${spec} (node builtin)`); continue; }
        if (!spec.startsWith(".") && !spec.startsWith("/")) {
          bad.push(`${where} -> ${spec} (bare specifier: esbuild will resolve it)`);
          continue;
        }
        const target = r(dirname(file), spec);
        if (!ALLOW.includes(target)) {
          bad.push(`${where} -> ${spec} (not on the allowlist)`);
          continue;
        }
        queue.push(target);
      }
    }
  }
  chk(bad.length === 0,
    "G. every import under functions/ is lib/og/{validate,labels,r-meta}.js and nothing else",
    bad.length ? bad.join(" | ") : `${seen.size} files walked, all clean`);

  /* Named rather than counted: satori and resvg are the two that
     actually broke the build, and a future reader should see them
     spelled out. */
  const bundled = [...seen].map((f) => relative(REPO, f)).join(" ");
  let joined = "";
  for (const f of seen) { try { joined += stripComments(await rf(f, "utf8")); } catch {} }
  chk(!/["']satori["']|@resvg|yoga-wasm|harfbuzz/.test(joined),
    "G. satori, resvg, yoga and harfbuzz appear nowhere in the bundle", bundled);
  chk(/lib\/og\/dynamic-card\.js/.test(await rf(r(REPO, "functions/og/[[path]].js"), "utf8")),
    "G. and the renderer that used to live there says where it went");
}

// ---------------------------------------------------------------- server
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon", ".xml": "application/xml; charset=utf-8",
};
try {
  await stat(join(ROOT, "r", "index.html"));
} catch {
  chk(false, "the /r/ page is in _site — run `npm run build` first");
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ""));
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    } catch {
      if (!extname(file)) file += ".html";
    }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
});
await new Promise((ok, no) => {
  server.on("error", no);
  server.listen(PORT, "127.0.0.1", ok);
}).catch((e) => {
  console.log(`  FAIL  could not bind 127.0.0.1:${PORT} — ${e.code || e.message}`);
  console.log("\nRUN ABORTED — refusing to share a port with something else.");
  process.exit(1);
});
const B = `http://127.0.0.1:${PORT}`;

/* Prove what is answering before believing anything it says. */
const probe = await fetch(B + "/r/").then((r) => r.text()).catch(() => "");
const isThisProject = /<title>[^<]*GuerillaType<\/title>/.test(probe) && /id=["']?tt-shared["'\s>]/.test(probe);
chk(isThisProject, `server on ${PORT} is this project's /r/ page`);
if (!isThisProject) {
  console.log("\nRUN ABORTED — refusing to test something that is not this build.");
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}

// ---------------------------------------------------------------- browser
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  serviceWorkers: "block",
  hasTouch: false,
});
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: B });
await context.addInitScript(() => {
  window.__ttEvents = [];
  window.__ttErrors = [];
  window.addEventListener("error", (e) => window.__ttErrors.push(String(e.message || e)));
  window.umami = { track: (name, props) => { window.__ttEvents.push({ name, props: props || {} }); } };
});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));

async function bail(msg) {
  chk(false, msg);
  console.log("\nRUN ABORTED — the counts below are partial.");
  await browser.close().catch(() => {});
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}
const waitOr = async (fn, msg, timeout = 9000) => {
  try { await fn(timeout); return true; }
  catch { await bail(msg); return false; }
};

// =============================================================== B
console.log("\nB. result-link.build(): four runs, four links");
await page.goto(B + "/about/", { waitUntil: "domcontentloaded" });
await waitOr((t) => page.waitForFunction(() => !!window.ttOpenShareSheet, null, { timeout: t }),
  "B. share/share.js loads (the module result-link builds on)");

const CUSTOM_TITLE = "ZEBRAQUARTZ private notes";
const CUSTOM_ID = "c_zq7788";
const CUSTOM_BODY = "velvetmoose gallopingly through the pumpernickel orchard";

const FIXTURES = {
  words: {
    result: {
      wpm: 71.4, raw: 78.2, accuracy: 96.1, consistency: 84, ms: 21400,
      chars: 128, errors: 5, mode: "words", lang: "en-1k", layout: "qwerty",
      target: "the quick brown fox jumps over the lazy dog again",
      keylog: [["t", 0], ["h", 70], ["e", 66]],
      _meta: { newModeBest: true },
    },
    state: { mode: "words", words: 10, language: "en-1k", layout: "qwerty" },
  },
  quote: {
    result: {
      wpm: 84, raw: 90, accuracy: 99, consistency: 88, ms: 30100,
      chars: 210, errors: 2, mode: "custom", lang: "en-1k", layout: "qwerty",
      target: "The only way to do great work is to love what you do.",
      keylog: [["T", 0], ["h", 80]],
      _meta: {},
    },
    state: { mode: "custom", language: "en-1k", layout: "qwerty", _customMeta: { kind: "quote", sourceId: "q-do-love" } },
  },
  customBook: {
    result: {
      wpm: 55, raw: 60, accuracy: 93, consistency: 71, ms: 60000,
      chars: 400, errors: 20, mode: "book", lang: "en-1k", layout: "qwerty",
      target: CUSTOM_BODY,
      keylog: [["v", 0], ["e", 75]],
      _meta: {},
    },
    state: {
      mode: "book", language: "en-1k", layout: "qwerty",
      bookSlug: `custom:${CUSTOM_ID}`, bookCh: 2, bookPage: 3,
      _customTitle: CUSTOM_TITLE, _customMeta: { kind: "custom", title: CUSTOM_TITLE },
    },
  },
  challenge: {
    result: {
      wpm: 102, raw: 110, accuracy: 97, consistency: 90, ms: 45000,
      chars: 500, errors: 12, mode: "challenge", lang: "en-1k", layout: "qwerty",
      target: "one hundred words of challenge text",
      keylog: [["o", 0], ["n", 68]],
      _meta: { newOverallBest: true },
      _challenge: { id: "word-100", name: "100 words", passed: true, reasons: [] },
    },
    state: { mode: "challenge", language: "en-1k", layout: "qwerty" },
  },
  book: {
    result: {
      wpm: 66, raw: 72, accuracy: 95, consistency: 80, ms: 90000,
      chars: 700, errors: 25, mode: "book", lang: "en-1k", layout: "qwerty",
      target: "Marley was dead: to begin with.",
      keylog: [["M", 0], ["a", 70]],
      _meta: {},
    },
    state: { mode: "book", language: "en-1k", layout: "qwerty", bookSlug: "a-christmas-carol", bookCh: 0, bookPage: 1 },
  },
};

const built = await page.evaluate(async (fx) => {
  const m = await import("/assets/js/share/result-link.js");
  const out = {};
  for (const [name, ctx] of Object.entries(fx)) {
    out[name] = await m.build({ result: ctx.result, state: ctx.state, origin: "https://guerillatype.com" });
  }
  return out;
}, FIXTURES);

const qOf = (link) => new URLSearchParams(new URL(link.shortUrl).search);
const fragOf = (link) => new URLSearchParams((link.fullUrl.split("#")[1] || ""));

/* Every link this module builds must be a link the validator accepts;
   otherwise the card renderer silently draws the default. */
for (const [name, link] of Object.entries(built)) {
  const model = (await import("../lib/og/validate.js")).validate(new URLSearchParams(new URL(link.shortUrl).search));
  chk(!!model, `B. ${name}: the query survives lib/og/validate.js`, link.shortUrl.slice(0, 96));
  chk(!link.shortUrl.includes("#"), `B. ${name}: the short url has no fragment`);
  chk(link.fullUrl.startsWith(link.shortUrl), `B. ${name}: the full url is the short one plus a fragment`);
  chk(new URL(link.shortUrl).pathname === "/r/", `B. ${name}: it points at /r/`, new URL(link.shortUrl).pathname);
}

{
  const w = built.words;
  const q = qOf(w), f = fragOf(w);
  chk(!q.has("src"), "B. words: a random word run names no public source", q.get("src") || "(none)");
  chk(f.get("t") === FIXTURES.words.result.target, "B. words: the text is in the fragment, whole", (f.get("t") || "").slice(0, 40));
  chk(!w.shortUrl.includes(encodeURIComponent(FIXTURES.words.result.target.slice(0, 12))),
    "B. words: and not in the query");
  chk(q.get("wpm") === "71" && q.get("acc") === "96" && q.get("err") === "5" && q.get("n") === "128",
    "B. words: the numbers are the run's", q.toString().slice(0, 70));
  chk(q.get("mode") === "words" && q.get("lang") === "en-1k" && q.get("lay") === "qwerty",
    "B. words: mode, language and layout are label ids");
  chk(q.get("pb") === "1", "B. words: a new mode best is pb=1", q.get("pb"));
  chk(/^\d{4}-\d{2}-\d{2}$/.test(q.get("d") || ""), "B. words: the date is the shape validate.js wants", q.get("d"));
  chk(w.imageUrl === `https://guerillatype.com${resultCardPath(71, 96)}`, "B. words: the image is this run's card", w.imageUrl);
}
{
  const q = qOf(built.quote), f = fragOf(built.quote);
  chk(q.get("src") === "q:q-do-love", "B. quote: named by its public id", q.get("src"));
  chk(!f.has("t"), "B. quote: and the text does NOT travel — the page looks it up", f.get("t") || "(absent)");
  chk(q.get("mode") === "quote", "B. quote: a quote typed through custom mode still says quote", q.get("mode"));
}
{
  const link = built.customBook;
  const q = qOf(link), f = fragOf(link);
  const hay = decodeURIComponent(link.fullUrl) + " " + link.fullUrl + " " + link.title + " " + link.text;
  /* Squashed: lowercase, with every character that is not a letter or
     a digit removed. "custom%3Ac_zq7788", "custom-c-zq7788" and
     "custom:c_zq7788" all collapse to the same string, so a link that
     "sanitised" the slug into something id-shaped still fails here.
     The share sheet's own gate learned this the hard way: its first
     version searched for "custom:" and passed against a live leak that
     was percent-encoded. */
  const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
  const squashed = squash(hay);
  chk(!q.has("src"), "B. custom book: a text of your own has no public source", q.get("src") || "(none)");
  chk(!squashed.includes(squash(CUSTOM_ID)) && !squashed.includes("zq7788"),
    "B. custom book: the private id appears nowhere in the link, in any shape");
  chk(!squashed.includes("customc") && !hay.includes("custom:"), "B. custom book: not even the custom: prefix");
  chk(!hay.includes("ZEBRAQUARTZ"), "B. custom book: the title never leaves the device");
  chk(f.get("t") === CUSTOM_BODY, "B. custom book: the body rides in the fragment", (f.get("t") || "").slice(0, 40));
  chk(!link.shortUrl.includes("velvetmoose") && !link.shortUrl.includes(encodeURIComponent("velvetmoose")),
    "B. custom book: and never in the query");
  chk(q.get("mode") === "custom", "B. custom book: the mode says custom, not book", q.get("mode"));
}
{
  const q = qOf(built.challenge);
  chk(q.get("ok") === "1", "B. challenge: a cleared challenge sets ok=1", q.get("ok"));
  chk(q.get("src") === "ch:word-100", "B. challenge: named by its public id", q.get("src"));
  chk(q.get("pb") === "2", "B. challenge: a lifetime best is pb=2", q.get("pb"));
  const missed = await page.evaluate(async (ctx) => {
    const m = await import("/assets/js/share/result-link.js");
    ctx.result._challenge.passed = false;
    return (await m.build({ result: ctx.result, state: ctx.state, origin: "https://x.test" })).shortUrl;
  }, FIXTURES.challenge);
  chk(new URLSearchParams(new URL(missed).search).get("ok") === "0",
    "B. challenge: a missed one sets ok=0, it is not simply absent", missed.slice(-40));
}
{
  const q = qOf(built.book);
  chk(q.get("src") === "bk:a-christmas-carol:0:1", "B. book: slug, chapter and page", q.get("src"));
  chk(!fragOf(built.book).has("t"), "B. book: a library book's text does not travel");
}

// =============================================================== C
console.log("\nC. /r/: the fragment never reaches the wire");
const rawHtmlEarly = await fetch(`${B}/r/`).then((r) => r.text());
const SHARE_Q = "v=1&wpm=62&raw=70&acc=96&con=88&dur=30&n=180&err=7&mode=words&lang=en-1k&lay=qwerty&d=2026-09-16";
const SHARE_TEXT = `the quick brown ${SECRET} fox jumps over it`;
const replay = await codec.packLog(MESSY_LOG, { quantum: 1 });
const SHARE_FRAG = `v=1&t=${encodeURIComponent(SHARE_TEXT)}&o=3&${replay.key}=${replay.value}`;

/* Every request the page makes, url and body, from the moment it
   starts loading. A fetch built from location.href is the mistake this
   is here to catch.

   A FRESH page, not the one section B used. Requests are reported per
   page and a previous document's late beacon (umami's POST fires well
   after load) would otherwise land in this list and be blamed on /r/.
   That cost half an hour once; the isolation is not decoration. */
const pageC = await context.newPage();
const seen = [];
const cErrors = [];
pageC.on("pageerror", (e) => cErrors.push(String(e).slice(0, 200)));
pageC.on("request", (req) => {
  let body = "";
  try { body = req.postData() || ""; } catch { body = ""; }
  seen.push({ url: req.url(), body, method: req.method(), headers: req.headers() });
});
await pageC.goto(`${B}/r/?${SHARE_Q}#${SHARE_FRAG}`, { waitUntil: "networkidle" });
await waitOr((t) => pageC.waitForSelector('#tt-shared:not([hidden])', { timeout: t }),
  "C. the card renders for a valid query");
await pageC.waitForTimeout(400);

chk(seen.length > 3, "C. the page really did make requests to inspect", `${seen.length} requests`);
const offenders = seen.filter((r) => {
  const hay = `${r.url} ${r.body} ${JSON.stringify(r.headers)}`;
  const dec = (() => { try { return decodeURIComponent(hay); } catch { return hay; } })();
  return dec.includes(SECRET) || hay.includes(SECRET)
    || hay.includes(replay.value.slice(0, 24)) || dec.includes(replay.value.slice(0, 24));
});
chk(offenders.length === 0, "C. no request carries the secret or the encoded replay",
  offenders.length ? offenders.slice(0, 2).map((o) => o.url.slice(0, 110)).join(" | ") : `${seen.length} requests clean`);
const hashy = seen.filter((r) => r.url.includes("#"));
chk(hashy.length === 0, "C. no request url contains a `#` at all",
  hashy.length ? hashy[0].url.slice(0, 110) : "");
const referrers = seen.filter((r) => String((r.headers || {}).referer || "").includes("#"));
chk(referrers.length === 0, "C. no Referer header carries a fragment either");
/* The leak this section was written to catch, and it was a real one:
   umami's tracker reports location.href verbatim, fragment and all, so
   simply loading it on this page POSTs the typed text and the replay
   to gateway.umami.is. /r/ therefore loads no third-party analytics at
   all. Asserted twice -- once against the built HTML, which holds with
   no network, and once against what the page actually did. */
/* Written as "either/or" on purpose, not as a flat "no umami here".
   Intercepting requests is not enough on its own -- a gate that stubs
   window.umami sees nothing and concludes the page is clean -- so this
   is the assertion that holds with no network at all. Today /r/ ships
   no tracker; if somebody decides later that it should have one, this
   still holds them to the two attributes that keep the query and the
   fragment out of the payload, rather than silently going quiet. */
const umamiTag = (rawHtmlEarly.match(/<script[^>]*umami[^>]*>/i) || [""])[0];
const noTracker = !/umami|cloudflareinsights/.test(rawHtmlEarly);
const guardedTracker = /data-exclude-hash=["']?true/i.test(umamiTag)
  && /data-exclude-search=["']?true/i.test(umamiTag);
chk(noTracker || guardedTracker,
  "C. /r/ either ships no tracker, or one that excludes the query and the hash",
  noTracker ? "no tracker at all" : umamiTag.slice(0, 120) || "(tag not found)");
const thirdParty = seen.filter((r) => !r.url.startsWith(B) && !r.url.startsWith("data:") && !r.url.startsWith("blob:"));
const analyticsHits = thirdParty.filter((r) => /umami|cloudflareinsights|analytics/i.test(r.url));
chk(analyticsHits.length === 0, "C. and sent nothing to an analytics endpoint",
  analyticsHits.map((r) => r.url.slice(0, 70)).join(" | "));

chk((await pageC.textContent('[data-r="wpm"]')) === "62", "C. the wpm renders from the query");
chk((await pageC.textContent('[data-r="acc"]')) === "96%", "C. so does the accuracy");
chk((await pageC.textContent('[data-r="raw"]')) === "70", "C. and the raw speed");
const shownText = (await pageC.textContent('[data-r="text"]')) || "";
chk(shownText.includes(SECRET), "C. the typed text renders, read out of the fragment", shownText.slice(0, 50));
chk(!(await pageC.isHidden('[data-r="text"]')), "C. and it is actually visible");
const tryHref = await pageC.getAttribute("#tt-try", "href");
chk(tryHref === "/practice/?mode=words", "C. Try this yourself deep-links to the same kind of run", tryHref);
chk(cErrors.length === 0, "C. the page threw nothing", cErrors.join(" | "));

/* The promise, in the words a reader actually sees. Asserted verbatim
   because it is a claim about behaviour, and the two must not drift
   apart quietly. */
const footnote = (await pageC.textContent('[data-r="footnote"]') || "").replace(/\s+/g, " ").trim();
chk(footnote.startsWith("The numbers and the public id travel in the address. The text you typed and the replay, if any, sit after the # and never reach a server."),
  "C. the privacy footnote says what actually happens", footnote.slice(0, 120));
chk(/analytics/i.test(footnote), "C. and that this page reports nothing", footnote.slice(-70));

const robots = await pageC.getAttribute('meta[name="robots"]', "content");
chk(/noindex/.test(robots || ""), "C. the template carries noindex", robots || "(absent)");
chk(/name=["']?robots["']?[^>]*noindex|noindex[^>]*name=["']?robots/.test(rawHtmlEarly),
  "C. noindex is in the built HTML, not added by script");

/* The replay is decoded and reserved for the D3 player, and the player
   itself is not here yet -- so the Play button stays hidden. */
const replayState = await pageC.evaluate(() => {
  const r = window.__ttReplay;
  const root = document.getElementById("tt-replay-root");
  const btn = document.getElementById("tt-replay-play");
  return {
    has: !!r, keys: r ? (r.entries || []).length : -1,
    prefs: r ? r.prefs : null,
    rootHidden: !!(root && root.hidden), btnHidden: !!(btn && btn.hidden),
  };
});
chk(replayState.has && replayState.keys === MESSY_LOG.length,
  "C. window.__ttReplay holds the decoded log for the D3 player", `${replayState.keys} entries`);
chk(replayState.prefs && replayState.prefs.stopOnError === true && replayState.prefs.spaceSkipsWords === true,
  "C. and the preference mask that makes a replay exact", JSON.stringify(replayState.prefs));
chk(replayState.rootHidden && replayState.btnHidden, "C. the replay root and its Play button stay hidden until D3");

/* The re-share row hands on the whole link, fragment included. */
await pageC.click("#tt-reshare");
await pageC.waitForTimeout(200);
const reshare = await pageC.evaluate(() => {
  const d = document.getElementById("share-sheet");
  const x = d && d.querySelector('[data-share-target="x"]');
  const tg = d && d.querySelector('[data-share-target="telegram"]');
  return { open: !!(d && d.open), x: x && x.getAttribute("href"), tg: tg && tg.getAttribute("href") };
});
chk(reshare.open, "C. the re-share row opens the share sheet");
chk(!!reshare.x && !reshare.x.includes(encodeURIComponent("#")) && !reshare.x.includes(SECRET),
  "C. a re-share to X carries the short link only", (reshare.x || "").slice(0, 90));
chk(!!reshare.tg && reshare.tg.includes(encodeURIComponent("#")),
  "C. a re-share to Telegram carries the whole link, fragment and all");
await pageC.keyboard.press("Escape");
await pageC.close();

// =============================================================== D
console.log("\nD. a link that is not a result");
for (const bad of ["v=1&wpm=9999", "v=1&wpm=62&src=q%3A..%2F..%2Fx", "v=2&wpm=62", ""]) {
  pageErrors.length = 0;
  await page.goto(`${B}/r/?${bad}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(200);
  const invalidVisible = await page.isVisible("#tt-invalid");
  const cardVisible = await page.isVisible("#tt-shared");
  chk(invalidVisible && !cardVisible,
    `D. ${JSON.stringify("?" + bad).slice(0, 40)} shows the plain not-a-result state`,
    `invalid=${invalidVisible} card=${cardVisible}`);
  chk(pageErrors.length === 0, "D. ...and throws nothing", pageErrors.join(" | "));
}
chk((await page.textContent("#tt-invalid h1")).trim() === "This link is not a result we can show",
  "D. it says so in plain words", await page.textContent("#tt-invalid h1"));

// =============================================================== F
console.log("\nF. the results card after a real run at 70 ms/key");
await page.goto(`${B}/practice/?mode=words&words=10`, { waitUntil: "networkidle" });
await page.waitForSelector(".tt-char", { timeout: 9000 });
await page.click(".tt-stage").catch(() => {});
const surfaceText = await page.$$eval(".tt-char", (els) =>
  els.map((e) => (e.classList.contains("tt-char--space") ? " " : e.textContent)).join(""));
/* 70 ms/key: the engine flags anything over 250 wpm as suspect and a
   robot-speed run tests a different code path. Two deliberate errors
   so accuracy lands below 100 and the band is not a constant. */
let ix = 0;
for (const ch of surfaceText) {
  if (ix === 4 || ix === 11) await page.keyboard.type(ch === "q" ? "z" : "q", { delay: 70 });
  else await page.keyboard.type(ch, { delay: 70 });
  ix++;
}
await waitOr((t) => page.waitForSelector("#tt-results:not([hidden])", { timeout: t }),
  "F. the run finished and the card is up");
await waitOr((t) => page.waitForFunction(() => {
  const b = document.getElementById("tt-share");
  return b && (b.getAttribute("data-share-url") || "").includes("#");
}, null, { timeout: t }), "F. the Share button gets a fragment-bearing url");

const card = await page.evaluate(() => {
  const b = document.getElementById("tt-share");
  const wpm = parseInt(document.querySelector(".results__title-num").textContent, 10);
  const acc = parseInt(Array.from(document.querySelectorAll(".results__metric"))
    .find((m) => /accuracy/.test(m.textContent)).querySelector(".results__value").textContent, 10);
  return { d: Object.assign({}, b.dataset), wpm, acc };
});
const shortU = card.d.shareShortUrl || "";
const fullU = card.d.shareUrl || "";
chk(new URL(shortU).pathname === "/r/" && !shortU.includes("#"),
  "F. data-share-short-url is the query-only /r/ link", shortU.slice(0, 100));
chk(fullU.startsWith(shortU + "#"), "F. data-share-url is that link plus the fragment", fullU.slice(0, 110));
const cardQ = new URLSearchParams(new URL(shortU).search);
chk(Number(cardQ.get("wpm")) === card.wpm && Number(cardQ.get("acc")) === card.acc,
  "F. the query carries the numbers the card shows", `${cardQ.get("wpm")}/${cardQ.get("acc")} vs ${card.wpm}/${card.acc}`);
chk(card.acc < 100, "F. the run really did land below 100 % (the band is not a constant)", `${card.acc}%`);
chk(card.d.shareImage.endsWith(`/og/result/${card.wpm > 200 ? "200p" : card.wpm}-${bandFor(card.acc)}.png`),
  "F. the image is the pre-rendered card for these numbers", card.d.shareImage);
const cardFrag = new URLSearchParams(fullU.split("#")[1] || "");
chk(cardFrag.get("t") === surfaceText, "F. what was on screen is in the fragment, whole",
  (cardFrag.get("t") || "").slice(0, 40));
chk(!!(cardFrag.get("r") || cardFrag.get("ru")), "F. the keystroke replay is there too",
  `${cardFrag.get("r") ? "r" : "ru"}=${(cardFrag.get("r") || cardFrag.get("ru") || "").length} chars`);
const cardLog = await codec.unpackLog({ r: cardFrag.get("r"), ru: cardFrag.get("ru") });
chk(!!cardLog && cardLog.entries.length >= surfaceText.length,
  "F. and it decodes to one entry per key actually pressed",
  cardLog ? `${cardLog.entries.length} entries for ${surfaceText.length} chars` : "did not decode");
chk(!shortU.includes(encodeURIComponent(surfaceText.slice(0, 10))),
  "F. the query carries none of the words that were typed");

await page.click("#tt-share");
await page.waitForTimeout(200);
await page.evaluate(() => navigator.clipboard.writeText("__nothing__"));
await page.click("#share-sheet [data-share-copy]");
await page.waitForTimeout(300);
const clip = await page.evaluate(() => navigator.clipboard.readText());
chk(clip === fullU, "F. Copy link puts the full url, fragment included, on the clipboard", clip.slice(0, 110));
/* Parsed, not string-matched: URLSearchParams writes a space as "+"
   and encodeURIComponent writes it as "%20", and an assertion that
   cannot tell those apart fails on a correct link. */
chk(clip.includes("#") && new URLSearchParams(clip.split("#")[1] || "").get("t") === surfaceText,
  "F. which means the person you send it to can see the text");
const socials = await page.$$eval("#share-sheet [data-share-target]", (els) => els.map((a) => ({
  id: a.dataset.shareTarget, href: a.getAttribute("href"),
})));
const shortOnly = ["x", "facebook", "linkedin", "reddit", "bluesky", "threads", "whatsapp"];
for (const id of shortOnly) {
  const a = socials.find((s) => s.id === id);
  chk(!!a && a.href.includes(encodeURIComponent(shortU)) && !a.href.includes(encodeURIComponent(fullU)),
    `F. ${id} gets the short link, never the fragment`, (a && a.href || "").slice(0, 80));
}
await page.keyboard.press("Escape");

/* The same log is filed in this browser, against the session id
   session-recorder minted. That is what makes "share a run from
   /stats/" possible later without the run having to be shared at the
   moment it ended. It is stored here and nowhere else. */
const stored = await page.evaluate(async () => {
  const s = await import("/assets/js/engine/replay-store.js");
  const rows = await s.list();
  if (!rows.length) return { rows: 0 };
  const one = await s.get(rows[0].id);
  return {
    rows: rows.length, id: rows[0].id,
    keys: one ? (one.keylog || []).length : -1,
    hasHash: !!(one && one.textHash),
    hashIsNotTheText: !!(one && one.textHash && one.textHash.length < 30),
    keep: s.KEEP,
  };
});
chk(stored.rows >= 1 && /^s_/.test(stored.id || ""),
  "F. the run's keystroke log is filed against its session id", JSON.stringify(stored));
chk(stored.keys >= surfaceText.length,
  "F. with one entry per key", `${stored.keys} entries for ${surfaceText.length} chars`);
chk(stored.hasHash && stored.hashIsNotTheText,
  "F. and a short hash of the target, not the target itself");
chk(stored.keep === 50, "F. the store keeps the newest 50 runs", String(stored.keep));

// ---------------------------------------------------------------- done
await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
