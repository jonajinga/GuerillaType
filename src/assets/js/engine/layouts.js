/* Keyboard layouts — used for visualization only. Input handling
   ALWAYS uses KeyboardEvent.key (OS-resolved); the layout setting just
   tells the heatmap which key cell corresponds to which character. */

/* Physical geometry of a PC numeric keypad: 4 columns x 5 rows.
   `w` / `h` are column / row spans (default 1); `label` overrides the
   glyph drawn on the cap for characters that have no printable form.
   This is the single source of truth for the pad — LAYOUTS.numpad is
   derived from it below, and both keyboard renderers draw from it, so
   the char inventory and the drawn pad can never drift apart. */
export const NUMPAD_KEYS = [
  { ch: "/", col: 1, row: 0 },
  { ch: "*", col: 2, row: 0 },
  { ch: "-", col: 3, row: 0 },
  { ch: "7", col: 0, row: 1 },
  { ch: "8", col: 1, row: 1 },
  { ch: "9", col: 2, row: 1 },
  { ch: "+", col: 3, row: 1, h: 2 },
  { ch: "4", col: 0, row: 2 },
  { ch: "5", col: 1, row: 2 },
  { ch: "6", col: 2, row: 2 },
  { ch: "1", col: 0, row: 3 },
  { ch: "2", col: 1, row: 3 },
  { ch: "3", col: 2, row: 3 },
  { ch: "\n", col: 3, row: 3, h: 2, label: "Ent" },
  { ch: "0", col: 0, row: 4, w: 2 },
  { ch: ".", col: 2, row: 4 },
];

function numpadRows() {
  const rows = [];
  for (const k of NUMPAD_KEYS) {
    if (!rows[k.row]) rows[k.row] = [];
    rows[k.row].push(k.ch);
  }
  return rows.map((r) => r.join(""));
}

export const LAYOUTS = {
  qwerty: [
    "1234567890-=",
    "qwertyuiop[]\\",
    "asdfghjkl;'",
    "zxcvbnm,./",
  ],
  dvorak: [
    "1234567890[]",
    "',.pyfgcrl/=\\",
    "aoeuidhtns-",
    ";qjkxbmwvz",
  ],
  colemak: [
    "1234567890-=",
    "qwfpgjluy;[]\\",
    "arstdhneio'",
    "zxcvbkm,./",
  ],
  workman: [
    "1234567890-=",
    "qdrwbjfup;[]\\",
    "ashtgyneoi'",
    "zxmcvkl,./",
  ],
  // 10-key calculator pad. Derived from NUMPAD_KEYS above.
  numpad: numpadRows(),
};

/* Layouts that only cover part of the board. A numpad user still types
   prose in other modes, so fingerForKey() falls back to the main-board
   map for characters the partial layout doesn't carry — otherwise
   selecting "numpad" would silently zero out per-finger stats for every
   letter the user types. */
const PARTIAL_LAYOUTS = new Set(["numpad"]);

// Key cell geometry (logical row 0..3, col index, finger 1..10).
// Finger map (left=1..4, right=5..8): 1 pinky..4 index, 5 index..8 pinky.
// 9 / 10 are the thumbs (used by the numpad's wide 0 key).
const FINGER_QWERTY = {
  "1":1,"2":2,"3":3,"4":4,"5":4,"6":5,"7":5,"8":6,"9":7,"0":8,"-":8,"=":8,
  "q":1,"w":2,"e":3,"r":4,"t":4,"y":5,"u":5,"i":6,"o":7,"p":8,"[":8,"]":8,"\\":8,
  "a":1,"s":2,"d":3,"f":4,"g":4,"h":5,"j":5,"k":6,"l":7,";":8,"'":8,
  "z":1,"x":2,"c":3,"v":4,"b":4,"n":5,"m":5,",":6,".":7,"/":8,
  " ":4,
};

/* Standard 10-key touch technique: the whole pad is worked by the right
   hand, anchored on 4-5-6. Index owns the 7/4/1 column, middle owns
   8/5/2, ring owns 9/6/3 plus the decimal point beneath it, pinky
   stretches to the operator column (/ * - +) and Enter, and the thumb
   takes the wide 0. Without this table the pad inherits FINGER_QWERTY,
   which puts 1-2-3-4-5 on the LEFT hand — the exact opposite of how a
   numpad is actually played. */
const FINGER_NUMPAD = {
  "7":5, "4":5, "1":5,
  "8":6, "5":6, "2":6,
  "9":7, "6":7, "3":7, ".":7,
  "/":8, "*":8, "-":8, "+":8, "\n":8,
  "0":10,
};

const LAYOUT_FINGERS = {
  numpad: FINGER_NUMPAD,
};

export function keyMap(layoutName = "qwerty") {
  const rows = LAYOUTS[layoutName] || LAYOUTS.qwerty;
  const fingers = LAYOUT_FINGERS[layoutName] || FINGER_QWERTY;
  const map = {};
  rows.forEach((row, ri) => {
    Array.from(row).forEach((ch, ci) => {
      map[ch] = { row: ri, col: ci, finger: fingers[ch] || 0 };
    });
  });
  // Always include space.
  map[" "] = { row: 4, col: 0, finger: 4, isSpace: true };
  return map;
}

export function fingerName(n) {
  return ["", "L pinky", "L ring", "L middle", "L index", "R index", "R middle", "R ring", "R pinky", "L thumb", "R thumb"][n] || "";
}

/* Stable bucket key for per-finger stats. The 1..8 finger numbering
   omits thumbs, so we expose a 10-bucket scheme that adds an explicit
   thumb bucket for spacebar. Use this instead of raw finger numbers
   when persisting per-finger samples. */
export const FINGER_BUCKETS = [
  "L_pinky", "L_ring", "L_middle", "L_index",
  "R_index", "R_middle", "R_ring", "R_pinky",
  "L_thumb", "R_thumb",
];

const BUCKET_FOR_FINGER = {
  1: "L_pinky", 2: "L_ring", 3: "L_middle", 4: "L_index",
  5: "R_index", 6: "R_middle", 7: "R_ring", 8: "R_pinky",
  9: "L_thumb", 10: "R_thumb",
};

/* Returns the FINGER_BUCKETS key for a given character on the given
   layout. Returns null for unknown / unmapped chars. Spacebar maps to
   R_thumb by convention (most typists rest the right thumb on space). */
export function fingerForKey(ch, layoutName = "qwerty") {
  if (ch == null) return null;
  if (ch === " ") return "R_thumb";
  const c = String(ch).toLowerCase();
  const map = keyMap(layoutName);
  const cell = map[c];
  let finger = (cell && cell.finger) || 0;
  // Partial layouts (numpad) borrow the main board for anything they
  // don't carry, so ordinary prose still records finger samples.
  if (!finger && PARTIAL_LAYOUTS.has(layoutName)) finger = FINGER_QWERTY[c] || 0;
  if (!finger) return null;
  return BUCKET_FOR_FINGER[finger] || null;
}

export function bucketLabel(bucket) {
  return ({
    "L_pinky": "L pinky", "L_ring": "L ring", "L_middle": "L middle", "L_index": "L index",
    "R_index": "R index", "R_middle": "R middle", "R_ring": "R ring", "R_pinky": "R pinky",
    "L_thumb": "L thumb", "R_thumb": "R thumb",
  })[bucket] || bucket;
}
