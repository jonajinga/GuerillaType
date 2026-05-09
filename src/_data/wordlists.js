/* Word-list metadata. The actual word arrays live as JSON files in
   /src/data/words/ and are fetched by the engine at runtime. This data
   file drives the /wordlists/ index and per-list pages. */

import fs from "node:fs";
import path from "node:path";

const WORDS_DIR = path.resolve("src/data/words");

const META = [
  {
    id: "en-1k",
    name: "English 1k",
    summary: "The 1,000 most common English words. Default for time and words modes — tuned for raw wpm benchmarks.",
    flavor: "Easy. Conversational.",
    bestFor: "Warm-ups · daily speed runs · benchmarks",
  },
  {
    id: "en-5k",
    name: "English 5k",
    summary: "Top 5,000 English words. Adds words like infrastructure, generally, paragraph for vocabulary breadth.",
    flavor: "Medium. Reading-paper level.",
    bestFor: "Vocabulary · sustained sessions",
  },
  {
    id: "en-10k",
    name: "English 10k",
    summary: "Top 10,000 English words. Realistic prose distribution — closer to what you'd type in a long-form document.",
    flavor: "Harder. Newspaper level.",
    bestFor: "Long sessions · prose practice",
  },
  {
    id: "en-20k",
    name: "English 20k",
    summary: "Top 20,000 English words. Wide vocabulary -- magazine and journal level. Drawn from a trillion-word web corpus, frequency-ranked.",
    flavor: "Wider. Magazine level.",
    bestFor: "Vocabulary-heavy practice · range",
  },
  {
    id: "en-50k",
    name: "English 50k",
    summary: "Top 50,000 English words. Full-spectrum vocabulary -- includes regional terms, technical jargon, archaic forms. Long sessions only.",
    flavor: "Encyclopedic. Wide-ranging.",
    bestFor: "Sustained sessions · breadth",
  },
  {
    id: "en-advanced",
    name: "English advanced vocabulary",
    summary: "Curated SAT/GRE-level vocabulary — abnegation, perspicacious, sycophant, zephyr. Stretches both your typing and your word recall.",
    flavor: "Demanding. Multi-syllable.",
    bestFor: "Advanced typists · vocabulary builders · SAT/GRE prep",
  },
  {
    id: "code-js",
    name: "Code: JavaScript",
    summary: "Real JavaScript tokens — function, const, return, =>, =. Includes braces and operators.",
    flavor: "Symbols-heavy.",
    bestFor: "Developers · symbol drilling",
  },
  {
    id: "code-py",
    name: "Code: Python",
    summary: "Pythonic syntax — def, lambda, import, decorators. Colons, indentation, dunders.",
    flavor: "Indentation-aware.",
    bestFor: "Python developers",
  },
  {
    id: "code-html",
    name: "Code: HTML",
    summary: "Tags and attributes. <div class=\"...\">, <a href=\"...\">, common patterns.",
    flavor: "Brackets and quotes.",
    bestFor: "Front-end · markup",
  },
  {
    id: "punctuation",
    name: "Punctuation drill",
    summary: "Focused on . , ; : ? ! ' \" ( ) [ ] { } - —. Use this if your error rate spikes on quotes or parens.",
    flavor: "Marks only.",
    bestFor: "Punctuation accuracy",
  },
  {
    id: "numbers",
    name: "Numbers drill",
    summary: "Pure digit-row practice. Phone numbers, mixed integers, decimals, dates.",
    flavor: "Top-row drill.",
    bestFor: "Spreadsheet typing · data entry",
  },
  {
    id: "scrabble",
    name: "Scrabble trainer",
    summary: "Curated 2- to 7-letter words handy in Scrabble — high-value letter combos, Q-without-U words, common bingos. Train both your typing and your Scrabble vocabulary.",
    flavor: "Game-strategy vocabulary.",
    bestFor: "Word-game players · vocabulary recall",
    rights: "All words drawn from public-domain English; the Scrabble® trademark belongs to Hasbro/Mattel. This list is not affiliated with the official tournament dictionaries (TWL / SOWPODS).",
  },
  {
    id: "code-ts",
    name: "Code: TypeScript",
    summary: "TypeScript-specific syntax — interfaces, generics, utility types, type guards. Pairs well with the JavaScript list.",
    flavor: "Type-heavy.",
    bestFor: "TypeScript developers · generics drilling",
  },
  {
    id: "code-rust",
    name: "Code: Rust",
    summary: "Rust keywords and idioms — fn, mut, impl, trait, Vec<T>, Option, Result, ownership operators.",
    flavor: "Borrow-checker fluent.",
    bestFor: "Rust developers · systems programming",
  },
  {
    id: "code-sql",
    name: "Code: SQL",
    summary: "SQL keywords across SELECT, JOIN, GROUP BY, window functions, DDL, transactions. Mostly uppercase — drills the shift key too.",
    flavor: "All-caps SHIFT workout.",
    bestFor: "Database developers · data analysts",
  },
  {
    id: "code-bash",
    name: "Code: Bash",
    summary: "Shell commands, flags, redirects, and parameter expansions. cd, ls, grep, awk, sed, pipes, &&, $(...).",
    flavor: "Symbol-soup.",
    bestFor: "Sysadmins · CLI fluency",
  },
  {
    id: "code-css",
    name: "Code: CSS",
    summary: "CSS properties, values, functions, and selectors. flexbox, grid, custom properties, modern color functions.",
    flavor: "Hyphens and colons.",
    bestFor: "Front-end · stylesheet authors",
  },
  {
    id: "pangrams",
    name: "Pangrams",
    summary: "Sentences that use every letter of the alphabet at least once. Great for full-keyboard practice in short bursts.",
    flavor: "Sentence-length.",
    bestFor: "Alphabet coverage · warm-ups",
  },
  {
    id: "misspellings",
    name: "Commonly misspelled",
    summary: "Words English speakers most often mistype — accommodate, embarrass, occurrence, separate. Slow down and get them right.",
    flavor: "Tricky spellings.",
    bestFor: "Accuracy · spelling memory",
  },
  {
    id: "latin-phrases",
    name: "Latin phrases",
    summary: "Everyday Latin phrases that crop up in English writing — bona fide, ad hoc, ipso facto, quid pro quo.",
    flavor: "Multi-word entries.",
    bestFor: "Academic and legal writing · vocabulary",
  },
  {
    id: "countries",
    name: "Countries of the world",
    summary: "All 195 sovereign nations. Spelling, capitalization, multi-word names like Saint Vincent and the Grenadines.",
    flavor: "Proper nouns.",
    bestFor: "Geography buffs · capital letters · long words",
  },
  {
    id: "capitals",
    name: "Capitals of the world",
    summary: "Capital cities for every country — Tokyo to Ouagadougou. Heavy on proper nouns and unfamiliar spellings.",
    flavor: "Proper nouns. Tricky spellings.",
    bestFor: "Geography buffs · uncommon letter combos",
  },
  {
    id: "missed",
    name: "My missed words",
    summary: "Words you've struggled with most across recent sessions. Auto-curated from your error history -- the more you miss a word, the more weight it gets.",
    flavor: "Personal weak spots.",
    bestFor: "Error correction · adaptive practice",
    runtime: true,
  },
];

// At build time, attach the actual word array + count to each entry so
// templates can render the full list without a runtime fetch.
const lists = META.map((m) => {
  const file = path.join(WORDS_DIR, `${m.id}.json`);
  let words = [];
  try { words = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { words = []; }
  return {
    ...m,
    count: words.length,
    words,
    permalink: `/wordlists/${m.id}/`,
    practiceUrl: `/practice/?mode=words&words=25&lang=${encodeURIComponent(m.id)}`,
  };
});

export default lists;
