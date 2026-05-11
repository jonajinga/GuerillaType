/* Sound feedback -- Web Audio API synthesis (no audio files).
   Three keystroke themes: "click", "typewriter", "pop". The
   "off" theme is a no-op (skipped at the call site). Sounds are
   short and quiet -- no autoplay-policy issues, no library, no
   asset bytes.

   Each playKey call schedules a few oscillator + envelope pairs
   on a shared AudioContext. The context is lazily initialized on
   the first call (browser autoplay policy lets us create + start
   the context once the user has gestured, which is true by the
   time the first keystroke fires).

   Usage:
     import { playKey, playMistake, setSoundPrefs } from "../engine/sounds.js";
     setSoundPrefs({ theme: "click", volume: 0.5 });
     playKey();       // each correct keystroke
     playMistake();   // wrong keystroke
*/

let ctx = null;
let theme = "off";
let volume = 0.5;
// Stale-context guard. Some browsers suspend the AudioContext after
// long idle; we resume() before each play to keep schedule timing
// from drifting.
function ensureCtx() {
  if (ctx) return ctx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx({ latencyHint: "interactive" });
  } catch {
    ctx = null;
  }
  return ctx;
}

export function setSoundPrefs(prefs) {
  if (!prefs) return;
  if (typeof prefs.theme === "string") theme = prefs.theme;
  if (typeof prefs.volume === "number") volume = Math.max(0, Math.min(1, prefs.volume));
}

export function getSoundPrefs() {
  return { theme, volume };
}

/* Schedule one tone: oscillator -> gain envelope -> destination. */
function tone({ freq = 800, dur = 0.05, type = "sine", attack = 0.001, release = 0.04, peak = 0.4 }) {
  const c = ensureCtx();
  if (!c) return;
  if (c.state === "suspended") { try { c.resume(); } catch {} }
  const now = c.currentTime;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(peak * volume, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(now);
  osc.stop(now + attack + release + 0.02);
}

/* Soft band-limited noise for typewriter / pop themes. */
function noise({ dur = 0.04, peak = 0.3, lowpass = 1200 }) {
  const c = ensureCtx();
  if (!c) return;
  if (c.state === "suspended") { try { c.resume(); } catch {} }
  const now = c.currentTime;
  // Short noise buffer
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    // Slight envelope baked in to avoid clicks at start/end.
    const env = 1 - (i / len);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = lowpass;
  const g = c.createGain();
  g.gain.setValueAtTime(peak * volume, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(c.destination);
  src.start(now);
}

/* Per-theme keystroke. Each call is < 60 ms total. */
export function playKey() {
  if (theme === "off" || volume <= 0) return;
  if (theme === "click") {
    // Crisp mechanical-keyboard click: short noise burst + a
    // higher tonal tick layered on top.
    noise({ dur: 0.025, peak: 0.18, lowpass: 4000 });
    tone({ freq: 2400, dur: 0.02, type: "triangle", attack: 0.001, release: 0.018, peak: 0.12 });
    return;
  }
  if (theme === "typewriter") {
    // Vintage typewriter: low percussive thump (key hitting
    // platen) + a softer high-frequency tick (the type bar).
    noise({ dur: 0.06, peak: 0.28, lowpass: 800 });
    tone({ freq: 1700, dur: 0.025, type: "square", attack: 0.001, release: 0.022, peak: 0.08 });
    return;
  }
  if (theme === "pop") {
    // Quick percussive: a single sine pop with fast attack +
    // exponential release. Bright, clean.
    tone({ freq: 760, dur: 0.045, type: "sine", attack: 0.001, release: 0.04, peak: 0.32 });
    return;
  }
}

export function playMistake() {
  if (theme === "off" || volume <= 0) return;
  // Universal "wrong" cue across themes: a brief low-frequency
  // tone with a soft attack. Quieter than the correct-key sound
  // so the surface doesn't feel punishing on a streak of misses.
  tone({ freq: 180, dur: 0.06, type: "sawtooth", attack: 0.002, release: 0.05, peak: 0.18 });
}

export function playFinish() {
  if (theme === "off" || volume <= 0) return;
  // Two-note ascending chime at session-end. Lands a positive
  // beat without becoming a fanfare.
  tone({ freq: 660, dur: 0.12, type: "triangle", attack: 0.005, release: 0.1, peak: 0.32 });
  setTimeout(() => tone({
    freq: 880, dur: 0.16, type: "triangle", attack: 0.005, release: 0.14, peak: 0.32,
  }), 120);
}
