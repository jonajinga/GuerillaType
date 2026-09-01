#!/usr/bin/env node
/* Scanner noise must come off an imported text, and nothing else may.

   Reported by a user who imported a scanned PDF of "Le Journal d'une
   femme de chambre" on /custom/. What was on their screen, verbatim:

     C'est un peu bête ce que vous me demandez-là, mon gros père,
     »Avex?..* 10 LE JOURNAL D'UNE FEMME DE CHAMBRE Il me poussa du
     coude...

   and the question that came with it: "sometimes there are characters
   like this * and < > etc....is there anything we can do about that?"

   Three separate faults are in that one line and only two belong here:

     1. "»" -- a French guillemet, which is a real quotation mark the
        book meant, and which no keyboard can send. It is MAPPED to a
        typeable quote, never deleted.
     2. "?..*" -- an ellipsis the scanner clipped to two dots, plus a
        stray asterisk it invented.
     3. "10 LE JOURNAL D'UNE FEMME DE CHAMBRE" -- a running head. That
        is page furniture and is fixed in import-parsers.js, not here.
        It is still present in the expected strings below, on purpose:
        pretending this suite fixed it would be a lie.

   The fixture is real. scripts/fixtures/ocr-noise-lejournal.txt holds
   passages taken from that actual PDF by running it through parseFile()
   in a browser -- pdf.js, the real import path. The whole book comes
   out as 677,109 characters containing 1,062 noise glyphs; the fixture
   is the small part that carries them, so this suite needs no PDF, no
   network, no server and no node_modules.

   The trap in testing a cleaner: deleting everything passes "the junk
   is gone". So section C asserts what must SURVIVE, and section D runs
   the whole of section B against deliberately broken cleaners -- one
   that returns "", one that strips all punctuation, one that drops
   every noise glyph unconditionally, and the identity function -- and
   FAILS if any of them can satisfy it.

   Usage: node scripts/check-ocr-cleanup.mjs   (no server needed) */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/* saveText() writes the user's "leave my text alone" choice to the
   index record in localStorage, and section F reads it back out. Node
   has no localStorage, and storage.js swallows the failure and returns
   false -- which would make saveText throw "out of storage" instead of
   testing anything. A Map is enough of a localStorage for that path.
   Installed before the import so nothing can read it early. */
if (typeof globalThis.localStorage === "undefined") {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
    clear: () => mem.clear(),
  };
}

const ct = await import("../src/assets/js/engine/custom-text.js");

/* Off the namespace, not by name. If cleanOcrNoise is deleted or
   renamed, a named import turns the whole suite into a module error --
   and a suite that cannot start looks nothing like a suite that
   failed. This way every assertion still runs and says which guarantee
   was lost. The fallbacks are deliberately the do-nothing versions. */
const cleanOcrNoise = ct.cleanOcrNoise || ((x) => String(x || ""));
const ocrNoiseReport = ct.ocrNoiseReport ||
  ((x) => ({ text: String(x || ""), total: 0, changes: [] }));
const cleanForDisplay = ct.cleanForDisplay || ((t) => String(t || ""));
const normalizeTypeable = ct.normalizeTypeable || ((x) => String(x || ""));
const sanitize = ct.sanitize;

let pass = 0, fail = 0;
const chk = (ok, n, x = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`);
  ok ? pass++ : fail++;
};
const eq = (got, want, label) => chk(got === want, label,
  got === want ? "" : `\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);

/* The display layer folds a single newline into a space -- that is why
   the user saw one long line rather than the six the file contains. */
const fold = (t) => t.replace(/\n/g, " ").replace(/[ \t]{2,}/g, " ").trim();

/* ── the fixture ──────────────────────────────────────────────────── */

const FIXTURE = fileURLToPath(new URL("./fixtures/ocr-noise-lejournal.txt", import.meta.url));
function loadPassages(path) {
  const out = {};
  let cur = null, buf = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^### (.+)$/);
    if (m) {
      if (cur) out[cur] = buf.join("\n").trim();
      cur = m[1];
      buf = [];
      continue;
    }
    if (cur === null) continue;   // the header comment
    buf.push(line);
  }
  if (cur) out[cur] = buf.join("\n").trim();
  return out;
}
const P = loadPassages(FIXTURE);

console.log("\n## A. The reported line, from the file the user actually imported");

/* Verbatim from the user's screen, minus the "..." they put at the end
   to mean "and so on". If this fails, the fixture is no longer the bug
   that was reported and nothing below is testing the right thing. */
const REPORTED_ON_SCREEN =
  "C'est un peu bête ce que vous me demandez-là, mon gros père, »Avex?..* " +
  "10 LE JOURNAL D'UNE FEMME DE CHAMBRE Il me poussa du coude";

chk(fold(P.reported).includes(REPORTED_ON_SCREEN),
  "the fixture really contains the line the user reported, character for character",
  fold(P.reported).includes(REPORTED_ON_SCREEN) ? "" : JSON.stringify(fold(P.reported)));

eq(cleanOcrNoise(P.reported),
  "il me l'adressait... Pourquoi\nme demandez-vous ça?... C'est un peu bête ce\n" +
  "que vous me demandez-là, mon gros père,\n\"Avex?...\n" +
  "10 LE JOURNAL D'UNE FEMME DE CHAMBRE\nIl me poussa du coude",
  "the reported passage comes out clean, exactly");

eq(fold(cleanOcrNoise(P.reported)),
  "il me l'adressait... Pourquoi me demandez-vous ça?... C'est un peu bête ce " +
  "que vous me demandez-là, mon gros père, \"Avex?... " +
  "10 LE JOURNAL D'UNE FEMME DE CHAMBRE Il me poussa du coude",
  "…and on the typing surface, where the newlines are folded away");

/* Said separately because it is the one thing this suite must not be
   read as claiming. */
chk(cleanOcrNoise(P.reported).includes("10 LE JOURNAL D'UNE FEMME DE CHAMBRE"),
  "the running head is still there — that is import-parsers.js's job, not this one");

const rep = ocrNoiseReport(P.reported);
eq(rep.total, 3, "the report counts three changes in that passage");
eq(JSON.stringify(rep.changes.map((c) => [c.id, c.count])),
  JSON.stringify([["guillemets", 1], ["ellipsis", 1], ["strays", 1]]),
  "…and names them, so the import preview can say what it did");
chk(rep.changes.every((c) => c.label && typeof c.label === "string" && c.label.length > 3),
  "…each with a label a person can read",
  JSON.stringify(rep.changes.map((c) => c.label)));
eq(rep.text, cleanOcrNoise(P.reported), "report.text is the cleaned text");

console.log("\n## B. Every noise-bearing passage in the real scan");
/* Exact expected strings, produced from the real extraction. These are
   the assertions section D runs against the broken cleaners. */

const CASES = [
  ["guillemets",
    "m'appeler par mon\nnom, au lieu de dire, tout le temps : \" ma fille \"\n" +
    "par ci... \" ma fille \" par là, sur ce ton de domination blessante, qui décourage",
    "real French dialogue quotes « » become typeable quotes, not deleted"],
  ["doubled-angle",
    "refermer, puis, l'eau ruisseler dans\nle tub des \" Ah 1 \", des \" Ohl \", " +
    "des \" Fuuiil \",\ndes \" Brrr! \" que la surprise de l'eau",
    "a guillemet the scanner read as \"<<\" becomes a quote like the ones beside it"],
  ["star-splits-word",
    "obstinée dans son rêve, pendant que Mon\nsieur, sous la lampe de la bibliothèque, alignait\ndes chiffres",
    "a \"*\" wedged into \"Monsieur\" at a line break goes"],
  ["tilde-splits-word",
    "les coucous aont on fait des pelotes jau\nnés, et les ruisseaux qui chantent sur les cailloux",
    "…and a \"~\" wedged into \"jaunes\""],
  ["bullet-line-start",
    "idée de\nplacer la lingerie, où je dois travailler, sous l\"s\nombles, à côté de nos chambres. " +
    "Et des placards,\nt des armoires,",
    "a bullet the scanner put at the start of a line goes"],
  ["caret-welded",
    "première fois, je fus prié de revoir le manuscrit., de le corriger d'en récrire quelques parties.\nJe refusai d'abord,",
    "\"^\" — the commonest noise glyph in this book — goes when it is welded to a word end"],
  ["trademark",
    "juifs!... Vive le Roy!... Vive l'armée! \" M la comtesse a menacé le gouvernement " +
    "de le faire interpeller, et monsieur",
    "\"™\", a misread superscript, goes — a keyboard cannot send it"],
  ["clipped-ellipsis",
    "fait, et tout était à recommencer!... Est-ce juste cela?... N'est-ce pas un\n" +
    "abominable vol?...\nLe vol?...",
    "\"?..\" becomes \"?...\" and the real \"?...\" beside it is left alone"],
  ["degree",
    "sûr qu'ils peuvent aller où ils veulent.\nA quoi M' Gouin, s'adressant plus particulièrement à Rose, ajoute",
    "a stray degree sign goes"],
  ["pipe-line-start",
    "raison de dire que c'est un homme excellent et\nénéreux, car, s'il n'était point tel, il n'y aurait\npas",
    "a stray pipe at the start of a line goes"],
];
for (const [name, want, label] of CASES) {
  chk(P[name] !== undefined, `fixture has a "${name}" passage`);
  eq(cleanOcrNoise(P[name]), want, label);
}

console.log("\n## C. What must SURVIVE — the anti-vacuity half");
/* Every check above would also pass if the cleaner deleted the whole
   string. These say it did not. */

eq(cleanOcrNoise("this is **bold** and this is __not__"),
  "this is **bold** and this is __not__",
  "Markdown emphasis survives — a run of the same glyph is never a stray");
eq(cleanOcrNoise("if a < b and c > d then"), "if a < b and c > d then",
  "a comparison survives — a glyph alone between two spaces is being used as a symbol");
eq(cleanOcrNoise("x^2 plus 5*3 in snake_case"), "x^2 plus 5*3 in snake_case",
  "a glyph welded between letters or digits survives");
eq(cleanOcrNoise("she said 20°C and it cost 5% of $40 + £3 & €2"),
  "she said 20°C and it cost 5% of $40 + £3 & €2",
  "degrees, percentages, currency and an ampersand survive");
eq(cleanOcrNoise("off.\n\n* * * * * * *\n\n\"What"), "off.\n\n* * * * * * *\n\n\"What",
  "the bundled Alice sample's \"* * * * *\" scene break survives whole");
eq(cleanOcrNoise("-- Voyons... -- Une sale fille... -- Ah!"),
  "-- Voyons... -- Une sale fille... -- Ah!",
  "\"--\" survives — the site turns every em-dash into it and this must not undo that");
eq(cleanOcrNoise("un post-office bien connu, l'élève à la fenêtre écrivait déjà son résumé"),
  "un post-office bien connu, l'élève à la fenêtre écrivait déjà son résumé",
  "a hyphenated compound, an apostrophe and French accents survive untouched");
eq(cleanOcrNoise("über Straße naïve café ñandú"), "über Straße naïve café ñandú",
  "…and German, Spanish and every other accent");
eq(cleanOcrNoise("你好世界 مرحبا"), "你好世界 مرحبا",
  "CJK and Arabic are not touched");
eq(cleanOcrNoise("il attendait... puis... et enfin.... voilà"),
  "il attendait... puis... et enfin.... voilà",
  "real ellipses are not rewritten — only clipped ones are");
eq(cleanOcrNoise("Mr. Smith left. Then he came back."),
  "Mr. Smith left. Then he came back.",
  "ordinary sentence punctuation is untouched");
eq(cleanOcrNoise(P["angle-as-symbol"]), P["angle-as-symbol"],
  "a real passage with no repairable noise comes back byte for byte");
chk(cleanOcrNoise("the quick brown fox jumps").split(" ").length === 5,
  "word boundaries still exist — five words in, five words out");
chk(ocrNoiseReport(P["angle-as-symbol"]).total === 0,
  "…and the report says nothing happened, so the preview stays hidden");

/* Cleanup runs again on every open of a saved text, so a second pass
   that changed anything would rewrite someone's book indefinitely.
   Verified over the whole 677k-character book before this was written;
   the fixture is the fast version. */
for (const [name, body] of Object.entries(P)) {
  const once = cleanOcrNoise(body);
  eq(cleanOcrNoise(once), once, `cleaning "${name}" twice is the same as cleaning it once`);
}

console.log("\n## D. The suite cannot be satisfied by deleting things");
/* Section B, re-run against cleaners that are wrong in the four ways
   this kind of code goes wrong. If any of them scores full marks, the
   assertions above are not testing the cleaner and this whole file is
   worthless. */

const SURVIVORS = [
  ["this is **bold** and this is __not__", "this is **bold** and this is __not__"],
  ["if a < b and c > d then", "if a < b and c > d then"],
  ["x^2 plus 5*3 in snake_case", "x^2 plus 5*3 in snake_case"],
  ["über Straße naïve café", "über Straße naïve café"],
  ["-- Voyons... -- Une sale fille...", "-- Voyons... -- Une sale fille..."],
  ["off.\n\n* * * * * * *\n\n\"What", "off.\n\n* * * * * * *\n\n\"What"],
];
const CORE = [
  ...CASES.map(([name, want]) => [P[name], want]),
  [P.reported,
    "il me l'adressait... Pourquoi\nme demandez-vous ça?... C'est un peu bête ce\n" +
    "que vous me demandez-là, mon gros père,\n\"Avex?...\n" +
    "10 LE JOURNAL D'UNE FEMME DE CHAMBRE\nIl me poussa du coude"],
  ...SURVIVORS,
];
const scoreOf = (fn) => CORE.filter(([input, want]) => {
  let got;
  try { got = fn(input); } catch { return false; }
  return got === want;
}).length;

const NOISE_CLASS = /[*|\\^~§¶†‡°¤¦¬•∗™<>]/g;
const SABOTEURS = [
  ["a cleaner that returns nothing", () => ""],
  ["a cleaner that strips all punctuation", (s) => String(s).replace(/[^\p{L}\p{N}\s]/gu, "")],
  ["a cleaner that flattens everything to ASCII", (s) => String(s).replace(/[^\x20-\x7E\n]/g, "")],
  ["a cleaner that drops every noise glyph with no guards", (s) => String(s).replace(NOISE_CLASS, "")],
  ["a cleaner that changes nothing at all", (s) => String(s)],
];

const real = scoreOf(cleanOcrNoise);
chk(real === CORE.length,
  `the real cleaner satisfies all ${CORE.length} core assertions`,
  real === CORE.length ? "" : `scored ${real}/${CORE.length}`);
for (const [name, fn] of SABOTEURS) {
  const s = scoreOf(fn);
  chk(s < CORE.length, `${name} FAILS this suite`, `scored ${s}/${CORE.length}`);
}
/* Named separately because it is the check that matters most: if the
   fix is reverted, cleanOcrNoise falls back to the identity above and
   this is the shape of what happens. */
chk(scoreOf((s) => String(s)) < CORE.length / 2,
  "…and the do-nothing cleaner fails most of them, not just one",
  `scored ${scoreOf((s) => String(s))}/${CORE.length}`);

console.log("\n## E. The old pipeline really did leave all of this in");
/* sanitize() as it stood before cleanOcrNoise existed. If these pass,
   the bug was never there and nothing above is testing anything. */
function oldSanitize(raw) {
  let s = String(raw || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<\?[\s\S]*?\?>/g, "");
  s = s.replace(/<!DOCTYPE[^>]*>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<\/?[a-z][^>]*>/gi, "");
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
       .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  s = s.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n");
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  s = normalizeTypeable(s);
  return s.trim();
}
const oldReported = fold(oldSanitize(P.reported));
chk(oldReported.includes(REPORTED_ON_SCREEN),
  "old: the reported line reached the typing surface exactly as the user saw it",
  JSON.stringify(oldReported));
chk(oldSanitize(P.reported).includes("»"),
  "old: the guillemet survived — a character no keyboard can send");
chk(oldSanitize(P.reported).includes("?..*"),
  "old: the clipped ellipsis and the stray asterisk both survived");
chk(oldSanitize(P.guillemets).includes("«") && oldSanitize(P.guillemets).includes("»"),
  "old: every real French quote mark stayed untypeable");
chk(oldSanitize(P["caret-welded"]).includes("corriger^"),
  "old: the caret stayed welded to the word");
chk(oldSanitize(P["trademark"]).includes("™"),
  "old: the misread superscript survived");
chk(oldSanitize(P["star-splits-word"]).includes("Mon*"),
  "old: a word was still cut in half by an asterisk");

console.log("\n## F. \"Leave my text alone\" is stored, and the display path obeys it");
/* The two halves of the feature interact: cleanup also runs on
   display, so an "off" choice at import time would be silently undone
   unless it is persisted AND read back. This is that check. */

if (typeof sanitize !== "function") {
  chk(false, "sanitize() is exported");
} else {
  chk(sanitize(P.reported).includes("\"Avex?..."),
    "sanitize(raw) cleans by default — every existing caller keeps working and gets the fix",
    JSON.stringify(sanitize(P.reported)));
  chk(sanitize(P.reported, { clean: false }).includes("»Avex?..*"),
    "sanitize(raw, { clean: false }) leaves the scanner's own text alone",
    JSON.stringify(sanitize(P.reported, { clean: false })));
  eq(sanitize(P.reported, { clean: false }), oldSanitize(P.reported),
    "…and what it gives back is exactly what the old pipeline gave back");
  eq(sanitize("the quick brown fox"), "the quick brown fox",
    "sanitize() with no options still does its old job on ordinary prose");
}

eq(cleanForDisplay(P.reported, { clean: false }), P.reported,
  "display: a record saved with clean:false is handed to the typing surface untouched");
eq(cleanForDisplay(P.reported, { clean: true }), cleanOcrNoise(P.reported),
  "display: a record saved with clean:true is cleaned");
eq(cleanForDisplay(P.reported, { id: "c_old", title: "before today" }), cleanOcrNoise(P.reported),
  "display: a record saved BEFORE this existed has no clean field, and is cleaned — that is the repair");
eq(cleanForDisplay(P.reported, null), cleanOcrNoise(P.reported),
  "display: a missing record still cleans rather than throwing");
eq(cleanForDisplay(P.reported, { clean: 0 }), cleanOcrNoise(P.reported),
  "display: only an explicit false opts out — a falsy value is not a decision");

/* End to end through real storage, not a stub of the feature: save a
   text with the checkbox off, read the index record back, and hand the
   segment to the display path the way practice-boot.js does. */
if (typeof ct.saveText === "function" && typeof ct.getSaved === "function") {
  const off = await ct.saveText({ title: "scan, cleanup off", raw: P.reported, clean: false });
  const offRec = ct.getSaved(off.id);
  chk(offRec && offRec.clean === false, "saveText({ clean: false }) writes clean:false onto the index record",
    JSON.stringify(offRec && offRec.clean));
  const offSeg = (offRec && offRec.segments && offRec.segments[0]) || "";
  chk(offSeg.includes("»Avex?..*"), "…the stored segment still holds the scanner's characters",
    JSON.stringify(offSeg));
  eq(cleanForDisplay(offSeg, offRec), offSeg,
    "…and the display path hands them straight through, so the choice is not silently undone");

  const on = await ct.saveText({ title: "scan, cleanup on", raw: P.reported });
  const onRec = ct.getSaved(on.id);
  chk(onRec && !("clean" in onRec),
    "saveText() with no clean option writes no clean field — nothing changes for existing callers",
    JSON.stringify(onRec && Object.keys(onRec)));
  const onSeg = (onRec && onRec.segments && onRec.segments[0]) || "";
  chk(onSeg.includes("\"Avex?...") && !onSeg.includes("»"),
    "…and its stored segment is already clean", JSON.stringify(onSeg));
} else {
  chk(false, "saveText/getSaved are exported");
}

console.log("\n## G. The practice page really is wired to it");
/* cleanForDisplay is only worth anything if the custom branch of
   targetFor() calls it. A helper wired into the engine and not into
   the page is this codebase's signature failure. */
const boot = readFileSync(fileURLToPath(new URL("../src/assets/js/pages/practice-boot.js", import.meta.url)), "utf8");
chk(/import\s*\{[^}]*\bcleanForDisplay\b[^}]*\}\s*from\s*"\.\.\/engine\/custom-text\.js"/.test(boot),
  "practice-boot.js imports cleanForDisplay from the engine");
chk(/return\s+textToParagraphs\(\s*cleanForDisplay\(\s*segments\[idx\]\s*,\s*item\s*\)\s*\)/.test(boot),
  "…and the custom segment it returns goes through it, with the saved record");
/* Deliberately NOT in the shared helper: book mode uses
   textToParagraphs/normalizeTypeable too, nobody asked for OCR cleanup
   there, and the per-text off-switch cannot reach it. */
const shared = boot.slice(boot.indexOf("function textToParagraphs"), boot.indexOf("function pickFresh"));
chk(shared.length > 50 && !/cleanOcrNoise|cleanForDisplay/.test(shared),
  "textToParagraphs() does NOT clean — it is shared with book mode, where the off-switch does not exist",
  shared.length > 50 ? "" : "could not find textToParagraphs");
eq(normalizeTypeable(P.reported).includes("»Avex?..*"), true,
  "normalizeTypeable() does not clean either — it is the whitespace pass and is shared everywhere");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
