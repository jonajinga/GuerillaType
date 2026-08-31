/* Punctuation Storm -- punctuation-heavy fragments rain down four
   lanes. Type one exactly and it is gone. Let one hit the gutter and it
   costs a shield. Three shields and the storm wins.

   "Storm" is a rate, not a boss: spawn interval falls from 1.6s toward
   0.42s and fall speed climbs from 55px/s toward 130px/s, both purely
   as a function of elapsed playing time. Several fragments are on
   screen at once from the first few seconds, which is the whole
   difference from Boss Battle (one target, one timer).

   Two conventions here differ from boss-boot / snake-boot, both forced
   by the content:

   1. SPACE CANNOT BE THE COMMIT KEY. `x = {a: 1};` contains three
      spaces. Boss and Snake submit on space; this game matches live --
      the moment the input equals a fragment on screen, that fragment
      is cleared. Enter clears the input without penalty.

   2. THE FRAGMENT NODES PERSIST. Snake repaints its whole SVG every
      tick. Here each fragment is one <text> node created on spawn,
      moved by its y attribute, and removed on clear or leak, so a
      spawn is exactly one childList insertion. */

import { getActive, updateActive } from "../profiles.js";
import { Analytics } from "../analytics.js";
import { setSoundPrefs, playKey, playMistake, playFinish } from "../engine/sounds.js";
import {
  FRAGMENTS, STORM, pickFragment, scoreFor,
  spawnIntervalMs, fallSpeedPxPerSec,
} from "../engine/punct-fragments.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const STAGE_W = 800, STAGE_H = 460;
const GUTTER_Y = 408;          // fragments below this line have leaked
const SPAWN_Y = 26;
const LANES = [30, 222, 414, 606];

let live = [];                 // [{ id, text, x, y, lane, node }]
let nextId = 1;
let running = false;
let paused = false;
let rafHandle = null;
let lastTs = 0;
let elapsedMs = 0;
let sinceSpawnMs = 0;

let score = 0;
let cleared = 0;
let streak = 0;
let bestStreak = 0;
let shields = STORM.SHIELDS;
let leaks = 0;

const profile = getActive();
const skipPunctPref = !!((profile.preferences || {}).skipPunctuation);

const svg = document.getElementById("storm-svg");
const layer = document.getElementById("storm-layer");
const input = document.getElementById("game-input");
const startBtn = document.getElementById("game-start");
const pauseBtn = document.getElementById("game-pause");
const resetBtn = document.getElementById("game-reset");
const overlay = document.getElementById("storm-overlay");
const noticeEl = document.getElementById("storm-skip-notice");
const scoreEl = document.querySelector("[data-score]");
const clearedEl = document.querySelector("[data-cleared]");
const streakEl = document.querySelector("[data-streak]");
const shieldsEl = document.querySelector("[data-shields]");
const intensityEl = document.querySelector("[data-intensity]");
const bestEl = document.querySelector("[data-best]");

/* THE skipPunctuation DECISION.

   settings.njk offers "Skip punctuation", which makes the practice
   typing engine auto-clear . , ; : ' " ! ? - so the user never has to
   press them. Honouring it here would delete the game: every target is
   punctuation, so "skip punctuation" would mean "skip the game".

   So Punctuation Storm deliberately ignores the preference -- it never
   goes near TypingEngine, it compares the typed string to the fragment
   character for character. Silently ignoring a preference the user set
   is its own bug, so when the preference is on the page says so, in
   words, above the stage. It is the only place in the site where a
   preference is overridden, and the user is told. */
if (noticeEl) noticeEl.hidden = !skipPunctPref;

function readBest() {
  const fresh = getActive() || {};
  const gs = fresh.gameStats || {};
  return (gs.byMode || {}).storm || { highScore: 0, bestStreak: 0 };
}

function elapsedSec() { return elapsedMs / 1000; }

/* Split in two on purpose. readBest() parses localStorage, so calling
   it 60 times a second would be a JSON.parse per frame. The counters
   only change on an event; only the storm intensity readout is
   continuous, and that one touches nothing but a number. */
function paintStats() {
  scoreEl.textContent = String(score);
  clearedEl.textContent = String(cleared);
  streakEl.textContent = String(streak);
  shieldsEl.textContent = String(shields);
  bestEl.textContent = String(readBest().highScore || 0);
  paintIntensity();
}

function paintIntensity() {
  intensityEl.textContent = (spawnIntervalMs(elapsedSec()) / 1000).toFixed(2) + "s";
}

/* Approximate advance width of the monospace stage font at 18px, used
   only to keep a long fragment from running off the right edge. */
function widthOf(text) { return text.length * 10.9; }

function pickLane() {
  // Prefer a lane with nothing near the top, so two fragments never
  // spawn on top of each other and become unreadable.
  const busy = new Set(live.filter((f) => f.y < SPAWN_Y + 60).map((f) => f.lane));
  const free = LANES.map((_, i) => i).filter((i) => !busy.has(i));
  const from = free.length ? free : LANES.map((_, i) => i);
  return from[Math.floor(Math.random() * from.length)];
}

function spawn() {
  if (live.length >= STORM.MAX_ON_SCREEN) return;
  const text = pickFragment(live.map((f) => f.text));
  const lane = pickLane();
  const x = Math.min(LANES[lane], STAGE_W - 24 - widthOf(text));
  const node = document.createElementNS(SVG_NS, "text");
  node.setAttribute("class", "storm-frag");
  node.setAttribute("x", String(x));
  node.setAttribute("y", String(SPAWN_Y));
  node.setAttribute("data-frag", text);
  node.setAttribute("data-id", String(nextId));
  // textContent, never innerHTML: fragments contain <, > and & and any
  // markup path would have to escape them correctly forever.
  node.textContent = text;
  layer.appendChild(node);
  live.push({ id: nextId++, text, x, y: SPAWN_Y, lane, node });
}

function despawn(f) {
  live = live.filter((x) => x !== f);
  if (f.node && f.node.parentNode) f.node.parentNode.removeChild(f.node);
}

function markLocks() {
  const v = input.value;
  let anyLock = false;
  for (const f of live) {
    const locked = v.length > 0 && f.text.startsWith(v);
    if (locked) anyLock = true;
    if (locked) f.node.setAttribute("data-locked", "true");
    else f.node.removeAttribute("data-locked");
  }
  // No live fragment starts with what is typed -- flag the field so the
  // player knows to clear it rather than keep adding characters.
  if (running && !paused && v.length > 0 && !anyLock) input.setAttribute("data-bad", "true");
  else input.removeAttribute("data-bad");
}

function clearFragment(f) {
  despawn(f);
  streak++;
  if (streak > bestStreak) bestStreak = streak;
  cleared++;
  score += scoreFor(f.text, streak);
  playKey();
  paintStats();
}

function leak(f) {
  despawn(f);
  leaks++;
  shields = Math.max(0, shields - 1);
  streak = 0;
  playMistake();
  if (svg) {
    svg.setAttribute("data-leak-flash", "true");
    setTimeout(() => svg && svg.removeAttribute("data-leak-flash"), 220);
  }
  paintStats();
  if (shields <= 0) endRound();
}

function frame(ts) {
  if (!running) return;
  rafHandle = requestAnimationFrame(frame);
  const dt = lastTs ? Math.min(80, ts - lastTs) : 0;
  lastTs = ts;
  if (paused) return;
  elapsedMs += dt;
  sinceSpawnMs += dt;

  if (sinceSpawnMs >= spawnIntervalMs(elapsedSec())) {
    sinceSpawnMs = 0;
    spawn();
  }

  const step = (fallSpeedPxPerSec(elapsedSec()) * dt) / 1000;
  const leaked = [];
  for (const f of live) {
    f.y += step;
    f.node.setAttribute("y", String(Math.round(f.y * 10) / 10));
    if (f.y >= GUTTER_Y - 60) f.node.setAttribute("data-danger", "true");
    if (f.y >= GUTTER_Y) leaked.push(f);
  }
  for (const f of leaked) {
    leak(f);
    if (!running) return;
  }
  paintIntensity();
}

function clearStage() {
  for (const f of live.slice()) despawn(f);
  live = [];
  // The pre-round demo fragments are not in `live` -- they are inert
  // decoration -- so they need removing by hand or they would hang in
  // mid-air for the whole round.
  layer.querySelectorAll("[data-demo]").forEach((n) => n.remove());
}

/* A still frame before Start, so the stage is not a blank rectangle and
   a first-time player can see what a target looks like. Deliberately
   NOT given data-frag: nothing here is typeable, and a check script
   counting live targets must not pick these up. */
function paintDemo() {
  const demo = FRAGMENTS.slice(0, 3);
  demo.forEach((text, i) => {
    const node = document.createElementNS(SVG_NS, "text");
    node.setAttribute("class", "storm-frag storm-frag--demo");
    node.setAttribute("x", String(LANES[i]));
    node.setAttribute("y", String(120 + i * 80));
    node.setAttribute("data-demo", "true");
    node.textContent = text;
    layer.appendChild(node);
  });
}

function resetState() {
  clearStage();
  score = 0; cleared = 0; streak = 0; bestStreak = 0;
  shields = STORM.SHIELDS; leaks = 0;
  elapsedMs = 0; sinceSpawnMs = 0; lastTs = 0;
}

function startRound() {
  if (running) return;
  resetState();
  if (overlay) overlay.hidden = true;
  running = true;
  paused = false;
  startBtn.hidden = true;
  pauseBtn.hidden = false;
  pauseBtn.textContent = "Pause";
  resetBtn.hidden = false;
  input.value = "";
  input.removeAttribute("data-bad");
  input.disabled = false;
  input.focus({ preventScroll: true });
  if (svg) svg.setAttribute("data-running", "true");
  Analytics.gameStart({ mode: "storm", speed: 1 });
  paintStats();
  // Open with one fragment already falling so the first second is not
  // an empty screen.
  spawn();
  rafHandle = requestAnimationFrame(frame);
}

function endRound() {
  if (!running) return;
  running = false;
  if (rafHandle) cancelAnimationFrame(rafHandle);
  rafHandle = null;
  if (svg) svg.removeAttribute("data-running");
  Analytics.gameOver({ mode: "storm", score, caught: cleared, missed: leaks, bestStreak, speed: 1 });
  let isNewBest = false;
  try {
    updateActive((p) => {
      p.gameStats = p.gameStats || { rounds: 0, totalCaught: 0 };
      p.gameStats.byMode = p.gameStats.byMode || {};
      const m = p.gameStats.byMode.storm || { highScore: 0, bestStreak: 0, rounds: 0, totalCaught: 0 };
      if (score > m.highScore) { m.highScore = score; isNewBest = true; }
      if (bestStreak > m.bestStreak) m.bestStreak = bestStreak;
      m.rounds = (m.rounds || 0) + 1;
      m.totalCaught = (m.totalCaught || 0) + cleared;
      m.lastPlayedAt = new Date().toISOString();
      p.gameStats.byMode.storm = m;
      return p;
    });
  } catch {}
  if (isNewBest) try { Analytics.gameNewBest({ mode: "storm", score }); } catch {}
  playFinish();
  clearStage();
  if (overlay) {
    overlay.hidden = false;
    overlay.querySelector("[data-over-score]").textContent = String(score);
    overlay.querySelector("[data-over-cleared]").textContent = String(cleared);
    overlay.querySelector("[data-over-streak]").textContent = String(bestStreak);
    overlay.querySelector("[data-over-best]").hidden = !isNewBest;
  }
  startBtn.textContent = "Play again";
  startBtn.hidden = false;
  pauseBtn.hidden = true;
  paintStats();
  try { input.blur(); } catch {}
}

function reset() {
  running = false;
  paused = false;
  if (rafHandle) cancelAnimationFrame(rafHandle);
  rafHandle = null;
  resetState();
  paintDemo();
  if (svg) svg.removeAttribute("data-running");
  if (overlay) overlay.hidden = true;
  input.value = "";
  input.removeAttribute("data-bad");
  startBtn.textContent = "Start";
  startBtn.hidden = false;
  pauseBtn.hidden = true;
  resetBtn.hidden = true;
  paintStats();
}

input.addEventListener("input", () => {
  if (!running || paused) { markLocks(); return; }
  const v = input.value;
  // Exact match wins. No fragment in the pool is a prefix of another
  // (scripts/check-punctuation-storm.mjs asserts it), so "exact" is
  // never ambiguous with "still typing a longer one".
  const hit = live.find((f) => f.text === v);
  if (hit) {
    clearFragment(hit);
    input.value = "";
  }
  markLocks();
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === "Escape") {
    // Shake-off key. There is no score penalty for typing the wrong
    // thing in this game -- the only cost is a fragment reaching the
    // gutter -- so this just empties the field.
    if (input.value) playMistake();
    input.value = "";
    markLocks();
    e.preventDefault();
  }
});

startBtn.addEventListener("click", startRound);
pauseBtn.addEventListener("click", () => {
  if (!running) return;
  paused = !paused;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
  if (!paused) input.focus({ preventScroll: true });
});
resetBtn.addEventListener("click", reset);

setSoundPrefs({
  theme: (profile.preferences && profile.preferences.soundTheme) || "off",
  volume: (profile.preferences && profile.preferences.soundVolume) || 0.5,
});

paintDemo();
paintStats();
