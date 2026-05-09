/* Build expanded English word lists from Norvig's 1/3-million-word
   frequency corpus (count_1w.txt, public domain). Filters to clean
   lowercase a-z words, drops digits/punctuation/single-letter junk,
   strips a small slur/profanity blocklist, and writes en-5k, en-10k,
   en-20k, en-50k as JSON arrays sorted by frequency rank.

   Run after dropping count_1w.txt into /tmp/norvig-1m.txt. */

import fs from "node:fs";

const SOURCE = ".norvig-1m.txt";
const OUT_DIR = "src/data/words";

// Conservative blocklist -- not exhaustive, but catches the obvious
// slurs and crude terms that would surface in the top-50k of a raw
// web-frequency corpus. A typing-tutor wordlist should not throw any
// of these up at a kid practicing during a school day.
const BLOCK = new Set([
  "fuck","shit","cunt","cock","dick","pussy","tits","ass","asshole","bitch",
  "bastard","damn","hell","piss","crap","whore","slut","retard","retarded",
  "fag","faggot","nigger","nigga","kike","spic","chink","gook","wetback",
  "dyke","tranny","negro","queer","homo","jap","cracker","raghead",
  "pron","porn","sex","sexy","xxx","milf","pussycat","boobs","boob","tit",
  "anal","oral","masturbate","masturbation","cum","semen","sperm",
  "penis","vagina","clit","clitoris","scrotum","orgasm","orgy","sodomy",
  "rape","rapist","molest","molester","pedo","pedophile",
]);

const raw = fs.readFileSync(SOURCE, "utf8");
const words = [];
const seen = new Set();
for (const line of raw.split("\n")) {
  const tab = line.indexOf("\t");
  const w = (tab >= 0 ? line.slice(0, tab) : line).trim().toLowerCase();
  if (!w) continue;
  if (w.length < 2) continue;
  if (!/^[a-z]+$/.test(w)) continue;
  if (BLOCK.has(w)) continue;
  if (seen.has(w)) continue;
  seen.add(w);
  words.push(w);
  if (words.length >= 60_000) break;
}

console.log(`Source produced ${words.length} clean lowercase words.`);

const cuts = [
  { name: "en-5k", n: 5000 },
  { name: "en-10k", n: 10_000 },
  { name: "en-20k", n: 20_000 },
  { name: "en-50k", n: 50_000 },
];

for (const { name, n } of cuts) {
  const slice = words.slice(0, n);
  const path = `${OUT_DIR}/${name}.json`;
  fs.writeFileSync(path, JSON.stringify(slice));
  const size = fs.statSync(path).size;
  console.log(`Wrote ${path}: ${slice.length} words (${(size/1024).toFixed(1)} KB)`);
}
