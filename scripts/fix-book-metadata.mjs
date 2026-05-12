#!/usr/bin/env node
/* Patches author + title fields on books that Gutenberg ingestion
   couldn't parse out of the .txt header. Each entry is a canonical
   well-known classic where the slug + title uniquely identifies
   the work. Re-runnable. */

import fs from "node:fs";
import path from "node:path";

const BOOKS_DIR = "src/data/books";
const INDEX = "src/data/library.json";

/* Per-slug authoritative metadata. title fields use proper title
   case with lowercase articles/prepositions, restored leading
   "The" where canonical. */
const FIX = {
  "aeneid":                   { title: "The Aeneid",                                    author: "Virgil" },
  "age-of-innocence":         { title: "The Age of Innocence",                          author: "Edith Wharton" },
  "anna-karenina":            { title: "Anna Karenina",                                 author: "Leo Tolstoy" },
  "anne-of-avonlea":          { title: "Anne of Avonlea",                               author: "L. M. Montgomery" },
  "beowulf":                  { title: "Beowulf",                                       author: "Anonymous" },
  "black-tulip":              { title: "The Black Tulip",                               author: "Alexandre Dumas" },
  "bleak-house":              { title: "Bleak House",                                   author: "Charles Dickens" },
  "brothers-karamazov":       { title: "The Brothers Karamazov",                        author: "Fyodor Dostoyevsky" },
  "connecticut-yankee":       { title: "A Connecticut Yankee in King Arthur's Court",   author: "Mark Twain" },
  "country-of-blind-wells":   { title: "The Country of the Blind, and Other Stories",   author: "H. G. Wells" },
  "david-copperfield":        { title: "David Copperfield",                             author: "Charles Dickens" },
  "doctor-moreau":            { title: "The Island of Doctor Moreau",                   author: "H. G. Wells" },
  "earth-to-moon":            { title: "From the Earth to the Moon",                    author: "Jules Verne" },
  "emma":                     { title: "Emma",                                          author: "Jane Austen" },
  "ethan-frome":              { title: "Ethan Frome",                                   author: "Edith Wharton" },
  "faust":                    { title: "Faust",                                         author: "Johann Wolfgang von Goethe" },
  "food-of-the-gods":         { title: "The Food of the Gods",                          author: "H. G. Wells" },
  "golden-bowl":              { title: "The Golden Bowl",                               author: "Henry James" },
  "hard-times":               { title: "Hard Times",                                    author: "Charles Dickens" },
  "herodotus-histories":      { title: "The Histories",                                 author: "Herodotus" },
  "hound-of-the-baskervilles":{ title: "The Hound of the Baskervilles",                 author: "Arthur Conan Doyle" },
  "innocents-abroad":         { title: "The Innocents Abroad",                          author: "Mark Twain" },
  "john-barleycorn":          { title: "John Barleycorn",                               author: "Jack London" },
  "julius-caesar":            { title: "Julius Caesar",                                 author: "William Shakespeare" },
  "kidnapped":                { title: "Kidnapped",                                     author: "Robert Louis Stevenson" },
  "kim":                      { title: "Kim",                                           author: "Rudyard Kipling" },
  "king-lear":                { title: "King Lear",                                     author: "William Shakespeare" },
  "land-time-forgot":         { title: "The Land That Time Forgot",                     author: "Edgar Rice Burroughs" },
  "last-of-the-mohicans":     { title: "The Last of the Mohicans",                      author: "James Fenimore Cooper" },
  "legend-sleepy-hollow":     { title: "The Legend of Sleepy Hollow",                   author: "Washington Irving" },
  "les-miserables":           { title: "Les Misérables",                                author: "Victor Hugo" },
  "little-dorrit":            { title: "Little Dorrit",                                 author: "Charles Dickens" },
  "little-lord-fauntleroy":   { title: "Little Lord Fauntleroy",                        author: "Frances Hodgson Burnett" },
  "little-princess":          { title: "A Little Princess",                             author: "Frances Hodgson Burnett" },
  "man-iron-mask":            { title: "The Man in the Iron Mask",                      author: "Alexandre Dumas" },
  "mansfield-park":           { title: "Mansfield Park",                                author: "Jane Austen" },
  "martin-eden":              { title: "Martin Eden",                                   author: "Jack London" },
  "merchant-of-venice":       { title: "The Merchant of Venice",                        author: "William Shakespeare" },
  "middlemarch":              { title: "Middlemarch",                                   author: "George Eliot" },
  "midsummer-nights-dream":   { title: "A Midsummer Night's Dream",                     author: "William Shakespeare" },
  "mrs-warrens-profession":   { title: "Mrs Warren's Profession",                       author: "George Bernard Shaw" },
  "mysterious-affair-styles": { title: "The Mysterious Affair at Styles",               author: "Agatha Christie" },
  "mysterious-island":        { title: "The Mysterious Island",                         author: "Jules Verne" },
  "northanger-abbey":         { title: "Northanger Abbey",                              author: "Jane Austen" },
  "o-pioneers":               { title: "O Pioneers!",                                   author: "Willa Cather" },
  "oliver-goldsmith-vicar":   { title: "The Vicar of Wakefield",                        author: "Oliver Goldsmith" },
  "oresteia":                 { title: "The Oresteia",                                  author: "Aeschylus" },
  "othello":                  { title: "Othello",                                       author: "William Shakespeare" },
  "our-mutual-friend":        { title: "Our Mutual Friend",                             author: "Charles Dickens" },
  "paradise-lost":            { title: "Paradise Lost",                                 author: "John Milton" },
  "persuasion":               { title: "Persuasion",                                    author: "Jane Austen" },
  "phantom-of-opera":         { title: "The Phantom of the Opera",                      author: "Gaston Leroux" },
  "pickwick-papers":          { title: "The Pickwick Papers",                           author: "Charles Dickens" },
  "plutarchs-lives":          { title: "Plutarch's Lives",                              author: "Plutarch" },
  "pollyanna":                { title: "Pollyanna",                                     author: "Eleanor H. Porter" },
  "portrait-artist":          { title: "A Portrait of the Artist as a Young Man",       author: "James Joyce" },
  "princess-of-mars":         { title: "A Princess of Mars",                            author: "Edgar Rice Burroughs" },
  "red-badge-of-courage":     { title: "The Red Badge of Courage",                      author: "Stephen Crane" },
  "return-of-sherlock-holmes":{ title: "The Return of Sherlock Holmes",                 author: "Arthur Conan Doyle" },
  "roughing-it":              { title: "Roughing It",                                   author: "Mark Twain" },
  "sherlock-his-last-bow":    { title: "His Last Bow",                                  author: "Arthur Conan Doyle" },
  "short-stories-poe":        { title: "Short Stories",                                 author: "Edgar Allan Poe" },
  "sign-of-four":             { title: "The Sign of the Four",                          author: "Arthur Conan Doyle" },
  "silas-marner":             { title: "Silas Marner",                                  author: "George Eliot" },
  "sister-carrie":            { title: "Sister Carrie",                                 author: "Theodore Dreiser" },
  "star-rover":               { title: "The Star Rover",                                author: "Jack London" },
  "study-in-scarlet":         { title: "A Study in Scarlet",                            author: "Arthur Conan Doyle" },
  "tales-from-shakespeare":   { title: "Tales from Shakespeare",                        author: "Charles and Mary Lamb" },
  "tarzan-of-the-apes":       { title: "Tarzan of the Apes",                            author: "Edgar Rice Burroughs" },
  "tess-dubervilles":         { title: "Tess of the d'Urbervilles",                     author: "Thomas Hardy" },
  "the-call-of-cthulhu":      { title: "The Call of Cthulhu",                           author: "H. P. Lovecraft" },
  "the-good-soldier":         { title: "The Good Soldier",                              author: "Ford Madox Ford" },
  "the-iliad":                { title: "The Iliad",                                     author: "Homer" },
  "the-iron-heel":            { title: "The Iron Heel",                                 author: "Jack London" },
  "the-jungle":               { title: "The Jungle",                                    author: "Upton Sinclair" },
  "the-lost-world":           { title: "The Lost World",                                author: "Arthur Conan Doyle" },
  "the-moonstone":            { title: "The Moonstone",                                 author: "Wilkie Collins" },
  "the-prophet":              { title: "The Prophet",                                   author: "Kahlil Gibran" },
  "the-republic":             { title: "The Republic",                                  author: "Plato" },
  "the-scarlet-letter":       { title: "The Scarlet Letter",                            author: "Nathaniel Hawthorne" },
  "the-tempest":              { title: "The Tempest",                                   author: "William Shakespeare" },
  "through-the-looking-glass":{ title: "Through the Looking-Glass",                     author: "Lewis Carroll" },
  "turn-of-screw":            { title: "The Turn of the Screw",                         author: "Henry James" },
  "twelfth-night":            { title: "Twelfth Night",                                 author: "William Shakespeare" },
  "twenty-years-after":       { title: "Twenty Years After",                            author: "Alexandre Dumas" },
  "typhoon":                  { title: "Typhoon",                                       author: "Joseph Conrad" },
  "ulysses":                  { title: "Ulysses",                                       author: "James Joyce" },
  "up-from-slavery":          { title: "Up from Slavery",                               author: "Booker T. Washington" },
  "valley-of-fear":           { title: "The Valley of Fear",                            author: "Arthur Conan Doyle" },
  "vanity-fair":              { title: "Vanity Fair",                                   author: "William Makepeace Thackeray" },
  "vicomte-bragelonne":       { title: "The Vicomte de Bragelonne",                     author: "Alexandre Dumas" },
  "white-fang":               { title: "White Fang",                                    author: "Jack London" },
  "wings-of-dove":            { title: "The Wings of the Dove",                         author: "Henry James" },
};

let updated = 0;
const books = JSON.parse(fs.readFileSync(INDEX, "utf8"));
for (const meta of books) {
  const patch = FIX[meta.slug];
  if (!patch) continue;
  const bp = path.join(BOOKS_DIR, meta.slug + ".json");
  if (!fs.existsSync(bp)) continue;
  meta.title = patch.title;
  meta.author = patch.author;
  const j = JSON.parse(fs.readFileSync(bp, "utf8"));
  j.title = patch.title;
  j.author = patch.author;
  fs.writeFileSync(bp, JSON.stringify(j, null, 2));
  updated++;
}
fs.writeFileSync(INDEX, JSON.stringify(books, null, 2));
console.log("Updated metadata on " + updated + " books.");
