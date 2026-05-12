/* Typing Race -- type to advance your car against a ghost AI
   running at a fixed WPM. First to the finish line wins.

   Track length = 60 words. Per correct word the player advances
   1/60 of the track. The AI advances at `(wpm * 5) / 60 / 60`
   characters per frame at 60 FPS, scaled to the track length. */

import { getActive, updateActive } from "../profiles.js";
import { loadD3 } from "../stats/d3-loader.js";
import { Analytics } from "../analytics.js";
import { setSoundPrefs, playKey, playMistake, playFinish } from "../engine/sounds.js";

const WORDS = [
  "the","quick","brown","fox","jumps","over","lazy","dog","when","every",
  "good","boy","does","fine","because","always","never","again","ready","strong",
  "river","stone","forest","mountain","valley","ocean","light","shadow","star","moon",
  "house","window","table","chair","letter","story","music","dancer","painter","writer",
  "morning","evening","summer","winter","autumn","spring","season","weather","wind","rain",
  "happy","quiet","gentle","careful","steady","honest","clever","brave","kind","wise",
  "drink","speak","listen","follow","gather","forget","remember","change","return","arrive",
  "single","double","triple","middle","center","corner","border","edge","line","circle",
];

const TRACK_WORDS = 60;
const DIFFICULTY_WPM = { easy: 40, medium: 60, hard: 80, pro: 100 };

let d3 = null;
let svgSel = null;
let running = false;
let words = [];
let cursor = 0;            // current word index
let correctChars = 0;
let totalChars = 0;
let startTs = 0;
let aiProgress = 0;        // fraction of track the AI has covered (0..1)
let frameTimer = null;
let difficulty = "medium";

const profile = getActive();
const input = document.getElementById("game-input");
const promptEl = document.getElementById("race-prompt");
const prevEl = document.getElementById("race-prev");
const curEl = document.getElementById("race-cur");
const nextEl = document.getElementById("race-next");
const startBtn = document.getElementById("game-start");
const resetBtn = document.getElementById("game-reset");
const wordsEl = document.querySelector("[data-words]");
const wpmEl = document.querySelector("[data-wpm]");
const accEl = document.querySelector("[data-acc]");
const streakEl = document.querySelector("[data-streak]");
const bestEl = document.querySelector("[data-best]");

let streak = 0;

function stopFrameTimer() {
  if (frameTimer) { try { frameTimer.stop(); } catch {} frameTimer = null; }
}

function readBest() {
  const fresh = getActive() || {};
  const gs = fresh.gameStats || {};
  const m = (gs.byMode || {})["race-" + difficulty];
  return m || { highScore: 0, bestStreak: 0 };
}

function pickWords(n) {
  const out = [];
  // Bias toward missed-words when available.
  const missed = Object.keys(profile.missedWords || {})
    .filter((w) => /^[a-z]{2,12}$/i.test(w));
  const pool = missed.length >= 10 ? missed.concat(WORDS) : WORDS.slice();
  for (let i = 0; i < n; i++) out.push(pool[Math.floor(Math.random() * pool.length)]);
  return out;
}

function paintPrompt() {
  if (!words.length) return;
  prevEl.textContent = words.slice(Math.max(0, cursor - 3), cursor).join(" ");
  curEl.textContent = words[cursor] || "";
  nextEl.textContent = words.slice(cursor + 1, cursor + 5).join(" ");
}

function paintTrack() {
  if (!svgSel) return;
  svgSel.selectAll("*").remove();
  const W = 800, H = 320;
  const trackTop = 60, laneH = 80;
  // Background gradient already on .race-svg via CSS.
  // Finish line.
  svgSel.append("rect").attr("x", W - 30).attr("y", trackTop).attr("width", 4).attr("height", laneH * 2).attr("fill", "var(--accent)");
  svgSel.append("text").attr("x", W - 25).attr("y", trackTop - 8).attr("fill", "var(--fg-2)").attr("font-family", "var(--font-mono)").attr("font-size", 11).attr("text-anchor", "end").text("FINISH");
  // Lane dividers.
  svgSel.append("line").attr("x1", 0).attr("x2", W).attr("y1", trackTop).attr("y2", trackTop).attr("stroke", "var(--rule)").attr("stroke-dasharray", "6 4");
  svgSel.append("line").attr("x1", 0).attr("x2", W).attr("y1", trackTop + laneH).attr("y2", trackTop + laneH).attr("stroke", "var(--rule)").attr("stroke-dasharray", "6 4");
  svgSel.append("line").attr("x1", 0).attr("x2", W).attr("y1", trackTop + laneH * 2).attr("y2", trackTop + laneH * 2).attr("stroke", "var(--rule)").attr("stroke-dasharray", "6 4");
  // Player progress.
  const playerProgress = cursor / TRACK_WORDS;
  const playerX = 30 + playerProgress * (W - 80);
  const aiX = 30 + aiProgress * (W - 80);
  // Player car.
  svgSel.append("g")
    .attr("transform", `translate(${playerX}, ${trackTop + laneH / 2})`)
    .append("text").attr("text-anchor", "middle").attr("font-size", 42).text("🏎");
  // AI car.
  svgSel.append("g")
    .attr("transform", `translate(${aiX}, ${trackTop + laneH + laneH / 2})`)
    .append("text").attr("text-anchor", "middle").attr("font-size", 38).text("👻");
  // Labels.
  svgSel.append("text").attr("x", 8).attr("y", trackTop + laneH / 2 + 6).attr("fill", "var(--accent)").attr("font-family", "var(--font-mono)").attr("font-size", 12).text("YOU");
  svgSel.append("text").attr("x", 8).attr("y", trackTop + laneH * 1.5 + 6).attr("fill", "var(--fg-3)").attr("font-family", "var(--font-mono)").attr("font-size", 12).text("AI");
  // WPM display under track.
  const elapsedMs = startTs ? performance.now() - startTs : 0;
  const wpm = elapsedMs > 0 ? Math.round((correctChars / 5) / (elapsedMs / 60000)) : 0;
  svgSel.append("text").attr("x", W / 2).attr("y", H - 12).attr("fill", "var(--fg-2)").attr("font-family", "var(--font-mono)").attr("font-size", 13).attr("text-anchor", "middle")
    .text(`${cursor} / ${TRACK_WORDS} words  ·  ${wpm} wpm  ·  AI ${DIFFICULTY_WPM[difficulty]} wpm`);
}

function paintStats() {
  wordsEl.textContent = String(cursor);
  const elapsedMs = startTs ? performance.now() - startTs : 0;
  const wpm = elapsedMs > 0 ? Math.round((correctChars / 5) / (elapsedMs / 60000)) : 0;
  wpmEl.textContent = String(wpm);
  const acc = totalChars > 0 ? Math.round((correctChars / totalChars) * 100) : 100;
  accEl.textContent = acc + "%";
  streakEl.textContent = String(streak);
  bestEl.textContent = String(readBest().highScore || 0);
}

function frame() {
  if (!running) return;
  const now = performance.now();
  // AI advance: WPM * 5 chars/min = chars/min. To translate to
  // track-fraction, assume avg word = 5 chars; each word = 1/60 track.
  // AI advances 1/60 per (60000ms / WPM) = (1000 / WPM) ms per word.
  const aiWPM = DIFFICULTY_WPM[difficulty];
  const elapsedSinceStart = now - startTs;
  const aiWords = (aiWPM / 60) * (elapsedSinceStart / 1000);
  aiProgress = Math.min(1, aiWords / TRACK_WORDS);
  paintTrack();
  paintStats();
  if (aiProgress >= 1 && cursor < TRACK_WORDS) {
    endRound(false);
    return;
  }
}

function startRound() {
  if (running) return;
  words = pickWords(TRACK_WORDS);
  cursor = 0;
  correctChars = 0;
  totalChars = 0;
  streak = 0;
  aiProgress = 0;
  startTs = performance.now();
  running = true;
  startBtn.hidden = true;
  resetBtn.hidden = false;
  input.value = "";
  input.focus({ preventScroll: true });
  Analytics.gameStart({ mode: "race-" + difficulty, speed: 1 });
  paintPrompt();
  paintTrack();
  paintStats();
  stopFrameTimer();
  if (d3) frameTimer = d3.timer(frame);
}

function endRound(playerWon) {
  if (!running) return;
  running = false;
  stopFrameTimer();
  const elapsedMs = performance.now() - startTs;
  const wpm = elapsedMs > 0 ? Math.round((correctChars / 5) / (elapsedMs / 60000)) : 0;
  const acc = totalChars > 0 ? Math.round((correctChars / totalChars) * 100) : 100;
  Analytics.gameOver({ mode: "race-" + difficulty, score: wpm, caught: cursor, missed: TRACK_WORDS - cursor, bestStreak: streak, speed: 1 });
  // Persist best-WPM-per-difficulty.
  const modeKey = "race-" + difficulty;
  let isNewBest = false;
  try {
    updateActive((p) => {
      p.gameStats = p.gameStats || { rounds: 0, totalCaught: 0 };
      p.gameStats.byMode = p.gameStats.byMode || {};
      const m = p.gameStats.byMode[modeKey] || { highScore: 0, bestStreak: 0, rounds: 0, totalCaught: 0 };
      if (playerWon && wpm > m.highScore) { m.highScore = wpm; isNewBest = true; }
      if (streak > m.bestStreak) m.bestStreak = streak;
      m.rounds = (m.rounds || 0) + 1;
      m.totalCaught = (m.totalCaught || 0) + cursor;
      m.lastPlayedAt = new Date().toISOString();
      p.gameStats.byMode[modeKey] = m;
      return p;
    });
  } catch {}
  if (isNewBest) {
    try { Analytics.gameNewBest({ mode: modeKey, score: wpm }); } catch {}
  }
  playFinish();
  // Overlay summary.
  if (svgSel) {
    svgSel.append("rect").attr("x", 0).attr("y", 0).attr("width", 800).attr("height", 320).attr("fill", "rgba(20, 22, 30, 0.85)");
    svgSel.append("text").attr("x", 400).attr("y", 130).attr("text-anchor", "middle").attr("fill", playerWon ? "var(--accent)" : "var(--bad, #d76050)").attr("font-family", "var(--font-display)").attr("font-size", 48).attr("font-weight", 500).text(playerWon ? "You won!" : "AI won");
    svgSel.append("text").attr("x", 400).attr("y", 170).attr("text-anchor", "middle").attr("fill", "var(--fg-1)").attr("font-family", "var(--font-mono)").attr("font-size", 18).text(`${wpm} wpm  ·  ${acc}% accuracy  ·  ${cursor}/${TRACK_WORDS} words`);
    if (isNewBest) {
      svgSel.append("text").attr("x", 400).attr("y", 200).attr("text-anchor", "middle").attr("fill", "var(--good, #76c893)").attr("font-family", "var(--font-mono)").attr("font-size", 13).attr("letter-spacing", "0.12em").text(`NEW PERSONAL BEST — ${difficulty.toUpperCase()} TIER`);
    }
    svgSel.append("text").attr("x", 400).attr("y", 240).attr("text-anchor", "middle").attr("fill", "var(--fg-3)").attr("font-family", "var(--font-mono)").attr("font-size", 13).text("Click Reset, then Start to race again.");
  }
  startBtn.textContent = "Race again";
  startBtn.hidden = false;
  try { input.blur(); } catch {}
}

function reset() {
  stopFrameTimer();
  running = false;
  cursor = 0;
  correctChars = 0;
  totalChars = 0;
  streak = 0;
  aiProgress = 0;
  startTs = 0;
  words = [];
  input.value = "";
  prevEl.textContent = ""; curEl.textContent = "Choose a difficulty, then Start."; nextEl.textContent = "";
  if (svgSel) svgSel.selectAll("*").remove();
  paintStats();
  paintTrack();
  startBtn.textContent = "Start race";
  startBtn.hidden = false;
  resetBtn.hidden = true;
}

input.addEventListener("input", () => {
  if (!running) return;
  const v = input.value;
  const target = words[cursor] || "";
  if (v.endsWith(" ")) {
    const typed = v.trim();
    if (typed === target) {
      correctChars += target.length + 1;
      totalChars += target.length + 1;
      cursor++;
      streak++;
      playKey();
      input.value = "";
      paintPrompt();
      if (cursor >= TRACK_WORDS) { endRound(true); return; }
    } else {
      // Wrong word -- clear and treat as a typo (no advance).
      totalChars += target.length + 1;
      streak = 0;
      playMistake();
      input.value = "";
    }
    paintStats();
    return;
  }
  // Live-match feedback: clear if the typed prefix doesn't match.
  if (v && !target.startsWith(v)) {
    streak = 0;
    totalChars += v.length;
    playMistake();
    input.value = "";
    paintStats();
  }
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const target = words[cursor] || "";
    if (input.value.trim() === target) {
      correctChars += target.length + 1;
      totalChars += target.length + 1;
      cursor++;
      streak++;
      playKey();
      input.value = "";
      paintPrompt();
      paintStats();
      if (cursor >= TRACK_WORDS) endRound(true);
    }
    e.preventDefault();
  }
});

startBtn.addEventListener("click", async () => {
  if (!d3) {
    d3 = await loadD3();
    if (!d3) { alert("Failed to load D3."); return; }
    svgSel = d3.select("#race-svg");
  }
  startRound();
});
resetBtn.addEventListener("click", reset);

document.querySelectorAll(".game-mode-switch__btn").forEach((b) => {
  b.addEventListener("click", () => {
    difficulty = b.dataset.difficulty || "medium";
    document.querySelectorAll(".game-mode-switch__btn").forEach((x) => x.classList.toggle("is-active", x === b));
    if (running) reset();
    paintStats();
    // The track HUD shows the current AI WPM at the bottom; without
    // a re-paint here the label kept showing the previous tier
    // until Start was clicked.
    paintTrack();
  });
});

// Initial: pre-warm D3 and paint a placeholder track.
loadD3().then((m) => {
  if (m) { d3 = m; svgSel = d3.select("#race-svg"); paintTrack(); }
});
setSoundPrefs({
  theme: (profile.preferences && profile.preferences.soundTheme) || "off",
  volume: (profile.preferences && profile.preferences.soundVolume) || 0.5,
});
paintStats();
