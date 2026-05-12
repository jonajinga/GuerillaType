/* Bigram Drill -- short letter combos appear in succession.
   60-second timed run. Score by speed + accuracy. Pool draws
   from common English bigrams and trigrams. */

import { getActive, updateActive } from "../profiles.js";
import { Analytics } from "../analytics.js";
import { setSoundPrefs, playKey, playMistake, playFinish } from "../engine/sounds.js";

const BIGRAMS = [
  "th","he","in","er","an","re","on","at","en","nd",
  "ti","es","or","te","of","ed","is","it","al","ar",
  "st","to","nt","ng","se","ha","as","ou","io","le",
  "ve","co","me","de","hi","ri","ro","ic","ne","ea",
  "ra","ce","li","ch","ll","be","ma","si","om","ur",
];
const TRIGRAMS = [
  "the","and","ing","ion","ent","for","tio","ere","her","ate",
  "ver","ter","hat","tha","ere","ate","his","con","res","ver",
  "all","fro","tio","est","oun","oth","ith","fth","sth","ous",
  "str","spr","spl","scr","squ","thr","shr","sch","chr","sph",
];

const DURATION_MS = 60_000;
let target = "";
let cleared = 0;
let score = 0;
let streak = 0;
let bestStreak = 0;
let charsTyped = 0;
let running = false;
let startTs = 0;
let rafHandle = null;

const profile = getActive();
const display = document.getElementById("bigrams-display");
const timer = document.getElementById("bigrams-timer");
const input = document.getElementById("game-input");
const startBtn = document.getElementById("game-start");
const resetBtn = document.getElementById("game-reset");
const scoreEl = document.querySelector("[data-score]");
const clearedEl = document.querySelector("[data-cleared]");
const wpmEl = document.querySelector("[data-wpm]");
const streakEl = document.querySelector("[data-streak]");
const bestEl = document.querySelector("[data-best]");

function readBest() {
  const fresh = getActive() || {};
  const gs = fresh.gameStats || {};
  return (gs.byMode || {}).bigrams || { highScore: 0, bestStreak: 0 };
}

function pickTarget() {
  // 70% bigrams, 30% trigrams.
  const pool = Math.random() < 0.7 ? BIGRAMS : TRIGRAMS;
  let t;
  do { t = pool[Math.floor(Math.random() * pool.length)]; } while (t === target);
  return t;
}

function paint() {
  display.innerHTML = target ? target.split("").map((c) => `<span class="bigrams-char">${c}</span>`).join("") : "Press Start.";
  const elapsed = startTs ? performance.now() - startTs : 0;
  const left = Math.max(0, DURATION_MS - elapsed);
  timer.textContent = (left / 1000).toFixed(1) + "s";
}

function paintStats() {
  scoreEl.textContent = String(score);
  clearedEl.textContent = String(cleared);
  const elapsedMs = startTs ? Math.min(DURATION_MS, performance.now() - startTs) : 0;
  const wpm = elapsedMs > 0 ? Math.round((charsTyped / 5) / (elapsedMs / 60000)) : 0;
  wpmEl.textContent = String(wpm);
  streakEl.textContent = String(streak);
  bestEl.textContent = String(readBest().highScore || 0);
}

function nextTarget() {
  target = pickTarget();
  paint();
}

function loop() {
  if (!running) return;
  const elapsed = performance.now() - startTs;
  if (elapsed >= DURATION_MS) { endRound(); return; }
  paint();
  paintStats();
  rafHandle = requestAnimationFrame(loop);
}

function startRound() {
  if (running) return;
  cleared = 0;
  score = 0;
  streak = 0;
  bestStreak = 0;
  charsTyped = 0;
  startTs = performance.now();
  running = true;
  startBtn.hidden = true;
  resetBtn.hidden = false;
  input.value = "";
  input.focus({ preventScroll: true });
  Analytics.gameStart({ mode: "bigrams", speed: 1 });
  nextTarget();
  paintStats();
  rafHandle = requestAnimationFrame(loop);
}

function endRound() {
  if (!running) return;
  running = false;
  if (rafHandle) cancelAnimationFrame(rafHandle);
  const elapsedMs = Math.min(DURATION_MS, performance.now() - startTs);
  const wpm = elapsedMs > 0 ? Math.round((charsTyped / 5) / (elapsedMs / 60000)) : 0;
  // Final score = cleared * 5 + WPM bonus
  score = cleared * 5 + wpm;
  Analytics.gameOver({ mode: "bigrams", score, caught: cleared, missed: 0, bestStreak, speed: 1 });
  let isNewBest = false;
  try {
    updateActive((p) => {
      p.gameStats = p.gameStats || { rounds: 0, totalCaught: 0 };
      p.gameStats.byMode = p.gameStats.byMode || {};
      const m = p.gameStats.byMode.bigrams || { highScore: 0, bestStreak: 0, rounds: 0, totalCaught: 0 };
      if (score > m.highScore) { m.highScore = score; isNewBest = true; }
      if (bestStreak > m.bestStreak) m.bestStreak = bestStreak;
      m.rounds = (m.rounds || 0) + 1;
      m.totalCaught = (m.totalCaught || 0) + cleared;
      m.lastPlayedAt = new Date().toISOString();
      p.gameStats.byMode.bigrams = m;
      return p;
    });
  } catch {}
  if (isNewBest) try { Analytics.gameNewBest({ mode: "bigrams", score }); } catch {}
  playFinish();
  display.innerHTML = `<span class="bigrams-summary">${score} pts  ·  ${cleared} cleared  ·  ${wpm} wpm  ·  best streak ${bestStreak}</span>`;
  timer.textContent = isNewBest ? "NEW PERSONAL BEST" : "";
  startBtn.textContent = "Run again";
  startBtn.hidden = false;
  try { input.blur(); } catch {}
}

function reset() {
  running = false;
  if (rafHandle) cancelAnimationFrame(rafHandle);
  cleared = 0; score = 0; streak = 0; bestStreak = 0;
  charsTyped = 0; startTs = 0; target = "";
  display.textContent = "Press Start.";
  timer.textContent = "";
  input.value = "";
  paintStats();
  startBtn.textContent = "Start 60s";
  startBtn.hidden = false;
  resetBtn.hidden = true;
}

input.addEventListener("input", () => {
  if (!running) return;
  const v = input.value;
  if (v.endsWith(" ")) {
    const typed = v.trim().toLowerCase();
    if (typed === target) {
      cleared++;
      streak++;
      if (streak > bestStreak) bestStreak = streak;
      charsTyped += target.length + 1;
      playKey();
      input.value = "";
      nextTarget();
    } else {
      streak = 0;
      playMistake();
      input.value = "";
      // Don't change target; let the user retry.
    }
    paintStats();
  }
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const typed = input.value.trim().toLowerCase();
    if (typed === target) {
      cleared++; streak++; if (streak > bestStreak) bestStreak = streak;
      charsTyped += target.length + 1;
      playKey();
      input.value = "";
      nextTarget();
    } else {
      streak = 0;
      playMistake();
      input.value = "";
    }
    paintStats();
    e.preventDefault();
  }
});

startBtn.addEventListener("click", startRound);
resetBtn.addEventListener("click", reset);

setSoundPrefs({
  theme: (profile.preferences && profile.preferences.soundTheme) || "off",
  volume: (profile.preferences && profile.preferences.soundVolume) || 0.5,
});
paintStats();
