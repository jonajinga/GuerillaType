#!/usr/bin/env node
/* Did the build actually write a card for everything that can be
   shared?
 *
 * Separate from `npm run og-render` on purpose. That gate renders three
 * fixed models and needs nothing on disk; this one reads _site and is
 * meaningless without a build, so it REFUSES to run instead of quietly
 * skipping. A gate that reports "0 failed" because it checked nothing
 * is the failure mode this project has already been bitten by.
 *
 * Run: npm run build && npm run og-images */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
process.chdir(ROOT);
const SITE = join(ROOT, "_site");
const OG = join(SITE, "og");

let pass = 0, fail = 0;
const chk = (ok, n, x = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); ok ? pass++ : fail++; };
const die = (msg) => { console.log(`  FAIL  ${msg}`); console.log("\nRUN ABORTED — counts below are partial."); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1); };

if (!existsSync(OG)) die("_site/og is missing — run `npm run build` first (OG_SKIP=1 skips this step).");

const pngs = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".png")) : []);
const json = (p) => JSON.parse(readFileSync(p, "utf8"));

// ── A. one card per shareable thing ─────────────────────────────────
console.log("\nA. counts");

const CORPUS = [
  ["quote", "src/data/quotes.json"],
  ["idiom", "src/data/idioms.json"],
  ["parable", "src/data/parables.json"],
  ["poem", "src/data/poetry.json"],
];
for (const [dir, file] of CORPUS) {
  const ids = json(join(ROOT, file)).map((x) => x.id).filter(Boolean);
  const files = pngs(join(OG, dir));
  chk(files.length === ids.length, `_site/og/${dir} has one PNG per id in ${file}`,
    `${files.length} PNGs vs ${ids.length} ids`);
  const missing = ids.filter((id) => !files.includes(`${id}.png`));
  chk(missing.length === 0, `every ${dir} id has its own card`, missing.slice(0, 3).join(", "));
}

const books = readdirSync(join(ROOT, "src", "data", "books")).filter((f) => f.endsWith(".json"));
chk(pngs(join(OG, "book")).length === books.length, "one card per book",
  `${pngs(join(OG, "book")).length} vs ${books.length}`);

for (const [dir, mod] of [["lesson", "lessons"], ["challenge", "challenges"], ["drill", "drills"]]) {
  const items = (await import(`../src/_data/${mod}.js`)).default;
  const list = typeof items === "function" ? await items() : items;
  chk(pngs(join(OG, dir)).length === list.length, `one card per ${dir}`,
    `${pngs(join(OG, dir)).length} vs ${list.length}`);
}

// ── B. the Free-plan result grid ────────────────────────────────────
console.log("\nB. result grid");

const { BAND_IDS } = await import("../lib/og/labels.js");
const result = pngs(join(OG, "result"));
const expected = BAND_IDS.length * 202;   // wpm 0..200 plus "200p"
chk(result.length === expected, "a card for every wpm x accuracy band", `${result.length} vs ${expected}`);
for (const name of ["62-95.png", "0-u80.png", "200-100.png", "200p-100.png", "120-90.png"]) {
  chk(result.includes(name), `result/${name} exists`);
}
chk(!result.includes("201-95.png"), "the grid stops at 200 (201+ folds into 200p)");

// ── C. the files are real cards ─────────────────────────────────────
console.log("\nC. the files themselves");

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SAMPLE = [
  join(OG, "result", "62-95.png"),
  join(OG, "quote", json(join(ROOT, "src/data/quotes.json"))[0].id + ".png"),
  join(OG, "poem", json(join(ROOT, "src/data/poetry.json"))[0].id + ".png"),
  join(OG, "book", books[0].replace(/\.json$/, ".png")),
];
let bytes = 0, n = 0;
for (const f of SAMPLE) {
  if (!existsSync(f)) { chk(false, `sample exists: ${f.slice(SITE.length)}`); continue; }
  const buf = readFileSync(f);
  const ok = buf.subarray(0, 8).equals(SIG) && buf.subarray(12, 16).toString("latin1") === "IHDR"
    && buf.readUInt32BE(16) === 1200 && buf.readUInt32BE(20) === 630;
  chk(ok, `1200x630 PNG: ${f.slice(SITE.length)}`, `${(buf.length / 1024).toFixed(1)} KB`);
}
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(join(dir, e.name));
    else if (e.name.endsWith(".png")) { bytes += statSync(join(dir, e.name)).size; n++; }
  }
}
walk(OG);
chk(n > 3000, "the whole set was written", `${n} PNGs, ${(bytes / 1048576).toFixed(1)} MB`);
chk(bytes / n > 5 * 1024, "average card is not an empty placeholder", `${(bytes / n / 1024).toFixed(1)} KB average`);

// ── D. the deployed rules ───────────────────────────────────────────
console.log("\nD. what ships with them");

const headers = existsSync(join(SITE, "_headers")) ? readFileSync(join(SITE, "_headers"), "utf8").split("\n") : [];
const i = headers.findIndex((l) => l.trim() === "/og/*");
const directives = [];
for (let k = i + 1; k < headers.length && /^\s+\S/.test(headers[k]); k++) directives.push(headers[k].trim());
chk(i >= 0 && directives.some((d) => /max-age=86400/.test(d)), "_site/_headers caches /og/*", directives.join(" | "));

const sw = existsSync(join(SITE, "sw.js")) ? readFileSync(join(SITE, "sw.js"), "utf8") : "";
chk(/startsWith\("\/og\/"\)/.test(sw), "_site/sw.js lets /og/ past the runtime cache");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
