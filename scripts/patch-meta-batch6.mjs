import fs from "node:fs";

const META = {
  "turn-of-screw":        { title: "The Turn of the Screw",                author: "Henry James",          year: "1898" },
  "golden-bowl":          { title: "The Golden Bowl",                      author: "Henry James",          year: "1904" },
  "ambassadors":          { title: "The Ambassadors",                      author: "Henry James",          year: "1903" },
  "wings-of-dove":        { title: "The Wings of the Dove",                author: "Henry James",          year: "1902" },
  "washington-square":    { title: "Washington Square",                    author: "Henry James",          year: "1880" },
  "roderick-hudson":      { title: "Roderick Hudson",                      author: "Henry James",          year: "1875" },
  "the-bostonians":       { title: "The Bostonians",                       author: "Henry James",          year: "1886" },
  "beasts-of-tarzan":     { title: "The Beasts of Tarzan",                 author: "Edgar Rice Burroughs", year: "1914" },
  "return-of-tarzan":     { title: "The Return of Tarzan",                 author: "Edgar Rice Burroughs", year: "1913" },
  "gods-of-mars":         { title: "The Gods of Mars",                     author: "Edgar Rice Burroughs", year: "1913" },
  "warlord-mars":         { title: "The Warlord of Mars",                  author: "Edgar Rice Burroughs", year: "1914" },
  "land-time-forgot":     { title: "The Land That Time Forgot",            author: "Edgar Rice Burroughs", year: "1918" },
  "penrod":               { title: "Penrod",                               author: "Booth Tarkington",     year: "1914" },
  "seventeen":            { title: "Seventeen",                            author: "Booth Tarkington",     year: "1916" },
  "magnificent-ambersons":{ title: "The Magnificent Ambersons",            author: "Booth Tarkington",     year: "1918" },
  "the-iron-heel":        { title: "The Iron Heel",                        author: "Jack London",          year: "1908" },
  "star-rover":           { title: "The Star Rover",                       author: "Jack London",          year: "1915" },
  "sea-wolf":             { title: "The Sea-Wolf",                         author: "Jack London",          year: "1904" },
  "martin-eden":          { title: "Martin Eden",                          author: "Jack London",          year: "1909" },
  "john-barleycorn":      { title: "John Barleycorn",                      author: "Jack London",          year: "1913" },
  "six-records":          { title: "Six Records of a Floating Life",       author: "Shen Fu",              year: "1809" },
  "ulysses":              { title: "Ulysses",                              author: "James Joyce",          year: "1922" },
  "portrait-artist":      { title: "A Portrait of the Artist as a Young Man", author: "James Joyce",       year: "1916" },
  "dubliners":            { title: "Dubliners",                            author: "James Joyce",          year: "1914" },
  "green-mansions":       { title: "Green Mansions",                       author: "W. H. Hudson",         year: "1904" },
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
