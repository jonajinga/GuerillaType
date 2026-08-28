#!/usr/bin/env node
/* Invariants for the poem corpus.

   Unlike the idiom file, these entries are complete literary works
   reproduced verbatim, so provenance is a first-class check here and
   not a nicety. The corpus shipped a 1931 poem labelled "Public
   domain": for a pre-1978 US publication the term runs 95 years from
   publication, expiring at the END of year+95, so the work enters the
   public domain on 1 January of year+96. In 2026 that means 1930 and
   earlier. A 1931 poem was roughly four months short.

   The cutoff is computed from the clock rather than hardcoded, so it
   advances every January instead of rotting into a stale constant.

   No browser needed. Run: node scripts/check-poetry.mjs */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let pass = 0, fail = 0;
const chk = (ok, n, x = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${x ? "  " + x : ""}`); ok ? pass++ : fail++; };

const a = JSON.parse(readFileSync(resolve("src/data/poetry.json"), "utf8"));
chk(Array.isArray(a) && a.length > 0, "corpus loads", `${a.length} poems`);

const PD_CUTOFF = new Date().getFullYear() - 96;
const yearOf = (p) => { const m = String(p.year || "").match(/\d{4}/); return m ? +m[0] : null; };

const ids = a.map((p) => p.id);
chk(new Set(ids).size === ids.length, "every id is unique",
  `${ids.length - new Set(ids).size} collision(s)`);

const tk = a.map((p) => `${(p.title || "").trim().toLowerCase()}|${(p.author || "").trim().toLowerCase()}`);
const dupT = [...new Set(tk.filter((k, i) => tk.indexOf(k) !== i))];
chk(dupT.length === 0, "no poem appears twice",
  dupT.length ? `${dupT.length}: ${dupT.slice(0, 3).map((k) => k.split("|")[0]).join(" / ")}` : "");

const texts = a.map((p) => String(p.text || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 120));
const dupX = texts.filter((t, i) => texts.indexOf(t) !== i);
chk(dupX.length === 0, "no poem text is duplicated", dupX.length ? `${dupX.length}` : "");

/* This is a typing tutor. The engine compares characters exactly, so an
   em dash or an accented letter is a wall a US keyboard cannot clear.
   Newlines are allowed and required -- they carry the verse structure. */
const untypeable = a.filter((p) => /[^\x20-\x7E\n]/.test(String(p.text || "")));
chk(untypeable.length === 0, "every poem is typeable on a plain keyboard",
  untypeable.length ? untypeable.slice(0, 3).map((p) => p.id).join(", ") : "");

const flat = a.filter((p) => !/\n/.test(String(p.text || "")));
chk(flat.length === 0, "verse structure is preserved",
  flat.length ? `${flat.length} poem(s) lost their line breaks` : "");

const missing = a.filter((p) => !p.id || !p.title || !p.author || !String(p.year || "").trim()
  || !p.source || !String(p.text || "").trim() || !Array.isArray(p.tags) || !p.tags.length);
chk(missing.length === 0, "every poem carries full attribution",
  missing.length ? missing.slice(0, 3).map((p) => p.id).join(", ") : "");

const undated = a.filter((p) => yearOf(p) === null);
chk(undated.length === 0, "every poem has a parseable year",
  undated.length ? undated.slice(0, 3).map((p) => p.id).join(", ") : "");

/* The one that matters most: nothing may ship whose stated publication
   year puts it outside the public domain. */
const tooRecent = a.filter((p) => { const y = yearOf(p); return y && y > PD_CUTOFF; });
chk(tooRecent.length === 0, `nothing published after ${PD_CUTOFF}`,
  tooRecent.length
    ? tooRecent.map((p) => `${yearOf(p)} ${p.author} — ${p.title}`).join("; ")
    : `cutoff advances each January`);

chk(a.length >= 122, "corpus has not shrunk unexpectedly", `${a.length}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
