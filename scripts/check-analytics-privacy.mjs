/* Analytics privacy: a text of your own is never named to the server.

   The rule this file defends is the one written at the top of
   src/assets/js/analytics.js: only mode names, structural keys, numeric
   metrics and STABLE PUBLIC identifiers may be sent. A custom text has
   none of those. Its slug is "custom:c_9f3a1b", its id is minted on the
   device, its title is whatever the reader called their own document,
   and its body is theirs.

   What must hold:

     A. The bundled Alice sample seeds itself on /custom/ with an
        app-minted id (c_...) and a title -- the fixtures for everything
        below are the real ones the app makes, not ones a gate invented.
     B. Read by chapter (?book=custom:<id>&ch=0&page=0) the run is
        internally "book" mode and state.bookSlug IS the private id.
        session_start must report the KIND ("custom"), which is the
        substitution book_completion has always made.
     C. Read by segment (?mode=custom&custom=<id>&seg=0) the same must
        hold on a second URL shape.
     D. A segment typed to the end, with deliberate errors, must not
        emit worst_char or worst_word -- those props are a character and
        a word cut straight out of the target, so for an import they are
        a piece of the reader's document. worst_finger / finger_acc must
        STILL fire, which is what proves the suppression is aimed at the
        two text-derived events and is not the block failing to run.
     E. A real library book (?book=alice-in-wonderland) must still carry
        its public slug, and a public wordlist run must still emit
        worst_char and worst_word. Without those two, this file would
        pass just as happily against a build that deleted the props, or
        deleted analytics altogether.
     F. The sweep: across every event recorded in B, C and D, no prop
        value contains "custom:", the id in any shape, or the text's
        title. Plus, across every phase including E, no "custom:" and no
        c_-shaped id at all.
     G. A source-level tripwire over every Analytics.*() / emit() call
        site in src/assets/js, so a NEW leak in a file this driver never
        visits still fails the gate.

   E and D's "still fires" half are the anti-vacuity checks. A gate that
   only asserts absence passes when the feature is deleted.

   Usage:
     OG_SKIP=1 npm run build      # not optional: this reads _site
     npm run analytics-privacy
*/
import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

/* Port from the task id, not from habit. 8080 is never ours. */
const TASK = "analytics-custom-id";
const PORT = Number(process.env.PORT)
  || 8100 + ([...TASK].reduce((a, c) => a + c.charCodeAt(0), 0) % 600);
const ROOT = resolve("_site");

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
  await stat(join(ROOT, "practice", "index.html"));
} catch {
  console.log("  FAIL  _site is not built — run `OG_SKIP=1 npm run build` first");
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

/* Prove what is answering before believing anything it says. A verifier
   in this project once tested another session's build for a full run
   because a port that was already taken still returned a perfectly good
   page. Two probes: the page is this project's, and the JS file this
   whole gate is about is byte-for-byte the one in _site here. */
const probe = await fetch(B + "/practice/").then((r) => r.text()).catch(() => "");
const isThisProject = /<title>[^<]*GuerillaType<\/title>/.test(probe)
  && /id=["']?tt-stage["'\s>]/.test(probe);
chk(isThisProject, `server on ${PORT} is this project's /practice/`);
const md5 = (b) => createHash("md5").update(b).digest("hex");
const servedJs = await fetch(B + "/assets/js/pages/practice-boot.js")
  .then((r) => r.arrayBuffer()).then((b) => md5(Buffer.from(b))).catch(() => "");
const localJs = await readFile(join(ROOT, "assets/js/pages/practice-boot.js"))
  .then(md5).catch(() => "");
const sameBuild = !!servedJs && servedJs === localJs;
chk(sameBuild, "and it is serving THIS worktree's practice-boot.js", `${servedJs.slice(0, 8)} vs ${localJs.slice(0, 8)}`);
if (!isThisProject || !sameBuild) {
  console.log("\nRUN ABORTED — refusing to test something that is not this build.");
  server.close();
  process.exit(1);
}

// ---------------------------------------------------------------- browser
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1366, height: 900 },
  serviceWorkers: "block",
  hasTouch: false,
});
/* Stand in for umami before any module runs, so analytics.js finds it
   and track() takes its real path. Every call is recorded with its
   props. addInitScript runs per document, so the array starts empty on
   every navigation -- which is what makes one page load one phase. */
await context.addInitScript(() => {
  window.__ttEvents = [];
  window.umami = { track: (name, props) => { window.__ttEvents.push({ name, props: props || {} }); } };
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 200)));

async function bail(msg) {
  chk(false, msg);
  console.log("\nRUN ABORTED — the counts below are partial.");
  await browser.close().catch(() => {});
  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}
const waitOr = async (fn, msg, timeout = 15000) => {
  try { await fn(timeout); return true; }
  catch { await bail(msg); return false; }
};

const events = () => page.evaluate(() => window.__ttEvents.slice());
const namesOf = (evs) => evs.map((e) => e.name);
const find = (evs, name) => evs.filter((e) => e.name === name);
const surfaceText = () => page.$$eval(".tt-char", (els) =>
  els.map((e) => (e.classList.contains("tt-char--space") ? " " : e.textContent)).join(""));

/* Open a practice URL and wait for real characters on the surface. */
async function openPractice(qs, label) {
  await page.goto(`${B}/practice/?${qs}`, { waitUntil: "networkidle" });
  await waitOr((t) => page.waitForSelector(".tt-char", { timeout: t }), `${label} rendered its text`);
  await page.click(".tt-stage").catch(() => {});
  return surfaceText();
}

/* Two wrong keys, inside words, at 70 ms/key. Wrong keys matter: the
   worst_char / worst_word block only runs when the finished result
   carries errored cursors, so a clean run would "pass" the absence
   checks in D without ever reaching the code they are about. 70 ms/key
   matters too — the engine flags anything over 250 wpm as suspect. */
function wrongKeyPlan(target) {
  const spots = [];
  const re = /[A-Za-z]{4,}/g;
  let m;
  while ((m = re.exec(target)) && spots.length < 2) spots.push(m.index + 1);
  return spots;
}
async function typeWithTwoErrors(target) {
  const spots = wrongKeyPlan(target);
  let i = 0;
  for (const ch of target) {
    if (spots.includes(i)) await page.keyboard.type(ch.toLowerCase() === "q" ? "z" : "q", { delay: 70 });
    else await page.keyboard.type(ch, { delay: 70 });
    i++;
  }
  return spots.length;
}

// ================================================================ A
console.log("\nA. the bundled sample, seeded by the app itself");
/* The id has to be one the app minted, not one the gate wrote into
   localStorage: the whole question is what the app does with its own
   private identifiers. */
await page.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
await page.evaluate(async () => {
  localStorage.clear();
  await new Promise((r) => {
    const q = indexedDB.deleteDatabase("tt-custom");
    q.onsuccess = q.onerror = q.onblocked = () => r();
  });
});
await page.goto(B + "/custom/", { waitUntil: "domcontentloaded" });
await waitOr((t) => page.waitForSelector(".saved-item", { timeout: Math.max(t, 20000) }),
  "A. the sample seeded itself into an empty list");
const sample = await page.evaluate(() => {
  const list = JSON.parse(localStorage.getItem("tt:custom-texts") || "[]");
  const it = list.find((x) => x && x.sample) || list[0] || null;
  return it ? { id: it.id, title: it.title, segCount: it.segCount || 0, chapCount: it.chapCount || 0 } : null;
});
chk(!!sample && /^c_[a-z0-9]{4,}/i.test(sample.id || ""), "A. it has an app-minted id", JSON.stringify(sample && sample.id));
chk(!!sample && !!sample.title, "A. and a title of its own", JSON.stringify(sample && sample.title));
chk(!!sample && sample.chapCount > 1 && sample.segCount > 1,
  "A. and can be read both ways — by chapter and by segment",
  `chapters=${sample && sample.chapCount} segments=${sample && sample.segCount}`);
if (!sample || !sample.id || !sample.title) await bail("A. no sample to test with");
const SLUG = `custom:${sample.id}`;

/* Everything that must never reach analytics, in every shape it could
   arrive in. The percent-encoded form is here because the first version
   of the share gate's leak check passed against a live leak: the id was
   in the payload as "custom%3Ac_tdwho2" and a raw substring search for
   "custom:" did not see it. */
const TITLE_WORDS = String(sample.title).toLowerCase().split(/[^a-z0-9]+/i).filter((w) => w.length >= 4);
chk(TITLE_WORDS.length >= 2, "A. its title has words distinctive enough to search for", TITLE_WORDS.join(","));

// ---------------------------------------------------------------- phases
const phases = {};
async function snapshot(key) {
  const evs = await events();
  phases[key] = evs;
  return evs;
}

// ================================================================ B
console.log("\nB. the same text read by chapter: ?book=custom:<id>&ch=0&page=0");
const chapText = await openPractice(`book=${encodeURIComponent(SLUG)}&ch=0&page=0`, "B. chapter 1 page 1");
chk(chapText.length > 200, "B. a real page of the reader's own text is on the surface", `${chapText.length} chars`);
await page.keyboard.type("Alic", { delay: 70 });
await page.keyboard.press("Escape");
await waitOr((t) => page.waitForSelector("#tt-results:not([hidden])", { timeout: t }),
  "B. Esc ended the run and the card is up");
const bEv = await snapshot("chapter");
const bStart = find(bEv, "session_start")[0];
chk(!!bStart, "B. session_start was recorded", namesOf(bEv).join(","));
chk(!!find(bEv, "session_finish").length, "B. and an end-of-run event was recorded");
chk(!!bStart && bStart.props.bookSlug === "custom",
  'B. session_start reports the KIND ("custom"), not the private slug',
  bStart ? JSON.stringify(bStart.props.bookSlug) : "");
const bCompletion = find(bEv, "book_completion")[0];
chk(!!bCompletion && bCompletion.props.book === "custom",
  "B. book_completion still reports the kind too",
  bCompletion ? JSON.stringify(bCompletion.props.book) : "no book_completion");

// ================================================================ C
console.log("\nC. the same text read by segment: ?mode=custom&custom=<id>&seg=0");
const segText = await openPractice(`mode=custom&custom=${encodeURIComponent(sample.id)}&seg=0`, "C. segment 0");
chk(segText.length > 40, "C. segment 0 is on the surface", `${segText.length} chars`);
await page.keyboard.type("Alic", { delay: 70 });
await page.keyboard.press("Escape");
await waitOr((t) => page.waitForSelector("#tt-results:not([hidden])", { timeout: t }),
  "C. Esc ended the run and the card is up");
const cEv = await snapshot("segment");
const cStart = find(cEv, "session_start")[0];
chk(!!cStart, "C. session_start was recorded", namesOf(cEv).join(","));
chk(!!find(cEv, "session_finish").length, "C. and an end-of-run event was recorded");
chk(!!cStart && (cStart.props.bookSlug == null),
  "C. the segment reader names no book at all", cStart ? JSON.stringify(cStart.props.bookSlug) : "");
chk(!!cStart && cStart.props.mode === "custom",
  "C. and says only that the mode was custom", cStart ? JSON.stringify(cStart.props.mode) : "");

// ================================================================ D
console.log("\nD. a short segment typed to the end, with two deliberate errors");
/* Which segment: the shortest one long enough to be a real run. At
   70 ms/key a 500-character segment is 35 seconds of gate, and the
   point of this phase is what fires at the end, not endurance. */
const segLens = await page.evaluate(async (id) => {
  const m = await import("/assets/js/engine/custom-text.js");
  const segs = await m.getSegments(id);
  return segs.map((s) => String(s).length);
}, sample.id);
let pick = -1;
segLens.forEach((len, i) => {
  if (len < 80 || len > 460) return;
  if (pick === -1 || len < segLens[pick]) pick = i;
});
chk(pick >= 0, "D. there is a segment short enough to finish at 70 ms/key",
  pick >= 0 ? `seg ${pick}, ${segLens[pick]} chars of ${segLens.length}` : `lengths ${segLens.slice(0, 5).join(",")}…`);
if (pick < 0) await bail("D. no finishable segment");
const dText = await openPractice(`mode=custom&custom=${encodeURIComponent(sample.id)}&seg=${pick}`, `D. segment ${pick}`);
const errs = await typeWithTwoErrors(dText);
chk(errs === 2, "D. two wrong keys were typed inside words", `${errs} spots`);
await waitOr((t) => page.waitForSelector("#tt-results:not([hidden])", { timeout: Math.max(t, 20000) }),
  "D. the segment was typed to the end and the card is up");
await page.waitForTimeout(250);
const dEv = await snapshot("finished");
chk(!!find(dEv, "session_start").length, "D. session_start was recorded", namesOf(dEv).join(","));
const dFinish = find(dEv, "session_finish")[0];
chk(!!dFinish, "D. and session_finish — a clean finish, not a stop");
chk(!!dFinish && dFinish.props.stopped === false, "D. the run really did finish",
  dFinish ? `stopped=${dFinish.props.stopped}` : "");
/* The anti-vacuity half. These two fire from inside the same block the
   suppressed ones live in, and only when the run produced errored
   cursors — so their presence proves the block ran and had something to
   report, and the absence below is a decision rather than dead code. */
chk(!!find(dEv, "finger_acc").length, "D. the weakest-spot block ran (finger_acc fired)");
chk(!!find(dEv, "worst_finger").length, "D. and worst_finger fired — a finger name is layout, not text");
chk(!find(dEv, "worst_word").length, "D. no worst_word: that word is cut out of the reader's document",
  JSON.stringify(find(dEv, "worst_word").map((e) => e.props)));
chk(!find(dEv, "worst_char").length, "D. no worst_char, for the same reason",
  JSON.stringify(find(dEv, "worst_char").map((e) => e.props)));

// ================================================================ E
console.log("\nE. a real library book still says which book it was");
/* Without this, every check above would pass against a build that sent
   no analytics at all, or dropped bookSlug for everything. */
const libText = await openPractice("book=alice-in-wonderland&ch=0&page=0", "E. a library chapter");
chk(libText.length > 200, "E. a library page is on the surface", `${libText.length} chars`);
await page.keyboard.type("Alic", { delay: 70 });
await page.waitForTimeout(150);
const eEv = await snapshot("library");
const eStart = find(eEv, "session_start")[0];
chk(!!eStart, "E. session_start was recorded", namesOf(eEv).join(","));
chk(!!eStart && eStart.props.bookSlug === "alice-in-wonderland",
  "E. and it carries the PUBLIC slug — the substitution is not blanket",
  eStart ? JSON.stringify(eStart.props.bookSlug) : "");

// ================================================================ E2
console.log("\nE2. public text still reports its weakest spots");
/* The other half of the anti-vacuity argument. "No worst_word for a
   custom text" is also satisfied by deleting worst_word, so a run over
   text that belongs to nobody has to prove the events still exist and
   still carry what they are for. A ten-word wordlist run is the
   cheapest public text there is. */
const wordsText = await openPractice("mode=words&words=10", "E2. a ten-word run");
chk(wordsText.length > 20, "E2. a wordlist run is on the surface", `${wordsText.length} chars`);
const wErrs = await typeWithTwoErrors(wordsText);
chk(wErrs === 2, "E2. two wrong keys were typed inside words", `${wErrs} spots`);
await waitOr((t) => page.waitForSelector("#tt-results:not([hidden])", { timeout: t }),
  "E2. the run finished and the card is up");
await page.waitForTimeout(250);
const wEv = await snapshot("words");
const wChar = find(wEv, "worst_char")[0];
const wWord = find(wEv, "worst_word")[0];
chk(!!wChar, "E2. worst_char still fires for public text — the event was not deleted",
  wChar ? JSON.stringify(wChar.props) : namesOf(wEv).join(","));
chk(!!wWord, "E2. worst_word still fires for public text — the event was not deleted",
  wWord ? JSON.stringify(wWord.props) : namesOf(wEv).join(","));
chk(!!wWord && typeof wWord.props.word === "string" && wWord.props.word.length >= 2,
  "E2. and it still carries the word it is for", wWord ? JSON.stringify(wWord.props.word) : "");

// ================================================================ F
console.log("\nF. the sweep over every prop of every recorded event");
const OWN = ["chapter", "segment", "finished"];
const allEvents = Object.entries(phases).flatMap(([k, evs]) => evs.map((e) => ({ phase: k, ...e })));
const propStrings = (evs) => evs.flatMap((e) =>
  Object.entries(e.props).map(([k, v]) => ({ where: `${e.phase}/${e.name}.${k}`, str: String(v) })));
/* Search the decoded form as well as the raw one. */
const withDecoded = (s) => {
  let out = s;
  try { out += " " + decodeURIComponent(s.replace(/%(?![0-9a-f]{2})/gi, "%25")); } catch {}
  return out;
};
chk(allEvents.length >= 12, "F. there are events to sweep at all", `${allEvents.length} events across ${Object.keys(phases).length} phases`);

const everyProp = propStrings(allEvents);
const ownProps = propStrings(allEvents.filter((e) => OWN.includes(e.phase)));
chk(ownProps.length >= 8, "F. and the three private runs produced props of their own", `${ownProps.length} props`);

const hitAll = (needle, list) => list.find((p) => withDecoded(p.str).toLowerCase().includes(needle.toLowerCase()));
let h;
h = hitAll("custom:", everyProp);
chk(!h, 'F. no prop value anywhere contains "custom:"', h ? `${h.where}=${h.str}` : "");
h = hitAll(sample.id, everyProp);
chk(!h, "F. no prop value anywhere contains the text's id", h ? `${h.where}=${h.str}` : "");
h = everyProp.find((p) => /c_[a-z0-9]{4,}/i.test(withDecoded(p.str)));
chk(!h, "F. and none carries a c_-shaped id in any other form", h ? `${h.where}=${h.str}` : "");
h = hitAll(sample.title, everyProp);
chk(!h, "F. no prop value anywhere contains the text's title", h ? `${h.where}=${h.str}` : "");
/* Word-level, and only over the private runs: "alice-in-wonderland" is
   a legitimate public slug in phase E and contains two of these words. */
let wordHit = null;
for (const w of TITLE_WORDS) {
  const p = ownProps.find((x) => withDecoded(x.str).toLowerCase().includes(w));
  if (p) { wordHit = `${p.where}=${p.str} (${w})`; break; }
}
chk(!wordHit, "F. and no word of the title appears in a private run's props", wordHit || TITLE_WORDS.join(","));
/* Nothing off the page either: the first sentence of what was typed. */
const typedSample = dText.slice(0, 24).toLowerCase();
h = ownProps.find((p) => typedSample && withDecoded(p.str).toLowerCase().includes(typedSample));
chk(!h, "F. and nothing that was typed", h ? `${h.where}=${h.str}` : "");
for (const k of OWN) {
  chk(namesOf(phases[k]).includes("session_start") && namesOf(phases[k]).includes("session_finish"),
    `F. ${k}: session_start and an end-of-run event were both recorded`,
    `${phases[k].length} events`);
  /* Name level, not just value level: with the guard removed, a stopped
     run over "CHAPTER I. Down the Rabbit-Hole" reports worst_word
     "chapter", which is a word of the reader's document but not a word
     of its title — the value sweep above would let it through. */
  const leaked = namesOf(phases[k]).filter((n) => n === "worst_word" || n === "worst_char");
  chk(leaked.length === 0, `F. ${k}: no event carries a character or a word out of the text`,
    leaked.join(","));
}

// ================================================================ G
console.log("\nG. the source tripwire: no call site hands a private field to analytics");
/* The driver above only visits practice-boot.js. This section reads
   every Analytics.*() and emit() call in src/assets/js and fails on a
   property whose VALUE expression names something private, unless that
   same expression also asks isCustomBook() first. A new leak in a file
   no gate drives is still a leak. */
const BANNED = [
  [/state\.bookSlug/, "state.bookSlug"],
  [/state\.customId/, "state.customId"],
  [/_customTitle/, "_customTitle"],
  [/customBookId\s*\(/, "customBookId()"],
  [/\.title\b/, ".title"],
  [/\bCUSTOM_BOOK_PREFIX\b/, "CUSTOM_BOOK_PREFIX"],
];
async function jsFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await jsFiles(p));
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}
/* The argument list of a call, read by balancing parentheses so a
   nested call or an object literal does not truncate it. */
function callArgs(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (!depth) return src.slice(openIdx + 1, i); }
  }
  return "";
}
/* Split an object literal's top level into "key: value" pieces.
   Comments come out first: a prose paragraph inside a props object
   splits on its own commas and turns a readable failure message into
   three words of a sentence. Stripping them also means a comment
   mentioning isCustomBook cannot excuse a call that does not call it. */
function topLevelProps(argsRaw) {
  const args = argsRaw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  const start = args.indexOf("{");
  if (start === -1) return [];
  let depth = 0, end = -1;
  for (let i = start; i < args.length; i++) {
    if ("{[(".includes(args[i])) depth++;
    else if ("}])".includes(args[i])) { depth--; if (!depth) { end = i; break; } }
  }
  if (end === -1) return [];
  const body = args.slice(start + 1, end);
  const parts = [];
  let depth2 = 0, cur = "";
  for (const c of body) {
    if ("{[(".includes(c)) depth2++;
    if ("}])".includes(c)) depth2--;
    if (c === "," && depth2 === 0) { parts.push(cur); cur = ""; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts.map((s) => s.trim()).filter(Boolean);
}
const files = (await jsFiles(resolve("src/assets/js"))).filter((f) => !f.endsWith("/analytics.js"));
let sites = 0, offenders = [];
for (const f of files) {
  const src = await readFile(f, "utf8");
  const re = /(?:Analytics\.[A-Za-z]+|(?<![A-Za-z.])emit)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const args = callArgs(src, m.index + m[0].length - 1);
    if (!args) continue;
    sites++;
    for (const prop of topLevelProps(args)) {
      const colon = prop.indexOf(":");
      const value = colon === -1 ? prop : prop.slice(colon + 1);
      if (/isCustomBook|isCustomBookSlug|isOwnText/.test(value)) continue;
      for (const [rx, label] of BANNED) {
        if (rx.test(value)) {
          const line = src.slice(0, m.index).split("\n").length;
          offenders.push(`${f.replace(resolve(".") + "/", "")}:${line} ${prop.trim().slice(0, 60)} (${label})`);
        }
      }
    }
  }
}
chk(sites >= 60, "G. the scan actually found the call sites", `${sites} Analytics/emit calls in ${files.length} files`);
chk(offenders.length === 0, "G. none of them passes a private field unguarded",
  offenders.slice(0, 3).join(" | "));

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
