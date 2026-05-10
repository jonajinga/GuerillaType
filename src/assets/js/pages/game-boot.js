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
import { mountVirtualKeyboard, unmountVirtualKeyboard, highlightNextKey as vkbdNext } from "../engine/virtual-keyboard.js";

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
let speedMult = 1.0;       // multiplier from the speed slider

const input = document.getElementById("game-input");
const speedSlider = document.getElementById("game-speed");
const speedVal = document.querySelector("[data-speed-val]");
if (speedSlider) {
  speedMult = parseFloat(speedSlider.value) || 1.0;
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
  // Base fall speed + per-catch ramp, all scaled by the slider.
  const baseSpeed = 50 + Math.random() * 30 + stats.caught * 0.6;
  const speed = baseSpeed * speedMult;
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
  const typed = (input.value || "").trim();
  // Only select live falling groups -- exclude dying groups (mid-
  // dissolve) and score popups. Both lack a datum and would throw
  // when the key function evaluates d.id, freezing the game.
  const groups = svgSel.selectAll("g.fall:not(.fall--dying):not(.fall-popup)").data(falling, (d) => d && d.id);
  groups.exit().remove();
  // New words enter with one <tspan> per char so we can color
  // each char independently (typed prefix = accent, rest =
  // neutral). The text is rebuilt only on enter; per-frame we
  // just update transform and tspan colors.
  const enter = groups.enter().append("g").attr("class", "fall");
  enter.each(function(d) {
    const t = d3.select(this).append("text")
      .attr("text-anchor", "middle")
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", "22")
      .attr("font-weight", "500");
    // Estimate char width by drawing the full word once to measure.
    // Simpler: lay out tspans with even spacing using the word
    // length. SVG tspan dx is relative; we use absolute x via
    // text-anchor:middle on the text + setting each tspan as
    // monospace.
    const chars = d.word.split("");
    chars.forEach((c, i) => {
      t.append("tspan")
        .attr("class", "fall__char")
        .attr("data-i", i)
        .text(c);
    });
  });
  // Update position + per-char fill on every frame.
  svgSel.selectAll("g.fall")
    .attr("transform", (d) => `translate(${d.x}, ${d.y})`)
    .each(function(d) {
      const matchLen = (typed && d.word.startsWith(typed)) ? typed.length : 0;
      d3.select(this).selectAll("tspan")
        .attr("fill", function() {
          const i = +this.getAttribute("data-i");
          if (i < matchLen) return "var(--accent)";
          return "var(--fg-0)";
        });
    });
}

function tryCatch(typed) {
  if (!typed) return false;
  // No scoring once the round has ended. Without this guard the
  // user could keep typing after the Game-over overlay and rack
  // up points on stale entries left in the falling array.
  if (!running) return false;
  // Match the first falling word whose text equals typed AND is
  // visibly on the stage. Without the y guard the user could
  // earn credit for a word that just slid past the bottom edge
  // (the frame's bottom-filter races with this handler).
  const i = falling.findIndex((f) => f.word === typed && f.y > 0 && f.y < stageH - 10);
  if (i === -1) return false;
  const f = falling[i];
  // Remove from the active array immediately so the frame loop
  // stops advancing the word -- but DON'T remove the DOM node yet.
  // Spawn a dissolve animation on its <g> in-place, then drop the
  // node when it finishes.
  falling.splice(i, 1);
  dissolveCaughtWord(f);
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

/* Caught-word disintegration: the word's text node is hidden
   immediately, replaced by a swarm of small colored squares that
   spray outward like exploding pixels. Each pixel fades + drifts
   on its own trajectory. ~700 ms lifecycle. A "+N" score popup
   floats up from the word's position over the same window. */
function dissolveCaughtWord(f) {
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
  // Clear the falling array so stale entries can't be caught
  // by typing through the game-over overlay.
  falling = [];
  input.value = "";
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
loadD3().then((m) => { if (m) { d3 = m; svgSel = d3.select("#game-svg"); }});

// Virtual on-screen keyboard for the game -- mobile only.
// Desktop users have a physical keyboard and don't need a tap
// surface (and the user explicitly asked not to show it on
// desktop). Mounts only when viewport <= 768 px.
function wireVirtualKeyboardForGame() {
  const isMobile = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  if (!isMobile) return;
  window.__vkbdHandler = {
    onChar: (ch) => {
      input.value += ch;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    onBackspace: () => {
      if (!input.value) return;
      input.value = input.value.slice(0, -1);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
  };
  mountVirtualKeyboard();
  document.body.classList.add("has-vkbd");
}
wireVirtualKeyboardForGame();
window.addEventListener("beforeunload", () => {
  // Clean up the handler so other pages aren't affected.
  try { delete window.__vkbdHandler; } catch {}
  unmountVirtualKeyboard();
});
