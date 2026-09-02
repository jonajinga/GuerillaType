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

   Sections A-G need no browser, no server and no node_modules.
   Section H does: it drives the real /custom/ page, because the panel
   and its off-switch live in the page, not in the engine, and the gap
   this file was extended to close -- a PASTE getting no preview -- is
   invisible from the engine side. It serves the built _site itself, on
   its own port, with /assets/js/** overlaid live from src/ so it can
   never be reading a stale build. See the note above section H.

   Usage: node scripts/check-ocr-cleanup.mjs
          (needs `npm ci` and one `npm run build`; serves itself) */
import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
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
    "m'appeler par mon\nnom, au lieu de dire, tout le temps : \"ma fille\"\n" +
    "par ci... \"ma fille\" par là, sur ce ton de domination blessante, qui décourage",
    "real French dialogue quotes « » become typeable quotes, and the space French sets INSIDE them goes with them"],
  ["doubled-angle",
    "refermer, puis, l'eau ruisseler dans\nle tub des \"Ah 1\", des \"Ohl\", " +
    "des \"Fuuiil\",\ndes \"Brrr!\" que la surprise de l'eau",
    "a guillemet the scanner read as \"<<\" becomes a quote like the ones beside it, spacing and all"],
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
    "juifs!... Vive le Roy!... Vive l'armée!\" M la comtesse a menacé le gouvernement " +
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
  /* ── WELDED: a glyph with a letter on EACH side, inside a word.
     These all survived the first version of the cleaner, because the
     guard that protects "x^2" and "5*3" protected them too. Added
     after a second screenshot from the practice page: "ut all^r". ── */
  ["caret-in-word",
    "on y est, sans cesse, en contact avec trop de\ngens, trop de choses, trop de plaisirs, " +
    "trop d'imprévu... Il faut allr quand mme... Ici, c'est\ncalme... Et quel silence!... L'air qu'on respire",
    "the reported \"all^r\": a caret welded between letters is scanner debris and goes"],
  ["star-in-word",
    "m'accompagna.... Elle souriait :\n-- Je ne suis pas fâchée de ce qui vient darriver, " +
    "me confia-t-elle... Il aimait trop son furet...\nMoi, je ne veux pas qui! aime quelque chose...",
    "…and \"d*arriver\", the same shape with an asterisk"],
  ["backslash-in-word",
    "ou combien de siècles?... Je ne le sais pas. Revenue à moi, une pensée suppliciante domina toutes\n" +
    "les autres : faire disparaître ce qui pouait m' accuser... Je me lavai le visage... je me rhabillai...\n" +
    "je remis -- oui, j'eus cet affreux couragf; -- je",
    "…and \"pou\\ait\", with a backslash"],
  ["angle-in-word",
    "t Dulait par la bouche de Georges. Gela me fit\niioid au cœur... Elles disparurent enfin...\n" +
    "Où sont-elles aujourd'hui, ces trois ombres",
    "…and \"ii>oid\", with an angle bracket"],
  ["degree-in-word",
    "eifronterie, soit manque d'ordre, il lui arriva\nsouvent des histoires pareilles ou analogues. " +
    "J'enua,s quelques-unes à raconter q.i, sous ce rapport, sont des plus édifiantes... " +
    "Mais il y a unmoment où le dégoût l'emporte, où la fatluê\nsa été Et puis, je crois que " +
    "j'en ai dit assez surc\"tte maison, qui fut pour moi le plus complet",
    "…and \"so°us\", with a degree sign"],
  ["caret-chain",
    "fcste avec Copp(''e, Lemaître, Quesnay de Hea/i\nrepaire; il conspire avec le gfnéral MercTer\n" +
    "towt cela, pour renverser la Ré[)ul)Iique. L'autre",
    "\"g^f^néral\" loses BOTH carets in one call — the first only becomes droppable once the second is gone"],
  ["caret-twin-survives",
    "-- C'est bien ça... Géîestine... Vous êtes une\n\"n\" hmtniiii nrje fompifs d'ordf!; hotd^^t\n" +
    "LE JOURNAL DUNE FEMME DE CHaMBRË 139",
    "…and on the same line a doubled \"^^\" is still kept — the repeated-glyph guard outranks the welded one"],
];
for (const [name, want, label] of CASES) {
  chk(P[name] !== undefined, `fixture has a "${name}" passage`);
  eq(cleanOcrNoise(P[name]), want, label);
}

console.log("\n## B2. The space French sets INSIDE a guillemet goes with it");
/* Reported from the typing surface, with a screenshot: "« marcher»."
   was still showing a space inside the quote after the mark was
   mapped, and "users can't type this". The mark and the narrow space
   beside it are one piece of punctuation; mapping one and keeping the
   other leaves a gap nobody typed. */

eq(cleanOcrNoise("« marcher»."), '"marcher".',
  'the reported line: "« marcher»." comes out as "marcher".');
eq(cleanOcrNoise("« marcher »."), '"marcher".',
  "…and so does the fully spaced form, which is how French normally sets it");
eq(cleanOcrNoise("il dit : « je vais marcher », puis partit."),
  'il dit : "je vais marcher", puis partit.',
  "…in a sentence: the spaces OUTSIDE the quotes are left exactly where they were");

/* The same text can reach this function before or after
   normalizeTypeable, so the space can still be a narrow no-break one.
   Both spellings, one answer. */
eq(cleanOcrNoise("\u00ab\u202fmarcher\u202f\u00bb."), '"marcher".',
  "a narrow no-break space (U+202F) inside the guillemets goes too — /custom/ sees the text before it is normalized");
eq(cleanOcrNoise("\u00ab\u00a0marcher\u00a0\u00bb."), '"marcher".',
  "…and a plain no-break space (U+00A0)");
eq(cleanOcrNoise(normalizeTypeable("\u00ab\u202fmarcher\u202f\u00bb.")), '"marcher".',
  "…and the same text after normalizeTypeable has already flattened it, which is the order sanitize() uses");
eq(cleanOcrNoise("des << Ohl >> ici"), 'des "Ohl" ici',
  "the doubled-bracket spelling of a guillemet loses its inner space as well");
eq(cleanOcrNoise("un ‹ mot › ici"), "un 'mot' ici",
  "single guillemets follow the same convention, one tier down");

/* The half that stops this becoming a space-eater. */
eq(cleanOcrNoise('he said "the cat sat" and left'), 'he said "the cat sat" and left',
  "an ASCII quote is not a guillemet — its spacing is not touched at all");
eq(cleanOcrNoise("«marcher»"), '"marcher"',
  "a guillemet with no inner space does not eat the letter beside it");
eq(cleanOcrNoise("il dit «  deux espaces  » ici"), 'il dit " deux espaces " ici',
  "only ONE space is taken — a run of them is not the punctuation's, and a normalizer that ate it could pass by deleting");
eq(cleanOcrNoise("mot\n» dit-il"), 'mot\n" dit-il',
  "a newline before a closing guillemet is not a space to eat — the line break stays");
eq(cleanOcrNoise("    « vers »"), '    "vers"',
  "…and leading indentation is untouched, which is load-bearing in verse");

const marcher = ocrNoiseReport("« marcher »");
eq(marcher.total, 2, "both marks are still counted, one each — the preview's numbers do not change meaning");
eq(cleanOcrNoise(cleanOcrNoise("« marcher »")), cleanOcrNoise("« marcher »"),
  "…and cleaning it twice is the same as cleaning it once");

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

console.log("\n## C2. Welded: the line between notation and debris");
/* Second report, with a screenshot of the practice page: "ut all^r" --
   a caret welded between letters, in the middle of a word. "users
   can't type that easily", and the book does not contain it.

   It survived the first cleaner because guard 2 kept ANY noise glyph
   with an alphanumeric on both sides, which is what protects "x^2" and
   "5*3". Guard 2 is now narrower: a welded glyph is kept only where it
   plausibly IS notation -- a DIGIT on either flank, or a word-run of a
   single character on both sides.

   Measured over the whole 677,109-character extraction: 131 noise
   glyphs sit welded between alphanumerics; 110 of them are debris of
   the kind below and now go, 21 stay. Section B holds the real
   passages; these are the rule itself, in the smallest strings that
   can state it. */

eq(cleanOcrNoise("ut all^r"), "ut allr",
  'the reported fragment, exactly as it appeared on screen: "ut all^r" -> "ut allr"');
eq(cleanOcrNoise("Il faut all^r quand m^me"), "Il faut allr quand mme",
  "…and the whole clause it came from");
eq(cleanOcrNoise("don*t"), "dont",
  "an asterisk inside a word goes too — the rule is per-shape, not per-character");
eq(cleanOcrNoise("g^f^néral"), "gfnéral",
  "a chain of welded carets is resolved in ONE call, not left half-cleaned");
eq(cleanOcrNoise(cleanOcrNoise("g^f^néral")), cleanOcrNoise("g^f^néral"),
  "…which is what keeps the cleaner idempotent — the practice page re-runs it on every open");

const WELDED_SURVIVES = [
  ["x^2", "a digit on a flank is notation"],
  ["2^10", "…on either flank"],
  ["mc^2", "…even with a multi-letter run on the other side"],
  ["5*3", "…and it is not caret-specific"],
  ["2§1", "…nor limited to the glyphs anyone expected"],
  ["20°C", "…which is what keeps a temperature readable"],
  ["x^n", "a single character on BOTH sides is notation, with no digit anywhere"],
  ["a*b", "…whatever the glyph"],
];
for (const [text, why] of WELDED_SURVIVES)
  eq(cleanOcrNoise(text), text, `"${text}" survives — ${why}`);
eq(cleanOcrNoise("the area is x^2, and 5*3 is 15, and x^n grows, but all^r does not"),
  "the area is x^2, and 5*3 is 15, and x^n grows, but allr does not",
  "…and all of them survive in one sentence beside the junk that does not");

/* The preview panel names every rule that fired. Somebody who watched
   "all^r" turn into "allr" has to find a row that says so; "stray
   scanner marks removed" reads as if it only touched marks standing on
   their own. */
const wrep = ocrNoiseReport("Il faut all^r quand m^me");
eq(wrep.total, 2, "the report counts both welded carets");
eq(JSON.stringify(wrep.changes.map((c) => [c.id, c.count])),
  JSON.stringify([["welded", 2]]),
  "…under their own id, not lumped in with the free-standing strays");
chk(/all\^r/.test(wrep.changes[0].label),
  "…and the label shows the user the shape they saw on screen",
  JSON.stringify(wrep.changes[0].label));

const mixed = ocrNoiseReport("un •homme et all^r");
eq(JSON.stringify(mixed.changes.map((c) => [c.id, c.count])),
  JSON.stringify([["strays", 1], ["welded", 1]]),
  "a passage with both kinds gets both rows, counted separately");
eq(mixed.text, "un homme et allr", "…and the text is cleaned of both");

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

console.log("\n## E2. The OLD welded guard really did keep all of that");
/* keepStray()'s guard 2 as it stood before 2026-09-02: any noise glyph
   with an alphanumeric on both sides was kept, full stop. If these
   assertions fail, the welded bug was never there and section C2 is
   testing nothing.

   Copied rather than imported on purpose — it has to keep saying what
   the old code did even after the old code is gone. */
const OLD_NOISE = /[*|\\^~§¶†‡°¤¦¬•∗™<>]/g;
const OLD_ALNUM = /[\p{L}\p{N}]/u;
const oldIsSpace = (ch) => ch === " " || ch === "\t";
function oldKeepStray(t, i) {
  const c = t[i];
  const prev = i > 0 ? t[i - 1] : "";
  const next = i + 1 < t.length ? t[i + 1] : "";
  let a = i - 1; while (a >= 0 && oldIsSpace(t[a])) a--;
  let b = i + 1; while (b < t.length && oldIsSpace(t[b])) b++;
  if ((a >= 0 && t[a] === c) || (b < t.length && t[b] === c)) return true;
  if (OLD_ALNUM.test(prev) && OLD_ALNUM.test(next)) return true;   // <- the guard that was too wide
  if (oldIsSpace(prev) && oldIsSpace(next)) return true;
  return false;
}
function oldStrayPass(raw) {
  const before = String(raw || "");
  return before.replace(OLD_NOISE, (m, off) => (oldKeepStray(before, off) ? m : ""));
}

eq(oldStrayPass("ut all^r"), "ut all^r",
  "old: the reported fragment came through the stray pass completely untouched");
for (const [name, junk] of [
  ["caret-in-word", "all^r"],
  ["star-in-word", "d*arriver"],
  ["backslash-in-word", "pou\\ait"],
  ["angle-in-word", "ii>oid"],
  ["degree-in-word", "so°us"],
  ["caret-chain", "g^f^néral"],
])
  chk(oldStrayPass(P[name]).includes(junk),
    `old: "${junk}" survived the stray pass, so it reached the typing surface`,
    P[name] === undefined ? "fixture passage missing" : "");

/* …and the guard was not simply broken: it was doing a real job, which
   is why it cannot just be deleted. */
eq(oldStrayPass("x^2 plus 5*3 and x^n"), "x^2 plus 5*3 and x^n",
  "old: the same guard is what kept the notation — the fix had to narrow it, not remove it");
chk(oldStrayPass("ut all^r") !== cleanOcrNoise("ut all^r"),
  "old and new disagree about the reported fragment — the change is load-bearing");

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

/* ══ H. The page ═══════════════════════════════════════════════════
   Everything above tests the engine. None of it can tell whether the
   PAGE offers a pasted text the same preview and the same off-switch
   it offers an uploaded file -- and it did not. renderOcrPanel() was
   only ever called from ingestFile(), so a paste was cleaned on save
   with no panel, no counts, and nothing to untick. Someone pasting
   Markdown lost "*italic*"; someone pasting a Windows path lost the
   backslash out of "C:\Users"; neither was told.

   So this half drives the real /custom/ page in a real browser: the
   real textarea, the real checkbox, the real save button, the real
   IndexedDB.

   HOW THE PAGE IS SERVED, AND WHY IT CANNOT BE A STALE BUILD.
   `_site` is an eleventy build and takes about three minutes. A suite
   that silently drove the previous build would be worse than no suite.
   The server below therefore serves /assets/js/** straight out of
   src/assets/js/**, and only the HTML shell out of _site. eleventy
   copies that directory through untouched
   (`addPassthroughCopy("src/assets/js")` in eleventy.config.js), so
   the module the browser runs is the file on disk, edit for edit --
   and H0 proves it by comparing the bytes the browser fetched against
   the bytes in src rather than taking it on trust.

   A build is still needed once, for the HTML shell. If _site is
   missing this section FAILS and says which command to run. It never
   skips: a skipped check reads exactly like a passing one, which is
   how a gate stops being a gate.

   Two other things this section takes seriously, both learned here:
     - it serves its own site on its own port and then asserts the
       page that answered is this project. A 200 is not evidence; a
       neighbouring project's dev server on a shared port has already
       cost this fleet a full run.
     - service workers are blocked. pwa.js reloads the page on
       controllerchange, and a reload landing mid-test rebuilds the
       page under whatever is being driven. */

console.log("\n## H. The page: a paste is an import, and gets the same preview");

const ROOT_DIR = fileURLToPath(new URL("..", import.meta.url));
const SITE_DIR = join(ROOT_DIR, "_site");
const SRC_JS_DIR = join(ROOT_DIR, "src", "assets", "js");
const SHELL = join(SITE_DIR, "custom", "index.html");
const BOOT_SRC = join(SRC_JS_DIR, "pages", "custom-boot.js");
/* Chosen for this task, not out of habit. 8080/8181/8765/8229 are all
   in use by other gates or other repositories on this machine. */
const PORT = Number(process.env.OCR_PORT || 8934);
const BASE = `http://127.0.0.1:${PORT}`;

function finish(code) {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(code === undefined ? (fail ? 1 : 0) : code);
}

if (!existsSync(SHELL)) {
  chk(false, "_site is built (the HTML shell for /custom/ exists)",
    `missing ${SHELL} — run: npm run build`);
  finish(1);
}

if (typeof sanitize !== "function") {
  chk(false, "sanitize() is exported — section H's expected character counts come from it");
  finish(1);
}

let chromium = null;
try { ({ chromium } = await import("playwright")); } catch (e) {
  chk(false, "playwright is installed", `${e.message.slice(0, 120)} — run: npm ci`);
  finish(1);
}

/* ── the server ─────────────────────────────────────────────────── */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function fileFor(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split("?")[0].split("#")[0]); }
  catch { return null; }
  if (p.endsWith("/")) p += "index.html";
  const rel = normalize(p).replace(/^([/\\]|\.\.[/\\])+/, "");
  // Live JS: the module under test is read from src, never from _site.
  if (rel.startsWith("assets/js/")) {
    const f = resolve(SRC_JS_DIR, rel.slice("assets/js/".length));
    if (f.startsWith(SRC_JS_DIR) && existsSync(f) && statSync(f).isFile()) return f;
  }
  const f = resolve(SITE_DIR, rel);
  if (!f.startsWith(SITE_DIR)) return null;
  if (existsSync(f)) {
    if (statSync(f).isFile()) return f;
    const idx = join(f, "index.html");
    if (existsSync(idx)) return idx;
  }
  return null;
}

const server = createServer((req, res) => {
  const f = fileFor(req.url || "/");
  if (!f) { res.writeHead(404, { "content-type": "text/plain" }); res.end("not found"); return; }
  res.writeHead(200, {
    "content-type": MIME[extname(f).toLowerCase()] || "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(f).pipe(res);
});

/* Bind or fail. Attaching to whatever already holds the port is how a
   suite ends up testing another project's site and reporting green. */
await new Promise((res, rej) => {
  server.once("error", rej);
  server.listen(PORT, "127.0.0.1", res);
}).catch((e) => {
  chk(false, `this suite owns port ${PORT}`,
    `${e.code || e.message} — something else is listening; set OCR_PORT to a free port`);
  finish(1);
});

/* ── H0. Is the thing answering actually this project, and is the JS
   it serves the JS on disk right now? ──────────────────────────── */
/* The build minifies attribute quotes away, so match on the id value
   rather than on a quoted attribute -- and match the heading too, so a
   200 from some other project's dev server on this port cannot pass
   for this page. */
const shellHtml = await (await fetch(BASE + "/custom/")).text();
const hasId = (id) => new RegExp(`id=["']?${id}["'\\s>]`).test(shellHtml);
chk(/<h1>Custom text<\/h1>/.test(shellHtml) && hasId("ocr-panel"),
  `the page answering ${BASE}/custom/ is this project's custom-text page`,
  shellHtml.slice(0, 80).replace(/\n/g, " "));
chk(hasId("ocr-clean") && hasId("paste-text") && shellHtml.includes("ocr-panel__hint"),
  "…and the shell has the off-switch, the textarea and the hint line this section drives");

const servedBoot = await (await fetch(BASE + "/assets/js/pages/custom-boot.js")).text();
chk(servedBoot === readFileSync(BOOT_SRC, "utf8"),
  "the browser is served the custom-boot.js that is on disk right now, byte for byte",
  servedBoot === readFileSync(BOOT_SRC, "utf8") ? ""
    : "the overlay is not live — this section would be testing a stale _site copy");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
page.on("pageerror", (e) => console.log("  PAGEERROR:", String(e).slice(0, 200)));

/* A net, not the plan. Every interaction below that can legitimately
   fail when the feature is missing is wrapped so it records a FAIL and
   carries on -- a suite that dies on its first red tells you one thing
   and hides the other twenty. This catches what is left, and prints
   the counts rather than a stack: an aborted run with no totals reads
   like a run nobody did. Node reports a rejected top-level await as an
   uncaught exception, so both are hooked. */
const abort = (err) => {
  console.log(`  FAIL  section H ran to the end — ${String(err?.message ?? err).split("\n")[0]}`);
  fail++;
  console.log("\nRUN ABORTED — the counts below are partial.");
  try { server.close(); } catch {}
  finish(1);
};
process.on("unhandledRejection", abort);
process.on("uncaughtException", abort);

/* ── driving helpers ───────────────────────────────────────────── */

/* Wait for custom-boot.js to have RUN, not merely for the DOM. The
   saved-texts list is rendered by it, so "No saved texts yet." is the
   only honest readiness signal on this page. */
async function freshPage() {
  await page.goto(BASE + "/custom/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".saved-item, .stats-empty", { timeout: 30000 });
  await page.evaluate(async () => {
    localStorage.clear();
    // Stops ensureSample() seeding Alice, so the newest index record is
    // always the one the case under test just saved.
    localStorage.setItem("tt:custom-sample", JSON.stringify("dismissed"));
    await new Promise((res) => {
      const r = indexedDB.deleteDatabase("tt-custom");
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".stats-empty", { timeout: 30000 });
}

const panelState = () => page.evaluate(() => {
  const el = document.querySelector("#ocr-panel");
  const box = document.querySelector("#paste-text");
  const notice = document.querySelector("#paste-notice");
  const val = box ? box.value : "";
  return {
    panels: document.querySelectorAll("#ocr-panel").length,
    hidden: el ? el.hidden : null,
    source: (el && el.dataset.source) || null,
    summary: (document.querySelector("#ocr-summary")?.textContent || "").trim(),
    rows: [...document.querySelectorAll("#ocr-changes li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()),
    hint: (document.querySelector(".ocr-panel__hint")?.textContent || "").trim(),
    checked: !!document.querySelector("#ocr-clean")?.checked,
    boxLen: val.length,
    box: val.length <= 4000 ? val : null,
    notice: notice && !notice.hidden ? notice.textContent.trim() : "",
  };
});

/* The off-switch is inside the panel, so when the panel is missing
   this is where a broken build throws. Record it as the failure it is
   and keep going: the cases after this one are about what gets STORED,
   and they are the ones that show what the missing off-switch costs. */
async function setTick(on) {
  try {
    if (on) await page.check("#ocr-clean", { timeout: 6000 });
    else await page.uncheck("#ocr-clean", { timeout: 6000 });
    return true;
  } catch (e) {
    chk(false, `the off-switch can be ${on ? "ticked" : "unticked"} on screen`,
      String(e.message).split("\n")[0]);
    return false;
  }
}

const shownPanel = () => page.waitForFunction(() => {
  const el = document.querySelector("#ocr-panel");
  return !!el && el.hidden === false;
}, null, { timeout: 8000 });

const panelSourceIs = (want) => page.waitForFunction((w) => {
  const el = document.querySelector("#ocr-panel");
  return !!el && el.hidden === false && el.dataset.source === w;
}, want, { timeout: 8000 });

/* "No panel appears" is a claim about a debounce that has had time to
   run. Nothing to wait FOR, so wait past it -- generously. */
const SETTLE = 1600;
const settle = () => page.waitForTimeout(SETTLE);

/* Read back what was actually stored: the index record from
   localStorage and the body from wherever saveText put it. Every
   branch resolves; a probe that hangs on a missing store turns a
   failing gate into one that never finishes. */
async function storedTop(needles = []) {
  return page.evaluate(async (needles) => {
    const rec = JSON.parse(localStorage.getItem("tt:custom-texts") || "[]")[0] || null;
    if (!rec) return null;
    let segs = Array.isArray(rec.segments) && rec.segments.length ? rec.segments : null;
    if (!segs) {
      segs = await new Promise((res) => {
        let req;
        try { req = indexedDB.open("tt-custom"); } catch { res(null); return; }
        req.onerror = req.onblocked = () => res(null);
        req.onsuccess = () => {
          try {
            const g = req.result.transaction("segments", "readonly").objectStore("segments").get(rec.id);
            g.onsuccess = () => res(g.result ? g.result.segments : null);
            g.onerror = () => res(null);
          } catch { res(null); }
        };
      });
    }
    const body = segs ? segs.join(" ") : "";
    return {
      id: rec.id,
      title: rec.title,
      bytes: rec.bytes,
      segCount: rec.segCount,
      clean: "clean" in rec ? rec.clean : "(no clean field)",
      bodyLen: body.length,
      has: needles.map((n) => body.includes(n)),
      head: body.slice(0, 90),
    };
  }, needles);
}

async function awaitSaved(needles) {
  try {
    await page.waitForSelector(".saved-item", { timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector("#paste-save").disabled, null, { timeout: 60000 });
  } catch (e) {
    chk(false, "the save button saved something", String(e.message).split("\n")[0]);
  }
  return storedTop(needles);
}

async function saveAndRead(needles) {
  await page.click("#paste-save").catch((e) =>
    chk(false, "the save button is clickable", String(e.message).split("\n")[0]));
  return awaitSaved(needles);
}

/* ── the texts ─────────────────────────────────────────────────── */

/* Real scanner output, the same fixture the rest of this file uses.
   Two passages, because P.reported alone cleans to exactly its own
   length (»→" is 1:1, ?..→?... adds one, the stray * removes one) and
   a character count that cannot tell the two answers apart is not an
   assertion. Adding star-splits-word makes them differ. */
const PASTE_NOISY = P.reported + "\n\n" + P["star-splits-word"];
const PASTE_CLEAN = P["angle-as-symbol"];   // real prose, a real "<", nothing to repair
const RAW_MARKS = "»Avex?..*";
const CLEANED_MARKS = '"Avex?...';
const SPLIT_WORD = "Mon*";

const wantNoisyReport = ocrNoiseReport(PASTE_NOISY);
const LEN_CLEANED = sanitize(PASTE_NOISY).length;
const LEN_ORIGINAL = sanitize(PASTE_NOISY, { clean: false }).length;
chk(LEN_CLEANED !== LEN_ORIGINAL,
  "the pasted fixture's cleaned and original lengths differ, so a stored character count can tell them apart",
  `${LEN_CLEANED} vs ${LEN_ORIGINAL}`);

/* ── H1. A paste with noise shows the panel, with the right counts,
       and does NOT rewrite what the user pasted ────────────────── */
await freshPage();
await page.fill("#paste-title", "pasted scan");
await page.fill("#paste-text", PASTE_NOISY);
await shownPanel().catch(() => {});
let st = await panelState();

chk(st.hidden === false, "pasting text with scanner noise in it shows the import preview",
  st.hidden === false ? "" : "the panel never appeared — a paste still gets no preview");
eq(st.source, "paste", "…and the panel says it is describing a paste, not a file");
eq(st.summary,
  `${wantNoisyReport.total} marks in this text look like scanning noise rather than writing, ` +
  `and will be cleaned up when you save:`,
  "…with the sentence a paste needs: what WILL happen, at save time");
eq(st.rows.length, wantNoisyReport.changes.length,
  "…one row per rule that fired");
eq(st.rows.join(" | "),
  wantNoisyReport.changes.map((c) => `${c.label} · ${c.count}`).join(" | "),
  "…each naming the rule and its count, the same as an uploaded file gets");
eq(st.checked, true, "…and the off-switch starts ticked");
chk(st.hint.startsWith("Untick to save the text exactly as you pasted it"),
  "…and the hint talks about the paste, not about \"the file\"", JSON.stringify(st.hint));
eq(st.box, PASTE_NOISY,
  "the textarea still holds exactly what was pasted — the scan does not rewrite it under the caret");
eq(st.notice, "", "…and no long-text preview notice was raised for a short paste");

/* ── H2. Unticking stores the ORIGINAL, and marks the record ───── */
await setTick(false);
st = await panelState();
eq(st.box, PASTE_NOISY, "unticking does not rewrite the box either — it already held the original");
let rec = await saveAndRead([RAW_MARKS, SPLIT_WORD, CLEANED_MARKS]);
chk(!!rec, "the pasted text saved");
eq(rec && rec.clean, false, "unticked: the index record carries clean:false");
eq(rec && rec.bytes, LEN_ORIGINAL,
  "unticked: the stored text is the ORIGINAL, to the character");
chk(!!rec && rec.has[0], "unticked: the scanner's own marks are still in the stored body", rec && rec.head);
chk(!!rec && rec.has[1], "unticked: the word the scanner split is still split");
chk(!!rec && !rec.has[2], "unticked: nothing was repaired behind the user's back");

/* ── H3. Leaving it ticked stores the cleaned text ─────────────── */
await freshPage();
await page.fill("#paste-title", "pasted scan, cleaned");
await page.fill("#paste-text", PASTE_NOISY);
await shownPanel().catch(() => {});
st = await panelState();
eq(st.checked, true, "a fresh paste comes up ticked");
rec = await saveAndRead([RAW_MARKS, SPLIT_WORD, CLEANED_MARKS, "»"]);
eq(rec && rec.clean, "(no clean field)",
  "ticked: no clean field is written, so \"saved before this existed\" and \"opted in\" stay apart");
eq(rec && rec.bytes, LEN_CLEANED, "ticked: the stored text is the CLEANED one, to the character");
chk(!!rec && !rec.has[0], "ticked: the scanner's marks are gone from the stored body");
chk(!!rec && !rec.has[1], "ticked: the split word was rejoined");
chk(!!rec && rec.has[2], "ticked: the clipped ellipsis was repaired");
chk(!!rec && !rec.has[3], "ticked: no untypeable guillemet reached storage");

/* ── H4. A paste with nothing to clean shows no panel ──────────── */
/* Same rule the file path uses, and for the same reason: a panel
   saying "0 changes" is noise. This passage is real prose containing a
   real "<" that the cleaner is right to leave alone, so it also proves
   the panel is driven by what the cleaner DID, not by what characters
   happen to be present. */
await freshPage();
await page.fill("#paste-text", PASTE_CLEAN);
await settle();
st = await panelState();
eq(st.hidden, true, "a paste with nothing to clean shows no panel");
eq(st.source, null, "…and leaves no stale source on the hidden panel");
eq(st.box, PASTE_CLEAN, "…and the text is untouched");

/* ── H4b. Emptying the box puts the off-switch back ────────────── */
await page.fill("#paste-text", PASTE_NOISY);
await shownPanel().catch(() => {});
await setTick(false);
await page.fill("#paste-text", "");
await settle();
st = await panelState();
eq(st.hidden, true, "clearing the box takes the panel down");
eq(st.checked, true,
  "…and puts the off-switch back to its default — there is nothing on screen to hold the answer");

/* ── H5. THE TRUNCATION TRAP ───────────────────────────────────
   Upload a text longer than the 200,000-character preview, toggle the
   checkbox, and save. The box only ever holds a preview; pendingFull
   holds the rest. If the toggle's own write to the textarea is ever
   mistaken for a manual edit, the stash is dropped and a 600-page book
   saves as its first fragment. Asserted in stored characters, because
   the toast says "Saved" either way. */
function buildNoisyBook() {
  const out = [];
  for (let i = 0; i < 4200; i++) {
    out.push(`Sentence number ${i} of the imported book, carrying enough words to look like real prose rather than filler.`);
    if (i % 100 === 7) {
      /* Two strays, not one. With a single "^" the cleanup was
         length-neutral -- the removed stray and the dot the clipped
         ellipsis gains cancel out -- and every assertion below that
         compares stored character counts would have been true of
         either answer. */
      out.push(`The scanner left a mark here: ^stray and a |pipe too, with \u00absome quoted words\u00bb and a clipped ellipsis?.. right here.`);
    }
  }
  return out.join(" ");
}
const BOOK = buildNoisyBook();
const BOOK_CLEANED = sanitize(BOOK).length;
const BOOK_ORIGINAL = sanitize(BOOK, { clean: false }).length;
const PREVIEW_CHARS = 200000;
const BOOK_TAIL = "Sentence number 4199 of the imported book";

chk(BOOK.length > PREVIEW_CHARS * 2 && BOOK_CLEANED !== BOOK_ORIGINAL,
  "the uploaded book is well past the preview ceiling and has noise in it",
  `${BOOK.length} chars, cleaned ${BOOK_CLEANED} vs original ${BOOK_ORIGINAL}`);

async function uploadBook() {
  await page.setInputFiles("#uploader-file", {
    name: "noisy-book.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(BOOK, "utf8"),
  });
  await page.waitForFunction(() => document.querySelector("#paste-text").value.length > 0,
    null, { timeout: 60000 });
  await panelSourceIs("file").catch(() => {});
}

await freshPage();
await uploadBook();
st = await panelState();
eq(st.source, "file", "a long upload still shows the FILE panel");
eq(st.boxLen, PREVIEW_CHARS,
  "…and the box holds only the preview, so the stash is genuinely in play");
chk(/whole text is saved/i.test(st.notice), "…and the notice says the whole text is kept",
  JSON.stringify(st.notice.slice(0, 60)));
chk(st.hint.startsWith("Untick to keep the file exactly as it came"),
  "…with the file's own hint, not the paste one", JSON.stringify(st.hint));

await setTick(false);
st = await panelState();
eq(st.boxLen, PREVIEW_CHARS, "after unticking the box is still a preview, of the original");
await settle();   // any scan the toggle wrongly scheduled would have fired by now
st = await panelState();
eq(st.source, "file", "…and the panel is still the file's — the toggle's own write is not a user edit");
eq(st.boxLen, PREVIEW_CHARS, "…and the stash was not dropped");

rec = await saveAndRead([BOOK_TAIL]);
chk(!!rec && rec.bytes > PREVIEW_CHARS,
  "toggled long upload: the WHOLE text was saved, not the 200,000-character preview",
  rec ? `${rec.bytes.toLocaleString()} chars` : "(nothing saved)");
eq(rec && rec.bytes, BOOK_ORIGINAL,
  "toggled long upload, unticked: every character of the original is stored");
eq(rec && rec.clean, false, "…and the record says the user opted out");
chk(!!rec && rec.has[0], "…and the last sentence of the book is really in there");

/* Same again, toggled OFF and back ON: the ticked answer must also
   save in full, not just the unticked one. */
await freshPage();
await uploadBook();
await setTick(false);
await setTick(true);
await settle();
st = await panelState();
eq(st.boxLen, PREVIEW_CHARS, "toggled twice: still previewing, still stashed");
rec = await saveAndRead([BOOK_TAIL]);
eq(rec && rec.bytes, BOOK_CLEANED,
  "toggled twice, left ticked: the whole cleaned text is stored");
chk(!!rec && rec.bytes > PREVIEW_CHARS, "…which is past the preview ceiling",
  rec ? `${rec.bytes.toLocaleString()} chars` : "");
eq(rec && rec.clean, "(no clean field)", "…and no opt-out was recorded");
chk(!!rec && rec.has[0], "…and the last sentence survived the round trip");

/* ── H6. Pasting after an upload ───────────────────────────────── */
/* Two panels and two stashes could exist at once here. There is one
   panel element and one timer by construction, and the file's stash
   has to be dropped the moment the box is edited -- otherwise the save
   button reads pendingFull and stores the BOOK the user just replaced. */
await freshPage();
await uploadBook();
st = await panelState();
eq(st.source, "file", "start from an uploaded book");
chk(st.notice !== "", "…with its preview notice up");

/* Dispatched from inside the page so the listener has run by the time
   the evaluate returns -- no timer, no waiting, nothing to be flaky
   about. The debounce cannot have fired yet, so what comes back is
   what the input handler alone did. */
const immediate = await page.evaluate((paste) => {
  const ta = document.querySelector("#paste-text");
  ta.value = paste;
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  const el = document.querySelector("#ocr-panel");
  const notice = document.querySelector("#paste-notice");
  return { hidden: el.hidden, source: el.dataset.source || null, noticeHidden: !!notice.hidden };
}, PASTE_NOISY);
eq(immediate.hidden, true,
  "the moment the box is edited the file's panel comes down — its counts describe text that is no longer there");
eq(immediate.source, null, "…and takes its label with it, before the debounce has run at all");
eq(immediate.noticeHidden, true, "…and the file's preview notice goes at the same time");

await panelSourceIs("paste").catch(() => {});
st = await panelState();
eq(st.panels, 1, "after pasting over an upload there is exactly one panel on the page");
eq(st.source, "paste", "…and it describes the paste, not the book that is no longer in the box");
eq(st.notice, "", "…the book's preview notice is gone");
eq(st.box, PASTE_NOISY, "…the box holds the paste");
chk(st.hint.startsWith("Untick to save the text exactly as you pasted it"),
  "…and the hint switched with it", JSON.stringify(st.hint));
eq(st.summary,
  `${wantNoisyReport.total} marks in this text look like scanning noise rather than writing, ` +
  `and will be cleaned up when you save:`,
  "…with the paste's counts, not the book's");

rec = await saveAndRead([RAW_MARKS, BOOK_TAIL]);
eq(rec && rec.bytes, LEN_CLEANED,
  "…and saving stores the pasted text, not the uploaded book that was stashed behind it");
chk(!!rec && !rec.has[1], "…no part of the book leaked into the saved record");

/* ── H7. Uploading after a paste ───────────────────────────────── */
/* The other direction, and the one that needs a cancelled timer. The
   paste's input event and the file drop happen in the SAME tick, so
   the debounce is guaranteed to still be pending when ingestFile()
   runs. resetOcr() has to cancel it; if it does not, the scan fires
   400ms later, reads the FILE's text out of the box and overwrites the
   file's panel with a paste report -- or, since the file's text is by
   then already cleaned, hides the panel entirely. */
await freshPage();
const SMALL_SCAN = P["caret-welded"];
await page.evaluate(({ paste, fileText }) => {
  const ta = document.querySelector("#paste-text");
  ta.value = paste;
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  const dt = new DataTransfer();
  dt.items.add(new File([fileText], "scan.txt", { type: "text/plain" }));
  document.querySelector("#uploader").dispatchEvent(
    new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt })
  );
}, { paste: PASTE_NOISY, fileText: SMALL_SCAN });

await panelSourceIs("file").catch(() => {});
st = await panelState();
eq(st.source, "file", "dropping a file while a paste scan is pending shows the file's panel");
await settle();
st = await panelState();
eq(st.hidden, false, "…and the pending scan does not take it away again");
eq(st.source, "file", "…nor relabel the file's import as a paste");
eq(st.box, cleanOcrNoise(SMALL_SCAN), "…and the box holds the file, cleaned, as an upload should");
eq(st.summary,
  `${ocrNoiseReport(SMALL_SCAN).total} mark in this file looked like scanning noise rather than the book, ` +
  `and was cleaned up:`,
  "…with the file's own sentence and count");

/* ── H8. An uploaded file with nothing to clean shows no panel ─── */
/* The same rule from the other side. Without this the "0 changes"
   guard inside renderOcrPanel() is unreachable from any test: the
   paste path returns before it, so only a clean FILE can get there. */
await freshPage();
await page.setInputFiles("#uploader-file", {
  name: "clean.txt",
  mimeType: "text/plain",
  buffer: Buffer.from(PASTE_CLEAN, "utf8"),
});
await page.waitForFunction(() => document.querySelector("#paste-text").value.length > 0,
  null, { timeout: 60000 });
await settle();
st = await panelState();
eq(st.hidden, true, "uploading a file with nothing to clean shows no panel either");
eq(st.source, null, "…and leaves no label behind");
eq(st.box, PASTE_CLEAN, "…and the file's own text is what is in the box");

/* ── H9. Saving in the same tick as the edit ───────────────────── */
/* The debounce opens a window: paste, then hit Save before the scan
   has run, and the choice the save uses is the one from the PREVIOUS
   text. Both the edit and the click are dispatched inside the page in
   one synchronous block, so the timer provably has not fired -- if the
   save did not flush the pending scan itself, the stale "no" from the
   noisy paste would be written onto a record with nothing to clean. */
await freshPage();
await page.fill("#paste-title", "raced save");
await page.fill("#paste-text", PASTE_NOISY);
await shownPanel().catch(() => {});
await setTick(false);
await page.evaluate((clean) => {
  const ta = document.querySelector("#paste-text");
  ta.value = clean;
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector("#paste-save").click();
}, PASTE_CLEAN);
rec = await awaitSaved([]);
eq(rec && rec.bytes, sanitize(PASTE_CLEAN).length,
  "a save in the same tick as the edit stores the text that is in the box");
eq(rec && rec.clean, "(no clean field)",
  "…and not the previous text's \"leave it alone\" — the save flushes the pending scan first");

/* ── H10. A paste longer than the preview ceiling ──────────────── */
/* The reason the scan and the checkbox never write to the textarea,
   stated as a test. A pasted book is ALL in the box -- there is no
   stash, because nothing put it there -- and it has to stay that way.
   The naive version of this feature calls showText() when the tick
   changes; past PREVIEW_CHARS that swaps the box for a 200,000-
   character preview and stashes the rest, and then the next thing the
   user types drops the stash and saves the fragment. So: toggle both
   ways, type after it, and count what was stored. */
await freshPage();
const TAIL = " And one more sentence, typed after the toggle, to prove the stash was never made.";
await page.fill("#paste-title", "pasted book");
await page.evaluate((book) => {
  const ta = document.querySelector("#paste-text");
  ta.value = book;
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}, BOOK);
await panelSourceIs("paste").catch(() => {});
st = await panelState();
eq(st.source, "paste", "a pasted book gets the paste panel like any other paste");
eq(st.boxLen, BOOK.length,
  "…and the whole of it stays in the box — a paste is never turned into a preview");
eq(st.notice, "", "…so no preview notice is raised for it");

await setTick(false);
st = await panelState();
eq(st.boxLen, BOOK.length, "unticking a long paste leaves every character of it in the box");
eq(st.notice, "", "…and still stashes nothing");
await setTick(true);
st = await panelState();
eq(st.boxLen, BOOK.length, "re-ticking it does not rewrite the box either");
eq(st.notice, "", "…and still stashes nothing");

await page.evaluate((tail) => {
  const ta = document.querySelector("#paste-text");
  ta.value += tail;
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}, TAIL);
await settle();
rec = await saveAndRead([TAIL.trim()]);
eq(rec && rec.bytes, sanitize(BOOK + TAIL).length,
  "typing after toggling a long paste still saves the whole thing, to the character");
chk(!!rec && rec.bytes > PREVIEW_CHARS * 2, "…which is nowhere near the preview ceiling",
  rec ? `${rec.bytes.toLocaleString()} chars` : "(nothing saved)");
chk(!!rec && rec.has[0], "…and the sentence typed last is in the saved text");

await browser.close();
server.close();

finish();
