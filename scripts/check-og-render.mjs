#!/usr/bin/env node
/* The share-card renderer, checked without a browser, a server or a
   build. Plain Node over lib/og/ and the seven vendored fonts.
 *
 * What this is guarding against, in order of how likely it is to bite:
 *
 *   1. A card that renders as something other than a 1200x630 PNG.
 *      Every platform crops to that; a wrong size is a broken preview,
 *      and satori fails by producing a *plausible* image, not by
 *      throwing.
 *   2. validate() getting friendly. It is the only thing between a URL
 *      and an image served from guerillatype.com. Section C hands it
 *      the five attacks the plan calls out and requires null for each
 *      -- AND requires a real model for a good query, so a validate()
 *      that returns null for everything cannot pass this gate by being
 *      maximally paranoid.
 *   3. A label map drifting behind the data. A word list added without
 *      a label draws an empty chip; section D compares the maps against
 *      wordlists.js, modes.js and layouts.js.
 *   4. Non-determinism. Two identical renders must be byte-identical,
 *      or every deploy re-uploads 3,600 files and no "did the design
 *      change?" question can ever be answered.
 *
 * Run: npm run og-render */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
process.chdir(ROOT);   // src/_data/wordlists.js resolves paths off cwd

let pass = 0, fail = 0;
const chk = (ok, n, x = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); ok ? pass++ : fail++; };
const die = (msg) => { console.log(`  FAIL  ${msg}`); console.log("\nRUN ABORTED — counts below are partial."); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1); };

const { FONT_FILES, CARD } = await import("../lib/og/theme.js");
const { MODES, LANGS, LAYOUTS, BANDS, BAND_IDS, bandFor, durationLabel } = await import("../lib/og/labels.js");
const { validate, parseSrc } = await import("../lib/og/validate.js");
const { resolveSrc, PARAS_PER_PAGE } = await import("../lib/og/resolve.js");
const { createNodeRenderer, resolveSrcNode, loadData } = await import("./lib/og-node.mjs");

// ── A. the fonts the cards are drawn with ───────────────────────────
console.log("\nA. vendored fonts");

const FONT_DIR = join(ROOT, "src", "assets", "fonts", "og");
if (!existsSync(FONT_DIR)) die(`${FONT_DIR} is missing — the renderer has nothing to draw with.`);

let fontBytes = 0;
const missingFonts = FONT_FILES.filter((f) => !existsSync(join(FONT_DIR, f.file)));
for (const f of missingFonts) chk(false, `${f.file} exists`, "listed in theme.js FONT_FILES");
/* Abort rather than limp on: every render below would throw ENOENT and
   the run would end in a stack trace instead of a verdict. */
if (missingFonts.length) die(`${missingFonts.length} font file(s) named in theme.js are not on disk.`);
for (const f of FONT_FILES) {
  const p = join(FONT_DIR, f.file);
  const buf = readFileSync(p);
  fontBytes += buf.length;
  /* sfnt magic: 0x00010000 (TrueType outlines) or "true"/"OTTO". satori
     cannot read woff2 at all, and a woff2 here would render a blank
     card rather than fail. */
  const magic = buf.readUInt32BE(0);
  const ok = magic === 0x00010000 || buf.subarray(0, 4).toString("latin1") === "true" || buf.subarray(0, 4).toString("latin1") === "OTTO";
  chk(ok, `${f.file} is a TTF/OTF satori can read`, `${(buf.length / 1024).toFixed(1)} KB`);
}
chk(fontBytes > 0 && fontBytes < 600 * 1024, "all faces together are under the 600 KB budget", `${(fontBytes / 1024).toFixed(1)} KB`);

const licenses = existsSync(join(ROOT, "src", "assets", "fonts", "licenses"))
  ? readdirSync(join(ROOT, "src", "assets", "fonts", "licenses")) : [];
for (const lic of ["Lora-OFL.txt", "Inter-OFL.txt", "JetBrainsMono-OFL.txt"]) {
  chk(licenses.includes(lic), `OFL text shipped: ${lic}`);
}

// ── B. three fixed models render to real PNGs ───────────────────────
console.log("\nB. rendering");

const renderer = createNodeRenderer();

const RESULT_MODEL = {
  layout: "result", v: 1, wpm: 62, raw: 68, acc: 97, con: 84, dur: 30, n: 52, err: 3,
  mode: "quote", modeLabel: "Quote", lang: "en-1k", langLabel: "English 1k",
  lay: "qwerty", layLabel: "QWERTY", pb: 1, ok: null, date: "2026-09-16",
  content: { kind: "quote", text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
};
const CONTENT_MODEL = {
  layout: "content",
  content: { kind: "quote", text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
};
const GRID_MODEL = { layout: "result", variant: "grid", wpm: 62, wpmLabel: "62", band: "95" };

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function render(name, model) {
  let png;
  try {
    png = Buffer.from(await renderer.renderPng(model));
  } catch (err) {
    chk(false, `${name} renders`, err.message);
    return null;
  }
  chk(png.subarray(0, 8).equals(PNG_SIG), `${name}: PNG signature`, png.subarray(0, 8).toString("hex"));
  const isIHDR = png.length > 24 && png.subarray(12, 16).toString("latin1") === "IHDR";
  chk(isIHDR, `${name}: first chunk is IHDR`);
  if (isIHDR) {
    chk(png.readUInt32BE(16) === CARD.width, `${name}: ${CARD.width} px wide`, String(png.readUInt32BE(16)));
    chk(png.readUInt32BE(20) === CARD.height, `${name}: ${CARD.height} px tall`, String(png.readUInt32BE(20)));
  }
  const kb = png.length / 1024;
  /* Under 15 KB means the card came out mostly empty -- a missing font
     or an element tree that collapsed. Over 400 KB means something is
     drawing a photograph. */
  chk(kb > 15 && kb < 400, `${name}: 15 KB < size < 400 KB`, `${kb.toFixed(1)} KB`);
  return png;
}

const resultPng = await render("result", RESULT_MODEL);
const contentPng = await render("content", CONTENT_MODEL);
const gridPng = await render("grid", GRID_MODEL);

if (resultPng && contentPng && gridPng) {
  chk(!resultPng.equals(contentPng) && !resultPng.equals(gridPng) && !contentPng.equals(gridPng),
    "the three layouts produce three different images");
}

const again = resultPng ? Buffer.from(await renderer.renderPng(RESULT_MODEL)) : null;
chk(!!again && again.equals(resultPng), "two renders of one model are byte-identical",
  again ? `${again.length} vs ${resultPng.length} bytes` : "render failed");

/* The excerpt has to actually reach the card: same result model with
   and without its content must differ. Without this, a card.js that
   silently dropped model.content would pass everything above. */
if (resultPng) {
  const bare = Buffer.from(await renderer.renderPng({ ...RESULT_MODEL, content: null }));
  chk(!bare.equals(resultPng), "the resolved excerpt changes the result card");
}

/* And the numbers have to reach it too. */
if (resultPng) {
  const faster = Buffer.from(await renderer.renderPng({ ...RESULT_MODEL, wpm: 137 }));
  chk(!faster.equals(resultPng), "changing wpm changes the card");
}

/* ── every part of a content card, for the kinds that are not quotes ─
   Until verifier round 1 the only content fixture here was a quote,
   and a quote is the one kind that draws NEITHER the excerpt panel nor
   a meaning/moral line -- its text is the headline. So `if
   (!headlineIsText)` could be turned into `if (false)`, deleting the
   body of every poem, parable, book, lesson, challenge and drill card,
   and this gate still said 89 passed.

   Each fixture renders twice: once whole, once with one piece of the
   MODEL removed. If the two images are identical, that piece never
   reached the canvas. */
const FIXTURES = [
  {
    name: "poem",
    content: {
      kind: "poem", title: "Hope is the thing with feathers",
      author: "Emily Dickinson", year: 1891, source: "Poems by Emily Dickinson",
      lines: ["Hope is the thing with feathers", "That perches in the soul,",
        "And sings the tune without the words,", "And never stops at all,"],
    },
    parts: [
      ["verse lines", (c) => ({ ...c, lines: [] })],
      ["byline", (c) => ({ ...c, author: null, year: null, source: null })],
    ],
  },
  {
    name: "parable",
    content: {
      kind: "parable", title: "The Frogs and the Ox",
      source: "Aesop's Fables (public domain)",
      moral: "Do not attempt the impossible.",
      text: "An ox came down to a reedy pool to drink. As he splashed heavily into the water, he crushed a young frog into the mud.",
    },
    parts: [
      ["excerpt", (c) => ({ ...c, text: "" })],
      ["moral", (c) => ({ ...c, moral: null })],
      ["byline", (c) => ({ ...c, source: null })],
    ],
  },
  {
    name: "idiom",
    content: { kind: "idiom", text: "kick the bucket", meaning: "die" },
    parts: [["meaning", (c) => ({ ...c, meaning: null })]],
  },
  {
    name: "lesson",
    content: {
      kind: "lesson", title: "i vs l", source: "Lesson 196",
      text: "il li ill lil lily lily ill ill lily lily lily lily lily ill ill lily ill lily",
    },
    parts: [
      ["text excerpt", (c) => ({ ...c, text: "" })],
      ["byline", (c) => ({ ...c, source: null })],
    ],
  },
];

for (const fx of FIXTURES) {
  const whole = Buffer.from(await renderer.renderPng({ layout: "content", content: fx.content }));
  chk(whole.subarray(0, 8).equals(PNG_SIG) && whole.readUInt32BE(16) === CARD.width && whole.readUInt32BE(20) === CARD.height,
    `${fx.name} card is a 1200x630 PNG`, `${(whole.length / 1024).toFixed(1)} KB`);
  for (const [part, strip] of fx.parts) {
    const without = Buffer.from(await renderer.renderPng({ layout: "content", content: strip(fx.content) }));
    chk(!without.equals(whole), `${fx.name} card draws its ${part}`);
  }
}

/* And every kind resolves-and-renders from the REAL data, so a card
   path that only breaks on a field the fixtures do not have (a book's
   chapter line, a drill's key list) still shows up here. */

// ── C. validate(): the boundary between a URL and an image ──────────
console.log("\nC. validate()");

const GOOD = "v=1&wpm=62&raw=68&acc=97&con=84&dur=30&n=52&err=3&mode=quote&lang=en-1k&lay=qwerty&pb=1&d=2026-09-16&src=q:q-do-love";
const good = validate(new URLSearchParams(GOOD));
chk(!!good, "a valid query returns a model");
if (good) {
  chk(good.wpm === 62 && good.raw === 68 && good.acc === 97 && good.con === 84, "numbers survive intact",
    `${good.wpm}/${good.raw}/${good.acc}/${good.con}`);
  chk(good.modeLabel === "Quote" && good.langLabel === "English 1k" && good.layLabel === "QWERTY",
    "labels come from the maps, not the query", `${good.modeLabel} / ${good.langLabel} / ${good.layLabel}`);
  chk(good.date === "2026-09-16" && good.pb === 1, "date and pb survive");
  chk(!!good.src && good.src.kind === "quote" && good.src.id === "q-do-love", "src parses to a kind and an id");
}

const REJECT = [
  ["wpm out of range", "v=1&wpm=9999"],
  ["path traversal in src", "v=1&wpm=62&src=q:../../x"],
  ["unknown lang (ad copy)", "v=1&wpm=62&lang=BUY-NOW"],
  ["script tag as mode", "v=1&wpm=62&mode=<script>"],
  ["impossible date", "v=1&wpm=62&d=2026-13-40"],
  ["date that does not exist", "v=1&wpm=62&d=2026-02-30"],
  ["missing version", "wpm=62"],
  ["wrong version", "v=2&wpm=62"],
  ["no wpm at all", "v=1&mode=time"],
  ["negative wpm", "v=1&wpm=-5"],
  ["exponent notation", "v=1&wpm=1e2"],
  ["accuracy over 100", "v=1&wpm=62&acc=101"],
  ["unknown src kind", "v=1&wpm=62&src=zz:thing"],
  ["uppercase id in src", "v=1&wpm=62&src=q:Q-DO-LOVE"],
  ["src with a slash", "v=1&wpm=62&src=q:a/b"],
  ["prototype key as mode", "v=1&wpm=62&mode=constructor"],
];
for (const [name, q] of REJECT) {
  chk(validate(new URLSearchParams(q)) === null, `rejected: ${name}`, q);
}
chk(validate(new URLSearchParams("v=1&wpm=62&fbclid=xyz&utm_source=x")) !== null,
  "an unknown tracking parameter does NOT kill the card");
chk(parseSrc("bk:alice-in-wonderland:0:3") !== null && parseSrc("bk:a:b:c:d:e") === null,
  "src depth is bounded");

// ── D. the label maps cover the data ────────────────────────────────
console.log("\nD. label coverage");

const wordlists = (await import("../src/_data/wordlists.js")).default;
const lists = typeof wordlists === "function" ? await wordlists() : wordlists;
const listIds = (Array.isArray(lists) ? lists : []).map((l) => l.id);
chk(listIds.length > 15, "wordlists.js read", `${listIds.length} lists`);
const missingLang = listIds.filter((id) => !LANGS[id]);
chk(missingLang.length === 0, "every word list has a LANGS label", missingLang.join(", "));

const modesMod = await import("../src/_data/modes.js");
const modeIds = (modesMod.default || []).map((m) => m.id);
const langIds = (modesMod.LANGUAGES || []).map((l) => l.id);
chk(modeIds.length > 3, "modes.js read", `${modeIds.length} modes`);
const missingMode = modeIds.filter((id) => !MODES[id]);
chk(missingMode.length === 0, "every mode has a MODES label", missingMode.join(", "));
const missingLang2 = langIds.filter((id) => !LANGS[id]);
chk(missingLang2.length === 0, "every modes.js LANGUAGE has a label", missingLang2.join(", "));

const layoutIds = Object.keys((await import("../src/assets/js/engine/layouts.js")).LAYOUTS);
chk(layoutIds.length >= 4, "layouts.js read", layoutIds.join(", "));
const missingLay = layoutIds.filter((id) => !LAYOUTS[id]);
chk(missingLay.length === 0, "every keyboard layout has a label", missingLay.join(", "));

chk(BAND_IDS.every((b) => BANDS[b]), "every accuracy band has a label", BAND_IDS.join(","));
chk(bandFor(96.4) === "95" && bandFor(100) === "100" && bandFor(79) === "u80" && bandFor(98) === "98",
  "bandFor puts accuracy in the right band");
chk(durationLabel(30) === "30s" && durationLabel(90) === "1:30" && durationLabel(300) === "5:00",
  "durationLabel", `${durationLabel(30)} / ${durationLabel(90)} / ${durationLabel(300)}`);

// ── E. resolve(): public ids -> the repo's own text ─────────────────
console.log("\nE. resolve()");

const quotes = JSON.parse(readFileSync(join(ROOT, "src", "data", "quotes.json"), "utf8"));
const idioms = JSON.parse(readFileSync(join(ROOT, "src", "data", "idioms.json"), "utf8"));
const poems = JSON.parse(readFileSync(join(ROOT, "src", "data", "poetry.json"), "utf8"));
const parables = JSON.parse(readFileSync(join(ROOT, "src", "data", "parables.json"), "utf8"));

const q0 = await resolveSrcNode(`q:${quotes[0].id}`);
chk(!!q0 && q0.kind === "quote" && q0.text === quotes[0].text, "quote resolves to its text", quotes[0].id);
const i0 = await resolveSrcNode(`id:${idioms[0].id}`);
chk(!!i0 && i0.kind === "idiom" && i0.meaning === idioms[0].meaning, "idiom resolves with its meaning", idioms[0].id);
const p0 = await resolveSrcNode(`po:${poems[0].id}`);
chk(!!p0 && p0.kind === "poem" && Array.isArray(p0.lines) && p0.lines.length > 1, "poem resolves to lines", poems[0].id);
const pa0 = await resolveSrcNode(`pa:${parables[0].id}`);
chk(!!pa0 && pa0.kind === "parable" && !!pa0.text, "parable resolves", parables[0].id);

const library = JSON.parse(readFileSync(join(ROOT, "src", "data", "library.json"), "utf8"));
const slug = library[0].slug;
const bk = await resolveSrcNode(`bk:${slug}:0:0`);
chk(!!bk && bk.kind === "book" && bk.title === library[0].title, "book page resolves", slug);
const book = await loadData(`books/${slug}`);
const wantParas = book.chapters[0].paragraphs.slice(0, PARAS_PER_PAGE).map((p) => p.text).join(" ");
chk(!!bk && bk.text === wantParas, `a book page is ${PARAS_PER_PAGE} paragraphs, same as the practice page`);

/* PARAS_PER_PAGE is duplicated: the practice page imports it from
   engine/chapter-detect.js (it used to be a local const). If the two
   ever drift, book cards would show a different page than the reader. */
const detect = readFileSync(join(ROOT, "src", "assets", "js", "engine", "chapter-detect.js"), "utf8");
const bootParas = /export const PARAS_PER_PAGE\s*=\s*(\d+)/.exec(detect)
  || /const PARAS_PER_PAGE\s*=\s*(\d+)/.exec(readFileSync(join(ROOT, "src", "assets", "js", "pages", "practice-boot.js"), "utf8"));
chk(!!bootParas && Number(bootParas[1]) === PARAS_PER_PAGE,
  "PARAS_PER_PAGE matches the practice page's constant", bootParas ? bootParas[1] : "not found");

const lessons = await loadData("lessons");
const ls = await resolveSrcNode(`ls:${lessons[0].id}`);
chk(!!ls && ls.kind === "lesson" && ls.title === lessons[0].title, "lesson resolves", String(lessons[0].id));
const challenges = await loadData("challenges");
const ch = await resolveSrcNode(`ch:${challenges[0].id}`);
chk(!!ch && ch.kind === "challenge" && ch.title === challenges[0].name, "challenge resolves", challenges[0].id);
const drills = await loadData("drills");
const dr = await resolveSrcNode(`dr:${drills[0].id}`);
chk(!!dr && dr.kind === "drill" && dr.title === drills[0].name, "drill resolves", drills[0].id);

for (const bad of ["q:no-such-quote", "bk:no-such-book", "ls:99999", "dr:nope", "q:../../x", "zz:x"]) {
  chk((await resolveSrcNode(bad)) === null, `unknown id resolves to null: ${bad}`);
}

/* resolveSrc must not depend on the Node glue: it takes its loader. */
const viaLoader = await resolveSrc(`q:${quotes[0].id}`, loadData);
chk(!!viaLoader && viaLoader.text === quotes[0].text, "resolveSrc works with any loader");

/* One card per kind, resolved from the repo's own data and rendered.
   Section B proves the PARTS are drawn; this proves the eight paths
   from a src token to a PNG all still work end to end. */
console.log("\n E2. every kind renders from real data");
const KIND_SRCS = [
  `q:${quotes[0].id}`, `id:${idioms[0].id}`, `po:${poems[0].id}`, `pa:${parables[0].id}`,
  `bk:${slug}:0:0`, `ls:${lessons[0].id}`, `ch:${challenges[0].id}`, `dr:${drills[0].id}`,
];
for (const src of KIND_SRCS) {
  const content = await resolveSrcNode(src);
  if (!content) { chk(false, `renders: ${src}`, "did not resolve"); continue; }
  /* A 1200x630 PNG in the size band is also what an EMPTY card looks
     like; the lesson defect hid behind exactly that. Every kind must
     carry body text or verse lines out of resolve.js. */
  chk(!!(content.text || (content.lines && content.lines.length)), `has body text: ${src}`);
  let png = null;
  try { png = Buffer.from(await renderer.renderPng({ layout: "content", content })); }
  catch (err) { chk(false, `renders: ${src}`, err.message); continue; }
  const kb = png.length / 1024;
  chk(png.subarray(0, 8).equals(PNG_SIG) && png.readUInt32BE(16) === CARD.width
    && png.readUInt32BE(20) === CARD.height && kb > 15 && kb < 400,
    `renders: ${src}`, `${kb.toFixed(1)} KB`);
}

/* The lesson excerpt has its own line here because it was wrong:
   resolve.js read `l.bestFor`, which lessons.js documents but no lesson
   has, so 480 of 500 lesson cards had an empty panel and nothing
   noticed. A lesson with a `text` must put that text on the card. */
const withText = lessons.find((l) => l.text);
const lsText = await resolveSrcNode(`ls:${withText.id}`);
chk(!!lsText && lsText.text === withText.text,
  "a lesson's excerpt is its own text, not an absent field", `lesson ${withText.id}`);
const keysOnly = lessons.find((l) => !l.text && l.keys);
const lsKeys = keysOnly ? await resolveSrcNode(`ls:${keysOnly.id}`) : null;
chk(!keysOnly || (lsKeys && lsKeys.text === `Keys: ${keysOnly.keys}`),
  "a lesson with no text falls back to its key set", keysOnly ? `lesson ${keysOnly.id}` : "none");
const emptyish = lessons.filter((l) => !l.text && !l.keys).length;
chk(emptyish <= 5, "at most a handful of lessons have neither text nor keys", `${emptyish} lessons`);

// ── F. the generator is wired into the build ────────────────────────
console.log("\nF. wiring");

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
/* The generator runs from eleventy.after, not from the build script:
   Cloudflare Pages invokes Eleventy directly, so a package.json step
   never ran there and the first deploy shipped 404s for every card. */
const eleventyCfg = readFileSync(new URL("../eleventy.config.js", import.meta.url), "utf8");
chk(/gen-og-images\.mjs/.test(eleventyCfg) && /eleventy\.after/.test(eleventyCfg), "the Eleventy build itself renders the cards (eleventy.after), so Pages gets them too");
for (const dep of ["satori", "@resvg/resvg-wasm", "yoga-wasm-web"]) {
  chk(!!(pkg.dependencies || {})[dep], `${dep} is in dependencies (Cloudflare's build needs it)`,
    (pkg.dependencies || {})[dep] || "missing");
}
/* Parse the rule block rather than grepping: the first version of this
   check did `headers.split("/og/*")[1]` and landed in the COMMENT above
   the rule, which mentions _site/og/**. It failed on a correct file. */
const headers = readFileSync(join(ROOT, "src", "_headers"), "utf8").split("\n");
const ogRule = headers.findIndex((l) => l.trim() === "/og/*");
const ogDirectives = [];
for (let i = ogRule + 1; i < headers.length && /^\s+\S/.test(headers[i]); i++) ogDirectives.push(headers[i].trim());
chk(ogRule >= 0 && ogDirectives.some((d) => /^Cache-Control:.*max-age=86400/.test(d)),
  "_headers caches /og/* for a day", ogDirectives.join(" | ") || "no /og/* rule");
const sw = readFileSync(join(ROOT, "src", "sw.njk"), "utf8");
chk(/startsWith\("\/og\/"\)/.test(sw), "sw.njk passes /og/ straight through");

const defaultPng = join(ROOT, "src", "assets", "img", "og-default.png");
chk(existsSync(defaultPng), "src/assets/img/og-default.png exists");
if (existsSync(defaultPng)) {
  const committed = readFileSync(defaultPng);
  const drawn = Buffer.from(await renderer.renderPng({ layout: "default" }));
  chk(drawn.equals(committed), "the committed default card is what lib/og draws today",
    `${committed.length} bytes on disk, ${drawn.length} rendered`);
  chk(committed.length / 1024 < 150, "default card is under the 150 KB share budget",
    `${(committed.length / 1024).toFixed(1)} KB`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
