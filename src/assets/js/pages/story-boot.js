/* Story Mode -- type your way through a public-domain passage
   word by word. Each correct word advances to the next; the
   passage shows previous words muted and the next words queued. */

import { getActive, updateActive } from "../profiles.js";
import { Analytics } from "../analytics.js";
import { setSoundPrefs, playKey, playMistake, playFinish } from "../engine/sounds.js";

const PASSAGES = [
  { id: "alice-open", title: "Alice's Adventures in Wonderland — opening", source: "Lewis Carroll, 1865",
    text: "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it." },
  { id: "moby-open", title: "Moby Dick — opening", source: "Herman Melville, 1851",
    text: "Call me Ishmael. Some years ago, never mind how long precisely, having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world." },
  { id: "frankenstein-open", title: "Frankenstein — letter one", source: "Mary Shelley, 1818",
    text: "You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings." },
  { id: "dickens-tale", title: "A Tale of Two Cities — opening", source: "Charles Dickens, 1859",
    text: "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness." },
  { id: "austen-pride", title: "Pride and Prejudice — opening", source: "Jane Austen, 1813",
    text: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife." },
  { id: "kafka-meta", title: "The Metamorphosis — opening", source: "Franz Kafka, 1915",
    text: "As Gregor Samsa awoke one morning from uneasy dreams he found himself transformed in his bed into a gigantic insect." },
  { id: "twain-huck", title: "Adventures of Huckleberry Finn — opening", source: "Mark Twain, 1884",
    text: "You don't know about me without you have read a book by the name of The Adventures of Tom Sawyer, but that ain't no matter." },
  { id: "dickens-david", title: "David Copperfield — opening", source: "Charles Dickens, 1850",
    text: "Whether I shall turn out to be the hero of my own life, or whether that station will be held by anybody else, these pages must show." },
  { id: "wilde-dorian", title: "The Picture of Dorian Gray — opening", source: "Oscar Wilde, 1890",
    text: "The studio was filled with the rich odour of roses, and when the light summer wind stirred amidst the trees of the garden, there came through the open door the heavy scent of the lilac, or the more delicate perfume of the pink-flowering thorn." },
  { id: "stevenson-jekyll", title: "Dr Jekyll and Mr Hyde — opening", source: "Robert Louis Stevenson, 1886",
    text: "Mr. Utterson the lawyer was a man of a rugged countenance, that was never lighted by a smile; cold, scanty and embarrassed in discourse; backward in sentiment; lean, long, dusty, dreary." },
  { id: "stoker-dracula", title: "Dracula — journal entry", source: "Bram Stoker, 1897",
    text: "Left Munich at 8:35 P.M., on 1st May, arriving at Vienna early next morning; should have arrived at 6:46, but train was an hour late." },
  { id: "joyce-portrait", title: "A Portrait of the Artist as a Young Man — opening", source: "James Joyce, 1916",
    text: "Once upon a time and a very good time it was there was a moocow coming down along the road and this moocow that was coming down along the road met a nicens little boy named baby tuckoo." },
  { id: "doyle-study", title: "A Study in Scarlet — Watson's account", source: "Arthur Conan Doyle, 1887",
    text: "In the year 1878 I took my degree of Doctor of Medicine of the University of London, and proceeded to Netley to go through the course prescribed for surgeons in the army." },
  { id: "swift-modest", title: "A Modest Proposal — opening", source: "Jonathan Swift, 1729",
    text: "It is a melancholy object to those, who walk through this great town, or travel in the country, when they see the streets, the roads, and cabin-doors, crowded with beggars of the female sex, followed by three, four, or six children." },
  { id: "thoreau-walden", title: "Walden — first paragraph", source: "Henry David Thoreau, 1854",
    text: "When I wrote the following pages, or rather the bulk of them, I lived alone, in the woods, a mile from any neighbor, in a house which I had built myself, on the shore of Walden Pond, in Concord, Massachusetts." },
  { id: "darwin-origin", title: "On the Origin of Species — introduction", source: "Charles Darwin, 1859",
    text: "When on board H.M.S. Beagle, as naturalist, I was much struck with certain facts in the distribution of the inhabitants of South America, and in the geological relations of the present to the past inhabitants of that continent." },
  { id: "shelley-mont", title: "Mont Blanc (excerpt)", source: "Percy Bysshe Shelley, 1817",
    text: "The everlasting universe of things flows through the mind, and rolls its rapid waves, now dark — now glittering — now reflecting gloom — now lending splendour, where from secret springs the source of human thought its tribute brings." },
  { id: "hardy-darkling", title: "The Darkling Thrush (opening)", source: "Thomas Hardy, 1900",
    text: "I leant upon a coppice gate when Frost was spectre-grey, and Winter's dregs made desolate the weakening eye of day." },
  { id: "wharton-mirth", title: "The House of Mirth — opening", source: "Edith Wharton, 1905",
    text: "Selden paused in surprise. In the afternoon rush of the Grand Central Station his eyes had been refreshed by the sight of Miss Lily Bart." },
  { id: "conrad-darkness", title: "Heart of Darkness — opening", source: "Joseph Conrad, 1899",
    text: "The Nellie, a cruising yawl, swung to her anchor without a flutter of the sails, and was at rest." },
  { id: "verne-leagues", title: "Twenty Thousand Leagues Under the Sea — opening", source: "Jules Verne, 1870",
    text: "The year 1866 was signalised by a remarkable incident, a mysterious and inexplicable phenomenon, which doubtless no one has yet forgotten." },
  { id: "hugo-miserables", title: "Les Misérables — opening", source: "Victor Hugo, 1862",
    text: "In 1815, Monseigneur Charles François Bienvenu Myriel was Bishop of Digne. He was a man about seventy-five years of age; he had occupied the see of Digne since 1806." },
  { id: "burroughs-tarzan", title: "Tarzan of the Apes — opening", source: "Edgar Rice Burroughs, 1912",
    text: "I had this story from one who had no business to tell it to me, or to any other. I may credit the seductive influence of an old vintage upon the narrator for the beginning of it." },
  { id: "london-call", title: "The Call of the Wild — opening", source: "Jack London, 1903",
    text: "Buck did not read the newspapers, or he would have known that trouble was brewing, not alone for himself, but for every tide-water dog, strong of muscle and with warm, long hair." },
  { id: "burnett-secret", title: "The Secret Garden — opening", source: "Frances Hodgson Burnett, 1911",
    text: "When Mary Lennox was sent to Misselthwaite Manor to live with her uncle everybody said she was the most disagreeable-looking child ever seen." },
  { id: "homer-iliad", title: "The Iliad — invocation", source: "Homer (Pope translation)",
    text: "Sing, O goddess, the anger of Achilles son of Peleus, that brought countless ills upon the Achaeans." },
  { id: "lovecraft-cthulhu", title: "The Call of Cthulhu — opening", source: "H. P. Lovecraft, 1928",
    text: "The most merciful thing in the world, I think, is the inability of the human mind to correlate all its contents." },
  { id: "twain-tom", title: "The Adventures of Tom Sawyer — opening", source: "Mark Twain, 1876",
    text: "Tom! No answer. Tom! No answer. What's gone with that boy, I wonder? You TOM! No answer." },
  { id: "wilde-importance", title: "The Importance of Being Earnest — opening", source: "Oscar Wilde, 1895",
    text: "Algernon. Did you hear what I was playing, Lane? Lane. I didn't think it polite to listen, sir. Algernon. I'm sorry for that, for your sake." },
  { id: "carroll-jabber", title: "Jabberwocky — opening stanza", source: "Lewis Carroll, 1871",
    text: "'Twas brillig, and the slithy toves did gyre and gimble in the wabe; all mimsy were the borogoves, and the mome raths outgrabe." },
];

let passage = null;
let words = [];
let cursor = 0;
let running = false;
let startTs = 0;
let correctChars = 0;
let totalChars = 0;
let lastIndex = -1;

const profile = getActive();
const sourceEl = document.getElementById("story-source");
const prevEl = document.getElementById("story-prev");
const curEl = document.getElementById("story-cur");
const nextEl = document.getElementById("story-next");
const input = document.getElementById("game-input");
const startBtn = document.getElementById("game-start");
const skipBtn = document.getElementById("game-skip");
const resetBtn = document.getElementById("game-reset");
const progressEl = document.querySelector("[data-progress]");
const wpmEl = document.querySelector("[data-wpm]");
const accEl = document.querySelector("[data-acc]");
const wordsEl = document.querySelector("[data-words]");
const bestEl = document.querySelector("[data-best]");

function readBest() {
  const fresh = getActive() || {};
  const gs = fresh.gameStats || {};
  return (gs.byMode || {}).story || { highScore: 0, bestStreak: 0 };
}

function pickPassage() {
  let idx;
  do { idx = Math.floor(Math.random() * PASSAGES.length); } while (idx === lastIndex && PASSAGES.length > 1);
  lastIndex = idx;
  return PASSAGES[idx];
}

function paintPrompt() {
  if (!words.length) return;
  prevEl.textContent = words.slice(Math.max(0, cursor - 5), cursor).join(" ");
  curEl.textContent = words[cursor] || "";
  nextEl.textContent = words.slice(cursor + 1, cursor + 8).join(" ");
}

function paintStats() {
  const pct = words.length ? Math.round((cursor / words.length) * 100) : 0;
  progressEl.textContent = pct + "%";
  const elapsedMs = startTs ? performance.now() - startTs : 0;
  const wpm = elapsedMs > 0 ? Math.round((correctChars / 5) / (elapsedMs / 60000)) : 0;
  wpmEl.textContent = String(wpm);
  const acc = totalChars > 0 ? Math.round((correctChars / totalChars) * 100) : 100;
  accEl.textContent = acc + "%";
  wordsEl.textContent = String(cursor);
  bestEl.textContent = String(readBest().highScore || 0);
}

function startRound() {
  passage = pickPassage();
  words = passage.text.split(/\s+/).filter(Boolean);
  cursor = 0;
  correctChars = 0;
  totalChars = 0;
  running = true;
  startTs = performance.now();
  sourceEl.textContent = passage.title + " — " + passage.source;
  startBtn.hidden = true;
  skipBtn.hidden = false;
  resetBtn.hidden = false;
  input.value = "";
  input.focus({ preventScroll: true });
  Analytics.gameStart({ mode: "story", speed: 1 });
  paintPrompt();
  paintStats();
}

function finishPassage() {
  running = false;
  const elapsedMs = performance.now() - startTs;
  const wpm = elapsedMs > 0 ? Math.round((correctChars / 5) / (elapsedMs / 60000)) : 0;
  const acc = totalChars > 0 ? Math.round((correctChars / totalChars) * 100) : 100;
  Analytics.gameOver({ mode: "story", score: wpm, caught: cursor, missed: words.length - cursor, bestStreak: 0, speed: 1 });
  let isNewBest = false;
  try {
    updateActive((p) => {
      p.gameStats = p.gameStats || { rounds: 0, totalCaught: 0 };
      p.gameStats.byMode = p.gameStats.byMode || {};
      const m = p.gameStats.byMode.story || { highScore: 0, bestStreak: 0, rounds: 0, totalCaught: 0 };
      if (wpm > m.highScore) { m.highScore = wpm; isNewBest = true; }
      m.rounds = (m.rounds || 0) + 1;
      m.totalCaught = (m.totalCaught || 0) + cursor;
      m.lastPlayedAt = new Date().toISOString();
      p.gameStats.byMode.story = m;
      return p;
    });
  } catch {}
  if (isNewBest) try { Analytics.gameNewBest({ mode: "story", score: wpm }); } catch {}
  playFinish();
  curEl.textContent = "✓ Passage complete!";
  prevEl.textContent = "";
  nextEl.textContent = `${wpm} wpm · ${acc}% accuracy`;
  startBtn.textContent = "Next passage";
  startBtn.hidden = false;
  skipBtn.hidden = true;
  try { input.blur(); } catch {}
}

function reset() {
  running = false;
  cursor = 0;
  words = [];
  correctChars = 0;
  totalChars = 0;
  startTs = 0;
  passage = null;
  sourceEl.textContent = "Choose a passage and start typing.";
  prevEl.textContent = "";
  curEl.textContent = "Tap Start to begin.";
  nextEl.textContent = "";
  input.value = "";
  startBtn.textContent = "Start";
  startBtn.hidden = false;
  skipBtn.hidden = true;
  resetBtn.hidden = true;
  paintStats();
}

input.addEventListener("input", () => {
  if (!running) return;
  const v = input.value;
  const target = words[cursor] || "";
  if (v.endsWith(" ")) {
    const typed = v.trim();
    if (typed === target) {
      correctChars += target.length + 1;
      totalChars += target.length + 1;
      cursor++;
      playKey();
      input.value = "";
      paintPrompt();
      paintStats();
      if (cursor >= words.length) { finishPassage(); return; }
    } else {
      totalChars += target.length + 1;
      playMistake();
      input.value = "";
      paintStats();
    }
    return;
  }
  if (v && !target.startsWith(v)) {
    // Soft mistake: clear input but DON'T advance.
    totalChars += v.length;
    playMistake();
    input.value = "";
    paintStats();
  }
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const target = words[cursor] || "";
    if (input.value.trim() === target) {
      correctChars += target.length + 1;
      totalChars += target.length + 1;
      cursor++;
      playKey();
      input.value = "";
      paintPrompt();
      paintStats();
      if (cursor >= words.length) finishPassage();
    }
    e.preventDefault();
  }
});

startBtn.addEventListener("click", startRound);
skipBtn.addEventListener("click", () => { reset(); startRound(); });
resetBtn.addEventListener("click", reset);

setSoundPrefs({
  theme: (profile.preferences && profile.preferences.soundTheme) || "off",
  volume: (profile.preferences && profile.preferences.soundVolume) || 0.5,
});
paintStats();
