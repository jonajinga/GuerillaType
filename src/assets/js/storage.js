/* localStorage facade with namespaced keys, JSON encoding, and simple
   versioning. All app keys are tt:* so we don't collide with anything
   else on the same origin. */

const NS = "tt:";
export const KEY_PROFILES = NS + "profiles";
export const KEY_ACTIVE = NS + "active-profile";
export const KEY_SETTINGS = NS + "settings";
export const KEY_CUSTOM = NS + "custom-texts";
export const KEY_META = NS + "meta";
export const KEY_THEME = NS + "theme";

export const SCHEMA_VERSION = 4;

export function read(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}
export function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch (e) { console.warn("[storage] quota?", e); return false; }
}
export function remove(key) { try { localStorage.removeItem(key); } catch {} }

export function getMeta() {
  return read(KEY_META, { version: SCHEMA_VERSION });
}
export function setMeta(m) { write(KEY_META, m); }

export function migrate() {
  const meta = getMeta();
  if (meta.version === SCHEMA_VERSION) return;
  if (meta.version < 2) migrateV1ToV2();
  if (meta.version < 3) migrateV2ToV3();
  if (meta.version < 4) migrateV3ToV4();
  setMeta({ version: SCHEMA_VERSION, migratedAt: new Date().toISOString() });
}

/* v2 → v3:
   - Reset preferences.whitespaceMark to "none" for everyone. The
     v2 default was "bullet" which produced a visible · between every
     word — most users found it noisy. Keeping v3 as opt-in only.
   - This is non-destructive: only flips the one pref. Other prefs
     stay as the user has them. */
/* v3 → v4:
   - Turn on the virtual keyboard + finger-color overlay by default.
     They're the signature visual aid; the v2 default of "off" hid
     them from most users. Existing profiles get them flipped to true
     unless they've already been explicitly set true (no-op then).
   - Users who don't want the overlay can turn it off in Settings. */
function migrateV3ToV4() {
  try {
    const raw = localStorage.getItem(KEY_PROFILES);
    if (!raw) return;
    const ps = JSON.parse(raw);
    if (!Array.isArray(ps)) return;
    let dirty = false;
    for (const p of ps) {
      if (!p || typeof p !== "object") continue;
      p.preferences = p.preferences || {};
      if (!p.preferences.showVirtualKeyboard)   { p.preferences.showVirtualKeyboard = true; dirty = true; }
      if (!p.preferences.keyboardFingerColors)  { p.preferences.keyboardFingerColors = true; dirty = true; }
      p.version = 4;
    }
    if (dirty) localStorage.setItem(KEY_PROFILES, JSON.stringify(ps));
  } catch (e) {
    console.warn("[storage] v3->v4 migration soft-failed:", e);
  }
}

function migrateV2ToV3() {
  try {
    const raw = localStorage.getItem(KEY_PROFILES);
    if (!raw) return;
    const ps = JSON.parse(raw);
    if (!Array.isArray(ps)) return;
    let dirty = false;
    for (const p of ps) {
      if (!p || typeof p !== "object") continue;
      if (p.preferences && p.preferences.whitespaceMark === "bullet") {
        p.preferences.whitespaceMark = "none";
        dirty = true;
      }
      p.version = 3;
    }
    if (dirty) localStorage.setItem(KEY_PROFILES, JSON.stringify(ps));
  } catch (e) {
    console.warn("[storage] v2->v3 migration soft-failed:", e);
  }
}

/* v1 → v2:
   - Adds perFinger, perCharDetail, lessonResults, sessionsByLesson,
     hourly buckets, bookProgress, and a preferences subtree.
   - All existing keys (perKey, perBigram, sessions, daily, etc.) are
     preserved untouched. Reads are best-effort: if KEY_PROFILES is
     missing or malformed we leave it alone and the defaults will be
     written when profiles.js next creates a profile. */
function migrateV1ToV2() {
  try {
    const raw = localStorage.getItem(KEY_PROFILES);
    if (!raw) return;
    const ps = JSON.parse(raw);
    if (!Array.isArray(ps)) return;
    let dirty = false;
    for (const p of ps) {
      if (!p || typeof p !== "object") continue;
      if (!p.perFinger) { p.perFinger = {}; dirty = true; }
      if (!p.perCharDetail) { p.perCharDetail = {}; dirty = true; }
      if (!p.missedWords) { p.missedWords = {}; dirty = true; }
      if (!p.lessonResults) { p.lessonResults = []; dirty = true; }
      if (!p.sessionsByLesson) { p.sessionsByLesson = {}; dirty = true; }
      if (!p.hourly) { p.hourly = {}; dirty = true; }
      if (!p.bookProgress) { p.bookProgress = {}; dirty = true; }
      if (!p.preferences) {
        p.preferences = {
          stopOnError: false, forgiveErrors: false, spaceSkipsWords: false,
          whitespaceMark: "none", soundTheme: "off", soundVolume: 0.5,
          showVirtualKeyboard: false, showTicker: false,
          reportFrequency: "word",
          hideUI: false, hideToolbar: false, autoScroll: true, ignoreCapitalization: false,
          skipPunctuation: false,
          cursorStyle: p.settings && p.settings.caret ? p.settings.caret : "line",
          typingFont: "jetbrains-mono",
          customThemes: [],
        };
        dirty = true;
      }
      p.version = 2;
    }
    if (dirty) localStorage.setItem(KEY_PROFILES, JSON.stringify(ps));
  } catch (e) {
    console.warn("[storage] v1->v2 migration soft-failed:", e);
  }
}

export function quotaUsed() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(NS)) continue;
    total += (localStorage.getItem(k) || "").length + k.length;
  }
  return total; // bytes (approx; UTF-16 doubles in some browsers)
}
