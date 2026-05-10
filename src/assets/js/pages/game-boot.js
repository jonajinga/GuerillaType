/* Catch the Word — typing mini-game.
   Falling words from the user's missedWords list (or weak-key
   fallback) descend down the stage. The user types each one to
   catch it. Three misses ends the round.

   D3 drives the rendering: each word is a <text> in an SVG, with
   a `transform: translate(x, y)` updated every animation frame
   via d3.timer. d3.scaleLinear maps screen height to fall
   duration. Words are stored in a `falling` array; new words
   spawn on a timer; caught words are removed and points added. */

import { getActive, updateActive } from "../profiles.js";
import { loadD3 } from "../stats/d3-loader.js";

const COMMON_FALLBACK_WORDS = [
  "the", "and", "for", "you", "this", "with", "have", "from", "they",
  "would", "could", "should", "about", "which", "their", "what", "make",
  "going", "where", "right", "first", "after", "again", "before", "people",
  "thought", "between", "without", "another", "because", "through",
];

const profile = getActive();
let words = [];           // candidate words to pull from
let falling = [];         // active words on screen
let stats = { score: 0, caught: 0, missed: 0, streak: 0, bestStreak: 0 };
let running = false;
let lastSpawnTs = 0;
let lastFrameTs = 0;
let d3 = null;
let svgSel = null;
let stageW = 800, stageH = 500;

const input = document.getElementById("game-input");
const startBtn = document.getElementById("game-start");
const pauseBtn = document.getElementById("game-pause");
const resetBtn = document.getElementById("game-reset");
const scoreEl = document.querySelector("[data-score]");
const caughtEl = document.querySelector("[data-caught]");
const missedEl = document.querySelector("[data-missed]");
const streakEl = document.querySelector("[data-streak]");

/* Build the candidate-word pool, weighted by miss-count from the
   user's profile. Falls back to a curated list of common words
   when the user has no miss history yet (new profile). */
function buildPool() {
  const missed = profile.missedWords || {};
  const entries = Object.entries(missed)
    .filter(([w, v]) => w && w.length >= 2 && w.length <= 14 && /^[a-zA-Z]+$/.test(w))
    .sort((a, b) => (b[1].n || 0) - (a[1].n || 0));
  if (entries.length >= 8) {
    // Repeat words by miss-count so weighting carries into picks.
    const pool = [];
    entries.slice(0, 60).forEach(([w, v]) => {
      const weight = Math.min(8, Math.ceil(Math.log2(1 + (v.n || 1))));
      for (let i = 0; i < weight; i++) pool.push(w);
    });
    return pool;
  }
  return COMMON_FALLBACK_WORDS.slice();
}

function pickWord() {
  if (!words.length) return null;
  return words[Math.floor(Math.random() * words.length)];
}

function reset() {
  falling = [];
  stats = { score: 0, caught: 0, missed: 0, streak: 0, bestStreak: 0 };
  paintStats();
  if (svgSel) svgSel.selectAll("g.fall").remove();
}

function paintStats() {
  scoreEl.textContent = String(stats.score);
  caughtEl.textContent = String(stats.caught);
  missedEl.textContent = String(stats.missed);
  streakEl.textContent = String(stats.streak);
}

function spawn() {
  const w = pickWord();
  if (!w) return;
  const x = 60 + Math.random() * (stageW - 120);
  const speed = 50 + Math.random() * 30 + stats.caught * 0.6;  // px/sec, ramps up
  falling.push({ id: Math.random().toString(36).slice(2), word: w, x, y: -20, speed });
}

function frame(elapsed) {
  if (!running) return;
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrameTs) / 1000 || 0);
  lastFrameTs = now;
  // Spawn pacing -- one word every 1.4 seconds initially, faster
  // as the round progresses.
  const spawnEvery = Math.max(700, 1400 - stats.caught * 40);
  if (now - lastSpawnTs > spawnEvery) {
    spawn();
    lastSpawnTs = now;
  }
  // Advance each word.
  for (const f of falling) {
    f.y += f.speed * dt;
  }
  // Words past the bottom = missed.
  const before = falling.length;
  falling = falling.filter((f) => {
    if (f.y < stageH - 10) return true;
    stats.missed++;
    stats.streak = 0;
    return false;
  });
  if (falling.length !== before) {
    paintStats();
    if (stats.missed >= 3) {
      endRound();
      return;
    }
  }
  paintFalling();
}

function paintFalling() {
  if (!svgSel) return;
  const groups = svgSel.selectAll("g.fall").data(falling, (d) => d.id);
  groups.exit().remove();
  const enter = groups.enter().append("g").attr("class", "fall");
  enter.append("text")
    .attr("text-anchor", "middle")
    .attr("fill", "var(--fg-0)")
    .attr("font-family", "var(--font-mono)")
    .attr("font-size", "22")
    .text((d) => d.word);
  svgSel.selectAll("g.fall")
    .attr("transform", (d) => `translate(${d.x}, ${d.y})`);
}

function tryCatch(typed) {
  if (!typed) return;
  // Match the first falling word whose text equals typed.
  const i = falling.findIndex((f) => f.word === typed);
  if (i === -1) return false;
  const f = falling[i];
  falling.splice(i, 1);
  const base = 10 + f.word.length * 2;
  const bonus = stats.streak >= 5 ? 1.5 : 1;
  stats.score += Math.round(base * bonus);
  stats.caught++;
  stats.streak++;
  if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
  paintStats();
  paintFalling();
  return true;
}

function startRound() {
  if (running) return;
  words = buildPool();
  reset();
  running = true;
  lastSpawnTs = performance.now() - 800;
  lastFrameTs = performance.now();
  input.value = "";
  input.focus({ preventScroll: true });
  startBtn.hidden = true;
  pauseBtn.hidden = false;
  resetBtn.hidden = false;
  d3.timer(frame);
}

function pauseRound() {
  running = !running;
  pauseBtn.textContent = running ? "Pause" : "Resume";
  if (running) {
    lastSpawnTs = performance.now();
    lastFrameTs = performance.now();
    d3.timer(frame);
  }
}

function endRound() {
  running = false;
  startBtn.textContent = "Play again";
  startBtn.hidden = false;
  pauseBtn.hidden = true;
  // Stash high score for future leaderboard work.
  try {
    updateActive((p) => {
      p.gameStats = p.gameStats || { highScore: 0, rounds: 0, totalCaught: 0 };
      if (stats.score > p.gameStats.highScore) p.gameStats.highScore = stats.score;
      p.gameStats.rounds += 1;
      p.gameStats.totalCaught += stats.caught;
      p.gameStats.bestStreak = Math.max(p.gameStats.bestStreak || 0, stats.bestStreak);
      return p;
    });
  } catch {}
  // Game-over overlay.
  if (svgSel) {
    const over = svgSel.append("g").attr("class", "fall game-over");
    over.append("rect")
      .attr("x", 0).attr("y", 0).attr("width", stageW).attr("height", stageH)
      .attr("fill", "rgba(20, 22, 30, .82)");
    over.append("text")
      .attr("x", stageW / 2).attr("y", stageH / 2 - 30)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--accent)")
      .attr("font-family", "var(--font-display)")
      .attr("font-size", "44").attr("font-weight", "500")
      .text("Round over");
    over.append("text")
      .attr("x", stageW / 2).attr("y", stageH / 2 + 20)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--fg-1)")
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", "18")
      .text(`Score ${stats.score} · ${stats.caught} caught · best streak ${stats.bestStreak}`);
  }
}

input.addEventListener("input", () => {
  const v = input.value.trim();
  if (!v) return;
  // Catch on space or matching length+content.
  if (v.endsWith(" ")) {
    tryCatch(v.trim());
    input.value = "";
    return;
  }
  // Also try the immediate match -- some falling words might be
  // shorter than the typed value once the user adds chars.
  if (tryCatch(v)) input.value = "";
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    tryCatch(input.value.trim());
    input.value = "";
    e.preventDefault();
  }
});

startBtn.addEventListener("click", async () => {
  if (!d3) {
    d3 = await loadD3();
    if (!d3) {
      alert("The game needs D3, which failed to load. Check your network and refresh.");
      return;
    }
    svgSel = d3.select("#game-svg");
  }
  startRound();
});
pauseBtn.addEventListener("click", pauseRound);
resetBtn.addEventListener("click", () => {
  running = false;
  reset();
  startBtn.textContent = "Start";
  startBtn.hidden = false;
  pauseBtn.hidden = true;
  resetBtn.hidden = true;
});

// Pre-warm D3 in the background so the first click is instant.
loadD3().then((m) => { if (m) { d3 = m; svgSel = d3.select("#game-svg"); }});
