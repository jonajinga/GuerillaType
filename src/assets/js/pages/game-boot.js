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
let gameMode = ({ endless: "endless", shooter: "shooter", classic: "classic" })[_gameParams.get("mode")] || "classic";
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
  if (gameMode === "shooter") {
    // Shooter: word enters from the left at a random vertical
    // band, drifts right. Off-stage to the right counts as a
    // miss. vx = horizontal speed; vy = 0.
    const y = 40 + Math.random() * (stageH - 80);
    const vx = 40 + Math.random() * 30 + stats.caught * 0.8;
    falling.push({
      id: Math.random().toString(36).slice(2),
      word: w, x: -40, y, vx: vx * speedMult, vy: 0, mode: "shooter",
    });
    return;
  }
  // Classic / endless: word falls from the top.
  const x = 60 + Math.random() * (stageW - 120);
  const rampPerCatch = gameMode === "endless" ? 1.5 : 0.6;
  const baseSpeed = 50 + Math.random() * 30 + stats.caught * rampPerCatch;
  falling.push({
    id: Math.random().toString(36).slice(2),
    word: w, x, y: -20, vx: 0, vy: baseSpeed * speedMult, mode: "fall",
  });
}

function frame(elapsed) {
  if (!running) return;
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrameTs) / 1000 || 0);
  lastFrameTs = now;
  // Spawn pacing. Classic: floor at 700 ms. Endless: floor at
  // 350 ms so the screen actually fills up at late stages.
  const minSpawn = gameMode === "endless" ? 350 : 700;
  const rampPerCatch = gameMode === "endless" ? 60 : 40;
  const spawnEvery = Math.max(minSpawn, 1400 - stats.caught * rampPerCatch);
  if (now - lastSpawnTs > spawnEvery) {
    spawn();
    lastSpawnTs = now;
  }
  // Advance each word along its axis. Older entries use f.speed
  // (vertical only); newer entries carry vx + vy so shooter mode
  // can drift horizontally.
  for (const f of falling) {
    if (f.vx == null && f.vy == null) {
      // Legacy fall path -- always vertical.
      f.y += (f.speed || 0) * dt;
    } else {
      f.x += (f.vx || 0) * dt;
      f.y += (f.vy || 0) * dt;
    }
  }
  // Miss check: falling words past bottom, shooter words past
  // the right edge.
  const before = falling.length;
  falling = falling.filter((f) => {
    if (f.mode === "shooter") {
      if (f.x < stageW + 80) return true;
    } else {
      if (f.y < stageH - 10) return true;
    }
    stats.missed++;
    stats.streak = 0;
    return false;
  });
  if (falling.length !== before) {
    paintStats();
    // Endless never ends on missed count; only caught -> stale
    // never triggers endRound. Classic + shooter end at 3.
    if (gameMode !== "endless" && stats.missed >= 3) {
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
  Analytics.gameOver({
    mode: gameMode,
    score: stats.score,
    caught: stats.caught,
    missed: stats.missed,
    bestStreak: stats.bestStreak,
    speed: speedMult,
  });
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
  // Game-over overlay. Class is "game-over-overlay" (NOT "fall")
  // so paintFalling's selectAll("g.fall") doesn't include it and
  // exit().remove() can't yank it on the next paint.
  if (svgSel) {
    // Wipe any prior overlay (in case of a quick re-end).
    svgSel.selectAll("g.game-over-overlay").remove();
    const over = svgSel.append("g").attr("class", "game-over-overlay");
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
    // Sub-instruction so the user knows they need to click Play
    // again -- otherwise they'd reflexively press a key and
    // wonder why the overlay isn't going anywhere.
    over.append("text")
      .attr("x", stageW / 2).attr("y", stageH / 2 + 56)
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
  },
  endless: {
    title: "Catch the Word — Endless",
    subtitle: "No three-miss cap. Words spawn forever and accelerate with every catch. Round ends only when you walk away.",
    hint: "Tap Start. Words spawn faster + fall faster the longer you survive. Use Pause for breathers; high score saves to your profile.",
  },
  shooter: {
    title: "Word Shooter",
    subtitle: "Words drift across the screen left to right. Type each one to shoot it before it exits the right edge. Three misses ends the round.",
    hint: "Tap Start. Type each word as it drifts toward the right edge -- catching one sends it nosediving into a pixel-shrapnel explosion at the bottom.",
  },
};
function applyModeCopy() {
  const c = MODE_COPY[gameMode] || MODE_COPY.classic;
  const t = document.getElementById("game-title");
  const s = document.getElementById("game-subtitle");
  if (t) t.textContent = c.title;
  if (s) s.textContent = c.subtitle;
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
document.querySelectorAll(".game-mode-switch__btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    gameMode = btn.dataset.gameMode || "classic";
    applyModeCopy();
    // Reset the round so the new mode takes effect cleanly. The
    // user starts a fresh round via the Start button.
    if (running) {
      running = false;
      falling = [];
      reset();
      startBtn.textContent = "Start";
      startBtn.hidden = false;
      pauseBtn.hidden = true;
      resetBtn.hidden = true;
      if (svgSel) svgSel.selectAll("g.fall, g.fall--dying, g.fall-popup").remove();
    }
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
