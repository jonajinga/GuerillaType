import fs from "node:fs";

const META = {
  "silas-marner":           { title: "Silas Marner",                       author: "George Eliot",          year: "1861" },
  "mill-on-the-floss":      { title: "The Mill on the Floss",              author: "George Eliot",          year: "1860" },
  "adam-bede":              { title: "Adam Bede",                          author: "George Eliot",          year: "1859" },
  "romola":                 { title: "Romola",                             author: "George Eliot",          year: "1863" },
  "felix-holt":             { title: "Felix Holt, the Radical",            author: "George Eliot",          year: "1866" },
  "oliver-goldsmith-vicar": { title: "The Vicar of Wakefield",             author: "Oliver Goldsmith",      year: "1766" },
  "the-coral-island":       { title: "The Coral Island",                   author: "R. M. Ballantyne",      year: "1857" },
  "black-tulip":            { title: "The Black Tulip",                    author: "Alexandre Dumas",       year: "1850" },
  "twenty-years-after":     { title: "Twenty Years After",                 author: "Alexandre Dumas",       year: "1845" },
  "vicomte-bragelonne":     { title: "The Vicomte de Bragelonne",          author: "Alexandre Dumas",       year: "1847" },
  "man-iron-mask":          { title: "The Man in the Iron Mask",           author: "Alexandre Dumas",       year: "1850" },
  "nicholas-nickleby":      { title: "Nicholas Nickleby",                  author: "Charles Dickens",       year: "1839" },
  "old-curiosity-shop":     { title: "The Old Curiosity Shop",             author: "Charles Dickens",       year: "1841" },
  "little-dorrit":          { title: "Little Dorrit",                      author: "Charles Dickens",       year: "1857" },
  "our-mutual-friend":      { title: "Our Mutual Friend",                  author: "Charles Dickens",       year: "1865" },
  "martin-chuzzlewit":      { title: "Martin Chuzzlewit",                  author: "Charles Dickens",       year: "1844" },
  "barnaby-rudge":          { title: "Barnaby Rudge",                      author: "Charles Dickens",       year: "1841" },
  "dombey-and-son":         { title: "Dombey and Son",                     author: "Charles Dickens",       year: "1848" },
  "mrs-warrens-profession": { title: "Mrs. Warren's Profession",           author: "George Bernard Shaw",   year: "1893" },
  "arms-and-the-man":       { title: "Arms and the Man",                   author: "George Bernard Shaw",   year: "1894" },
  "caesar-cleopatra":       { title: "Caesar and Cleopatra",               author: "George Bernard Shaw",   year: "1898" },
  "major-barbara":          { title: "Major Barbara",                      author: "George Bernard Shaw",   year: "1905" },
  "heartbreak-house":       { title: "Heartbreak House",                   author: "George Bernard Shaw",   year: "1919" },
  "short-stories-poe":      { title: "Tales of Mystery and Imagination",   author: "Edgar Allan Poe",       year: "1845" },
  "fall-of-house-usher":    { title: "The Fall of the House of Usher and Other Tales", author: "Edgar Allan Poe", year: "1839" },
  "sherlock-his-last-bow":  { title: "His Last Bow",                       author: "Arthur Conan Doyle",    year: "1917" },
  "country-of-blind-wells": { title: "The Country of the Blind, and Other Stories", author: "H. G. Wells", year: "1911" },
  "food-of-the-gods":       { title: "The Food of the Gods",               author: "H. G. Wells",           year: "1904" },
  "arabian-nights":         { title: "The Thousand and One Nights",        author: "Anonymous",             year: "c. 1450" },
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
