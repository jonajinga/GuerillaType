/* Keyboard layouts — used for visualization only. Input handling
   ALWAYS uses KeyboardEvent.key (OS-resolved); the layout setting just
   tells the heatmap which key cell corresponds to which character. */

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
  // 10-key calculator pad (3 wide × 4 tall, with a wide 0).
  numpad: [
    "789",
    "456",
    "123",
    "0..",
  ],
};

// Key cell geometry (logical row 0..3, col index, finger 1..8).
// Finger map (left=1..4, right=5..8): 1 pinky..4 index, 5 index..8 pinky.
const FINGER_QWERTY = {
  "1":1,"2":2,"3":3,"4":4,"5":4,"6":5,"7":5,"8":6,"9":7,"0":8,"-":8,"=":8,
  "q":1,"w":2,"e":3,"r":4,"t":4,"y":5,"u":5,"i":6,"o":7,"p":8,"[":8,"]":8,"\\":8,
  "a":1,"s":2,"d":3,"f":4,"g":4,"h":5,"j":5,"k":6,"l":7,";":8,"'":8,
  "z":1,"x":2,"c":3,"v":4,"b":4,"n":5,"m":5,",":6,".":7,"/":8,
  " ":4,
};

export function keyMap(layoutName = "qwerty") {
  const rows = LAYOUTS[layoutName] || LAYOUTS.qwerty;
  const map = {};
  rows.forEach((row, ri) => {
    Array.from(row).forEach((ch, ci) => {
      map[ch] = { row: ri, col: ci, finger: FINGER_QWERTY[ch] || 0 };
    });
  });
  // Always include space.
  map[" "] = { row: 4, col: 0, finger: 4, isSpace: true };
  return map;
}

export function fingerName(n) {
  return ["", "L pinky", "L ring", "L middle", "L index", "R index", "R middle", "R ring", "R pinky"][n] || "";
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
  if (!cell || !cell.finger) return null;
  return BUCKET_FOR_FINGER[cell.finger] || null;
}

export function bucketLabel(bucket) {
  return ({
    "L_pinky": "L pinky", "L_ring": "L ring", "L_middle": "L middle", "L_index": "L index",
    "R_index": "R index", "R_middle": "R middle", "R_ring": "R ring", "R_pinky": "R pinky",
    "L_thumb": "L thumb", "R_thumb": "R thumb",
  })[bucket] || bucket;
}
