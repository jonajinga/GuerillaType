#!/usr/bin/env node
/* Invariants for the parable corpus.

   These are complete short works reproduced verbatim, so provenance
   matters as it does for the poems. Every entry here is Aesop, and 258
   of them come from the V. S. Vernon Jones translation of 1912 -- a
   translation carries its own copyright separate from the ancient
   original, so the edition being named and dated is the thing that
   makes reproducing it safe. An entry that loses its source line loses
   the only evidence it may be published.

   No browser needed. Run: node scripts/check-parables.mjs */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let pass = 0, fail = 0;
const chk = (ok, n, x = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); ok ? pass++ : fail++; };

const a = JSON.parse(readFileSync(resolve("src/data/parables.json"), "utf8"));
chk(Array.isArray(a) && a.length > 0, "corpus loads", `${a.length} parables`);

const ids = a.map((p) => p.id);
chk(new Set(ids).size === ids.length, "every id is unique", `${ids.length - new Set(ids).size} collision(s)`);

const titles = a.map((p) => String(p.title || "").trim().toLowerCase());
const dupT = [...new Set(titles.filter((t, i) => titles.indexOf(t) !== i))];
chk(dupT.length === 0, "no parable appears twice", dupT.length ? `${dupT.length}: ${dupT.slice(0, 3).join(" / ")}` : "");

const texts = a.map((p) => String(p.text || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 120));
const dupX = texts.filter((t, i) => texts.indexOf(t) !== i);
chk(dupX.length === 0, "no parable text is duplicated", dupX.length ? `${dupX.length}` : "");

const untypeable = a.filter((p) => /[^\x20-\x7E\n]/.test(String(p.text || "")));
chk(untypeable.length === 0, "every parable is typeable on a plain keyboard",
  untypeable.length ? untypeable.slice(0, 3).map((p) => p.id).join(", ") : "");

const missing = a.filter((p) => !p.id || !String(p.title || "").trim()
  || !String(p.source || "").trim() || !String(p.text || "").trim()
  || !Array.isArray(p.tags) || !p.tags.length);
chk(missing.length === 0, "every parable carries a title, a source and tags",
  missing.length ? missing.slice(0, 3).map((p) => p.id).join(", ") : "");

/* The source is the provenance evidence, so it has to say something.
   A bare "Aesop" would not identify which translation is being used. */
const weakSource = a.filter((p) => !/public domain/i.test(String(p.source || "")));
chk(weakSource.length === 0, "every source states its public-domain standing",
  weakSource.length ? `${weakSource.length}, e.g. ${weakSource[0].id}: "${weakSource[0].source}"` : "");

/* A truncated fable is worse than an absent one -- the reader types
   toward a moral that never arrives. */
const truncated = a.filter((p) => !/[.!?"']\s*$/.test(String(p.text || "").trim()));
chk(truncated.length === 0, "no parable stops mid-sentence",
  truncated.length ? truncated.slice(0, 3).map((p) => p.id).join(", ") : "");

chk(a.length >= 269, "corpus has not shrunk unexpectedly", `${a.length}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
