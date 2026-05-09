/* Pre-grouped lesson stages. Computed at build time so the template
   doesn't have to deal with Nunjucks for-loop scoping (set-inside-for
   doesn't propagate, breaking range-match flags).
   Each stage names a label, optional description, a chip text for the
   card, and an array of [min, max] inclusive id ranges. The lessons
   array is filled in below by walking the canonical lesson list. */

import lessons from "./lessons.js";

const STAGES = [
  { label: "Stage 1 — Home row",                 chip: "home",      ranges: [[1, 7]] },
  { label: "Stage 2 — Top + bottom rows",        chip: "rows",      ranges: [[8, 9]] },
  { label: "Stage 3 — Single-key drills",        chip: "key",       desc: "TypingClub-style micro-drills, one key at a time, both hands.", ranges: [[81, 91]] },
  { label: "Stage 4 — Letter introduction A–Z",  chip: "alphabet",  desc: "Each of the 26 letters introduced one at a time with a focused drill, common words, and a sample sentence.", ranges: [[301, 326]] },
  { label: "Stage 5 — Number key intro 0–9",     chip: "digit",     desc: "Each digit introduced individually, in isolation, then with phrases.", ranges: [[327, 336]] },
  { label: "Stage 6 — Reach drills",             chip: "reach",     desc: "Finger-isolation reaches per column. Build the reach map before building speed.", ranges: [[181, 191]] },
  { label: "Stage 7 — Confusable letters",       chip: "confusable",desc: "b/d, p/q, u/n, m/n, i/l, o/0, 1/l/I -- disambiguation drills.", ranges: [[192, 198]] },
  { label: "Stage 8 — Bigrams + trigrams",       chip: "bigram",    desc: "The most common letter-pair patterns in English: th, he, in, er, an, nd, ed, on, st, tion, ing.", ranges: [[16, 19], [92, 114], [204, 212]] },
  { label: "Stage 9 — Common words",             chip: "frequency", desc: "The top-100 most-frequent English words plus function-word sentences.", ranges: [[199, 203]] },
  { label: "Stage 10 — Top-1000 word frequency", chip: "frequency", desc: "The top 250 English words broken into tiers, plus verbs, nouns, adjectives, and category vocabularies.", ranges: [[357, 376]] },
  { label: "Stage 11 — Common phrases",          chip: "phrases",   desc: "Greetings, farewells, restaurant, travel, weather, directions, work, shopping, agreement, sympathy, email, meetings, negotiation, customer service.", ranges: [[337, 356]] },
  { label: "Stage 12 — Speed builders",          chip: "speed",     desc: "Mixed-length sprints, pangrams, and review runs.", ranges: [[20, 24], [115, 120]] },
  { label: "Stage 13 — Capitalization & shift",  chip: "caps",      desc: "Sentence starts, title case, acronyms, proper nouns, hyphenated words.", ranges: [[25, 32]] },
  { label: "Stage 14 — Punctuation in context",  chip: "punct",     desc: "Commas, periods, quotes, semicolons, dashes, parens, apostrophes, hyphens.", ranges: [[10, 15], [213, 220]] },
  { label: "Stage 15 — Punctuation edge cases",  chip: "punct",     desc: "Quote-within-quote, nested parens, em-dash vs en-dash, ellipsis, hyphenated compounds, dialogue tags, slash usage, editorial brackets.", ranges: [[477, 490]] },
  { label: "Stage 16 — Numbers & symbols",       chip: "symbols",   desc: "Digit row, decimals, currency, brackets, math, units, dates, and the symbol gauntlet.", ranges: [[33, 44]] },
  { label: "Stage 17 — Number patterns",         chip: "numbers",   desc: "Counting, primes, Fibonacci, powers of 2, π and e, phone numbers, ISBNs, dates.", ranges: [[221, 230]] },
  { label: "Stage 18 — Programming",             chip: "code",      desc: "Real code across 30+ languages and tools: JS, TS, Python, Rust, Go, Java, C, C++, Ruby, Swift, Kotlin, PHP, Lua, Elixir, Haskell, Scala, Clojure, OCaml, F#, Dart, Julia, R, Erlang, Solidity, Bash, SQL, Vim, regex, GraphQL, Vue, Angular, Svelte, Express, Django, Rails, Phoenix, Terraform, Ansible, Helm, MongoDB, Redis.", ranges: [[45, 56], [121, 140], [231, 247], [377, 401]] },
  { label: "Stage 19 — Long-form prose",         chip: "prose",     desc: "Public-domain literary excerpts. Pass requires 95%+ accuracy: type carefully.", ranges: [[57, 72], [141, 155], [248, 259], [402, 421]] },
  { label: "Stage 20 — Poetry",                  chip: "poetry",    desc: "Type famous poems line by line -- Shakespeare, Frost, Dickinson, Whitman, Yeats, Kipling, Wordsworth, Tennyson, Hopkins, Sandburg, Williams, Pound.", ranges: [[156, 160], [286, 290], [437, 446]] },
  { label: "Stage 21 — Famous speeches",         chip: "speech",    desc: "Public-domain oratory: Lincoln, FDR, JFK, Sojourner Truth, TR, Pericles, Frederick Douglass, Anthony, Stanton, Washington, Churchill, Reagan, Mandela, Havel.", ranges: [[161, 170], [260, 270], [447, 456]] },
  { label: "Stage 22 — Historical documents",    chip: "document",  desc: "Declaration of Independence, U.S. Constitution Preamble, Bill of Rights, Magna Carta, Federalist Papers, Mayflower Compact, Emancipation Proclamation, Universal Declaration of Human Rights, U.N. Charter, Geneva Convention.", ranges: [[422, 436]] },
  { label: "Stage 23 — Sentence rhythm",         chip: "rhythm",    desc: "Narrative, description, dialogue, lists, compound sentences.", ranges: [[271, 275]] },
  { label: "Stage 24 — Foreign phrases",         chip: "foreign",   desc: "Common Spanish, French, German, Italian phrases plus the Greek alphabet.", ranges: [[281, 285]] },
  { label: "Stage 25 — Endurance runs",          chip: "endurance", desc: "Longer single-passage runs to build sustained typing rhythm.", ranges: [[291, 295]] },
  { label: "Stage 26 — Professional copy",       chip: "professional", desc: "Resume bullets, cover letters, meeting notes, status reports, Slack updates.", ranges: [[296, 300]] },
  { label: "Stage 27 — Specialized formats",     chip: "specialized", desc: "Legal boilerplate, medical Latin, scientific notation, finance, AP style, screenplay, chess, URLs, citations, music notation, API docs, OpenAPI, HTTP, stack traces, error logs, GitHub Actions, kubectl, AWS CLI, JSON Schema, diff format.", ranges: [[73, 80], [171, 180], [276, 280], [457, 476]] },
  { label: "Stage 28 — Final mastery",           chip: "mastery",   desc: "Comprehensive review at high difficulty -- pangrams, mixed numbers + letters, code + prose hybrids, punctuation gauntlets, long-form endurance, technical writing, speech excerpts, speed runs.", ranges: [[491, 500]] },
];

function inAnyRange(id, ranges) {
  for (const [lo, hi] of ranges) {
    if (id >= lo && id <= hi) return true;
  }
  return false;
}

const claimed = new Set();
let seq = 0;
const out = STAGES.map((stage) => {
  const items = lessons
    .filter((l) => !claimed.has(l.id) && inAnyRange(l.id, stage.ranges))
    .map((l) => {
      claimed.add(l.id);
      seq += 1;
      // displayNum is the sequential lesson number in pedagogical order,
      // shown on the card so the curriculum reads 1..500 cleanly. The
      // original numeric id stays unchanged because URLs and saved
      // lesson-bests reference it by id (changing the id would break
      // every existing user's progress).
      return { ...l, displayNum: seq };
    });
  return { ...stage, lessons: items };
});

// Anything not picked up by an explicit stage falls into a final
// "Other" bucket so a typo in the stage map doesn't silently lose a
// lesson card. In practice this should be empty.
const orphans = lessons.filter((l) => !claimed.has(l.id));
if (orphans.length) {
  out.push({
    label: "Other",
    chip: "misc",
    desc: "Lessons not yet assigned to a stage.",
    ranges: [],
    lessons: orphans,
  });
}

export default out;
