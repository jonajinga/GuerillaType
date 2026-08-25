/* Drill definitions -- each drill's `words` set uses ONLY the keys
   listed in its `keys` field. (Pure-key drills.) Bottom row and vowels
   have no English words obeying that constraint, so those use
   letter-cluster sequences instead -- drill content rather than prose.
   The engine treats each entry in `words` as one space-separated chunk. */

export default [
  {
    id: "home-row",
    name: "Home Row",
    keys: "asdfghjkl;",
    desc: "Anchor your fingers on a-s-d-f and j-k-l-;. Every word here uses only home-row keys.",
    words: ["ash", "dad", "dash", "fad", "fall", "flag", "flask", "gala", "gas", "gash", "glad", "glass", "half", "hall", "has", "lad", "lag", "lash", "sad", "salad", "sash", "shall"],
  },
  {
    id: "top-row",
    name: "Top Row",
    keys: "qwertyuiop",
    desc: "Q through P. Every word uses only top-row keys.",
    words: ["pie", "tip", "tie", "top", "tow", "tour", "tower", "true", "type", "you", "your", "wire", "wipe", "tower", "outer", "quiet", "quite", "quote", "queue", "report", "repute", "ripe", "ripper", "router", "trip"],
  },
  {
    id: "bottom-row",
    name: "Bottom Row",
    keys: "zxcvbnm,./",
    desc: "No vowels live on the bottom row, so this drill is letter clusters -- type the sequences as written.",
    words: ["zx", "cv", "bn", "mm", "vbn", "cxz", "mnb", "vcx", ",,", "..", "//", "z,", "x,", "c.", "v/", "bn,", "mn.", "z/", "x/.", "vbnm"],
  },
  {
    id: "left-hand",
    name: "Left Hand",
    keys: "qwertasdfgzxcvb",
    desc: "Everything to the left of the index-finger split. All words use only left-hand keys.",
    words: ["act", "added", "are", "ate", "bad", "barb", "barge", "base", "bear", "beard", "beats", "beg", "best", "brave", "card", "cards", "carve", "case", "crab", "crate", "dab", "dare", "data", "date", "dread", "ebb", "edge", "fade", "fast", "fear", "feast", "feed", "free", "great", "rage", "raster", "savage", "scare", "stab", "stage", "stagger", "tea", "trade", "vest", "wage", "wax", "ware", "zest"],
  },
  {
    id: "right-hand",
    name: "Right Hand",
    keys: "yuiopjklhnm",
    desc: "Everything from the index-finger split rightward. All words use only right-hand keys.",
    words: ["hill", "him", "hip", "hop", "hum", "hump", "ill", "imply", "inn", "ion", "join", "joint", "jolly", "joy", "jump", "junk", "kin", "lily", "limp", "limpy", "link", "lump", "milk", "mill", "minim", "monk", "moon", "mum", "noun", "nimbly", "ninny", "nip", "nun", "nylon", "only", "onion", "opinion", "pin", "pinion", "ply", "polo", "pomp", "pony", "puppy", "pull", "pun", "yum"],
  },
  {
    id: "vowels",
    name: "Vowels",
    keys: "aeiou",
    desc: "Pure vowels. No English word is all-vowel, so this drill is vowel clusters -- sing them.",
    words: ["a", "e", "i", "o", "u", "ai", "ae", "io", "oi", "ea", "eu", "au", "ou", "ie", "oe", "ua", "iou", "aeiou", "uoiea", "aei", "ouo", "iao"],
  },
  {
    id: "punctuation",
    name: "Punctuation",
    keys: ".,;:'\"!?-",
    desc: "Quote marks, dashes, semicolons. Drill the marks that slow most typists down.",
    words: ["it's", "don't", "won't", "isn't", "you're", "they're", "can't", "well-known", "self-aware", "first-class", "\"hello\"", "\"world\"", "what?", "why?", "how!", "wait;", "no:", "yes;"],
  },
  {
    id: "numbers",
    name: "Numbers",
    keys: "0123456789",
    desc: "The number row. Mixed digit lengths to break finger habits.",
    words: ["123", "456", "789", "012", "1024", "2048", "1729", "3141", "2718", "8675309", "100", "1000", "10000", "404", "200", "500", "42", "73", "60", "30", "15", "1985", "2026"],
  },
  {
    id: "alpha",
    name: "Alpha Mix",
    keys: "abcdefghijklmnopqrstuvwxyz",
    desc: "Common short words across the whole alphabet. Warmup-friendly.",
    words: ["the", "of", "and", "to", "in", "is", "you", "that", "it", "he", "was", "for", "on", "are", "with", "as", "her", "his", "they", "have"],
  },
  {
    id: "alpha-forward",
    name: "A → Z",
    keys: "abcdefghijklmnopqrstuvwxyz",
    desc: "Type the alphabet in order, A through Z. No shuffling.",
    ordered: true,
    words: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"],
  },
  {
    id: "alpha-reverse",
    name: "Z → A",
    keys: "zyxwvutsrqponmlkjihgfedcba",
    desc: "Type the alphabet backward, Z through A. No shuffling.",
    ordered: true,
    words: ["z", "y", "x", "w", "v", "u", "t", "s", "r", "q", "p", "o", "n", "m", "l", "k", "j", "i", "h", "g", "f", "e", "d", "c", "b", "a"],
  },

  // ── Source-code micro-drills ─────────────────────────────────────
  {
    id: "code-brackets",
    name: "Code: brackets",
    keys: "()[]{}",
    desc: "Bracket pairs in isolation. Train the shifted-key reach.",
    words: ["()", "[]", "{}", "({})", "[()]", "()[]", "(())", "[[]]", "{[()]}", "([{}])", "(())", "{}[]", "({[]})", "([])", "{()}", "[{}]"],
  },
  {
    id: "code-symbols-math",
    name: "Code: math operators",
    keys: "+-*/=<>!%",
    desc: "Math + comparison operators. = != < <= > >= && ||.",
    words: ["+", "-", "*", "/", "=", "==", "!=", "===", "<", ">", "<=", ">=", "&&", "||", "%", "+=", "-=", "*=", "/=", "**", "<<", ">>"],
  },
  {
    id: "code-js-keywords",
    name: "Code: JS keywords",
    keys: "abcdefghijklmnopqrstuvwxyz",
    desc: "Common JavaScript keywords and short tokens.",
    words: ["const", "let", "var", "if", "else", "function", "return", "for", "while", "true", "false", "null", "undefined", "import", "export", "default", "class", "this", "super", "async", "await", "try", "catch", "throw", "new", "of", "in"],
  },
  {
    id: "code-arrows",
    name: "Code: arrow functions",
    keys: "abcdefghijklmnopqrstuvwxyz()=>",
    desc: "Arrow-function shapes. Practice => with various arities.",
    words: ["()=>{}", "(x)=>x", "(a,b)=>a+b", "()=>true", "(x)=>x*2", "(x,y)=>x===y", "()=>null", "(o)=>o.id", "(x)=>{return x}", "(...a)=>a", "([a,b])=>b"],
  },
  {
    id: "code-py-decorators",
    name: "Code: Python decorators",
    keys: "abcdefghijklmnopqrstuvwxyz@_",
    desc: "Python decorator and dunder patterns.",
    words: ["@property", "@staticmethod", "@classmethod", "@dataclass", "__init__", "__name__", "__main__", "__str__", "__repr__", "__len__", "__eq__", "@cached_property"],
  },
  {
    id: "code-html-tags",
    name: "Code: HTML tags",
    keys: "abcdefghijklmnopqrstuvwxyz<>/=",
    desc: "Common HTML opening + closing tags. Type each pair fully.",
    words: ["<div>", "</div>", "<span>", "</span>", "<a>", "</a>", "<p>", "</p>", "<h1>", "</h1>", "<ul>", "<li>", "</li>", "</ul>", "<form>", "</form>", "<input/>", "<br/>", "<hr/>", "<img/>"],
  },
  {
    id: "code-tailwind",
    name: "Code: Tailwind classes",
    keys: "abcdefghijklmnopqrstuvwxyz0123456789-",
    desc: "Common Tailwind utility-class strings.",
    words: ["flex", "grid", "block", "hidden", "p-4", "m-2", "mx-auto", "w-full", "h-screen", "text-sm", "text-xl", "font-bold", "text-gray-700", "bg-white", "rounded-md", "shadow-lg", "border", "gap-4", "space-x-2", "items-center", "justify-between", "hover:bg-blue-500"],
  },

  /* ── Numpad drills ──────────────────────────────────────────────
     Right-hand numeric keypad practice. Each drill keeps the home
     position on 4-5-6 and exercises the pad in a different pattern.

     HARD CONSTRAINT: every character below must exist on a physical
     PC numeric keypad, i.e. it must appear in NUMPAD_KEYS in
     src/assets/js/engine/layouts.js. That inventory is exactly:
     0-9 . / * - + and Enter. In particular there is NO comma and NO
     equals key on a numpad — grouping separators and "= result" belong
     to the number row, not the pad (see the numbers-prices drill).
     Enter exists on the pad and is finger-mapped, but the drill format
     is space-separated words with no newline support, so no drill word
     contains it.

     Set the keyboard layout to "Numpad" in /settings/ to get the pad
     drawn under the typing surface and on the /stats/ heatmap. */
  {
    id: "numpad-rows",
    name: "Numpad: row drills",
    keys: "0123456789",
    desc: "Step through each numpad row in sequence -- top (7-8-9), middle (4-5-6), bottom (1-2-3), then 0 thumb anchor.",
    words: ["789", "456", "123", "000", "987", "654", "321", "147", "258", "369", "159", "357", "753", "951"],
  },
  {
    id: "numpad-mixed",
    name: "Numpad: mixed digits",
    keys: "0123456789",
    desc: "Jumbled digit sequences -- builds the cross-row jumps that pure-row drills miss.",
    words: ["8273", "1956", "4082", "7193", "5604", "3819", "2746", "9135", "6028", "4571", "8362", "1947", "5083", "7261", "9408", "3675"],
  },
  {
    id: "numpad-decimals",
    name: "Numpad: decimals",
    keys: "0123456789.",
    desc: "Currency and measurement style. Drills the decimal point under the ring finger alongside the digit grid -- the core spreadsheet-entry pattern.",
    words: ["12.50", "3.14", "99.99", "0.05", "2.718", "65.40", "0.001", "150.75", "9.99", "23.45", "1.618", "0.5", "100.01", "42.42", "365.25", "7.25", "18.75", "0.125"],
  },
  {
    id: "numpad-phone",
    name: "Numpad: phone numbers",
    keys: "0123456789-",
    desc: "Hyphen-separated phone-number patterns. Trains the dash + digit muscle memory together.",
    words: ["555-0100", "212-555-0123", "1-800-555-0199", "404-555-0177", "917-555-0142", "303-555-0188", "718-555-0145", "415-555-0162", "646-555-0191", "773-555-0124", "212-867-5309", "555-1212"],
  },
  {
    id: "numpad-math",
    name: "Numpad: math operators",
    keys: "0123456789+-*/.",
    desc: "Arithmetic expressions mixing the digit grid with +, - , * and /. On a real pad Enter is the equals key, so the expressions stop at the second operand.",
    words: ["2+2", "10/2", "7*8", "100-25", "9+1", "12/4", "6*6", "50+50", "81/9", "11*11", "20-7", "3.14*2", "144/12", "15+85", "250-75", "8*7", "0.5*4", "36/6"],
  },
  {
    id: "numpad-operators",
    name: "Numpad: operator column",
    keys: "0123456789+-*/",
    desc: "Isolates the right-pinky stretch to the / * - + column on the pad's outer edge -- the reach that costs 10-key beginners the most accuracy.",
    words: ["+-", "*/", "-+", "/*", "+*", "-/", "4+4", "6-2", "8*3", "9/3", "1+2-3", "5*2/5", "7-4+1", "0+0", "2*2*2", "9/9+9", "10-5+5", "3*3/9"],
  },

  // ── Per-finger isolation drills
  { id: "finger-l-pinky",  name: "Left pinky isolation",  keys: "qazQAZ",
    desc: "Pinky-only column on the left. Strengthens the weakest finger across all three rows.",
    words: ["aqaq", "azaz", "qzqz", "qa az aq", "aza qaq zqz", "qaz qaz qaz", "az qa zq", "qz az aq qa zq", "azqa zqaq aqzq", "aqz qaz qza", "aaa qqq zzz"] },
  { id: "finger-l-ring",   name: "Left ring finger",      keys: "wsxWSX",
    desc: "Left ring finger column drill across all three rows.",
    words: ["sw sw sw", "sx sx sx", "ws ws ws", "swx wsx xws", "sw ws sx xs", "sxw wxs xsw", "sws xsx wxw", "sxws wsxs"] },
  { id: "finger-l-middle", name: "Left middle finger",    keys: "edcEDC",
    desc: "Left middle column drill across all three rows.",
    words: ["ed ed ed", "ec ec ec", "dc dc dc", "edc edc", "ced ced", "dec dec", "deed cede edged", "decade ceded", "deeded ecdec"] },
  { id: "finger-l-index",  name: "Left index finger",     keys: "rtfgvbRTFGVB",
    desc: "Left index roams over six keys: F, R, T, G, V, B.",
    words: ["fr ft fg fv fb", "tr tf gt bt", "ft gr vb bg", "frbg trvf bvft", "brag fart graft", "verb verbs", "trf vbg ftrg", "right fight tight bright"] },
  { id: "finger-r-index",  name: "Right index finger",    keys: "yuhjnmYUHJNM",
    desc: "Right index column. Six keys that carry a lot of English.",
    words: ["jh jn jm jy ju", "uh hu nh hm un", "junky hunky human jumpy", "mummy nymph hyphen rhythm", "yum jut hum nun mum", "hung many young much", "huh hmm uhuh"] },
  { id: "finger-r-middle", name: "Right middle finger",   keys: "ik,IK<",
    desc: "Right middle column with the comma. Punctuation rhythm built in.",
    words: ["ik ik ik", "i, i, i,", "k, k, k,", "kik kik kik", "iki kiki", "ki, k,i ,ki", "iki, k,iki, ikik,", "ik,ik kiki,"] },
  { id: "finger-r-ring",   name: "Right ring finger",     keys: "ol.OL>",
    desc: "Right ring finger including the period. Trains end-of-sentence rhythm.",
    words: ["ol ol ol", "o. o. o.", "l. l. l.", "olo olo olo", "lol lol lol", "loo loo loo", "ool. lool. ollo.", "loll. olol."] },
  { id: "finger-r-pinky",  name: "Right pinky finger",    keys: "p;/P:?",
    desc: "Right pinky -- the trickiest finger. Outer column with semicolons, colons, slashes.",
    words: [";; ;;", "// //", "p; p; p;", "p/ p/ p/", ";/ /; ;/", "p;p; /p/p", "p:p p:; p?p", "/p/p/p ;p;p;p"] },

  // ── Bigram targeted drills
  { id: "bigram-th", name: "Bigram: th", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "Top English bigram. The most-typed two-letter pattern.",
    words: ["the", "this", "that", "they", "them", "then", "their", "these", "those", "thing", "think", "thought", "though", "through", "thirty", "thumb", "thread", "thaw", "theory", "theme", "thunder", "thirsty"] },
  { id: "bigram-he", name: "Bigram: he", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "Second-most-common English bigram. Anchors many short words.",
    words: ["he", "her", "here", "head", "heart", "heat", "heavy", "heel", "help", "herb", "hero", "shed", "ahead", "shelter", "behold", "rehearsal", "cheek", "wheel", "hedge"] },
  { id: "bigram-in", name: "Bigram: in", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "Words anchored on -in-. Trains a heavy English pattern.",
    words: ["in", "into", "inch", "inn", "ink", "input", "inside", "infer", "intent", "kind", "find", "wind", "bring", "thing", "string", "spring", "ring", "sing", "king", "drink", "blink", "shrink", "evening"] },
  { id: "bigram-er", name: "Bigram: er", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "Words ending in -er. A heavy English suffix pattern.",
    words: ["over", "ever", "every", "very", "her", "perhaps", "person", "term", "service", "river", "letter", "better", "matter", "after", "water", "paper", "later", "father", "mother", "summer", "winter", "manager", "answer"] },
  { id: "bigram-an", name: "Bigram: an", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "Words anchored on -an-.",
    words: ["an", "and", "any", "ant", "anvil", "answer", "anchor", "land", "hand", "stand", "band", "candy", "fancy", "ancient", "panda", "manage", "balance", "advance", "danger", "language", "plant", "demand", "human", "national"] },
  { id: "bigram-re", name: "Bigram: re", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "Words anchored on -re- including the re- prefix.",
    words: ["are", "were", "before", "more", "store", "core", "share", "where", "there", "here", "fire", "wire", "tire", "hire", "retire", "require", "recall", "revoke", "reveal", "renew", "review", "refuse", "report"] },

  // ── Trigram drills
  { id: "trigram-tion", name: "Trigram: -tion", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "One of English's most productive suffixes.",
    words: ["nation", "action", "station", "motion", "option", "fiction", "section", "passion", "mission", "fashion", "vision", "portion", "function", "junction", "selection", "direction", "education", "operation", "solution", "creation", "reduction", "production", "attention", "position"] },
  { id: "trigram-ing", name: "Trigram: -ing", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "Present-participle suffix.",
    words: ["ring", "sing", "king", "wing", "swing", "thing", "string", "bring", "spring", "going", "doing", "making", "taking", "running", "playing", "typing", "reading", "writing", "thinking", "fighting", "looking", "starting", "evening", "morning"] },
  { id: "trigram-ent", name: "Trigram: -ent", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "-ent endings: silent, talent, agent, parent.",
    words: ["went", "sent", "bent", "rent", "tent", "dent", "spent", "agent", "talent", "silent", "absent", "recent", "parent", "intent", "moment", "patient", "ancient", "evident", "different", "important", "permanent", "frequent", "violent", "innocent"] },
  { id: "trigram-est", name: "Trigram: -est", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "Superlative suffix -est.",
    words: ["best", "rest", "test", "west", "fest", "pest", "nest", "guest", "chest", "quest", "honest", "modest", "harvest", "interest", "request", "earnest", "biggest", "fastest", "slowest", "highest", "lowest", "newest", "oldest", "latest"] },

  // ── Common short-word drills
  { id: "short-2", name: "Two-letter words", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "All common two-letter English words. Trains rhythm and word-boundary spacing.",
    words: ["of", "to", "in", "it", "is", "as", "at", "we", "be", "by", "do", "go", "he", "if", "me", "my", "no", "on", "or", "so", "up", "us", "an"] },
  { id: "short-3", name: "Three-letter words", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "Top three-letter words: the, and, for, you, etc.",
    words: ["the", "and", "for", "are", "but", "not", "you", "all", "any", "can", "had", "her", "was", "one", "our", "out", "day", "get", "has", "him", "his", "how", "man", "new", "now", "old", "see", "two", "way", "who", "boy", "did", "its", "let", "put", "say", "she", "too", "use"] },
  { id: "short-4", name: "Four-letter words", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "High-frequency four-letter words. Builds steady rhythm.",
    words: ["that", "with", "have", "this", "will", "your", "from", "they", "know", "want", "been", "good", "much", "some", "time", "very", "when", "come", "here", "just", "like", "long", "make", "many", "more", "most", "over", "such", "take", "than", "them", "well", "were", "work", "year"] },

  // ── Capitalization & shift drills
  { id: "shift-acronyms", name: "Shift: acronyms", keys: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    desc: "All-caps acronyms. Trains both shift keys without breaking rhythm.",
    words: ["NASA", "HTTP", "HTTPS", "HTML", "CSS", "JSON", "XML", "CSV", "PDF", "JPEG", "GIF", "API", "SDK", "CPU", "GPU", "RAM", "SSD", "TLS", "VPN", "URL", "DNS", "WIFI", "NATO", "FBI", "CIA", "WHO", "IRS", "FDA"] },
  { id: "shift-proper-nouns", name: "Shift: proper nouns", keys: "abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    desc: "Names, places, titles. Mixes shift use with regular flow.",
    words: ["London", "Paris", "Tokyo", "Berlin", "Sydney", "Boston", "Chicago", "Denver", "Lincoln", "Roosevelt", "Newton", "Einstein", "Tesla", "Curie", "Darwin", "Hemingway", "Austen", "Twain", "Wilde", "Joyce", "Borges", "Tolstoy", "Kafka"] },
  { id: "shift-camelcase", name: "Shift: camelCase", keys: "abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    desc: "Programming-style camelCase identifiers. Mid-word shift drill.",
    words: ["userName", "firstName", "lastName", "emailAddress", "phoneNumber", "isAdmin", "hasAccess", "getUser", "setName", "fetchUsers", "createOrder", "updateProfile", "deleteAccount", "validateInput", "renderComponent", "handleClick", "onSubmit", "onError"] },

  // ── Code-flavored drills
  { id: "code-strings", name: "Code: strings + escapes", keys: "abcdefghijklmnopqrstuvwxyz \"'\\$",
    desc: "Quoted strings with escape sequences.",
    words: ["\"hello\"", "'world'", "\"line\\none\"", "\"tab\\there\"", "'quote\\''", "\"$var\"", "\"${name}\"", "\"\\u00e9\"", "'a\\\\b\\\\c'"] },
  { id: "code-imports", name: "Code: import statements", keys: "abcdefghijklmnopqrstuvwxyz {} ./;",
    desc: "Import / require / from boilerplate across JS, Python, Rust, Go.",
    words: ["import", "from", "require", "use", "package", "import os", "import sys", "from typing", "import { useState }", "from './utils'", "use std::io", "package main"] },
  { id: "code-comments", name: "Code: comment styles", keys: "abcdefghijklmnopqrstuvwxyz /*-#<>!",
    desc: "Single-line, multi-line, JSDoc, and shell comment styles.",
    words: ["// note", "/* block */", "/** doc */", "# python", "<!-- html -->", "/// rust", "//! crate", "// TODO", "// FIXME", "/* eslint-disable */", "# noqa"] },
  { id: "code-shell", name: "Code: shell prompts", keys: "abcdefghijklmnopqrstuvwxyz $#~/.@:- ",
    desc: "Realistic shell prompts and short commands.",
    words: ["$ ls -la", "$ cd ~/projects", "$ git status", "# whoami", "$ pwd", "user@host:~$", "root@server:#", "$ npm run dev", "$ python -V", "$ docker ps", "$ kubectl get pods", "$ ssh user@host"] },

  // ── Real-world content
  { id: "real-emails", name: "Email addresses", keys: "abcdefghijklmnopqrstuvwxyz0123456789.@-_+",
    desc: "Real-style email addresses. Trains the @ key with name + domain rhythm.",
    words: ["alice@example.com", "bob.smith@example.com", "j.doe@company.co.uk", "support@example.org", "no-reply@example.io", "admin+tag@host.com", "user_42@gmail.com", "first.last@uni.edu", "info@startup.dev", "team@example.app"] },
  { id: "real-urls", name: "URLs", keys: "abcdefghijklmnopqrstuvwxyz0123456789:/.?=&-_#",
    desc: "Real URL shapes including paths, query strings, fragments.",
    words: ["https://example.com", "https://www.example.org/about", "https://api.example.com/v2/users/42", "https://example.com/?q=typing", "https://example.com/#section-3", "ftp://files.example.com", "ssh://git@github.com:user/repo.git"] },
  { id: "real-hashtags", name: "Hashtags + handles", keys: "abcdefghijklmnopqrstuvwxyz0123456789#@_-",
    desc: "Social-media style hashtags and at-handles.",
    words: ["#typing", "#productivity", "#100daysofcode", "#programming", "@alice", "@user_name", "@dev-team", "#WebDev", "#OpenSource", "@github", "@guerillatype"] },
  { id: "real-paths", name: "File paths", keys: "abcdefghijklmnopqrstuvwxyz0123456789./-_~",
    desc: "Unix-style file paths plus extensions. Trains forward-slash rhythm.",
    words: ["/usr/local/bin", "/home/alice/projects", "./src/main.js", "../config.json", "src/utils/format.ts", "tests/fixtures/sample.csv", "node_modules/.bin/eslint", "/etc/nginx/nginx.conf", "~/.ssh/known_hosts", "/var/log/syslog", "dist/index.html"] },

  // ── Specialty drills
  { id: "speciality-roman", name: "Roman numerals", keys: "IVXLCDM ",
    desc: "Roman numerals. Pure shift-key + rare-letter drill.",
    words: ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XV", "XX", "XXX", "XL", "L", "LX", "LXX", "LXXX", "XC", "C", "CD", "D", "DCC", "CM", "M", "MM", "MMI", "MMXX", "MMXXIV"] },
  { id: "speciality-greek", name: "Greek letter names", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "Greek alphabet spelled out. Useful for math + science notation.",
    words: ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda", "mu", "nu", "xi", "omicron", "pi", "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega"] },
  { id: "speciality-doubles", name: "Double-letter words", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "Words containing doubled letters. Drills repeat-key rhythm.",
    words: ["all", "well", "tell", "fall", "still", "small", "spell", "yellow", "follow", "fellow", "see", "free", "tree", "sweet", "green", "between", "feel", "keep", "moon", "soon", "noon", "loose", "choose", "moose", "kiss", "miss", "boss", "press", "puff", "stuff", "off"] },
  { id: "speciality-rare", name: "Rare-letter words", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "Words containing j, q, x, z. The least-used four letters in English.",
    words: ["jazz", "quartz", "xylophone", "zebra", "jinx", "quiz", "xerox", "zephyr", "jacquard", "quixotic", "exquisite", "zigzag", "buzz", "fizz", "puzzle", "azimuth", "oxygen", "judgement", "jealous", "quench", "exit", "zen", "jolt", "vex"] },
  { id: "speciality-palindromes", name: "Palindromes", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "Words that read the same forward and backward.",
    words: ["civic", "kayak", "level", "madam", "racecar", "radar", "refer", "rotator", "rotor", "sagas", "solos", "stats", "tenet", "wow", "noon", "nun", "pop", "sees", "deed", "did", "gag", "huh", "mom", "dad"] },
  { id: "speciality-twisters", name: "Tongue twisters", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "Classic tongue twisters as continuous text.",
    words: ["she", "sells", "sea", "shells", "by", "the", "seashore", "peter", "piper", "picked", "a", "peck", "of", "pickled", "peppers", "how", "much", "wood", "would", "a", "woodchuck", "chuck", "betty", "bought", "a", "bit", "of", "better", "butter"] },

  // ── Speed builders
  { id: "speed-short", name: "Speed burst (short)", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "A handful of short, easy words. Run as fast as possible.",
    words: ["go", "run", "fast", "type", "now", "yes", "do", "it", "win", "the", "race", "speed", "is", "key", "press", "keep", "going", "more"] },
  { id: "speed-medium", name: "Speed burst (medium)", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "Medium-length common words. Builds sustained speed.",
    words: ["always", "before", "during", "people", "really", "should", "though", "without", "another", "between", "country", "develop", "general", "however", "include", "members", "national", "perhaps"] },
  { id: "speed-hard", name: "Speed burst (hard)", keys: "abcdefghijklmnopqrstuvwxyz ",
    desc: "Long, awkward words. Builds raw speed under load.",
    words: ["responsibility", "infrastructure", "characteristics", "approximately", "implementation", "interpretation", "extraordinarily", "internationalization", "commercialization", "incompatibility"] },

  // ── Punctuation gauntlets
  { id: "punct-quotes", name: "Quote punctuation", keys: "abcdefghijklmnopqrstuvwxyz \"'.,?!",
    desc: "Quoted dialogue with terminal punctuation.",
    words: ["\"hello,\"", "\"yes!\"", "\"no.\"", "\"why?\"", "\"go,\"", "\"wait!\"", "\"stop.\"", "'maybe'", "'sure,'", "\"okay.\"", "\"now?\"", "\"never!\""] },
  { id: "punct-dashes", name: "Hyphens + dashes", keys: "abcdefghijklmnopqrstuvwxyz -",
    desc: "Compound modifiers and ranges.",
    words: ["well-known", "self-aware", "twenty-one", "mid-century", "first-class", "high-quality", "long-term", "ten-fold", "two-thirds", "father-in-law", "state-of-the-art", "real-time"] },
  { id: "punct-mix", name: "Punctuation mix", keys: "abcdefghijklmnopqrstuvwxyz .,?!:;'-",
    desc: "Common terminal + internal punctuation in real word patterns.",
    words: ["yes,", "no.", "why?", "wait!", "okay,", "sure;", "well:", "don't", "won't", "can't", "let's", "she'd", "they're", "I'm", "you'll", "we've", "it's", "that's"] },

  // ── Numbers
  { id: "numbers-years", name: "Years", keys: "0123456789 ",
    desc: "Common four-digit years. Trains digit-row rhythm in groups.",
    words: ["1066", "1492", "1607", "1776", "1812", "1865", "1914", "1939", "1945", "1969", "1989", "2000", "2008", "2020", "2024", "2025", "1215", "1620", "1789"] },
  { id: "numbers-prices", name: "Prices ($)", keys: "0123456789$.,",
    desc: "Currency amounts with the $ key.",
    words: ["$1.99", "$5.00", "$9.95", "$12.50", "$19.99", "$25", "$49.99", "$99", "$100", "$199.99", "$1,000", "$2,499.99", "$10,000", "$0.50", "$0.99", "$3.14"] },
  { id: "numbers-percent", name: "Percentages", keys: "0123456789%.",
    desc: "Percentages including decimals.",
    words: ["10%", "25%", "50%", "75%", "99%", "100%", "0.1%", "1%", "5%", "12.5%", "33.3%", "66.7%", "95%", "99.9%", "0.05%", "150%", "200%"] },
];
