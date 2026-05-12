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
import { Analytics } from "../analytics.js";

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
let speedMult = 1.0;
// Mode flags. URL ?mode=endless | shooter sets the initial mode;
// the user can switch via the in-page mode switch buttons too.
const _gameParams = new URLSearchParams(location.search);
const ALL_MODES = ["classic","endless","shooter","asteroids","bomb","tower","combo-sprint","stroop"];
let gameMode = ALL_MODES.includes(_gameParams.get("mode")) ? _gameParams.get("mode") : "classic";
// Tower mode runs a defensive base HP bar instead of the miss-counter.
let baseHP = 100;
const BASE_HP_MAX = 100;
// Tower lane Y-coordinates (3 horizontal lanes).
const TOWER_LANES = [stageH * 0.28, stageH * 0.50, stageH * 0.72];
// Stroop color palette. The chosen color is RENDERED on the word
// but the user must type the LITERAL word, ignoring the color.
const STROOP_PALETTE = ["red","blue","green","yellow","purple","orange"];
const STROOP_COLOR_HEX = {
  red: "#d76050", blue: "#5b8bd6", green: "#76c893",
  yellow: "#e3b873", purple: "#9b6bd6", orange: "#e58060",
};
let stroopCurrentColor = null;
// Combo Sprint: chain timer. Resets on idle.
let lastCatchTs = 0;
const COMBO_CHAIN_IDLE_MS = 2200;
const initialSpeed = parseFloat(_gameParams.get("speed")) || 1.0;
speedMult = initialSpeed;

const input = document.getElementById("game-input");
const speedSlider = document.getElementById("game-speed");
const speedVal = document.querySelector("[data-speed-val]");
if (speedSlider) {
  speedSlider.value = String(initialSpeed);
  if (speedVal) speedVal.textContent = initialSpeed.toFixed(1) + "×";
  speedSlider.addEventListener("input", () => {
    speedMult = parseFloat(speedSlider.value) || 1.0;
    if (speedVal) speedVal.textContent = speedMult.toFixed(1) + "×";
  });
}
const startBtn = document.getElementById("game-start");
const pauseBtn = document.getElementById("game-pause");
const resetBtn = document.getElementById("game-reset");
const scoreEl = document.querySelector("[data-score]");
const caughtEl = document.querySelector("[data-caught]");
const missedEl = document.querySelector("[data-missed]");
const streakEl = document.querySelector("[data-streak]");
const bestEl = document.querySelector("[data-best]");
const multEl = document.querySelector("[data-mult]");

/* Streak -> multiplier tier table. Visible reward for catching
   words in rapid succession -- tiers are wide enough that the
   user can lose one without dropping below the next floor. */
function multiplierFor(streak) {
  if (streak >= 40) return 5;
  if (streak >= 20) return 3;
  if (streak >= 10) return 2;
  if (streak >= 5)  return 1.5;
  return 1;
}

/* Per-mode best score / best streak. Always re-fetches the active
   profile so the chip / overlay reflect writes made earlier in
   this same session (the module-scoped `profile` is captured at
   boot and doesn't auto-refresh on updateActive). */
function readBest(modeKey) {
  const fresh = getActive() || profile || {};
  const gs = fresh.gameStats || {};
  if (gs.byMode && gs.byMode[modeKey]) return gs.byMode[modeKey];
  // Legacy migration: pre-byMode, all scores were lumped into the
  // top-level highScore / bestStreak. Treat those as classic-mode.
  if (modeKey === "classic") {
    return { highScore: gs.highScore || 0, bestStreak: gs.bestStreak || 0 };
  }
  return { highScore: 0, bestStreak: 0 };
}

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

// Shared timer handle. Every startRound / pauseRound / endRound /
// reset path needs to either own or stop this handle -- otherwise
// d3.timer accumulates timers each cycle and frame() gets called
// N times per tick, doubling spawn pacing and physics step.
let frameTimer = null;
function stopFrameTimer() {
  if (frameTimer) { try { frameTimer.stop(); } catch {} frameTimer = null; }
}

function reset() {
  stopFrameTimer();
  running = false;
  falling = [];
  stats = { score: 0, caught: 0, missed: 0, streak: 0, bestStreak: 0 };
  baseHP = BASE_HP_MAX;
  lastCatchTs = 0;
  stroopCurrentColor = null;
  paintStats();
  if (svgSel) svgSel.selectAll("g.fall, g.fall-hud").remove();
  if (input) input.value = "";
}

let _lastPaintedScore = 0;
function paintStats() {
  const prev = _lastPaintedScore;
  scoreEl.textContent = String(stats.score);
  caughtEl.textContent = String(stats.caught);
  missedEl.textContent = String(stats.missed);
  streakEl.textContent = String(stats.streak);
  if (bestEl) {
    const best = readBest(gameMode);
    bestEl.textContent = String(best.highScore || 0);
  }
  if (multEl) {
    const m = multiplierFor(stats.streak);
    if (m > 1) {
      multEl.hidden = false;
      multEl.textContent = m + "×";
      multEl.dataset.tier = String(m);
    } else {
      multEl.hidden = true;
    }
  }
  // Score pulse: brief scale + glow when the score jumps.
  if (stats.score > prev) {
    scoreEl.classList.remove("is-pulsing");
    void scoreEl.offsetWidth; // restart animation
    scoreEl.classList.add("is-pulsing");
  }
  _lastPaintedScore = stats.score;
}

function spawn() {
  const w = pickWord();
  if (!w) return;
  const halfW = Math.max(20, Math.ceil(w.length * 7));
  const margin = 16;
  const id = Math.random().toString(36).slice(2);

  if (gameMode === "shooter") {
    const minY = 28;
    const maxY = Math.max(minY + 1, stageH - 110);
    const y = minY + Math.random() * (maxY - minY);
    const vx = 40 + Math.random() * 30 + stats.caught * 0.8;
    falling.push({ id, word: w, x: -halfW - 6, y, vx: vx * speedMult, vy: 0, mode: "shooter" });
    return;
  }

  if (gameMode === "asteroids") {
    // Place the word on a circle around the center, velocity toward center.
    const cx = stageW / 2, cy = stageH / 2;
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.max(stageW, stageH) / 2 + 90;
    const startX = cx + Math.cos(angle) * radius;
    const startY = cy + Math.sin(angle) * radius;
    const baseSpeed = 55 + Math.random() * 35 + stats.caught * 0.9;
    const speed = baseSpeed * speedMult;
    falling.push({
      id, word: w, x: startX, y: startY,
      vx: -Math.cos(angle) * speed,
      vy: -Math.sin(angle) * speed,
      mode: "asteroids",
    });
    return;
  }

  if (gameMode === "bomb") {
    // Single bomb at a time. Center the word, attach a countdown.
    // Timer floors at 4s after every successful defuse.
    if (falling.length) return;
    const timer = Math.max(4, 10 - stats.caught * 0.4);  // 10s -> 4s
    falling.push({
      id, word: w,
      x: stageW / 2, y: stageH / 2 - 20,
      vx: 0, vy: 0, mode: "bomb",
      timerStart: timer * 1000,
      timerLeft: timer * 1000,
    });
    return;
  }

  if (gameMode === "tower") {
    // Pick one of three lanes; words march right -> left toward base.
    const lane = Math.floor(Math.random() * TOWER_LANES.length);
    const baseSpeed = 50 + Math.random() * 30 + stats.caught * 0.8;
    falling.push({
      id, word: w,
      x: stageW + halfW + 8,
      y: TOWER_LANES[lane],
      vx: -baseSpeed * speedMult, vy: 0, mode: "tower",
      lane,
    });
    return;
  }

  if (gameMode === "combo-sprint") {
    // High-velocity horizontal stream. Y placed in a randomized band.
    const minY = 60;
    const maxY = stageH - 130;
    const y = minY + Math.random() * (maxY - minY);
    // Speed ramps fast -- the "sprint" is genuine.
    const vx = 140 + Math.random() * 40 + stats.caught * 1.4;
    falling.push({
      id, word: w, x: -halfW - 6, y,
      vx: vx * speedMult, vy: 0, mode: "combo-sprint",
    });
    return;
  }

  if (gameMode === "stroop") {
    // Single word at a time. Word is colored in a NON-matching color;
    // the user must type the literal word (ignoring the color).
    if (falling.length) return;
    // Pick a color from the palette that's NOT the literal word
    // (when the word IS a color name). Otherwise any color works.
    let color = STROOP_PALETTE[Math.floor(Math.random() * STROOP_PALETTE.length)];
    if (STROOP_PALETTE.includes(w.toLowerCase())) {
      const filtered = STROOP_PALETTE.filter((c) => c !== w.toLowerCase());
      color = filtered[Math.floor(Math.random() * filtered.length)];
    }
    stroopCurrentColor = color;
    falling.push({
      id, word: w,
      x: stageW / 2, y: stageH / 2,
      vx: 0, vy: 0, mode: "stroop",
      stroopColor: color,
    });
    return;
  }

  // Classic / endless: word falls from the top.
  const minX = halfW + margin;
  const maxX = Math.max(minX + 1, stageW - halfW - margin);
  const x = minX + Math.random() * (maxX - minX);
  const rampPerCatch = gameMode === "endless" ? 1.5 : 0.6;
  const baseSpeed = 50 + Math.random() * 30 + stats.caught * rampPerCatch;
  falling.push({ id, word: w, x, y: -22, vx: 0, vy: baseSpeed * speedMult, mode: "fall" });
}

function frame(elapsed) {
  if (!running) return;
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrameTs) / 1000 || 0);
  lastFrameTs = now;

  // Per-mode spawn pacing. Single-target modes (bomb, stroop)
  // only spawn one item; the spawn() guard handles the cap.
  let spawnEvery;
  if (gameMode === "endless")             spawnEvery = Math.max(350, 1400 - stats.caught * 60);
  else if (gameMode === "asteroids")      spawnEvery = Math.max(550, 1300 - stats.caught * 45);
  else if (gameMode === "tower")          spawnEvery = Math.max(900, 1700 - stats.caught * 30);
  else if (gameMode === "combo-sprint")   spawnEvery = Math.max(280, 900  - stats.caught * 30);
  else if (gameMode === "bomb")           spawnEvery = 0;      // single-target, spawn() self-gates
  else if (gameMode === "stroop")         spawnEvery = 0;
  else                                    spawnEvery = Math.max(700, 1400 - stats.caught * 40);

  if (gameMode === "bomb" || gameMode === "stroop") {
    if (!falling.length) spawn();
  } else if (now - lastSpawnTs > spawnEvery) {
    spawn();
    lastSpawnTs = now;
  }

  // Combo-sprint chain decay: if no catch within COMBO_CHAIN_IDLE_MS, reset.
  if (gameMode === "combo-sprint" && stats.streak > 0
      && lastCatchTs > 0 && now - lastCatchTs > COMBO_CHAIN_IDLE_MS) {
    stats.streak = 0;
    paintStats();
  }

  // Advance per word.
  for (const f of falling) {
    if (f.mode === "bomb") {
      f.timerLeft = Math.max(0, (f.timerLeft || 0) - dt * 1000);
    } else if (f.mode === "stroop") {
      // No movement; stays centered until typed.
    } else if (f.vx == null && f.vy == null) {
      f.y += (f.speed || 0) * dt;
    } else {
      f.x += (f.vx || 0) * dt;
      f.y += (f.vy || 0) * dt;
    }
  }

  // Miss check per mode.
  const FLOOR_Y = stageH - 80;
  let towerHit = 0;
  const before = falling.length;
  falling = falling.filter((f) => {
    let missed = false;
    if (f.mode === "shooter") {
      if (f.x >= stageW + 80) missed = true;
    } else if (f.mode === "combo-sprint") {
      if (f.x >= stageW + 80) missed = true;
    } else if (f.mode === "asteroids") {
      // Impact at the center -- once within 14 px of center, it hit.
      const dx = f.x - stageW / 2, dy = f.y - stageH / 2;
      if (dx * dx + dy * dy < 14 * 14) missed = true;
    } else if (f.mode === "bomb") {
      if ((f.timerLeft || 0) <= 0) missed = true;
    } else if (f.mode === "tower") {
      // Reaches the left base (x = 50).
      if (f.x < 60) missed = true;
    } else if (f.mode === "stroop") {
      // Never times out -- the user can take their time.
    } else {
      if (f.y >= FLOOR_Y) missed = true;
    }
    if (!missed) return true;
    stats.missed++;
    if (f.mode === "tower") {
      // Each breach damages the base instead of incrementing a counter.
      towerHit += 12 + Math.floor(f.word.length * 1.4);
    }
    if (gameMode !== "combo-sprint") stats.streak = 0;
    else stats.streak = 0; // combo-sprint also resets streak on miss
    return false;
  });
  if (falling.length !== before) {
    if (gameMode === "tower") baseHP = Math.max(0, baseHP - towerHit);
    paintStats();
    // End-of-round conditions per mode.
    if (gameMode === "tower" && baseHP <= 0) { endRound(); return; }
    else if (gameMode === "asteroids" && stats.missed >= 3) { endRound(); return; }
    else if (gameMode === "bomb" && stats.missed >= 1) { endRound(); return; }
    else if (gameMode !== "endless" && gameMode !== "combo-sprint" && gameMode !== "tower"
             && gameMode !== "stroop"
             && stats.missed >= 3) {
      endRound();
      return;
    }
  }
  paintFalling();
}

function paintFalling() {
  if (!svgSel) return;
  const typed = (input.value || "").trim();
  const groups = svgSel.selectAll("g.fall:not(.fall--dying):not(.fall-popup)").data(falling, (d) => d && d.id);
  groups.exit().remove();
  const enter = groups.enter().append("g").attr("class", "fall");
  enter.each(function(d) {
    const sel = d3.select(this);
    // Bomb mode: render a countdown ring behind the word.
    if (d.mode === "bomb") {
      sel.append("circle")
        .attr("class", "fall__bomb-ring-bg")
        .attr("r", 60).attr("fill", "none")
        .attr("stroke", "var(--rule)").attr("stroke-width", 4);
      sel.append("circle")
        .attr("class", "fall__bomb-ring")
        .attr("r", 60).attr("fill", "none")
        .attr("stroke", "var(--bad, #d76050)").attr("stroke-width", 4)
        .attr("stroke-linecap", "round")
        .attr("transform", "rotate(-90)");
    }
    // Stroop mode: render a colored swatch as backdrop -- mismatched.
    if (d.mode === "stroop") {
      sel.append("rect")
        .attr("class", "fall__stroop-bg")
        .attr("x", -120).attr("y", -32)
        .attr("width", 240).attr("height", 64)
        .attr("rx", 8).attr("ry", 8)
        .attr("fill", STROOP_COLOR_HEX[d.stroopColor] || "#888")
        .attr("opacity", .85);
    }
    const t = sel.append("text")
      .attr("text-anchor", "middle")
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", d.mode === "stroop" ? 32 : (d.mode === "bomb" ? 26 : 22))
      .attr("font-weight", d.mode === "stroop" ? "600" : "500");
    // Stroop: write text in WHITE on the colored backdrop so the
    // user reads the LITERAL letters; the color is the distractor.
    if (d.mode === "stroop") {
      t.attr("y", 10).attr("fill", "#ffffff").attr("stroke", "rgba(0,0,0,.4)").attr("stroke-width", 0.5);
    }
    const chars = d.word.split("");
    chars.forEach((c, i) => {
      t.append("tspan")
        .attr("class", "fall__char")
        .attr("data-i", i)
        .text(c);
    });
  });

  // Update position + per-char fill on every frame.
  svgSel.selectAll("g.fall:not(.fall--dying)")
    .attr("transform", (d) => `translate(${d.x}, ${d.y})`)
    .each(function(d) {
      const matchLen = (typed && d.word.startsWith(typed)) ? typed.length : 0;
      const sel = d3.select(this);
      // Stroop keeps everything white (typed = brighter via opacity).
      sel.selectAll("tspan").attr("fill", function() {
        if (d.mode === "stroop") return "#ffffff";
        const i = +this.getAttribute("data-i");
        if (i < matchLen) return "var(--accent)";
        return "var(--fg-0)";
      }).attr("opacity", function() {
        if (d.mode !== "stroop") return null;
        const i = +this.getAttribute("data-i");
        return i < matchLen ? 1 : 0.7;
      });
      // Bomb countdown ring (stroke-dasharray to draw % left).
      if (d.mode === "bomb") {
        const C = 2 * Math.PI * 60;
        const pct = (d.timerLeft || 0) / (d.timerStart || 1);
        sel.select("circle.fall__bomb-ring")
          .attr("stroke-dasharray", C)
          .attr("stroke-dashoffset", C * (1 - pct))
          .attr("stroke", pct < 0.3 ? "var(--bad, #d76050)" : "var(--warn, #e3b873)");
      }
    });

  // Tower base HP bar -- repainted every frame on its own HUD group.
  paintTowerHUD();
}

function paintTowerHUD() {
  if (!svgSel) return;
  if (gameMode !== "tower") {
    svgSel.selectAll("g.fall-hud").remove();
    return;
  }
  let hud = svgSel.selectAll("g.fall-hud").data([null]);
  hud = hud.enter().append("g").attr("class", "fall-hud").merge(hud);
  hud.selectAll("*").remove();
  // Vertical base column on the left.
  hud.append("rect")
    .attr("x", 0).attr("y", 0)
    .attr("width", 50).attr("height", stageH)
    .attr("fill", "rgba(20, 22, 30, 0.55)")
    .attr("stroke", "var(--accent)").attr("stroke-width", 2)
    .attr("stroke-dasharray", "4 4");
  // HP fill.
  const hpRatio = baseHP / BASE_HP_MAX;
  hud.append("rect")
    .attr("x", 4).attr("y", stageH * (1 - hpRatio) + 4)
    .attr("width", 42).attr("height", stageH * hpRatio - 8)
    .attr("fill", hpRatio > 0.5 ? "var(--good, #76c893)"
      : hpRatio > 0.25 ? "var(--warn, #e3b873)"
      : "var(--bad, #d76050)")
    .attr("opacity", 0.85);
  // HP label.
  hud.append("text")
    .attr("x", 25).attr("y", 22)
    .attr("text-anchor", "middle")
    .attr("fill", "var(--fg-0)")
    .attr("font-family", "var(--font-mono)")
    .attr("font-size", "12").attr("font-weight", "600")
    .text("BASE");
  hud.append("text")
    .attr("x", 25).attr("y", stageH - 14)
    .attr("text-anchor", "middle")
    .attr("fill", "var(--fg-1)")
    .attr("font-family", "var(--font-mono)")
    .attr("font-size", "14").attr("font-weight", "500")
    .text(baseHP + " HP");
}

function tryCatch(typed) {
  if (!typed) return false;
  if (!running) return false;
  // Match first falling word whose text equals typed. For modes
  // where words stay on-stage (bomb, stroop, tower, asteroids,
  // combo-sprint) the FLOOR_Y check would wrongly reject mid-stage
  // matches, so the visibility predicate is mode-aware.
  const i = falling.findIndex((f) => {
    if (f.word !== typed) return false;
    if (f.mode === "bomb" || f.mode === "stroop") return true;
    if (f.mode === "tower") return f.x > 50;
    if (f.mode === "asteroids") return true;
    if (f.mode === "combo-sprint") return f.x > -80 && f.x < stageW + 80;
    return f.y > 0 && f.y < stageH - 80;
  });
  if (i === -1) return false;
  const f = falling[i];
  falling.splice(i, 1);
  dissolveCaughtWord(f);
  const base = 10 + f.word.length * 2;
  // Combo-sprint awards a multiplier scaled by streak directly
  // -- 5x cap kicks in fast.
  let bonus = multiplierFor(stats.streak);
  if (f.mode === "combo-sprint") {
    bonus = Math.min(5, 1 + stats.streak * 0.1);
  }
  // Bomb mode pays out faster the LESS time was left on the timer.
  if (f.mode === "bomb") {
    const urgency = 1 + (1 - (f.timerLeft || 0) / (f.timerStart || 1));
    bonus *= urgency;
  }
  // Tower mode: a small base-repair heal on the catch -- caps at MAX.
  if (f.mode === "tower") {
    baseHP = Math.min(BASE_HP_MAX, baseHP + Math.max(1, Math.floor(f.word.length * 0.3)));
  }
  stats.score += Math.round(base * bonus);
  stats.caught++;
  stats.streak++;
  if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
  lastCatchTs = performance.now();
  paintStats();
  paintFalling();
  return true;
}

/* Shooter-mode catch effect: the word becomes a "shot plane"
   that nosedives toward the bottom of the screen with a faint
   smoke trail, then explodes at the bottom in a wider pixel
   burst with a small flash + score popup. Classic / endless
   modes keep the in-place pixel disintegration. */
function dissolveCaughtWord(f) {
  if (f && f.mode === "shooter") return crashCaughtWord(f);
  if (!svgSel || !d3) return;
  // Find the existing <g> for this word so paintFalling can
  // exclude it (class .fall--dying).
  const node = svgSel.selectAll("g.fall").filter((d) => d && d.id === f.id);
  if (!node.empty()) {
    node.classed("fall--dying", true);
    // Hide the text immediately -- pixels take over.
    node.selectAll("text").attr("opacity", 0);
    // Remove the dying group once particles finish.
    node.transition().delay(720).duration(0).remove();
  }

  // Spawn a particle swarm. Use a separate <g> outside the dying
  // node so paintFalling can't yank it. ~28 squares clustered at
  // the word's position, each given a random velocity outward and
  // up. Bigger pixels for shorter words so the burst always reads
  // as substantial.
  const burst = svgSel.append("g").attr("class", "fall-popup");
  const pixelCount = 22 + Math.min(20, f.word.length * 2);
  const palette = ["var(--accent)", "var(--accent-soft, #f59c80)", "var(--warn, #e3b873)", "var(--fg-0)"];
  const cx = f.x, cy = f.y - 6;
  for (let i = 0; i < pixelCount; i++) {
    const size = 2 + Math.random() * 3;
    const angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 90;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed - 20;
    const lifetime = 500 + Math.random() * 220;
    burst.append("rect")
      .attr("x", cx - size / 2).attr("y", cy - size / 2)
      .attr("width", size).attr("height", size)
      .attr("rx", 0.5).attr("ry", 0.5)
      .attr("fill", palette[Math.floor(Math.random() * palette.length)])
      .attr("opacity", .9)
      .transition().duration(lifetime).ease(d3.easeQuadOut)
      .attr("x", cx + dx - size / 2)
      .attr("y", cy + dy - size / 2)
      .attr("opacity", 0);
  }
  // Burst clears itself after the longest pixel lifetime + cushion.
  burst.transition().delay(800).duration(0).remove();

  // "+N" popup floats up + fades.
  const popup = svgSel.append("g").attr("class", "fall-popup");
  popup.append("text")
    .attr("x", f.x).attr("y", f.y)
    .attr("text-anchor", "middle")
    .attr("fill", "var(--accent)")
    .attr("font-family", "var(--font-display)")
    .attr("font-size", "22").attr("font-weight", "600")
    .attr("opacity", 0)
    .text(`+${Math.round((10 + f.word.length * 2) * (stats.streak >= 5 ? 1.5 : 1))}`)
    .transition().duration(80).attr("opacity", 1)
    .transition().duration(500).ease(d3.easeCubicOut)
    .attr("y", f.y - 50).attr("opacity", 0)
    .on("end", () => popup.remove());
}

/* Shooter catch -- the word turns into a "shot plane" that
   nosedives + rotates, drops a smoke trail of tiny squares,
   then explodes when it hits the bottom. The explosion is a
   wider, brighter pixel burst than the in-place dissolve. */
function crashCaughtWord(f) {
  if (!svgSel || !d3) return;
  const startX = f.x;
  const startY = f.y;
  const endX = f.x + (Math.random() - 0.3) * 80;
  const endY = stageH - 18;
  const fallMs = 480 + Math.random() * 120;

  // Hide the original falling group.
  const node = svgSel.selectAll("g.fall").filter((d) => d && d.id === f.id);
  if (!node.empty()) {
    node.classed("fall--dying", true);
    node.selectAll("text").attr("opacity", 0);
    node.transition().delay(fallMs + 320).duration(0).remove();
  }

  // Smoking, rotating plane. Use the word's text inside a group
  // that animates position + rotation via attrTween on transform.
  const plane = svgSel.append("g").attr("class", "fall-popup");
  const planeText = plane.append("text")
    .attr("text-anchor", "middle")
    .attr("fill", "var(--bad, #d76050)")
    .attr("font-family", "var(--font-mono)")
    .attr("font-size", "20")
    .attr("font-weight", "600")
    .attr("opacity", .92)
    .text(f.word);

  // Smoke-trail spawner -- drops a few squares behind the plane
  // as it falls. Each square fades quickly.
  const trail = svgSel.append("g").attr("class", "fall-popup");
  const smokeTimer = d3.timer((elapsed) => {
    if (elapsed > fallMs) { smokeTimer.stop(); return; }
    const t = elapsed / fallMs;
    const px = startX + (endX - startX) * t + (Math.random() - 0.5) * 6;
    const py = startY + (endY - startY) * t + (Math.random() - 0.5) * 6;
    const s = 2 + Math.random() * 2;
    trail.append("rect")
      .attr("x", px - s / 2).attr("y", py - s / 2)
      .attr("width", s).attr("height", s)
      .attr("fill", "var(--fg-3)").attr("opacity", .55)
      .transition().duration(380).ease(d3.easeCubicOut)
      .attr("opacity", 0)
      .attr("y", py - s / 2 + 14);
  });

  // Animate the plane to the crash site, then trigger the
  // explosion + cleanup. d3.transition on transform handles both
  // translate and rotate at once via a custom attrTween.
  const start = `translate(${startX},${startY}) rotate(0)`;
  const end = `translate(${endX},${endY}) rotate(70)`;
  plane.attr("transform", start)
    .transition().duration(fallMs).ease(d3.easeCubicIn)
    .attrTween("transform", () => {
      return (t) => {
        const x = startX + (endX - startX) * t;
        const y = startY + (endY - startY) * t * t;  // accelerate
        const rot = 70 * t;
        return `translate(${x},${y}) rotate(${rot})`;
      };
    })
    .on("end", () => {
      planeText.transition().duration(80).attr("opacity", 0);
      explodeAt(endX, endY);
      trail.transition().delay(200).duration(0).remove();
      plane.transition().delay(280).duration(0).remove();
    });

  // "+N" popup floats up from the crash site.
  const popup = svgSel.append("g").attr("class", "fall-popup");
  popup.append("text")
    .attr("x", endX).attr("y", endY)
    .attr("text-anchor", "middle")
    .attr("fill", "var(--accent)")
    .attr("font-family", "var(--font-display)")
    .attr("font-size", "22").attr("font-weight", "600")
    .attr("opacity", 0)
    .text(`+${Math.round((10 + f.word.length * 2) * (stats.streak >= 5 ? 1.5 : 1))}`)
    .transition().delay(fallMs).duration(80).attr("opacity", 1)
    .transition().duration(520).ease(d3.easeCubicOut)
    .attr("y", endY - 60).attr("opacity", 0)
    .on("end", () => popup.remove());
}

/* Wider pixel burst at the crash site for the shooter mode. */
function explodeAt(x, y) {
  if (!svgSel || !d3) return;
  const burst = svgSel.append("g").attr("class", "fall-popup");
  // Flash circle that pulses out.
  burst.append("circle")
    .attr("cx", x).attr("cy", y).attr("r", 4)
    .attr("fill", "var(--warn, #e3b873)").attr("opacity", .85)
    .transition().duration(320).ease(d3.easeCubicOut)
    .attr("r", 50).attr("opacity", 0);
  // Pixel shrapnel -- wider spread + bigger pieces than the
  // in-place dissolve.
  const palette = ["var(--accent)", "var(--accent-soft, #f59c80)", "var(--warn, #e3b873)", "var(--bad, #d76050)", "var(--fg-0)"];
  for (let i = 0; i < 36; i++) {
    const size = 3 + Math.random() * 4;
    const angle = -Math.PI + Math.random() * Math.PI;  // upper half only -- shrapnel flies up + sideways
    const speed = 70 + Math.random() * 140;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed;
    const lifetime = 600 + Math.random() * 200;
    burst.append("rect")
      .attr("x", x - size / 2).attr("y", y - size / 2)
      .attr("width", size).attr("height", size)
      .attr("rx", .5).attr("ry", .5)
      .attr("fill", palette[Math.floor(Math.random() * palette.length)])
      .attr("opacity", .95)
      .transition().duration(lifetime).ease(d3.easeQuadOut)
      .attr("x", x + dx - size / 2)
      .attr("y", y + dy - size / 2 + 30)  // gravity pull
      .attr("opacity", 0);
  }
  burst.transition().delay(900).duration(0).remove();
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
  // Wipe the pre-round hint so it doesn't sit behind the falling
  // words. paintHint() is a no-op when running=true.
  if (svgSel) svgSel.selectAll("g.stage-hint").remove();
  Analytics.gameStart({ mode: gameMode, speed: speedMult });
  stopFrameTimer();
  frameTimer = d3.timer(frame);
}

function pauseRound() {
  running = !running;
  pauseBtn.textContent = running ? "Pause" : "Resume";
  if (running) {
    lastSpawnTs = performance.now();
    lastFrameTs = performance.now();
    stopFrameTimer();
    frameTimer = d3.timer(frame);
  } else {
    // Halt the frame loop while paused so it doesn't keep
    // burning CPU + accumulating phantom dt values.
    stopFrameTimer();
  }
}

function endRound() {
  running = false;
  stopFrameTimer();
  // Clear the falling array so stale entries can't be caught
  // by typing through the game-over overlay.
  falling = [];
  input.value = "";
  startBtn.textContent = "Play again";
  startBtn.hidden = false;
  pauseBtn.hidden = true;
  Analytics.gameOver({
    mode: gameMode,
    score: stats.score,
    caught: stats.caught,
    missed: stats.missed,
    bestStreak: stats.bestStreak,
    speed: speedMult,
  });
  // Stash high score per-mode. Legacy top-level keys are preserved
  // for backward compat (and so old code reading them still works).
  try {
    updateActive((p) => {
      p.gameStats = p.gameStats || { rounds: 0, totalCaught: 0 };
      p.gameStats.byMode = p.gameStats.byMode || {};
      const m = p.gameStats.byMode[gameMode] || { highScore: 0, bestStreak: 0, rounds: 0, totalCaught: 0 };
      if (stats.score > m.highScore) m.highScore = stats.score;
      if (stats.bestStreak > m.bestStreak) m.bestStreak = stats.bestStreak;
      m.rounds = (m.rounds || 0) + 1;
      m.totalCaught = (m.totalCaught || 0) + stats.caught;
      m.lastPlayedAt = new Date().toISOString();
      p.gameStats.byMode[gameMode] = m;
      p.gameStats.rounds = (p.gameStats.rounds || 0) + 1;
      p.gameStats.totalCaught = (p.gameStats.totalCaught || 0) + stats.caught;
      if (stats.score > (p.gameStats.highScore || 0)) p.gameStats.highScore = stats.score;
      p.gameStats.bestStreak = Math.max(p.gameStats.bestStreak || 0, stats.bestStreak);
      return p;
    });
  } catch {}
  // Game-over overlay. Class is "game-over-overlay" (NOT "fall")
  // so paintFalling's selectAll("g.fall") doesn't include it and
  // exit().remove() can't yank it on the next paint.
  if (svgSel) {
    // Refresh the in-memory profile so the best chip in the
    // overlay reflects the score we JUST wrote.
    const refreshedBest = readBest(gameMode);
    const isNewBest = stats.score > 0 && stats.score >= refreshedBest.highScore;
    svgSel.selectAll("g.game-over-overlay").remove();
    const over = svgSel.append("g").attr("class", "game-over-overlay");
    over.append("rect")
      .attr("x", 0).attr("y", 0).attr("width", stageW).attr("height", stageH)
      .attr("fill", "rgba(20, 22, 30, .82)");
    const titleY = isNewBest ? stageH / 2 - 60 : stageH / 2 - 30;
    over.append("text")
      .attr("x", stageW / 2).attr("y", titleY)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--accent)")
      .attr("font-family", "var(--font-display)")
      .attr("font-size", "44").attr("font-weight", "500")
      .text(isNewBest ? "New best!" : "Round over");
    if (isNewBest) {
      over.append("text")
        .attr("x", stageW / 2).attr("y", titleY + 36)
        .attr("text-anchor", "middle")
        .attr("fill", "var(--good, #76c893)")
        .attr("font-family", "var(--font-mono)")
        .attr("font-size", "14").attr("letter-spacing", "0.12em")
        .text(`PERSONAL ${gameMode.toUpperCase()} BEST`);
    }
    over.append("text")
      .attr("x", stageW / 2).attr("y", stageH / 2 + 20)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--fg-1)")
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", "18")
      .text(`Score ${stats.score} · ${stats.caught} caught · best streak ${stats.bestStreak}`);
    if (!isNewBest && refreshedBest.highScore > 0) {
      over.append("text")
        .attr("x", stageW / 2).attr("y", stageH / 2 + 44)
        .attr("text-anchor", "middle")
        .attr("fill", "var(--fg-3)")
        .attr("font-family", "var(--font-mono)")
        .attr("font-size", "12")
        .text(`Your best: ${refreshedBest.highScore} (need ${refreshedBest.highScore - stats.score + 1} more)`);
    }
    over.append("text")
      .attr("x", stageW / 2).attr("y", stageH / 2 + (isNewBest ? 56 : 74))
      .attr("text-anchor", "middle")
      .attr("fill", "var(--fg-3)")
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", "13")
      .text("Click Play again to start a new round.");
  }
  // Also blur the input so a stray key doesn't auto-fire anything.
  try { input.blur(); } catch {}
}

input.addEventListener("input", () => {
  const raw = input.value;
  const v = raw.trim();
  paintFalling();
  if (!v) return;
  // Catch on space.
  if (raw.endsWith(" ")) {
    tryCatch(v);
    input.value = "";
    paintFalling();
    return;
  }
  // Immediate match (user typed the full word without a trailing
  // space).
  if (tryCatch(v)) {
    input.value = "";
    paintFalling();
    return;
  }
  // No falling word starts with what they've typed -- they made a
  // mistake. Clear the input so they don't have to backspace
  // their way out of a typo. This is the standard typelit.io
  // behavior.
  const anyPrefixMatch = falling.some((f) => f.word.startsWith(v));
  if (!anyPrefixMatch) {
    input.value = "";
    paintFalling();
  }
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
loadD3().then((m) => {
  if (m) {
    d3 = m;
    svgSel = d3.select("#game-svg");
    // Once D3 is ready, paint the initial pre-round hint so the
    // user sees mode-specific directions before tapping Start.
    paintHint();
  }
});

/* Game-mode switch buttons. Tabs across the top let the user
   flip between classic / endless / shooter without reloading.
   Updates the page title + subtitle to match the active mode
   and resets the round so the new physics take effect cleanly. */
const MODE_COPY = {
  classic: {
    title: "Catch the Word",
    subtitle: "Type the falling words before they hit the bottom. Three misses ends the round. Picker is weighted toward words you've mistyped before.",
    hint: "Tap Start when you're ready. Words fall from the top; type each one (or finish with a space). Three misses ends the round.",
    howtoTitle: "How to play — Classic",
    howto: [
      "Words fall from the top of the stage. Type the next one before it hits the bottom.",
      "Each catch scores points. A <strong>streak multiplier</strong> (1.5× → 5×) kicks in after 5 in a row and color-escalates with speed.",
      "Three misses ends the round. Your high score saves per-mode to your profile.",
      "Words come from your <strong>missed-words list</strong> when available — if you've never missed a word, it falls back to high-error keys from your typing history.",
    ],
  },
  endless: {
    title: "Catch the Word — Endless",
    subtitle: "No three-miss cap. Words spawn forever and accelerate with every catch. Round ends only when you walk away.",
    hint: "Tap Start. Words spawn faster + fall faster the longer you survive. Use Pause for breathers; high score saves to your profile.",
    howtoTitle: "How to play — Endless",
    howto: [
      "Same falling-word stage as Classic, but <strong>no three-miss cap</strong>. The round only ends when you click Reset.",
      "Spawn pacing and fall speed ramp up <strong>continuously</strong> with every catch — the screen gets denser the longer you survive.",
      "Score the way Classic scores, but missed words just keep coming. Misses do NOT end the round; they tick the missed counter for the post-round summary.",
      "Use <strong>Pause</strong> between waves to breathe. High score saves to your profile under the Endless bucket.",
    ],
  },
  shooter: {
    title: "Word Shooter",
    subtitle: "Words drift across the screen left to right. Type each one to shoot it before it exits the right edge. Three misses ends the round.",
    hint: "Tap Start. Type each word as it drifts toward the right edge -- catching one sends it nosediving into a pixel-shrapnel explosion at the bottom.",
    howtoTitle: "How to play — Word Shooter",
    howto: [
      "Words enter from the <strong>left edge</strong> and drift toward the right. Type each one before it exits.",
      "A catch sends the word nosediving in a <strong>pixel-shrapnel explosion</strong> at the bottom of the stage — the visual reward is the point.",
      "Three exits = three misses = round ends. Streak multiplier still applies; long runs hit 5× quickly.",
      "Words come from your <strong>missed-words list</strong> first, then fall back to high-error keys. Same pool as Classic — same targeted practice.",
    ],
  },
  asteroids: {
    title: "Word Asteroids",
    subtitle: "Words approach the center from every direction. Type each one before it impacts. Three impacts ends the round.",
    hint: "Tap Start. Asteroids enter from all around the edge and converge on the center. Type each word before it reaches the impact zone. Three impacts end the round.",
    howtoTitle: "How to play — Asteroids",
    howto: [
      "Words enter from a random direction around the stage and move <strong>toward the center</strong>.",
      "Type a word to destroy that asteroid before it reaches the impact zone (a small radius at the center of the stage).",
      "<strong>Three impacts</strong> end the round. The streak multiplier compounds with every consecutive destroy.",
      "Words come from your <strong>missed-words list</strong>. Wide spawn pattern means you'll get practice on the same words from many angles.",
    ],
  },
  bomb: {
    title: "Bomb Defuse",
    subtitle: "One bomb at a time, one shrinking timer. Defuse to spawn the next bomb with less time. One miss ends the round.",
    hint: "Tap Start. Defuse the bomb by typing the word correctly before the ring runs out. Each defuse cuts a little off the next timer. One miss ends the run.",
    howtoTitle: "How to play — Bomb Defuse",
    howto: [
      "A single bomb spawns at center with a <strong>countdown ring</strong>. Defuse it by typing the word before the ring depletes.",
      "Each successful defuse spawns the next bomb with a shorter timer (10 s → floor at 4 s).",
      "<strong>One miss</strong> ends the round — the bomb went off. Score scales by urgency: less time left = bigger bonus.",
      "Streak multiplier still applies; chains of defuses rack up huge multipliers.",
    ],
  },
  tower: {
    title: "Tower Defense",
    subtitle: "Words march toward your base in three lanes. Type to stop them. Your base has 100 HP — protect it as long as you can.",
    hint: "Tap Start. Words march right-to-left in three lanes. Type to destroy. Each word that reaches your base on the left damages it; HP runs out, round ends.",
    howtoTitle: "How to play — Tower Defense",
    howto: [
      "Words march <strong>right → left</strong> in three lanes toward your base on the left side of the stage.",
      "Type a word to destroy it. Each catch slightly <strong>repairs</strong> your base (the longer the word, the bigger the patch).",
      "Words that reach the base <strong>damage</strong> it: 12 HP + word length × 1.4. Base starts at 100 HP.",
      "The round ends when the base hits 0 HP. Score = points scored before the base falls.",
    ],
  },
  "combo-sprint": {
    title: "Combo Sprint",
    subtitle: "Words zoom past horizontally fast. No miss cap. Score is your chain length × base — build the longest streak you can.",
    hint: "Tap Start. Words sprint across the screen quickly. Catch them in a long chain — your streak feeds the multiplier directly. Miss or idle for 2 seconds and the chain resets.",
    howtoTitle: "How to play — Combo Sprint",
    howto: [
      "Words sprint left → right at <strong>high velocity</strong>. The pace ramps every catch.",
      "<strong>No miss cap</strong>. The round only ends when you click Reset — score is your peak.",
      "The streak multiplier scales linearly with chain length: 1× → 5× (cap). Every catch grows it; <strong>missing or idling for 2 seconds breaks the chain</strong>.",
      "Pure chase-the-multiplier mode. The longer you can keep a chain alive, the bigger every catch becomes.",
    ],
  },
  stroop: {
    title: "Stroop Type",
    subtitle: "Words are painted in colors that don't match the word. Type the LITERAL word; ignore the color. Brain-training meets typing.",
    hint: "Tap Start. A word appears in a color-mismatched swatch (e.g. the word RED in blue paint). Type the literal letters — the color is the distractor.",
    howtoTitle: "How to play — Stroop Type",
    howto: [
      "A word appears in a colored swatch. The swatch color is chosen to <strong>NOT match</strong> the literal word.",
      "Type the <strong>literal word</strong>, ignoring the color. (The classic Stroop effect: your brain wants to name the color instead.)",
      "There's no movement and no miss timer — go at your own pace. Score = 1 per correct word, with the streak multiplier still applied.",
      "Brain-training crossover: useful for sharpening focus and resisting visual distractors while typing.",
    ],
  },
};
function applyModeCopy() {
  const c = MODE_COPY[gameMode] || MODE_COPY.classic;
  const t = document.getElementById("game-title");
  const s = document.getElementById("game-subtitle");
  if (t) t.textContent = c.title;
  if (s) s.textContent = c.subtitle;
  // Per-mode How-to-play panel below the stage.
  const ht = document.getElementById("game-howto-title");
  const hl = document.getElementById("game-howto-list");
  if (ht) ht.textContent = c.howtoTitle || "How to play";
  if (hl && Array.isArray(c.howto)) {
    hl.innerHTML = c.howto.map((line) => `<li>${line}</li>`).join("");
  }
  document.querySelectorAll(".game-mode-switch__btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.gameMode === gameMode);
  });
  // Paint the in-stage hint that shows BEFORE the round starts.
  // Once the round is running the hint clears so it doesn't sit
  // behind the falling words.
  paintHint();
}
function paintHint() {
  if (!svgSel) return;
  svgSel.selectAll("g.stage-hint").remove();
  if (running) return;
  const c = MODE_COPY[gameMode] || MODE_COPY.classic;
  const hint = svgSel.append("g").attr("class", "stage-hint");
  hint.append("text")
    .attr("x", stageW / 2).attr("y", stageH / 2 - 6)
    .attr("text-anchor", "middle")
    .attr("fill", "var(--fg-2)")
    .attr("font-family", "var(--font-mono)")
    .attr("font-size", "14")
    .attr("style", "max-width: 70%")
    .text(c.title);
  // Word-wrap the hint text into 2-3 lines manually since SVG
  // doesn't support text-wrap. Split on word boundaries near
  // ~52 chars per line.
  const lines = wrapForSvg(c.hint, 52);
  lines.forEach((line, i) => {
    hint.append("text")
      .attr("x", stageW / 2).attr("y", stageH / 2 + 22 + i * 18)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--fg-3)")
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", "12")
      .text(line);
  });
}
function wrapForSvg(s, maxChars) {
  const words = s.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = (cur ? cur + " " : "") + w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
applyModeCopy();
paintStats();  // initial paint so the Best chip reflects the mode at load
document.querySelectorAll(".game-mode-switch__btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    gameMode = btn.dataset.gameMode || "classic";
    applyModeCopy();
    paintStats();  // Best chip flips to the new mode's high score
    // Unconditional reset: whether the previous round was still
    // running or had ended at the game-over overlay, the new
    // mode needs a clean stage. The 'if (running)' guard used to
    // skip this branch after a finished round, leaving the
    // game-over overlay (and any drifting fall words) parked on
    // the new mode's surface. reset() handles falling[] +
    // stats; we additionally wipe every SVG group class the
    // game has ever appended.
    reset();
    if (svgSel) {
      svgSel.selectAll("g.fall, g.fall--dying, g.fall-popup, g.game-over-overlay, g.stage-hint").remove();
    }
    startBtn.textContent = "Start";
    startBtn.hidden = false;
    pauseBtn.hidden = true;
    resetBtn.hidden = true;
    // Re-paint the pre-round hint for the freshly-active mode.
    paintHint();
  });
});

// Mobile typing uses the OS soft keyboard. The game-input has
// inputmode="text" so iOS / Android surface their native keyboard
// when the user taps the field (or when startRound focuses it).
// The custom virtual keyboard was previously mounted here but it
// covered the falling-word stage on small screens and conflicted
// with input focus, so the OS keyboard is the more reliable path.
window.addEventListener("beforeunload", () => {
  try { delete window.__vkbdHandler; } catch {}
});
