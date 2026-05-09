import fs from "node:fs";

const META = {
  "germinal":              { title: "Germinal",                              author: "Émile Zola",            year: "1885" },
  "therese-raquin":        { title: "Thérèse Raquin",                        author: "Émile Zola",            year: "1867" },
  "red-and-black":         { title: "The Red and the Black",                 author: "Stendhal",              year: "1830" },
  "pere-goriot":           { title: "Père Goriot",                           author: "Honoré de Balzac",      year: "1835" },
  "eugenie-grandet":       { title: "Eugénie Grandet",                       author: "Honoré de Balzac",      year: "1833" },
  "dead-souls":            { title: "Dead Souls",                            author: "Nikolai Gogol",         year: "1842" },
  "demons":                { title: "Demons",                                author: "Fyodor Dostoevsky",     year: "1872" },
  "cherry-orchard":        { title: "The Cherry Orchard",                    author: "Anton Chekhov",         year: "1904" },
  "three-sisters-chekhov": { title: "Three Sisters",                         author: "Anton Chekhov",         year: "1900" },
  "uncle-vanya":           { title: "Uncle Vanya",                           author: "Anton Chekhov",         year: "1898" },
  "seagull-chekhov":       { title: "The Seagull",                           author: "Anton Chekhov",         year: "1895" },
  "taras-bulba":           { title: "Taras Bulba",                           author: "Nikolai Gogol",         year: "1835" },
  "werther":               { title: "The Sorrows of Young Werther",          author: "Johann Wolfgang von Goethe", year: "1774" },
  "way-of-all-flesh":      { title: "The Way of All Flesh",                  author: "Samuel Butler",         year: "1903" },
  "erewhon":               { title: "Erewhon",                               author: "Samuel Butler",         year: "1872" },
  "moll-flanders":         { title: "Moll Flanders",                         author: "Daniel Defoe",          year: "1722" },
  "tom-jones":             { title: "The History of Tom Jones, a Foundling", author: "Henry Fielding",        year: "1749" },
  "tristram-shandy":       { title: "The Life and Opinions of Tristram Shandy, Gentleman", author: "Laurence Sterne", year: "1759" },
  "evelina":               { title: "Evelina",                               author: "Frances Burney",        year: "1778" },
  "forsyte-saga":          { title: "The Forsyte Saga",                      author: "John Galsworthy",       year: "1922" },
  "typee":                 { title: "Typee",                                 author: "Herman Melville",       year: "1846" },
  "billy-budd":            { title: "Billy Budd, Sailor",                    author: "Herman Melville",       year: "1924" },
  "country-pointed-firs":  { title: "The Country of the Pointed Firs",       author: "Sarah Orne Jewett",     year: "1896" },
  "maggie-girl-streets":   { title: "Maggie: A Girl of the Streets",         author: "Stephen Crane",         year: "1893" },
  "financier-dreiser":     { title: "The Financier",                         author: "Theodore Dreiser",      year: "1912" },
  "princess-casamassima":  { title: "The Princess Casamassima",              author: "Henry James",           year: "1886" },
  "what-maisie-knew":      { title: "What Maisie Knew",                      author: "Henry James",           year: "1897" },
  "puddnhead-wilson":      { title: "Pudd'nhead Wilson",                     author: "Mark Twain",            year: "1894" },
  "tom-sawyer-abroad":     { title: "Tom Sawyer Abroad",                     author: "Mark Twain",            year: "1894" },
  "joan-of-arc-twain":     { title: "Personal Recollections of Joan of Arc", author: "Mark Twain",            year: "1896" },
  "following-the-equator": { title: "Following the Equator",                 author: "Mark Twain",            year: "1897" },
  "ozma-of-oz":            { title: "Ozma of Oz",                            author: "L. Frank Baum",         year: "1907" },
  "land-of-oz":            { title: "The Marvelous Land of Oz",              author: "L. Frank Baum",         year: "1904" },
  "five-children-and-it":  { title: "Five Children and It",                  author: "E. Nesbit",             year: "1902" },
  "railway-children":      { title: "The Railway Children",                  author: "E. Nesbit",             year: "1906" },
  "princess-and-goblin":   { title: "The Princess and the Goblin",           author: "George MacDonald",      year: "1872" },
  "hans-brinker":          { title: "Hans Brinker, or The Silver Skates",    author: "Mary Mapes Dodge",      year: "1865" },
  "son-of-tarzan":         { title: "The Son of Tarzan",                     author: "Edgar Rice Burroughs",  year: "1914" },
  "thuvia-maid-mars":      { title: "Thuvia, Maid of Mars",                  author: "Edgar Rice Burroughs",  year: "1916" },
  "at-earths-core":        { title: "At the Earth's Core",                   author: "Edgar Rice Burroughs",  year: "1914" },
  "five-weeks-balloon":    { title: "Five Weeks in a Balloon",               author: "Jules Verne",           year: "1863" },
  "when-sleeper-wakes":    { title: "When the Sleeper Wakes",                author: "H. G. Wells",           year: "1899" },
  "first-men-moon":        { title: "The First Men in the Moon",             author: "H. G. Wells",           year: "1901" },
  "tono-bungay":           { title: "Tono-Bungay",                           author: "H. G. Wells",           year: "1909" },
  "man-who-was-thursday":  { title: "The Man Who Was Thursday",              author: "G. K. Chesterton",      year: "1908" },
  "innocence-father-brown":{ title: "The Innocence of Father Brown",         author: "G. K. Chesterton",      year: "1911" },
  "39-steps":              { title: "The Thirty-Nine Steps",                 author: "John Buchan",           year: "1915" },
  "riddle-of-sands":       { title: "The Riddle of the Sands",               author: "Erskine Childers",      year: "1903" },
  "secret-adversary":      { title: "The Secret Adversary",                  author: "Agatha Christie",       year: "1922" },
  "doctor-faustus-marlowe":{ title: "The Tragical History of Doctor Faustus",author: "Christopher Marlowe",   year: "1604" },
  "spoon-river-anthology": { title: "Spoon River Anthology",                 author: "Edgar Lee Masters",     year: "1915" },
  "gitanjali":             { title: "Gitanjali",                             author: "Rabindranath Tagore",   year: "1912" },
  "on-liberty-mill":       { title: "On Liberty",                            author: "John Stuart Mill",      year: "1859" },
  "hedda-gabler":          { title: "Hedda Gabler",                          author: "Henrik Ibsen",          year: "1890" },
  "peer-gynt":             { title: "Peer Gynt",                             author: "Henrik Ibsen",          year: "1867" },
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
