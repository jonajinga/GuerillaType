import fs from "node:fs";

const path = "src/data/quotes.json";
const cur = JSON.parse(fs.readFileSync(path, "utf8"));
const have = new Set(cur.map(q => q.text.toLowerCase().trim().slice(0, 60)));
const idHave = new Set(cur.map(q => q.id));

const NEW = [
  { id: "q-james-w-action", text: "Act as if what you do makes a difference. It does.", author: "William James", tags: ["action"] },
  { id: "q-james-w-attitude", text: "The greatest discovery of my generation is that human beings can alter their lives by altering their attitudes of mind.", author: "William James", tags: ["mindset"] },
  { id: "q-dewey-democracy", text: "Democracy must be born anew every generation, and education is its midwife.", author: "John Dewey", tags: ["education"] },
  { id: "q-dewey-experience", text: "Education is not preparation for life; education is life itself.", author: "John Dewey", tags: ["education"] },
  { id: "q-thoreau-walden", text: "I went to the woods because I wished to live deliberately, to front only the essential facts of life.", author: "Henry David Thoreau", tags: ["nature"] },
  { id: "q-thoreau-time", text: "As if you could kill time without injuring eternity.", author: "Henry David Thoreau", tags: ["time"] },
  { id: "q-emerson-tread", text: "Do not go where the path may lead, go instead where there is no path and leave a trail.", author: "Ralph Waldo Emerson", tags: ["originality"] },
  { id: "q-emerson-character", text: "What you do speaks so loudly that I cannot hear what you say.", author: "Ralph Waldo Emerson", tags: ["action"] },
  { id: "q-orwell-1984-truth", text: "The further a society drifts from truth, the more it will hate those who speak it.", author: "George Orwell (attributed)", tags: ["truth"] },
  { id: "q-orwell-saint", text: "Saints should always be judged guilty until they are proved innocent.", author: "George Orwell", tags: ["skepticism"] },
  { id: "q-huxley-time", text: "There is only one corner of the universe you can be certain of improving, and that's your own self.", author: "Aldous Huxley", tags: ["self"] },
  { id: "q-huxley-doors", text: "If the doors of perception were cleansed every thing would appear to man as it is, infinite.", author: "William Blake", tags: ["perception"] },
  { id: "q-eliot-george", text: "It is never too late to be what you might have been.", author: "George Eliot", tags: ["growth"] },
  { id: "q-eliot-george-time", text: "Our deeds determine us, as much as we determine our deeds.", author: "George Eliot", tags: ["action"] },
  { id: "q-cather-life", text: "There are some things you learn best in calm, and some in storm.", author: "Willa Cather", tags: ["learning"] },
  { id: "q-wharton-mirror", text: "If only we'd stop trying to be happy we could have a pretty good time.", author: "Edith Wharton", tags: ["happiness"] },
  { id: "q-james-h-experience", text: "Live all you can; it's a mistake not to.", author: "Henry James", tags: ["life"] },
  { id: "q-james-h-house", text: "The house of fiction has many windows.", author: "Henry James", tags: ["writing"] },
  { id: "q-london-living", text: "I would rather be ashes than dust!", author: "Jack London", tags: ["intensity"] },
  { id: "q-london-imagination", text: "Life is not always a matter of holding good cards, but sometimes, playing a poor hand well.", author: "Jack London", tags: ["resilience"] },
  { id: "q-fitzgerald-decade", text: "There are no second acts in American lives.", author: "F. Scott Fitzgerald", tags: ["life"] },
  { id: "q-fitzgerald-soul", text: "Show me a hero and I'll write you a tragedy.", author: "F. Scott Fitzgerald", tags: ["literature"] },
  { id: "q-faulkner-immortal", text: "I believe that man will not merely endure: he will prevail.", author: "William Faulkner", tags: ["resilience"] },
  { id: "q-steinbeck-grapes", text: "Whenever they's a fight so hungry people can eat, I'll be there.", author: "John Steinbeck", tags: ["solidarity"] },
  { id: "q-steinbeck-east", text: "All war is a symptom of man's failure as a thinking animal.", author: "John Steinbeck", tags: ["war"] },
  { id: "q-baldwin-fire", text: "Love takes off masks that we fear we cannot live without and know we cannot live within.", author: "James Baldwin", tags: ["love"] },
  { id: "q-morrison-bird", text: "If you are free, you need to free somebody else.", author: "Toni Morrison", tags: ["freedom"] },
  { id: "q-walker-purple", text: "I think it pisses God off if you walk by the color purple in a field somewhere and don't notice it.", author: "Alice Walker", tags: ["beauty"] },
  { id: "q-angelou-still", text: "You may write me down in history with your bitter, twisted lies, You may trod me in the very dirt but still, like dust, I'll rise.", author: "Maya Angelou", tags: ["resilience"] },
  { id: "q-angelou-survive", text: "I can be changed by what happens to me. But I refuse to be reduced by it.", author: "Maya Angelou", tags: ["resilience"] },
  { id: "q-orwell-1984-power", text: "If you want a picture of the future, imagine a boot stamping on a human face -- forever.", author: "George Orwell", tags: ["politics"] },
  { id: "q-borges-library", text: "When writers die they become books, which is, after all, not too bad an incarnation.", author: "Jorge Luis Borges", tags: ["writing"] },
  { id: "q-marquez-talk", text: "What matters in life is not what happens to you but what you remember.", author: "Gabriel García Márquez", tags: ["memory"] },
  { id: "q-eco-name", text: "We live for books. A sweet mission in this world dominated by disorder and decay.", author: "Umberto Eco", tags: ["books"] },
  { id: "q-camus-absurd", text: "There is but one truly serious philosophical problem, and that is suicide.", author: "Albert Camus", tags: ["philosophy"] },
  { id: "q-sartre-no-exit", text: "Freedom is what you do with what's been done to you.", author: "Jean-Paul Sartre", tags: ["freedom"] },
  { id: "q-beauvoir-old", text: "One's life has value so long as one attributes value to the life of others.", author: "Simone de Beauvoir", tags: ["meaning"] },
  { id: "q-arendt-action", text: "Storytelling reveals meaning without committing the error of defining it.", author: "Hannah Arendt", tags: ["narrative"] },
  { id: "q-frankl-suffering", text: "When we are no longer able to change a situation, we are challenged to change ourselves.", author: "Viktor Frankl", tags: ["resilience"] },
  { id: "q-frankl-meaning", text: "Those who have a why to live, can bear with almost any how.", author: "Viktor Frankl (after Nietzsche)", tags: ["meaning"] },
  { id: "q-jung-shadow", text: "There is no coming to consciousness without pain.", author: "Carl Jung", tags: ["growth"] },
  { id: "q-jung-self", text: "The privilege of a lifetime is to become who you truly are.", author: "Carl Jung", tags: ["self"] },
  { id: "q-freud-dreams", text: "Dreams are the royal road to the unconscious.", author: "Sigmund Freud", tags: ["psychology"] },
  { id: "q-rogers-good", text: "The good life is a process, not a state of being. It is a direction not a destination.", author: "Carl Rogers", tags: ["growth"] },
  { id: "q-maslow-hammer", text: "If the only tool you have is a hammer, you tend to see every problem as a nail.", author: "Abraham Maslow", tags: ["perspective"] },
  { id: "q-skinner-shaping", text: "A failure is not always a mistake; it may simply be the best one can do under the circumstances.", author: "B. F. Skinner", tags: ["resilience"] },
  { id: "q-pascal-heart", text: "The heart has its reasons of which reason knows nothing.", author: "Blaise Pascal", tags: ["heart"] },
  { id: "q-pascal-room", text: "All of humanity's problems stem from man's inability to sit quietly in a room alone.", author: "Blaise Pascal", tags: ["solitude"] },
  { id: "q-russell-fanatic2", text: "Fanaticism consists of redoubling your efforts when you have forgotten your aim.", author: "George Santayana", tags: ["fanaticism"] },
  { id: "q-santayana-history", text: "Those who cannot remember the past are condemned to repeat it.", author: "George Santayana", tags: ["history"] },
  { id: "q-frost-poem-comma", text: "I have been one acquainted with the night.", author: "Robert Frost", tags: ["solitude"] },
  { id: "q-frost-fences", text: "Good fences make good neighbors.", author: "Robert Frost", tags: ["boundaries"] },
  { id: "q-yeats-dance", text: "How can we know the dancer from the dance?", author: "William Butler Yeats", tags: ["art"] },
  { id: "q-eliot-ts-time", text: "Time present and time past are both perhaps present in time future.", author: "T. S. Eliot", tags: ["time"] },
  { id: "q-eliot-ts-love", text: "We shall not cease from exploration, and the end of all our exploring will be to arrive where we started and know the place for the first time.", author: "T. S. Eliot", tags: ["journey"] },
  { id: "q-keats-truth-beauty", text: "Beauty is truth, truth beauty, -- that is all ye know on earth, and all ye need to know.", author: "John Keats", tags: ["beauty","truth"] },
  { id: "q-shelley-power", text: "Look on my works, ye Mighty, and despair!", author: "Percy Bysshe Shelley", tags: ["power"] },
  { id: "q-byron-mad", text: "She walks in beauty, like the night of cloudless climes and starry skies.", author: "Lord Byron", tags: ["beauty"] },
  { id: "q-wordsworth-emotion", text: "Poetry is the spontaneous overflow of powerful feelings: it takes its origin from emotion recollected in tranquillity.", author: "William Wordsworth", tags: ["poetry"] },
  { id: "q-coleridge-water", text: "Water, water, every where, nor any drop to drink.", author: "Samuel Taylor Coleridge", tags: ["irony"] },
  { id: "q-burns-mice", text: "The best laid schemes of mice and men go often awry.", author: "Robert Burns", tags: ["fate"] },
  { id: "q-keats-thing", text: "A thing of beauty is a joy forever.", author: "John Keats", tags: ["beauty"] },
  { id: "q-emily-dickinson-bird", text: "I'm Nobody! Who are you? Are you -- Nobody -- too?", author: "Emily Dickinson", tags: ["identity"] },
  { id: "q-dickinson-truth-slant", text: "Tell all the truth but tell it slant.", author: "Emily Dickinson", tags: ["truth"] },
  { id: "q-whitman-multitudes2", text: "Do I contradict myself? Very well then I contradict myself, (I am large, I contain multitudes.)", author: "Walt Whitman", tags: ["self"] },
  { id: "q-tagore-quote", text: "You can't cross the sea merely by standing and staring at the water.", author: "Rabindranath Tagore", tags: ["action"] },
  { id: "q-mandela-anger", text: "Resentment is like drinking poison and then hoping it will kill your enemies.", author: "Nelson Mandela", tags: ["forgiveness"] },
  { id: "q-mandela-impossible", text: "It always seems impossible until it's done.", author: "Nelson Mandela", tags: ["determination"] },
  { id: "q-confucius-music", text: "Music produces a kind of pleasure which human nature cannot do without.", author: "Confucius", tags: ["music"] },
  { id: "q-confucius-revenge", text: "Before you embark on a journey of revenge, dig two graves.", author: "Confucius (attributed)", tags: ["revenge"] },
  { id: "q-stevens-boredom", text: "Boredom is the dream bird that hatches the egg of experience.", author: "Walter Benjamin", tags: ["boredom"] },
  { id: "q-mlk-bend", text: "The arc of the moral universe is long, but it bends toward justice.", author: "Martin Luther King Jr.", tags: ["justice"] },
];

const added = NEW.filter(q =>
  !idHave.has(q.id) &&
  !have.has(q.text.toLowerCase().trim().slice(0, 60))
);
const out = [...cur, ...added];
fs.writeFileSync(path, JSON.stringify(out, null, 2));
console.log(`Added ${added.length} quotes. Total: ${out.length}.`);
