/* Memory Type -- working-memory sequence game. A sequence of N
   words flashes one at a time; the user reproduces it. Each round
   adds one word; one wrong reproduction ends the run. */

import { getActive, updateActive } from "../profiles.js";
import { Analytics } from "../analytics.js";
import { setSoundPrefs, playKey, playMistake, playFinish } from "../engine/sounds.js";

const POOL = [
  "river","stone","forest","mountain","valley","ocean","light","shadow","star","moon",
  "house","window","table","chair","letter","story","music","painter","writer","dancer",
  "morning","evening","summer","winter","autumn","spring","season","weather","wind","rain",
  "happy","quiet","gentle","careful","steady","honest","clever","brave","kind","wise",
  "drink","speak","listen","follow","gather","forget","remember","change","return","arrive",
  "single","double","triple","middle","center","corner","border","circle","square","ladder",
  "honey","spice","bread","candle","velvet","copper","silver","sapphire","ember","cobalt",
];

const FLASH_MS = 800;
const GAP_MS = 250;

let round = 1;
let sequence = [];
let cursor = 0;        // playback or input cursor
let phase = "idle";    // idle | watch | type | done
let score = 0;
let running = false;
let phaseTimer = null;
let lastIndex = -1;

const profile = getActive();
const phaseEl = document.getElementById("memory-phase");
const displayEl = document.getElementById("memory-display");
const slotsEl = document.getElementById("memory-slots");
const input = document.getElementById("game-input");
const startBtn = document.getElementById("game-start");
const resetBtn = document.getElementById("game-reset");
const scoreEl = document.querySelector("[data-score]");
const roundEl = document.querySelector("[data-round]");
const lengthEl = document.querySelector("[data-length]");
const bestEl = document.querySelector("[data-best]");

function readBest() {
  const fresh = getActive() || {};
  const gs = fresh.gameStats || {};
  return (gs.byMode || {}).memory || { highScore: 0, bestStreak: 0 };
}

function pickWord() {
  let i;
  do { i = Math.floor(Math.random() * POOL.length); } while (i === lastIndex);
  lastIndex = i;
  return POOL[i];
}

function pickSequence(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    let w;
    do { w = POOL[Math.floor(Math.random() * POOL.length)]; } while (out[out.length - 1] === w);
    out.push(w);
  }
  return out;
}

function renderSlots(filled) {
  slotsEl.innerHTML = sequence.map((_, i) => {
    if (phase === "watch") return `<span class="memory-slot is-hidden">·</span>`;
    if (phase === "type" && i < filled) return `<span class="memory-slot is-typed">${sequence[i]}</span>`;
    return `<span class="memory-slot">_</span>`;
  }).join("");
}

function paintStats() {
  scoreEl.textContent = String(score);
  roundEl.textContent = String(round);
  lengthEl.textContent = String(sequence.length || (round + 2));
  bestEl.textContent = String(readBest().highScore || 0);
}

function watchSequence() {
  phase = "watch";
  cursor = 0;
  phaseEl.textContent = "Watch the sequence…";
  input.disabled = true;
  input.value = "";
  renderSlots(0);
  function flashNext() {
    if (cursor >= sequence.length) {
      displayEl.textContent = "";
      startTypePhase();
      return;
    }
    displayEl.textContent = sequence[cursor];
    cursor++;
    phaseTimer = setTimeout(() => {
      displayEl.textContent = "";
      phaseTimer = setTimeout(flashNext, GAP_MS);
    }, FLASH_MS);
  }
  flashNext();
}

function startTypePhase() {
  phase = "type";
  cursor = 0;
  phaseEl.textContent = "Type the sequence — press space after each word.";
  displayEl.textContent = "";
  input.disabled = false;
  input.focus({ preventScroll: true });
  renderSlots(0);
}

function nextRound() {
  round++;
  sequence = pickSequence(round + 2);
  paintStats();
  setTimeout(() => { if (running) watchSequence(); }, 700);
}

function startRound() {
  if (running) return;
  round = 1;
  score = 0;
  sequence = pickSequence(round + 2);
  running = true;
  startBtn.hidden = true;
  resetBtn.hidden = false;
  Analytics.gameStart({ mode: "memory", speed: 1 });
  paintStats();
  watchSequence();
}

function endRound() {
  if (!running) return;
  running = false;
  if (phaseTimer) clearTimeout(phaseTimer);
  phase = "done";
  input.disabled = true;
  Analytics.gameOver({ mode: "memory", score, caught: round - 1, missed: 0, bestStreak: round, speed: 1 });
  let isNewBest = false;
  try {
    updateActive((p) => {
      p.gameStats = p.gameStats || { rounds: 0, totalCaught: 0 };
      p.gameStats.byMode = p.gameStats.byMode || {};
      const m = p.gameStats.byMode.memory || { highScore: 0, bestStreak: 0, rounds: 0, totalCaught: 0 };
      if (score > m.highScore) { m.highScore = score; isNewBest = true; }
      if (round > m.bestStreak) m.bestStreak = round;
      m.rounds = (m.rounds || 0) + 1;
      m.totalCaught = (m.totalCaught || 0) + (round - 1);
      m.lastPlayedAt = new Date().toISOString();
      p.gameStats.byMode.memory = m;
      return p;
    });
  } catch {}
  if (isNewBest) try { Analytics.gameNewBest({ mode: "memory", score }); } catch {}
  playFinish();
  phaseEl.textContent = isNewBest ? "New personal best!" : "Round over.";
  displayEl.innerHTML = `<span class="memory-summary">${score} pts · reached round ${round}</span>`;
  startBtn.textContent = "Play again";
  startBtn.hidden = false;
}

function reset() {
  if (phaseTimer) clearTimeout(phaseTimer);
  running = false;
  round = 1;
  score = 0;
  sequence = [];
  cursor = 0;
  phase = "idle";
  input.disabled = true;
  input.value = "";
  displayEl.textContent = "";
  slotsEl.innerHTML = "";
  phaseEl.textContent = "Press Start to watch the first sequence.";
  paintStats();
  startBtn.textContent = "Start";
  startBtn.hidden = false;
  resetBtn.hidden = true;
}

input.addEventListener("input", () => {
  if (phase !== "type") return;
  const v = input.value;
  if (v.endsWith(" ")) {
    const typed = v.trim().toLowerCase();
    const target = (sequence[cursor] || "").toLowerCase();
    if (typed === target) {
      cursor++;
      score += target.length + 2;
      playKey();
      input.value = "";
      renderSlots(cursor);
      if (cursor >= sequence.length) {
        // Round cleared.
        score += 20 * round;  // round-clear bonus
        nextRound();
      }
    } else {
      playMistake();
      endRound();
    }
    paintStats();
  }
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const typed = input.value.trim().toLowerCase();
    const target = (sequence[cursor] || "").toLowerCase();
    if (typed === target) {
      cursor++;
      score += target.length + 2;
      playKey();
      input.value = "";
      renderSlots(cursor);
      if (cursor >= sequence.length) { score += 20 * round; nextRound(); }
    } else {
      playMistake();
      endRound();
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
