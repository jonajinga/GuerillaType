/* Word Snake -- classic snake, steered by typing direction words.
   The snake moves on a 20x15 grid. Type 'up' / 'down' / 'left' /
   'right' (or u/d/l/r) and commit with space or Enter to turn. */

import { getActive, updateActive } from "../profiles.js";
import { Analytics } from "../analytics.js";
import { setSoundPrefs, playKey, playMistake, playFinish } from "../engine/sounds.js";

const COLS = 20, ROWS = 15;
const STAGE_W = 600, STAGE_H = 450;
const CELL = STAGE_W / COLS;  // 30 px

let snake = [];        // array of {x, y}
let dir = { x: 1, y: 0 };
let pendingDir = null;
let food = null;
let running = false;
let paused = false;
let tickInterval = 220; // ms per cell; speeds up with food eaten
let lastTickTs = 0;
let foodEaten = 0;
let score = 0;
let rafHandle = null;

const profile = getActive();
const svg = document.getElementById("snake-svg");
const input = document.getElementById("game-input");
const startBtn = document.getElementById("game-start");
const pauseBtn = document.getElementById("game-pause");
const resetBtn = document.getElementById("game-reset");
const scoreEl = document.querySelector("[data-score]");
const lengthEl = document.querySelector("[data-length]");
const foodEl = document.querySelector("[data-food]");
const bestEl = document.querySelector("[data-best]");

function readBest() {
  const fresh = getActive() || {};
  const gs = fresh.gameStats || {};
  return (gs.byMode || {}).snake || { highScore: 0, bestStreak: 0 };
}

function placeFood() {
  while (true) {
    const f = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    if (!snake.some((s) => s.x === f.x && s.y === f.y)) { food = f; return; }
  }
}

function resetState() {
  snake = [{ x: 5, y: 7 }, { x: 4, y: 7 }, { x: 3, y: 7 }];
  dir = { x: 1, y: 0 };
  pendingDir = null;
  tickInterval = 220;
  foodEaten = 0;
  score = 0;
  placeFood();
}

function paint() {
  svg.innerHTML = "";
  // Grid backdrop.
  const bg = `<rect x="0" y="0" width="${STAGE_W}" height="${STAGE_H}" fill="var(--bg-2)"/>`;
  // Cells (subtle grid).
  let cells = "";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if ((r + c) % 2 === 0) cells += `<rect x="${c*CELL}" y="${r*CELL}" width="${CELL}" height="${CELL}" fill="rgba(255,255,255,0.02)"/>`;
    }
  }
  // Food.
  let foodSvg = "";
  if (food) {
    foodSvg = `<circle cx="${food.x*CELL+CELL/2}" cy="${food.y*CELL+CELL/2}" r="${CELL*0.32}" fill="var(--accent)"/>`;
  }
  // Snake body.
  let body = "";
  snake.forEach((s, i) => {
    const isHead = i === 0;
    body += `<rect x="${s.x*CELL+2}" y="${s.y*CELL+2}" width="${CELL-4}" height="${CELL-4}" fill="${isHead ? "var(--good, #76c893)" : "color-mix(in oklab, var(--good, #76c893) 70%, var(--bg-1))"}" rx="3"/>`;
  });
  svg.innerHTML = bg + cells + foodSvg + body;
}

function setPendingDir(token) {
  const t = (token || "").trim().toLowerCase();
  let nd = null;
  if (t === "up" || t === "u") nd = { x: 0, y: -1 };
  else if (t === "down" || t === "d") nd = { x: 0, y: 1 };
  else if (t === "left" || t === "l") nd = { x: -1, y: 0 };
  else if (t === "right" || t === "r") nd = { x: 1, y: 0 };
  if (!nd) { playMistake(); return false; }
  // Can't reverse directly into yourself.
  if (nd.x === -dir.x && nd.y === -dir.y) { return false; }
  pendingDir = nd;
  playKey();
  return true;
}

function tick() {
  if (pendingDir) { dir = pendingDir; pendingDir = null; }
  const head = snake[0];
  const next = { x: head.x + dir.x, y: head.y + dir.y };
  // Wall.
  if (next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS) { endRound(); return; }
  // Self.
  if (snake.some((s) => s.x === next.x && s.y === next.y)) { endRound(); return; }
  snake.unshift(next);
  if (food && next.x === food.x && next.y === food.y) {
    foodEaten++;
    score += 10;
    placeFood();
    tickInterval = Math.max(80, tickInterval - 6);
  } else {
    snake.pop();
  }
  paintStats();
  paint();
}

function paintStats() {
  scoreEl.textContent = String(score);
  lengthEl.textContent = String(snake.length);
  foodEl.textContent = String(foodEaten);
  bestEl.textContent = String(readBest().highScore || 0);
}

function loop(now) {
  if (!running) return;
  if (!paused && now - lastTickTs >= tickInterval) {
    lastTickTs = now;
    tick();
  }
  rafHandle = requestAnimationFrame(loop);
}

function startRound() {
  if (running) return;
  resetState();
  running = true;
  paused = false;
  lastTickTs = performance.now();
  startBtn.hidden = true;
  pauseBtn.hidden = false;
  resetBtn.hidden = false;
  input.value = "";
  input.focus({ preventScroll: true });
  Analytics.gameStart({ mode: "snake", speed: 1 });
  paint();
  paintStats();
  rafHandle = requestAnimationFrame(loop);
}

function endRound() {
  if (!running) return;
  running = false;
  if (rafHandle) cancelAnimationFrame(rafHandle);
  Analytics.gameOver({ mode: "snake", score, caught: foodEaten, missed: 0, bestStreak: 0, speed: 1 });
  let isNewBest = false;
  try {
    updateActive((p) => {
      p.gameStats = p.gameStats || { rounds: 0, totalCaught: 0 };
      p.gameStats.byMode = p.gameStats.byMode || {};
      const m = p.gameStats.byMode.snake || { highScore: 0, bestStreak: 0, rounds: 0, totalCaught: 0 };
      if (score > m.highScore) { m.highScore = score; isNewBest = true; }
      m.rounds = (m.rounds || 0) + 1;
      m.totalCaught = (m.totalCaught || 0) + foodEaten;
      m.lastPlayedAt = new Date().toISOString();
      p.gameStats.byMode.snake = m;
      return p;
    });
  } catch {}
  if (isNewBest) try { Analytics.gameNewBest({ mode: "snake", score }); } catch {}
  playFinish();
  // Overlay.
  const overlay = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(overlay);
  overlay.innerHTML = `
    <rect x="0" y="0" width="${STAGE_W}" height="${STAGE_H}" fill="rgba(20,22,30,.85)"/>
    <text x="${STAGE_W/2}" y="${STAGE_H/2-40}" text-anchor="middle" fill="var(--accent)" font-family="var(--font-display)" font-size="44" font-weight="500">Game over</text>
    <text x="${STAGE_W/2}" y="${STAGE_H/2}" text-anchor="middle" fill="var(--fg-1)" font-family="var(--font-mono)" font-size="16">${score} points · ${foodEaten} food · length ${snake.length}</text>
    ${isNewBest ? `<text x="${STAGE_W/2}" y="${STAGE_H/2+28}" text-anchor="middle" fill="var(--good, #76c893)" font-family="var(--font-mono)" font-size="12" letter-spacing="0.12em">NEW PERSONAL BEST</text>` : ""}
    <text x="${STAGE_W/2}" y="${STAGE_H/2+60}" text-anchor="middle" fill="var(--fg-3)" font-family="var(--font-mono)" font-size="13">Click Reset, then Start.</text>
  `;
  startBtn.textContent = "Play again";
  startBtn.hidden = false;
  pauseBtn.hidden = true;
  try { input.blur(); } catch {}
}

function reset() {
  running = false;
  paused = false;
  if (rafHandle) cancelAnimationFrame(rafHandle);
  resetState();
  paint();
  paintStats();
  startBtn.textContent = "Start";
  startBtn.hidden = false;
  pauseBtn.hidden = true;
  resetBtn.hidden = true;
}

input.addEventListener("input", () => {
  const v = input.value;
  if (v.endsWith(" ")) {
    setPendingDir(v.trim());
    input.value = "";
  }
  // Single-char shortcut commits immediately.
  const t = v.trim().toLowerCase();
  if (["u","d","l","r"].includes(t)) {
    setPendingDir(t);
    input.value = "";
  }
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    setPendingDir(input.value.trim());
    input.value = "";
    e.preventDefault();
  }
  // Arrow keys as fallback for accessibility.
  if (e.key === "ArrowUp") { setPendingDir("u"); e.preventDefault(); }
  if (e.key === "ArrowDown") { setPendingDir("d"); e.preventDefault(); }
  if (e.key === "ArrowLeft") { setPendingDir("l"); e.preventDefault(); }
  if (e.key === "ArrowRight") { setPendingDir("r"); e.preventDefault(); }
});

startBtn.addEventListener("click", startRound);
pauseBtn.addEventListener("click", () => {
  paused = !paused;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
});
resetBtn.addEventListener("click", reset);

setSoundPrefs({
  theme: (profile.preferences && profile.preferences.soundTheme) || "off",
  volume: (profile.preferences && profile.preferences.soundVolume) || 0.5,
});
resetState();
paint();
paintStats();
