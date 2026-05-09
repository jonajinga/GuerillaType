import fs from "node:fs";

const META = {
  "o-pioneers":           { title: "O Pioneers!",                       author: "Willa Cather",         year: "1913" },
  "my-antonia":           { title: "My Ántonia",                        author: "Willa Cather",         year: "1918" },
  "ethan-frome":          { title: "Ethan Frome",                       author: "Edith Wharton",        year: "1911" },
  "house-of-mirth":       { title: "The House of Mirth",                author: "Edith Wharton",        year: "1905" },
  "age-of-innocence":     { title: "The Age of Innocence",              author: "Edith Wharton",        year: "1920" },
  "the-call-of-cthulhu":  { title: "The Call of Cthulhu",               author: "H. P. Lovecraft",      year: "1928" },
  "mountains-of-madness": { title: "At the Mountains of Madness",       author: "H. P. Lovecraft",      year: "1936" },
  "descent-of-man":       { title: "The Descent of Man",                author: "Charles Darwin",       year: "1871" },
  "the-prophet":          { title: "The Prophet",                       author: "Kahlil Gibran",        year: "1923" },
  "beyond-good-and-evil": { title: "Beyond Good and Evil",              author: "Friedrich Nietzsche",  year: "1886" },
  "thus-spoke-zarathustra":{ title: "Thus Spoke Zarathustra",            author: "Friedrich Nietzsche", year: "1883" },
  "herodotus-histories":  { title: "The Histories",                     author: "Herodotus",            year: "c. 440 BCE" },
  "metamorphoses":        { title: "Metamorphoses",                     author: "Ovid",                 year: "8 CE" },
  "aeneid":               { title: "The Aeneid",                        author: "Virgil",               year: "19 BCE" },
  "plutarchs-lives":      { title: "Plutarch's Lives",                  author: "Plutarch",             year: "c. 100 CE" },
  "oresteia":             { title: "The Oresteia",                      author: "Aeschylus",            year: "458 BCE" },
  "candide":              { title: "Candide",                           author: "Voltaire",             year: "1759" },
  "tartuffe":             { title: "Tartuffe",                          author: "Molière",              year: "1664" },
  "red-badge-of-courage": { title: "The Red Badge of Courage",          author: "Stephen Crane",        year: "1895" },
  "sister-carrie":        { title: "Sister Carrie",                     author: "Theodore Dreiser",     year: "1900" },
  "howards-end":          { title: "Howards End",                       author: "E. M. Forster",        year: "1910" },
  "where-angels-fear":    { title: "Where Angels Fear to Tread",        author: "E. M. Forster",        year: "1905" },
  "the-good-soldier":     { title: "The Good Soldier",                  author: "Ford Madox Ford",      year: "1915" },
  "of-human-bondage":     { title: "Of Human Bondage",                  author: "W. Somerset Maugham",  year: "1915" },
  "moon-and-sixpence":    { title: "The Moon and Sixpence",             author: "W. Somerset Maugham",  year: "1919" },
  "emma-mcteague":        { title: "McTeague",                          author: "Frank Norris",         year: "1899" },
  "the-overcoat":         { title: "The Overcoat and Other Stories",    author: "Nikolai Gogol",        year: "1842" },
  "fathers-and-sons":     { title: "Fathers and Sons",                  author: "Ivan Turgenev",        year: "1862" },
  "phantom-of-opera":     { title: "The Phantom of the Opera",          author: "Gaston Leroux",        year: "1910" },
  "penguin-island":       { title: "Penguin Island",                    author: "Anatole France",       year: "1908" },
};

let patched = 0;
for (const [slug, m] of Object.entries(META)) {
  const path = `src/data/books/${slug}.json`;
  if (!fs.existsSync(path)) { console.log("MISSING", slug); continue; }
  const j = JSON.parse(fs.readFileSync(path, "utf8"));
  j.title = m.title; j.author = m.author; j.year = m.year;
  fs.writeFileSync(path, JSON.stringify(j, null, 2));
  patched++;
}

const libPath = "src/data/library.json";
const lib = JSON.parse(fs.readFileSync(libPath, "utf8"));
for (const entry of lib) {
  if (META[entry.slug]) {
    entry.title = META[entry.slug].title;
    entry.author = META[entry.slug].author;
    entry.year = META[entry.slug].year;
  }
}
lib.sort((a, b) => (a.author || "").localeCompare(b.author || "") || (a.title || "").localeCompare(b.title || ""));
fs.writeFileSync(libPath, JSON.stringify(lib, null, 2));

console.log(`Patched ${patched} books. Total library: ${lib.length}.`);
