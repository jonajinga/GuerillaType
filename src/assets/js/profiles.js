import { read, write, KEY_PROFILES, KEY_ACTIVE } from "./storage.js";

const DEFAULT_SETTINGS = {
  layout: "qwerty",
  language: "en-1k",
  theme: "system",
  punctuation: false,
  numbers: false,
  freedom: true,        // allow forward typing past errors
  blindMode: false,     // don't show correctness highlight (advanced)
  sound: false,
  caret: "line",        // line | block | underline
  showLiveWPM: true,
  smoothCaret: true,
  dailyGoalSec: 600,    // 10 minutes
};

const DEFAULT_PREFERENCES = {
  stopOnError: false, forgiveErrors: false, spaceSkipsWords: false,
  whitespaceMark: "none", soundTheme: "off", soundVolume: 0.5,
  // Default the virtual keyboard + finger colors ON. They're the
  // signature visual aid; users can turn them off in Settings.
  showVirtualKeyboard: true, keyboardFingerColors: true,
  showTicker: false,
  reportFrequency: "word",
  hideUI: false, hideToolbar: false, autoScroll: true, ignoreCapitalization: false,
  skipPunctuation: false,
  cursorStyle: "line",
  typingFont: "jetbrains-mono",
  customThemes: [],
  // Per-mode auto-advance switches, keyed by the mode family the
  // practice page derives (time, words, quote, custom, book, lesson,
  // drill, challenge, adaptive, idiom, poem, parable). Missing = off.
  autoAdvance: {},
  /* "This device has a physical keyboard", the Settings switch under
     Auto-advance. The browser cannot tell an iPad with a Magic
     Keyboard from an iPad without one: both report the touch-first
     media query and a tablet user agent, so isMobileLike() in
     typing-engine.js says soft keyboard and the site waits for a tap
     before every run. This is the user overruling that, per device
     (it lives in the profile, which is per browser). Off by default:
     the tap-to-start path is the safe direction to be wrong in. */
  physicalKeyboard: false,
};

export function newProfile(name = "Default") {
  return {
    version: 2,
    id: "p_" + Math.random().toString(36).slice(2, 8),
    name,
    createdAt: new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS },
    preferences: { ...DEFAULT_PREFERENCES },
    lifetime: {
      sessions: 0, chars: 0, correctChars: 0, totalMs: 0,
      bestWpm: 0, bestAccuracy: 0, streakDays: 0, lastDay: null,
    },
    perKey: {},
    perBigram: {},
    perFinger: {},
    perCharDetail: {},
    missedWords: {},
    sessions: [],
    daily: {},
    hourly: {},
    achievements: [],
    challengeBests: {},
    lessonResults: [],
    sessionsByLesson: {},
    bookProgress: {},
    corpusProgress: {},
  };
}

export function getProfiles() {
  let p = read(KEY_PROFILES, null);
  if (!p || !Array.isArray(p) || !p.length) {
    const init = [newProfile("Default")];
    write(KEY_PROFILES, init);
    write(KEY_ACTIVE, init[0].id);
    return init;
  }
  return p;
}
export function saveProfiles(p) { write(KEY_PROFILES, p); }
export function getActiveId() {
  const id = read(KEY_ACTIVE, null);
  if (id) return id;
  const ps = getProfiles();
  if (ps[0]) { write(KEY_ACTIVE, ps[0].id); return ps[0].id; }
  return null;
}
export function setActiveId(id) { write(KEY_ACTIVE, id); }

export function getActive() {
  const ps = getProfiles();
  const id = getActiveId();
  return ps.find((p) => p.id === id) || ps[0];
}
export function updateActive(mut) {
  const ps = getProfiles();
  const id = getActiveId();
  const i = ps.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const next = mut(ps[i]) || ps[i];
  ps[i] = next;
  saveProfiles(ps);
  return next;
}

export function addProfile(name) {
  const ps = getProfiles();
  const np = newProfile(name);
  ps.push(np);
  saveProfiles(ps);
  setActiveId(np.id);
  return np;
}

export function renameProfile(id, name) {
  const ps = getProfiles();
  const i = ps.findIndex((p) => p.id === id);
  if (i < 0) return;
  ps[i].name = name;
  saveProfiles(ps);
}

export function deleteProfile(id) {
  let ps = getProfiles();
  ps = ps.filter((p) => p.id !== id);
  if (!ps.length) ps = [newProfile("Default")];
  saveProfiles(ps);
  if (getActiveId() === id) setActiveId(ps[0].id);
}

export function exportJson() {
  const ps = getProfiles();
  const blob = new Blob([JSON.stringify({ version: 1, profiles: ps }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `typing-tutor-profiles-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importJson(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.profiles)) throw new Error("Invalid file");
  const cur = getProfiles();
  // Merge by id; new ids get appended.
  const byId = new Map(cur.map((p) => [p.id, p]));
  for (const p of data.profiles) byId.set(p.id, p);
  saveProfiles(Array.from(byId.values()));
}
