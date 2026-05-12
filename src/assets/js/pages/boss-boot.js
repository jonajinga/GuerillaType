/* Boss Battle -- type words to deal damage to a boss with an HP
   bar. Misses heal the boss. Defeat the boss to advance levels.
   Levels scale boss HP and shrink the per-word timer. */

import { getActive, updateActive } from "../profiles.js";
import { loadD3 } from "../stats/d3-loader.js";
import { Analytics } from "../analytics.js";
import { setSoundPrefs, playKey, playMistake, playFinish } from "../engine/sounds.js";

const FALLBACK_WORDS = [
  "thunder","castle","kingdom","dragon","wizard","sword","shield","forge","tower","valley",
  "lantern","oracle","banner","crown","ranger","hunter","knight","mantle","silent","blade",
  "echo","storm","mountain","river","forest","desert","island","ember","crystal","whisper",
];

let d3 = null;
let svgSel = null;
let running = false;
let paused = false;
let frameTimer = null;

let level = 1;
let boss = { hpMax: 500, hp: 500 };
let currentWord = "";
let wordTimer = 0;      // ms left on current word
let wordTimerStart = 0;
let streak = 0;
let defeats = 0;
let score = 0;          // total damage dealt across all levels in this run
let shakeMs = 0;
let healFlashMs = 0;
let defeatFlashMs = 0;

const profile = getActive();
const input = document.getElementById("game-input");
const startBtn = document.getElementById("game-start");
const pauseBtn = document.getElementById("game-pause");
const resetBtn = document.getElementById("game-reset");
const scoreEl = document.querySelector("[data-score]");
const levelEl = document.querySelector("[data-level]");
const defeatsEl = document.querySelector("[data-defeats]");
const streakEl = document.querySelector("[data-streak]");
const bestEl = document.querySelector("[data-best]");

function stopFrameTimer() {
  if (frameTimer) { try { frameTimer.stop(); } catch {} frameTimer = null; }
}

function pickWord() {
  const missed = Object.keys(profile.missedWords || {}).filter((w) => /^[a-z]{3,12}$/i.test(w));
  const pool = missed.length >= 8 ? missed.concat(FALLBACK_WORDS) : FALLBACK_WORDS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function levelTimerMs() {
  // Word timer starts at 8s on level 1, shrinks 0.4s per level, floors at 3.5s.
  return Math.max(3500, 8000 - (level - 1) * 400);
}

function levelMaxHP() {
  return Math.round(500 * Math.pow(1.5, level - 1));
}

function readBest() {
  const fresh = getActive() || {};
  const gs = fresh.gameStats || {};
  return (gs.byMode || {}).boss || { highScore: 0, bestStreak: 0 };
}

function nextWord() {
  currentWord = pickWord();
  wordTimerStart = levelTimerMs();
  wordTimer = wordTimerStart;
}

function startBoss() {
  boss = { hpMax: levelMaxHP(), hp: levelMaxHP() };
  nextWord();
}

function paintStats() {
  scoreEl.textContent = String(score);
  levelEl.textContent = String(level);
  defeatsEl.textContent = String(defeats);
  streakEl.textContent = String(streak);
  bestEl.textContent = String(readBest().highScore || 0);
}

function paintBoss() {
  if (!svgSel) return;
  svgSel.selectAll("*").remove();
  const W = 800, H = 360;
  const shakeX = shakeMs > 0 ? (Math.random() - 0.5) * 6 : 0;
  const shakeY = shakeMs > 0 ? (Math.random() - 0.5) * 6 : 0;
  // Background atmosphere.
  svgSel.append("rect").attr("x", 0).attr("y", 0).attr("width", W).attr("height", H).attr("fill", "url(#bossGradient)");
  const defs = svgSel.append("defs");
  const grad = defs.append("linearGradient").attr("id", "bossGradient").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 1);
  grad.append("stop").attr("offset", "0%").attr("stop-color", "color-mix(in oklab, var(--bg-0) 60%, var(--bad, #d76050))");
  grad.append("stop").attr("offset", "100%").attr("stop-color", "var(--bg-1)");

  // Boss avatar (a stylized skull/eye glyph).
  const bossG = svgSel.append("g").attr("transform", `translate(${W / 2 + shakeX}, ${130 + shakeY})`);
  // Boss body (circle).
  bossG.append("circle").attr("r", 70)
    .attr("fill", healFlashMs > 0 ? "var(--good, #76c893)" : "var(--bad, #d76050)")
    .attr("opacity", 0.9);
  // Eyes.
  bossG.append("circle").attr("cx", -22).attr("cy", -10).attr("r", 9).attr("fill", "var(--fg-0)");
  bossG.append("circle").attr("cx", 22).attr("cy", -10).attr("r", 9).attr("fill", "var(--fg-0)");
  bossG.append("circle").attr("cx", -22).attr("cy", -10).attr("r", 4).attr("fill", "#000");
  bossG.append("circle").attr("cx", 22).attr("cy", -10).attr("r", 4).attr("fill", "#000");
  // Mouth.
  bossG.append("path")
    .attr("d", "M -28 22 Q 0 42 28 22")
    .attr("stroke", "var(--fg-0)").attr("stroke-width", 4).attr("fill", "none").attr("stroke-linecap", "round");
  // HP bar.
  const hpFrac = boss.hp / boss.hpMax;
  svgSel.append("rect").attr("x", W / 2 - 220).attr("y", 220).attr("width", 440).attr("height", 18).attr("fill", "rgba(20,22,30,.5)").attr("rx", 6);
  svgSel.append("rect").attr("x", W / 2 - 220).attr("y", 220).attr("width", 440 * hpFrac).attr("height", 18).attr("fill", hpFrac > 0.5 ? "var(--good, #76c893)" : hpFrac > 0.2 ? "var(--warn, #e3b873)" : "var(--bad, #d76050)").attr("rx", 6);
  svgSel.append("text").attr("x", W / 2).attr("y", 234).attr("text-anchor", "middle").attr("fill", "var(--fg-0)").attr("font-family", "var(--font-mono)").attr("font-size", 12).attr("font-weight", 600).text(`${Math.ceil(boss.hp)} / ${boss.hpMax} HP`);
  // Word prompt above boss.
  if (running && !paused) {
    svgSel.append("text").attr("x", W / 2).attr("y", 50).attr("text-anchor", "middle").attr("fill", "var(--accent)").attr("font-family", "var(--font-display)").attr("font-size", 40).attr("font-weight", 500).text(currentWord);
    // Timer ring under the word.
    const pct = wordTimer / wordTimerStart;
    const ringR = 22, ringX = W / 2 - 240;
    const C = 2 * Math.PI * ringR;
    svgSel.append("circle").attr("cx", ringX).attr("cy", 50).attr("r", ringR).attr("fill", "none").attr("stroke", "var(--rule)").attr("stroke-width", 3);
    svgSel.append("circle").attr("cx", ringX).attr("cy", 50).attr("r", ringR)
      .attr("fill", "none").attr("stroke", pct < 0.3 ? "var(--bad, #d76050)" : "var(--accent)").attr("stroke-width", 3)
      .attr("stroke-linecap", "round").attr("transform", `rotate(-90 ${ringX} 50)`)
      .attr("stroke-dasharray", C).attr("stroke-dashoffset", C * (1 - pct));
    svgSel.append("text").attr("x", ringX).attr("y", 54).attr("text-anchor", "middle").attr("fill", "var(--fg-1)").attr("font-family", "var(--font-mono)").attr("font-size", 12).attr("font-weight", 600).text(Math.ceil(wordTimer / 1000) + "s");
  }
  // Defeat flash.
  if (defeatFlashMs > 0) {
    svgSel.append("text").attr("x", W / 2).attr("y", 320).attr("text-anchor", "middle").attr("fill", "var(--good, #76c893)").attr("font-family", "var(--font-display)").attr("font-size", 28).attr("font-weight", 600).text(`Boss ${defeats} defeated — next level!`);
  }
}

function frame() {
  if (!running || paused) return;
  const now = performance.now();
  const dt = 16; // approx ms per tick (d3.timer fires ~60fps)
  wordTimer = Math.max(0, wordTimer - dt);
  if (shakeMs > 0) shakeMs -= dt;
  if (healFlashMs > 0) healFlashMs -= dt;
  if (defeatFlashMs > 0) defeatFlashMs -= dt;
  if (wordTimer <= 0) {
    // Timed out -- count as a miss.
    boss.hp = Math.min(boss.hpMax, boss.hp + 8);
    healFlashMs = 200;
    streak = 0;
    playMistake();
    nextWord();
    paintStats();
  }
  paintBoss();
}

function attemptAttack(typed) {
  if (typed.toLowerCase() === currentWord.toLowerCase()) {
    const mult = 1 + streak * 0.1;
    const dmg = Math.round(currentWord.length * mult);
    boss.hp = Math.max(0, boss.hp - dmg);
    score += dmg;
    streak++;
    shakeMs = 220;
    playKey();
    if (boss.hp <= 0) {
      defeats++;
      defeatFlashMs = 1000;
      level++;
      startBoss();
    } else {
      nextWord();
    }
  } else {
    boss.hp = Math.min(boss.hpMax, boss.hp + 8);
    healFlashMs = 200;
    streak = 0;
    playMistake();
  }
  paintStats();
}

function startRound() {
  if (running) return;
  level = 1;
  defeats = 0;
  score = 0;
  streak = 0;
  startBoss();
  running = true;
  paused = false;
  startBtn.hidden = true;
  pauseBtn.hidden = false;
  resetBtn.hidden = false;
  input.value = "";
  input.focus({ preventScroll: true });
  Analytics.gameStart({ mode: "boss", speed: 1 });
  stopFrameTimer();
  if (d3) frameTimer = d3.timer(frame);
  paintStats();
  paintBoss();
}

function endRound() {
  running = false;
  stopFrameTimer();
  Analytics.gameOver({ mode: "boss", score, caught: defeats, missed: 0, bestStreak: streak, speed: 1 });
  let isNewBest = false;
  try {
    updateActive((p) => {
      p.gameStats = p.gameStats || { rounds: 0, totalCaught: 0 };
      p.gameStats.byMode = p.gameStats.byMode || {};
      const m = p.gameStats.byMode.boss || { highScore: 0, bestStreak: 0, rounds: 0, totalCaught: 0 };
      if (score > m.highScore) { m.highScore = score; isNewBest = true; }
      if (streak > m.bestStreak) m.bestStreak = streak;
      m.rounds = (m.rounds || 0) + 1;
      m.totalCaught = (m.totalCaught || 0) + defeats;
      m.lastPlayedAt = new Date().toISOString();
      p.gameStats.byMode.boss = m;
      return p;
    });
  } catch {}
  if (isNewBest) try { Analytics.gameNewBest({ mode: "boss", score }); } catch {}
  playFinish();
  if (svgSel) {
    svgSel.append("rect").attr("x", 0).attr("y", 0).attr("width", 800).attr("height", 360).attr("fill", "rgba(20, 22, 30, .85)");
    svgSel.append("text").attr("x", 400).attr("y", 140).attr("text-anchor", "middle").attr("fill", "var(--accent)").attr("font-family", "var(--font-display)").attr("font-size", 48).attr("font-weight", 500).text("Run over");
    svgSel.append("text").attr("x", 400).attr("y", 180).attr("text-anchor", "middle").attr("fill", "var(--fg-1)").attr("font-family", "var(--font-mono)").attr("font-size", 18).text(`${defeats} bosses defeated  ·  ${score} damage dealt  ·  best streak ${streak}`);
    if (isNewBest) {
      svgSel.append("text").attr("x", 400).attr("y", 210).attr("text-anchor", "middle").attr("fill", "var(--good, #76c893)").attr("font-family", "var(--font-mono)").attr("font-size", 13).attr("letter-spacing", "0.12em").text("NEW PERSONAL BEST");
    }
  }
  startBtn.textContent = "Run again";
  startBtn.hidden = false;
  pauseBtn.hidden = true;
  try { input.blur(); } catch {}
}

input.addEventListener("input", () => {
  if (!running || paused) return;
  const v = input.value;
  if (v.endsWith(" ")) {
    attemptAttack(v.trim());
    input.value = "";
  }
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    attemptAttack(input.value.trim());
    input.value = "";
    e.preventDefault();
  }
});

startBtn.addEventListener("click", async () => {
  if (!d3) {
    d3 = await loadD3();
    if (!d3) { alert("Failed to load D3."); return; }
    svgSel = d3.select("#boss-svg");
  }
  startRound();
});
pauseBtn.addEventListener("click", () => {
  paused = !paused;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
});
resetBtn.addEventListener("click", () => {
  endRound();
});

loadD3().then((m) => {
  if (m) { d3 = m; svgSel = d3.select("#boss-svg"); paintBoss(); }
});
setSoundPrefs({
  theme: (profile.preferences && profile.preferences.soundTheme) || "off",
  volume: (profile.preferences && profile.preferences.soundVolume) || 0.5,
});
paintStats();
