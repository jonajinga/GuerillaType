/* Megamenu definition. Each section has THREE groups (rendered as a
   3-column grid on wide viewports). Hamburger panel + footer iterate
   the same data so links stay in sync across components.

   Counts (lessons, achievements, challenges, drills) are computed at
   build time from the source data so descriptions stay in sync as
   content grows. */

import lessons from "./lessons.js";
import drills from "./drills.js";
import challenges from "./challenges.js";
import { ACHIEVEMENTS } from "../assets/js/engine/achievements.js";

const N_LESSONS = lessons.length;
const N_DRILLS = drills.length;
const N_CHALLENGES = challenges.length;
const N_ACHIEVEMENTS = ACHIEVEMENTS.length;
const N_ACH_GROUPS = new Set(ACHIEVEMENTS.map((a) => a.group)).size;
const MID_LESSON = Math.max(1, Math.floor(N_LESSONS / 2));

const megamenu = [
  {
    label: "Practice",
    url: "/practice/",
    groups: [
      {
        title: "Quick start",
        items: [
          { chip: "Q", label: "Today's quote", url: "/practice/?mode=quote&quote=daily", desc: "One curated quote per day, shared by all visitors." },
          { chip: "15", label: "15-second sprint", url: "/practice/?mode=time&duration=15", desc: "Fastest warm-up. One short burst." },
          { chip: "30", label: "30-second test", url: "/practice/?mode=time&duration=30", desc: "The classic warm-up -- type as much as you can." },
          { chip: "60", label: "60-second test", url: "/practice/?mode=time&duration=60", desc: "A common benchmark length." },
          { chip: "2m", label: "2-minute test", url: "/practice/?mode=time&duration=120", desc: "Tests sustained pace." },
          { chip: "5m", label: "5-minute test", url: "/practice/?mode=time&duration=300", desc: "Endurance. Holds attention longer than a sprint." },
          { chip: "Z", label: "Zen mode", url: "/practice/?mode=zen", desc: "Untimed. Stop when you stop." },
        ],
      },
      {
        title: "Pick a mode",
        items: [
          { chip: "T", label: "Time mode", url: "/practice/?mode=time&duration=30", desc: "Type freely, ends when the clock runs out." },
          { chip: "10", label: "Words: 10", url: "/practice/?mode=words&words=10", desc: "Short fixed count -- sentence-length burst." },
          { chip: "25", label: "Words: 25", url: "/practice/?mode=words&words=25", desc: "Default words mode." },
          { chip: "50", label: "Words: 50", url: "/practice/?mode=words&words=50", desc: "Mid-length fixed count." },
          { chip: "100", label: "Words: 100", url: "/practice/?mode=words&words=100", desc: "Long-form fixed count." },
          { chip: "❝", label: "Quote", url: "/practice/?mode=quote", desc: "Curated literary quotes, four length buckets." },
          { chip: "C", label: "Custom text", url: "/custom/", desc: "Drop a file, paste a chapter, type through it." },
        ],
      },
      {
        title: "Personalized",
        items: [
          { chip: "A", label: "Adaptive mode", url: "/practice/?mode=adaptive", desc: "Words biased toward your weakest keys and bigrams." },
          { chip: "✗", label: "My missed words", url: "/practice/?mode=words&words=25&lang=missed", desc: "Practice the words you actually mistype most." },
          { chip: "★", label: "Daily challenge", url: "/challenges/", desc: "A new goal every visit -- speed, accuracy, endurance." },
          { chip: "📚", label: "From a book", url: "/library/", desc: "Type your way through a public-domain classic." },
          { chip: "I", label: "Daily idiom", url: "/idioms/", desc: "Today's curated idiom + meaning." },
          { chip: "P", label: "A poem", url: "/poetry/", desc: "Frost, Dickinson, Whitman, Shakespeare, Blake." },
          { chip: "F", label: "A parable", url: "/parables/", desc: "Aesop's Fables and short moral stories." },
          { chip: "🎮", label: "Games", url: "/games/", desc: "Catch the Word + more typing mini-games." },
        ],
      },
    ],
    featured: { kind: "today-quote", title: "Today's quote", cta: { label: "Type today's quote", url: "/practice/?mode=quote&quote=daily" } },
  },
  {
    label: "Learn",
    url: "/lessons/",
    groups: [
      {
        title: "Lessons",
        items: [
          { chip: "L", label: "All lessons", url: "/lessons/", desc: `${N_LESSONS} progressive lessons, beginner to mastery.` },
          { chip: "1", label: "Lesson 1: home row", url: `/practice/?lesson=1`, desc: "Start here. Eight keys, no surprises." },
          { chip: "5", label: "Lesson 5: top row", url: `/practice/?lesson=5`, desc: "qwerty uiop -- the upward reaches." },
          { chip: "10", label: "Lesson 10: bottom row", url: `/practice/?lesson=10`, desc: "zxcv bnm -- the trickiest row." },
          { chip: String(MID_LESSON), label: `Lesson ${MID_LESSON}: midway`, url: `/practice/?lesson=${MID_LESSON}`, desc: "Picks up halfway through the curriculum." },
          { chip: String(N_LESSONS), label: `Lesson ${N_LESSONS}: final`, url: `/practice/?lesson=${N_LESSONS}`, desc: "The end of the curriculum." },
          { chip: "C", label: "Custom text", url: "/custom/", desc: "Practice on text you actually want to read." },
        ],
      },
      {
        title: "Row + finger drills",
        items: [
          { chip: "D", label: "All drills", url: "/drills/", desc: `${N_DRILLS} finger-row, key-cluster, and code drills.` },
          { chip: "H", label: "Home row", url: "/practice/?drill=home-row", desc: "asdf jkl; -- the fundamentals." },
          { chip: "T", label: "Top row", url: "/practice/?drill=top-row", desc: "qwerty uiop -- reach upward." },
          { chip: "B", label: "Bottom row", url: "/practice/?drill=bottom-row", desc: "zxcv bnm -- the trickiest row." },
          { chip: "L", label: "Left hand", url: "/practice/?drill=left-hand", desc: "Everything to the left of the index split." },
          { chip: "R", label: "Right hand", url: "/practice/?drill=right-hand", desc: "Everything to the right of the index split." },
          { chip: "V", label: "Vowels", url: "/practice/?drill=vowels", desc: "a e i o u -- the carriers of every word." },
          { chip: ".", label: "Punctuation", url: "/practice/?drill=punctuation", desc: "Brackets, quotes, slashes, em-dashes." },
        ],
      },
      {
        title: "Specialty drills",
        items: [
          { chip: "#", label: "Numbers", url: "/practice/?drill=numbers", desc: "Top-row digits, plain and mixed." },
          { chip: "Np", label: "Numpad rows", url: "/practice/?drill=numpad-rows", desc: "789 / 456 / 123 -- right-hand keypad." },
          { chip: "$", label: "Numpad decimals", url: "/practice/?drill=numpad-decimals", desc: "Currency and measurement style." },
          { chip: "☎", label: "Numpad phone", url: "/practice/?drill=numpad-phone", desc: "Phone-number digit + dash patterns." },
          { chip: "JS", label: "Code: JS keywords", url: "/practice/?drill=code-js", desc: "function, const, return -- core syntax." },
          { chip: "Py", label: "Code: Python", url: "/practice/?drill=code-py", desc: "def, lambda, decorators, dunders." },
          { chip: "&lt;&gt;", label: "Code: HTML tags", url: "/practice/?drill=code-html", desc: "Common element tags and attributes." },
          { chip: "Tw", label: "Code: Tailwind", url: "/practice/?drill=code-tailwind", desc: "Common utility-class strings." },
        ],
      },
    ],
    featured: { kind: "next-lesson", title: "Continue learning", cta: { label: "Open lessons", url: "/lessons/" } },
  },
  {
    label: "Library",
    url: "/library/",
    groups: [
      {
        title: "Long-form text",
        items: [
          { chip: "B", label: "Books", url: "/library/", desc: "Public-domain books from Project Gutenberg." },
          { chip: "❝", label: "Quotes", url: "/quotes/", desc: "Browse every quote, build a collection." },
          { chip: "I", label: "Idioms", url: "/idioms/", desc: "Common English idioms with their meanings." },
          { chip: "P", label: "Poetry", url: "/poetry/", desc: "Frost, Dickinson, Whitman, Shakespeare, Blake." },
          { chip: "F", label: "Fables & parables", url: "/parables/", desc: "Aesop and short moral stories, public domain." },
          { chip: "Q", label: "Daily quote", url: "/practice/?mode=quote&quote=daily", desc: "Today's curated line." },
          { chip: "C", label: "Custom text", url: "/custom/", desc: "Drop a file, paste a chapter, type through it." },
        ],
      },
      {
        title: "English word lists",
        items: [
          { chip: "WL", label: "All word lists", url: "/wordlists/", desc: "Browse every available list and its size." },
          { chip: "1k", label: "English 1k", url: "/wordlists/en-1k/", desc: "Most common 1,000 English words." },
          { chip: "5k", label: "English 5k", url: "/wordlists/en-5k/", desc: "Wider vocabulary spread." },
          { chip: "10k", label: "English 10k", url: "/wordlists/en-10k/", desc: "Long-tail vocabulary." },
          { chip: "Av", label: "Advanced vocab", url: "/wordlists/en-advanced/", desc: "SAT/GRE-level words. Multi-syllable challenge." },
          { chip: "✗", label: "My missed words", url: "/wordlists/missed/", desc: "Words you've struggled with this week." },
          { chip: "Sc", label: "Scrabble trainer", url: "/wordlists/scrabble/", desc: "2-7 letter Scrabble-handy words." },
        ],
      },
      {
        title: "Specialty word lists",
        items: [
          { chip: "JS", label: "Code: JavaScript", url: "/wordlists/code-js/", desc: "Keywords, common identifiers, syntax." },
          { chip: "Py", label: "Code: Python", url: "/wordlists/code-py/", desc: "Pythonic patterns and keywords." },
          { chip: "TS", label: "Code: TypeScript", url: "/wordlists/code-ts/", desc: "Interfaces, generics, utility types." },
          { chip: "Rs", label: "Code: Rust", url: "/wordlists/code-rust/", desc: "fn, mut, impl, trait, Vec<T>." },
          { chip: "SQL", label: "Code: SQL", url: "/wordlists/code-sql/", desc: "SELECT, JOIN, GROUP BY -- mostly uppercase." },
          { chip: "$", label: "Code: Bash", url: "/wordlists/code-bash/", desc: "Shell commands, pipes, redirects." },
          { chip: "🌍", label: "Countries", url: "/wordlists/countries/", desc: "All 195 sovereign nations." },
          { chip: "🏛", label: "Capitals", url: "/wordlists/capitals/", desc: "Capital cities of the world." },
          { chip: "L", label: "Latin phrases", url: "/wordlists/latin-phrases/", desc: "ad hoc, bona fide, ipso facto." },
        ],
      },
    ],
    featured: { kind: "today-idiom", title: "Idiom of the day", cta: { label: "Type this idiom", url: "/idioms/" } },
  },
  {
    label: "Compete",
    url: "/challenges/",
    groups: [
      {
        title: "Speed challenges",
        items: [
          { chip: "S", label: "Sprint", url: "/practice/?mode=time&duration=60&challenge=sprint", desc: "60 seconds. Hit 60 wpm at 95% accuracy." },
          { chip: "M", label: "Marathon", url: "/practice/?mode=time&duration=300&challenge=marathon", desc: "5 minutes at 50 wpm. Endurance test." },
          { chip: "100", label: "100 Words", url: "/practice/?mode=words&words=100&challenge=word-100", desc: "100 common words at 70 wpm." },
          { chip: "500", label: "500 Words", url: "/practice/?mode=words&words=500&challenge=word-500", desc: "Long-form endurance. 60 wpm to clear." },
          { chip: "QC", label: "Quote Chase", url: "/practice/?mode=quote&challenge=quote-chase", desc: "Race through three quotes at 65 wpm." },
          { chip: "Z", label: "Zen Master", url: "/practice/?mode=zen&challenge=zen", desc: "Untimed marathon. Stop on your own terms." },
        ],
      },
      {
        title: "Accuracy + specialty",
        items: [
          { chip: "P", label: "Pangram run", url: "/practice/?mode=quote&challenge=pangram", desc: "A sentence with every letter. Don't slip." },
          { chip: "MC", label: "Mountain climb", url: "/practice/?mode=words&words=80&challenge=mountain-climb", desc: "Words get harder as you climb." },
          { chip: "{}", label: "Code mode", url: "/practice/?mode=words&words=40&challenge=code-mode", desc: "Function, const, return. Symbols included." },
          { chip: ".", label: "Punctuation gauntlet", url: "/practice/?mode=words&words=50&challenge=punctuation", desc: "Brackets, quotes, em-dashes, colons." },
          { chip: "#", label: "Numbers gauntlet", url: "/practice/?mode=words&words=50&challenge=numbers", desc: "Digits, decimals, mixed alphanumerics." },
          { chip: "★", label: "All challenges", url: "/challenges/", desc: `${N_CHALLENGES} challenges total. Bests tracked locally.` },
        ],
      },
      {
        title: "Track + measure",
        items: [
          { chip: "PB", label: "Personal bests", url: "/stats/#mode-bests", desc: "Your top WPM by mode + duration." },
          { chip: "★", label: "Achievements", url: "/stats/#achievements-grid", desc: `${N_ACHIEVEMENTS} badges across ${N_ACH_GROUPS} categories.` },
          { chip: "📊", label: "WPM trend", url: "/stats/#trend", desc: "Last 30 sessions plotted as a line chart." },
          { chip: "🔥", label: "Streak", url: "/stats/", desc: "Daily-typing streak. Don't break the chain." },
          { chip: "📅", label: "Daily activity", url: "/stats/#contribution", desc: "GitHub-style contribution grid for your typing." },
          { chip: "T", label: "Lesson trends", url: "/stats/#lesson-trends-svg", desc: "WPM line per lesson across attempts." },
        ],
      },
    ],
    featured: { kind: "challenge-best", title: "Beat your best", cta: { label: "All challenges", url: "/challenges/" } },
  },
  {
    label: "Games",
    url: "/games/",
    groups: [
      {
        title: "Play",
        items: [
          { chip: "🎮", label: "All games", url: "/games/", desc: "Every typing game in one place." },
          { chip: "C", label: "Catch the Word", url: "/practice/game/", desc: "Falling-word arcade driven by your missed-words list." },
          { chip: "C+", label: "Catch — speed 1.5x", url: "/practice/game/?speed=1.5", desc: "Same game, sped up. Quick warm-up." },
          { chip: "C++", label: "Catch — speed 2x", url: "/practice/game/?speed=2", desc: "Hard mode. Pixels fly." },
          { chip: "★", label: "High scores", url: "/stats/#mode-bests", desc: "Your best score + best streak per game." },
        ],
      },
      {
        title: "Coming soon",
        items: [
          { chip: "🎯", label: "Shooter mode", url: "/games/#shooter", desc: "Cursor-driven word targeting." },
          { chip: "∞", label: "Endless mode", url: "/games/#endless", desc: "Spawns forever, faster each minute." },
          { chip: "💡", label: "Suggest a game", url: "/contribute/game/", desc: "Pitch a typing mini-game." },
        ],
      },
      {
        title: "Why games?",
        items: [
          { chip: "📚", label: "The case for games", url: "/games/#why", desc: "Sustained engagement when you're tired or bored." },
          { chip: "✗", label: "My missed words", url: "/practice/?mode=words&words=25&lang=missed", desc: "Practice the words you mistype most." },
          { chip: "S", label: "Stats dashboard", url: "/stats/", desc: "Where game results land." },
        ],
      },
    ],
    featured: { kind: "game-pitch", title: "Play Catch the Word", cta: { label: "Open the game", url: "/practice/game/" } },
  },
  {
    label: "Insights",
    url: "/stats/",
    groups: [
      {
        title: "Your data",
        items: [
          { chip: "S", label: "Stats dashboard", url: "/stats/", desc: "Heatmap, trend, contribution grid, lifetime totals." },
          { chip: "★", label: "Achievements", url: "/stats/#achievements-grid", desc: `${N_ACHIEVEMENTS} badges across ${N_ACH_GROUPS} categories.` },
          { chip: "⌨", label: "Keyboard heatmap", url: "/stats/#heatmap", desc: "Speed + accuracy painted onto your layout." },
          { chip: "📊", label: "WPM trend", url: "/stats/#trend", desc: "Last 30 sessions, plotted." },
          { chip: "📅", label: "Daily activity", url: "/stats/#contribution", desc: "GitHub-style contribution grid for your typing." },
          { chip: "PB", label: "Mode bests", url: "/stats/#mode-bests", desc: "Personal bests broken out by mode and duration." },
        ],
      },
      {
        title: "Detail reports",
        items: [
          { chip: "🖐", label: "Per-finger errors", url: "/stats/#perfinger-svg", desc: "Error rate vs avg key time, all 10 fingers." },
          { chip: "🔤", label: "Character report", url: "/stats/#char-table-host", desc: "Sortable per-character breakdown." },
          { chip: "📈", label: "Lesson trends", url: "/stats/#lesson-trends-svg", desc: "WPM across attempts, one line per lesson." },
          { chip: "✗", label: "Missed words", url: "/stats/#missed-words-section", desc: "Top 20 words you struggle with most." },
          { chip: "🐢", label: "Slowest keys", url: "/stats/#perkey-svg", desc: "Per-key average time -- find the bottleneck." },
          { chip: "🔍", label: "Recent sessions", url: "/stats/#sessions-list", desc: "Last 30 sessions with mode, WPM, accuracy." },
        ],
      },
      {
        title: "Settings & guides",
        items: [
          { chip: "⚙", label: "Settings", url: "/settings/", desc: "Profiles, theme, layout, JSON export." },
          { chip: "G", label: "User guide", url: "/guide/", desc: "Everything you need to know to use the site." },
          { chip: "?", label: "FAQ", url: "/faq/", desc: "Common questions and answers." },
          { chip: "ℹ", label: "About", url: "/about/", desc: "Why this site exists. Made by one person." },
          { chip: "F", label: "Features", url: "/features/", desc: "Full list of what the site can do." },
          { chip: "C", label: "Custom texts", url: "/custom/", desc: "Manage your saved practice texts." },
        ],
      },
    ],
    featured: { kind: "stats", title: "Your typing", cta: { label: "Open dashboard", url: "/stats/" } },
  },
  {
    label: "Contribute",
    url: "/contribute/",
    groups: [
      {
        title: "Suggest content",
        items: [
          { chip: "❝", label: "Suggest a quote", url: "/contribute/quote/", desc: "Public-domain line worth typing again and again." },
          { chip: "B", label: "Suggest a book", url: "/contribute/book/", desc: "Project Gutenberg classic for the full-text library." },
          { chip: "F", label: "Suggest a parable", url: "/contribute/parable/", desc: "Aesop, Zen, folk -- short stories with a moral." },
          { chip: "I", label: "Suggest an idiom", url: "/contribute/idiom/", desc: "Phrase, meaning, origin, region." },
          { chip: "P", label: "Suggest a poem", url: "/contribute/poem/", desc: "Pre-1929 poetry -- sonnets, lyrics, narrative." },
          { chip: "D", label: "Suggest a drill", url: "/contribute/drill/", desc: "Key cluster, bigram, finger isolation, symbol pack." },
          { chip: "G", label: "Suggest a game", url: "/contribute/game/", desc: "Pitch a typing mini-game with mechanics + scoring." },
          { chip: "+", label: "All forms", url: "/contribute/", desc: "Hub for every contribution type." },
        ],
      },
      {
        title: "Share & connect",
        items: [
          { chip: "★", label: "Leave a testimonial", url: "/contribute/testimonial/", desc: "Tell other typists why this is worth their time." },
          { chip: "♥", label: "Send a thanks note", url: "/contribute/thanks-note/", desc: "Quick message of appreciation for the wall." },
          { chip: "📋", label: "All reviews", url: "/reviews/", desc: "Read what other typists are saying." },
          { chip: "💌", label: "Thanks wall", url: "/thanks-wall/", desc: "A small wall of kindness from the community." },
          { chip: "💬", label: "Send feedback", url: "/contribute/", desc: "Bugs, typos, ideas, complaints -- comes straight to me." },
        ],
      },
      {
        title: "Open the source",
        items: [
          { chip: "G", label: "GitHub repo", url: "https://github.com/jonajinga/GuerillaType", desc: "Browse the code, file an issue, open a PR. MIT licensed." },
          { chip: "📜", label: "Changelog", url: "/changelog/", desc: "Every notable change, in chronological order." },
          { chip: "📚", label: "Guide", url: "/guide/", desc: "How the engine, modes, and stats work under the hood." },
          { chip: "🔭", label: "Roadmap", url: "/roadmap/", desc: "What's coming next and what's been deferred." },
          { chip: "🙏", label: "Why contribute", url: "/why-contribute/", desc: "The case for adding to a free, no-tracking practice surface." },
        ],
      },
    ],
    featured: { kind: "contribute", title: "Help shape the project", cta: { label: "All ways to help", url: "/contribute/" } },
  },
];

export default megamenu;
