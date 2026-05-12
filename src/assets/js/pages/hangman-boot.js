/* Hangman Speedrun -- single-letter guesses against a target
   word with a 15-second timer. Wrong guesses progress the
   hangman drawing; six wrong = round over. Solve = next puzzle. */

import { getActive, updateActive } from "../profiles.js";
import { Analytics } from "../analytics.js";
import { setSoundPrefs, playKey, playMistake, playFinish } from "../engine/sounds.js";

const FALLBACK_EASY = ["river","stone","apple","dance","light","music","cloud","table","ocean","candy","forest","valley","window","summer","winter","spring","autumn","shadow","planet","silent"];
const FALLBACK_MED = ["castle","journey","horizon","whisper","mountain","melody","secret","balance","silence","gravity","captain","kingdom","majesty","ancient","fortune","mystery"];
const FALLBACK_HARD = ["pendulum","threshold","fortitude","sanctuary","kaleidoscope","architecture","ephemeral","luminescent","quintessential","perseverance"];

let target = "";
let revealed = [];     // chars revealed; '' for hidden positions
let wrongLetters = [];
let triedLetters = new Set();
let timeLeft = 15000;
let lastTick = 0;
let running = false;
let score = 0;
let solved = 0;
let wrongTotal = 0;
let rafHandle = null;

const profile = getActive();
const svg = document.getElementById("hangman-svg");
const letters = document.getElementById("hangman-letters");
const tried = document.getElementById("hangman-tried");
const input = document.getElementById("game-input");
const startBtn = document.getElementById("game-start");
const resetBtn = document.getElementById("game-reset");
const scoreEl = document.querySelector("[data-score]");
const solvedEl = document.querySelector("[data-solved]");
const wrongEl = document.querySelector("[data-wrong]");
const bestEl = document.querySelector("[data-best]");

function readBest() {
  const fresh = getActive() || {};
  const gs = fresh.gameStats || {};
  return (gs.byMode || {}).hangman || { highScore: 0, bestStreak: 0 };
}

function pickWord() {
  // Difficulty curves by score.
  let pool;
  if (score < 200) pool = FALLBACK_EASY;
  else if (score < 600) pool = FALLBACK_MED;
  else pool = FALLBACK_HARD;
  // Mix in missed-words at the easy / medium tiers.
  const missed = Object.keys(profile.missedWords || {}).filter((w) => /^[a-z]{4,10}$/i.test(w));
  if (missed.length && score < 600) pool = pool.concat(missed);
  return pool[Math.floor(Math.random() * pool.length)].toLowerCase();
}

function startPuzzle() {
  target = pickWord();
  revealed = target.split("").map(() => "");
  wrongLetters = [];
  triedLetters = new Set();
  timeLeft = 15000;
  lastTick = performance.now();
  renderAll();
}

function renderLetters() {
  letters.innerHTML = revealed.map((c, i) => `<span class="hangman-slot ${c ? "is-revealed" : ""}">${c || "_"}</span>`).join("");
}

function renderTried() {
  if (!triedLetters.size) { tried.textContent = "Tried: —"; return; }
  tried.textContent = "Tried: " + [...triedLetters].sort().join(" ");
}

function renderHangman() {
  // Always shown: gallows.
  let s = `<rect x="0" y="0" width="600" height="360" fill="var(--bg-2)"/>`;
  s += `<line x1="40" y1="320" x2="200" y2="320" stroke="var(--fg-1)" stroke-width="6"/>`;
  s += `<line x1="80" y1="320" x2="80" y2="40" stroke="var(--fg-1)" stroke-width="6"/>`;
  s += `<line x1="80" y1="40" x2="220" y2="40" stroke="var(--fg-1)" stroke-width="6"/>`;
  s += `<line x1="220" y1="40" x2="220" y2="80" stroke="var(--fg-1)" stroke-width="4"/>`;
  // Hangman parts based on wrong count.
  const N = wrongLetters.length;
  if (N >= 1) s += `<circle cx="220" cy="105" r="22" stroke="var(--bad, #d76050)" stroke-width="4" fill="none"/>`;
  if (N >= 2) s += `<line x1="220" y1="127" x2="220" y2="200" stroke="var(--bad, #d76050)" stroke-width="4"/>`;
  if (N >= 3) s += `<line x1="220" y1="150" x2="190" y2="180" stroke="var(--bad, #d76050)" stroke-width="4"/>`;
  if (N >= 4) s += `<line x1="220" y1="150" x2="250" y2="180" stroke="var(--bad, #d76050)" stroke-width="4"/>`;
  if (N >= 5) s += `<line x1="220" y1="200" x2="190" y2="240" stroke="var(--bad, #d76050)" stroke-width="4"/>`;
  if (N >= 6) s += `<line x1="220" y1="200" x2="250" y2="240" stroke="var(--bad, #d76050)" stroke-width="4"/>`;
  // Timer ring.
  const cx = 480, cy = 100, r = 50;
  const C = 2 * Math.PI * r;
  const pct = timeLeft / 15000;
  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--rule)" stroke-width="6"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${pct < 0.3 ? "var(--bad, #d76050)" : "var(--accent)"}" stroke-width="6" stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/>`;
  s += `<text x="${cx}" y="${cy + 8}" text-anchor="middle" fill="var(--fg-0)" font-family="var(--font-mono)" font-size="22" font-weight="600">${Math.ceil(timeLeft/1000)}s</text>`;
  s += `<text x="${cx}" y="${cy + 80}" text-anchor="middle" fill="var(--fg-3)" font-family="var(--font-mono)" font-size="11" letter-spacing="0.1em">TIME LEFT</text>`;
  svg.innerHTML = s;
}

function renderStats() {
  scoreEl.textContent = String(score);
  solvedEl.textContent = String(solved);
  wrongEl.textContent = String(wrongTotal);
  bestEl.textContent = String(readBest().highScore || 0);
}

function renderAll() {
  renderLetters();
  renderTried();
  renderHangman();
  renderStats();
}

function tryLetter(ch) {
  if (!running) return;
  const c = (ch || "").toLowerCase();
  if (!/^[a-z]$/.test(c)) { playMistake(); return; }
  if (triedLetters.has(c)) { playMistake(); return; }
  triedLetters.add(c);
  let hit = false;
  for (let i = 0; i < target.length; i++) {
    if (target[i] === c) { revealed[i] = c; hit = true; }
  }
  if (hit) {
    playKey();
    if (revealed.every((x) => x)) {
      // Solved! Bonus based on remaining time.
      const bonus = Math.round(20 + (timeLeft / 1000) * 4 + target.length * 4);
      score += bonus;
      solved++;
      renderAll();
      // Brief pause then next puzzle.
      setTimeout(() => { if (running) { startPuzzle(); } }, 900);
    }
  } else {
    wrongLetters.push(c);
    wrongTotal++;
    playMistake();
    if (wrongLetters.length >= 6) {
      endRound();
      return;
    }
  }
  renderAll();
}

function loop(now) {
  if (!running) return;
  const dt = now - lastTick;
  lastTick = now;
  timeLeft = Math.max(0, timeLeft - dt);
  if (timeLeft <= 0) {
    // Time out -- counts as a wrong (penalty) and starts a new puzzle.
    wrongLetters.push("_");
    wrongTotal++;
    if (wrongLetters.length >= 6) { endRound(); return; }
    setTimeout(() => { if (running) startPuzzle(); }, 600);
    renderAll();
    rafHandle = requestAnimationFrame(loop);
    return;
  }
  renderHangman();
  rafHandle = requestAnimationFrame(loop);
}

function startRound() {
  if (running) return;
  score = 0;
  solved = 0;
  wrongTotal = 0;
  running = true;
  startBtn.hidden = true;
  resetBtn.hidden = false;
  Analytics.gameStart({ mode: "hangman", speed: 1 });
  startPuzzle();
  input.value = "";
  input.focus({ preventScroll: true });
  rafHandle = requestAnimationFrame(loop);
}

function endRound() {
  if (!running) return;
  running = false;
  if (rafHandle) cancelAnimationFrame(rafHandle);
  Analytics.gameOver({ mode: "hangman", score, caught: solved, missed: wrongTotal, bestStreak: 0, speed: 1 });
  let isNewBest = false;
  try {
    updateActive((p) => {
      p.gameStats = p.gameStats || { rounds: 0, totalCaught: 0 };
      p.gameStats.byMode = p.gameStats.byMode || {};
      const m = p.gameStats.byMode.hangman || { highScore: 0, bestStreak: 0, rounds: 0, totalCaught: 0 };
      if (score > m.highScore) { m.highScore = score; isNewBest = true; }
      m.rounds = (m.rounds || 0) + 1;
      m.totalCaught = (m.totalCaught || 0) + solved;
      m.lastPlayedAt = new Date().toISOString();
      p.gameStats.byMode.hangman = m;
      return p;
    });
  } catch {}
  if (isNewBest) try { Analytics.gameNewBest({ mode: "hangman", score }); } catch {}
  playFinish();
  let s = `<rect x="0" y="0" width="600" height="360" fill="rgba(20,22,30,.9)"/>`;
  s += `<text x="300" y="140" text-anchor="middle" fill="var(--bad, #d76050)" font-family="var(--font-display)" font-size="40" font-weight="500">Game over</text>`;
  s += `<text x="300" y="178" text-anchor="middle" fill="var(--fg-1)" font-family="var(--font-mono)" font-size="16">The word was: ${target}</text>`;
  s += `<text x="300" y="210" text-anchor="middle" fill="var(--fg-1)" font-family="var(--font-mono)" font-size="14">${score} pts · ${solved} solved · ${wrongTotal} wrong</text>`;
  if (isNewBest) s += `<text x="300" y="240" text-anchor="middle" fill="var(--good, #76c893)" font-family="var(--font-mono)" font-size="12" letter-spacing="0.12em">NEW PERSONAL BEST</text>`;
  s += `<text x="300" y="280" text-anchor="middle" fill="var(--fg-3)" font-family="var(--font-mono)" font-size="12">Click Reset, then Start.</text>`;
  svg.innerHTML = s;
  startBtn.textContent = "Play again";
  startBtn.hidden = false;
  try { input.blur(); } catch {}
}

function reset() {
  running = false;
  if (rafHandle) cancelAnimationFrame(rafHandle);
  score = 0; solved = 0; wrongTotal = 0;
  target = ""; revealed = []; wrongLetters = []; triedLetters = new Set();
  timeLeft = 15000;
  letters.innerHTML = "";
  tried.textContent = "";
  renderHangman();
  renderStats();
  startBtn.textContent = "Start";
  startBtn.hidden = false;
  resetBtn.hidden = true;
}

input.addEventListener("input", () => {
  const v = input.value;
  if (v.length >= 1) {
    tryLetter(v[v.length - 1]);
    input.value = "";
  }
});
input.addEventListener("keydown", (e) => {
  if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
    tryLetter(e.key);
    input.value = "";
    e.preventDefault();
  }
});

startBtn.addEventListener("click", startRound);
resetBtn.addEventListener("click", reset);

setSoundPrefs({
  theme: (profile.preferences && profile.preferences.soundTheme) || "off",
  volume: (profile.preferences && profile.preferences.soundVolume) || 0.5,
});
renderHangman();
renderStats();
