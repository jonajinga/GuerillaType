/* localStorage facade with namespaced keys, JSON encoding, and simple
   versioning. All app keys are tt:* so we don't collide with anything
   else on the same origin. */

const NS = "tt:";
export const KEY_PROFILES = NS + "profiles";
export const KEY_ACTIVE = NS + "active-profile";
// NB: there is deliberately no KEY_SETTINGS. "tt:settings" was declared
// and included in the old wipe list but never read or written by anything
// -- settings live in profile.settings / profile.preferences.
export const KEY_CUSTOM = NS + "custom-texts";
export const KEY_META = NS + "meta";
export const KEY_THEME = NS + "theme";
export const KEY_DEVICE = NS + "device-id";

export const SCHEMA_VERSION = 5;

/* ---------------------------------------------------------------
   Key classification.

   Sync needs to know which of these belong to the *person* and which
   belong to the *browser they happen to be sitting at*. Getting this
   wrong is how "sync" starts yanking the active profile out from under
   someone on a second device, or uploads a half-typed contact-form
   draft to a server.

   SYNCABLE   — the user's work. Follows them everywhere.
   DEVICE     — deliberately stays put. Which profile is open, where you
                are in a playlist, dismissed prompts, debug toggles.

   Anything matching neither is treated as DEVICE (fail closed): a key
   we forgot to classify must never be uploaded by default.
   --------------------------------------------------------------- */
export const SYNCABLE_KEYS = [KEY_PROFILES, KEY_CUSTOM, KEY_THEME, NS + "collections"];
export const SYNCABLE_PREFIXES = [NS + "lesson-best-"];

const DEVICE_PREFIXES = [NS + "contribute-draft-", NS + "toc-collapsed:"];
const DEVICE_KEYS = [
  KEY_ACTIVE, KEY_META, KEY_DEVICE,
  // Cached sign-in state. Device-local by definition, and holds no token
  // -- the session itself is an HttpOnly cookie JS cannot read.
  NS + "session.v1",
  NS + "active-collection", NS + "active-collection-index",
  NS + "feedback-draft", NS + "testimonial-prompt-dismissed",
  NS + "pwa-install-dismissed", NS + "pwa-installed",
  NS + "debug", NS + "analytics-debug",
];

export function isSyncable(key) {
  if (SYNCABLE_KEYS.includes(key)) return true;
  return SYNCABLE_PREFIXES.some((p) => key.startsWith(p));
}

export function isKnownDeviceKey(key) {
  if (DEVICE_KEYS.includes(key)) return true;
  return DEVICE_PREFIXES.some((p) => key.startsWith(p));
}

/* Keys nobody has classified. isSyncable fails closed, so an unclassified
   key silently becomes device-local -- which is the safe default but also
   a silent one: ship a feature with a new tt:* key and its data quietly
   stops following the user, with nothing to notice. Surface them instead. */
export function unclassifiedKeys() {
  return enumerateAppKeys().device.filter((k) => !isKnownDeviceKey(k));
}

/* Every tt:* key currently present, split by destination. Sync must
   enumerate rather than hardcode -- lesson bests alone are ~500 discrete
   keys, and the drafts/flags tail grows whenever a feature lands. */
export function enumerateAppKeys() {
  const sync = [], device = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(NS)) continue;
      (isSyncable(k) ? sync : device).push(k);
    }
  } catch {}
  return { sync, device };
}

/* A stable per-browser id. Needed because the adaptive model merges as
   a per-device counter (see sync/merge.js) -- two devices each keep
   their own slot and the totals are summed, which is what makes a
   repeated push idempotent instead of inflating someone's stats.

   Minted before sign-in and never rotated, so pre-account writes keep
   their attribution when the local data is later claimed. */
export function getDeviceId() {
  let id = null;
  try { id = localStorage.getItem(KEY_DEVICE); } catch {}
  if (id) return id;
  id = (crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    // Pre-2021 Safari has crypto but not randomUUID.
    : "d-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  try { localStorage.setItem(KEY_DEVICE, id); } catch {}
  return id;
}

/* Wipe every tt:* key. The old danger-zone handler removed five named
   keys, which left tt:theme, ~500 tt:lesson-best-* entries, collections,
   drafts and flags behind -- so a "wiped" browser still showed mastered
   lessons and could re-unlock lesson achievements. Tolerable as a local
   quirk; not tolerable once we promise account deletion. */
export function clearAllAppData({ keepDeviceId = false } = {}) {
  const doomed = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(NS)) continue;
      if (keepDeviceId && k === KEY_DEVICE) continue;
      doomed.push(k);
    }
    // Collect first, delete second -- removing during the index walk
    // reshuffles localStorage and silently skips keys.
    for (const k of doomed) localStorage.removeItem(k);
  } catch {}
  return doomed.length;
}

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
  if (meta.version < 5) migrateV4ToV5();
  setMeta({ version: SCHEMA_VERSION, migratedAt: new Date().toISOString() });
}

/* v4 → v5: prepare the local shape for cross-device sync.
   - Mint a device id (see getDeviceId).
   - Declare the three subtrees that were only ever created lazily at
     their write sites -- modeBests (session-recorder), missedWordsPeak
     (session-recorder), gameStats (the nine game boots). They were
     absent from newProfile(), so every reader had to defend with
     `|| {}`. Merging can't reason about a field that may or may not
     exist, so they get declared here and in newProfile().
   Non-destructive: existing values are left exactly as they are. */
function migrateV4ToV5() {
  try {
    getDeviceId();
    const raw = localStorage.getItem(KEY_PROFILES);
    if (!raw) return;
    const ps = JSON.parse(raw);
    if (!Array.isArray(ps)) return;
    let dirty = false;
    for (const p of ps) {
      if (!p || typeof p !== "object") continue;
      if (!p.modeBests) { p.modeBests = {}; dirty = true; }
      if (typeof p.missedWordsPeak !== "number") {
        p.missedWordsPeak = Object.keys(p.missedWords || {}).length;
        dirty = true;
      }
      if (!p.gameStats) {
        p.gameStats = { rounds: 0, totalCaught: 0, highScore: 0, bestStreak: 0, byMode: {} };
        dirty = true;
      }
      p.version = 5;
    }
    if (dirty) localStorage.setItem(KEY_PROFILES, JSON.stringify(ps));
  } catch (e) {
    console.warn("[storage] v4->v5 migration soft-failed:", e);
  }
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
