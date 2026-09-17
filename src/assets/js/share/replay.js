/* The replay player: a recorded session, played back through the real
 * engine on a clock that is not the wall clock.
 *
 * Why it is built this way. A replay that redrew the screen itself
 * would be a second renderer, and a second renderer drifts: it would
 * paint errors, skipped punctuation, forgiven characters and the caret
 * by its own rules, and every preference the typist had switched on
 * would be a rule somebody had to remember to copy. So there is no
 * second renderer. The player constructs a real `TypingEngine` with
 * `capture:false` (no keyboard, no focus, nothing bound to the
 * document) and feeds it `onChar` / `onBackspace` exactly as the
 * keyboard would have. Everything on screen -- correct glyphs, wrong
 * glyphs, the caret, the live wpm and accuracy -- is painted by the
 * same code that painted it for the typist.
 *
 * The clock. `opts.now` is the engine's only source of time, so the
 * player hands it a virtual one. `this.clock` is milliseconds of
 * *recorded* time; the scheduler moves it, never `performance.now()`.
 * Event k fires when the clock reaches `times[k]`, the running sum of
 * the recorded deltas, which means the engine measures exactly the
 * intervals the typist produced and computes exactly the same wpm from
 * them -- at any playback speed, and even when the browser drops
 * frames. Real time only decides *when* the clock is advanced, never
 * by how much.
 *
 * Long gaps. Real time between two events is
 * `min(gap, 1500 ms) / speed`, so a four-minute think finishes in a
 * second and a half at 1x while the virtual clock still advances the
 * whole four minutes -- the live wpm dives exactly as it did for the
 * typist, but nobody has to watch it. A pause marker (the typist
 * pressed Pause) carries no duration at all: the engine subtracted it
 * from the run. The player shows a short beat with the clock HELD, so
 * the numbers stay honest and the viewer still sees that they stepped
 * away.
 *
 * Nothing in this file touches the network, and nothing in it reads or
 * writes the address bar: the log arrived in a URL fragment and stays
 * on this device.
 */
import { TypingEngine } from "../engine/typing-engine.js";
import { MARK_BACKSPACE, MARK_WORD_BACKSPACE, MARK_PAUSE, MARK_END } from "./codec.js";

/* The four speeds with buttons. play() takes any number -- the gate
   drives at 16x -- these are only what the UI offers. */
export const SPEEDS = [0.5, 1, 2, 4];

/* The longest the player will sit still, in real milliseconds at 1x.
   Divided by the speed, so 4x waits a quarter as long. Chosen by
   watching real runs: under about a second a gap reads as a stumble
   and is worth seeing; past a second and a half it reads as nothing
   happening and people leave. */
export const PAUSE_CAP_MS = 1500;

/* What "matches the shared numbers" means, and it is deliberately
   tight: the replay runs the same keys through the same engine, so the
   only honest reasons to differ by more than this are a target text
   the link could not carry exactly, or a session whose length was
   rounded to whole seconds on the way into the query. */
export const WPM_TOLERANCE = 1;
export const ACC_TOLERANCE = 1;

const MATCH_TEXT = "Matches the shared numbers";
const DIFFER_TEXT = "Replay differs from the shared numbers";

const isMark = (ch) => ch === MARK_BACKSPACE || ch === MARK_WORD_BACKSPACE
  || ch === MARK_PAUSE || ch === MARK_END;

function prefersReducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch { return false; }
}

/* Inline, token-based styling, the way /r/ already does it. A new CSS
   partial would mean a new entry in CSS_ORDER in eleventy.config.js
   and another file for a merge to collide in, for one panel that
   exists on exactly one page. */
const CSS = `
.replay{margin:var(--space-5) 0 0;padding:var(--space-4);border:1px solid var(--bd-1,var(--bd,#3a3a3a));border-radius:var(--radius);background:var(--bg-1)}
.replay__head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--space-3)}
/* The live-stats row is built for the practice toolbar, where it has
   the whole window. Inside a panel on a 375 px phone it overflowed the
   border by about 14 px and cut the end off "words typed". It is
   allowed to wrap and to shrink here; nothing else uses .replay__live. */
.replay__live{flex:1 1 auto;flex-wrap:wrap;justify-content:flex-end;min-width:0;gap:var(--space-4);row-gap:var(--space-2)}
.replay__live .live-stats__metric{padding-inline:var(--space-1,.25rem)}
@media (max-width:480px){
  .replay__head{justify-content:flex-start}
  .replay__live{justify-content:flex-start;gap:var(--space-3)}
}
.replay__eyebrow{margin:0;font-family:var(--font-mono);font-size:var(--fs-200);letter-spacing:.08em;text-transform:uppercase;color:var(--fg-2)}
.replay__stage{margin:var(--space-3) auto;padding:var(--space-3) 0;min-height:4em}
.replay__controls{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-3);margin-top:var(--space-3)}
.replay__speeds{display:flex;gap:.25rem}
.replay__speed{min-width:3rem;padding:.3rem .5rem;font-family:var(--font-mono);font-size:var(--fs-200);background:var(--bg-2);color:var(--fg-1);border:1px solid var(--bd-1,#3a3a3a);border-radius:var(--radius);cursor:pointer}
.replay__speed[aria-pressed="true"]{background:var(--accent);color:var(--bg-0);border-color:var(--accent)}
.replay__scrub{flex:1 1 12rem;display:flex;align-items:center;gap:var(--space-2);min-width:8rem}
/* 44 px of vertical hit area, which is the smallest target worth
   shipping for a finger, without touching the track's look: a range
   input draws its track centred in whatever box it is given. */
.replay__scrub input{flex:1 1 auto;width:100%;height:44px;margin:0;cursor:pointer}
.replay__count{font-family:var(--font-mono);font-size:var(--fs-200);color:var(--fg-2);white-space:nowrap}
.replay__badge{font-family:var(--font-mono);font-size:var(--fs-200);color:var(--accent);letter-spacing:.06em;text-transform:uppercase}
.replay__verdict{margin:var(--space-3) 0 0;font-size:var(--fs-200)}
.replay__verdict--match{color:var(--good,var(--accent))}
.replay__verdict--differ{color:var(--fg-2)}
.replay__hint{margin:var(--space-2) 0 0;font-size:var(--fs-200);color:var(--fg-3,var(--fg-2))}
/* The only thing in this panel that moves without being asked: the
   caret blink, which comes from the typing surface's own stylesheet.
   Somebody who has asked for less motion gets a still caret, and the
   rule is a media query rather than a JS class so it holds even if the
   player's own detection is wrong. */
@media (prefers-reduced-motion:reduce){.replay .tt-caret{animation:none}}
`;

function injectStyle(doc) {
  if (doc.getElementById("tt-replay-style")) return;
  const el = doc.createElement("style");
  el.id = "tt-replay-style";
  el.textContent = CSS;
  doc.head.appendChild(el);
}

export class ReplayPlayer {
  /* opts:
       root     the container on /r/ (#tt-replay-root)
       entries  the decoded [char-or-marker, deltaMs] pairs
       text     the target the run was typed against
       prefs    the five booleans from the "o" bitmask
       model    the validated query -- the shared numbers to check against
       button   the existing Play button, reused so the page's own
                markup (and the D2 gate's selector) stays meaningful */
  constructor(opts = {}) {
    this.root = opts.root;
    this.events = (opts.entries || []).filter((e) => Array.isArray(e) && typeof e[0] === "string");
    this.text = typeof opts.text === "string" ? opts.text : "";
    this.prefs = opts.prefs || {};
    this.model = opts.model || {};
    this.destroyed = false;

    /* Absolute recorded time of each event: the running sum of the
       deltas. times[0] is 0, which is also the engine's startTs, so
       the engine's elapsed time is the typist's elapsed time. */
    this.times = [];
    let acc = 0;
    for (const e of this.events) { acc += Math.max(0, Number(e[1]) || 0); this.times.push(acc); }
    this.duration = acc;

    this.clock = 0;
    this.idx = 0;
    this.playing = false;
    this.speed = 1;
    this.finishedRun = false;
    this.playedAll = false;
    this.verdict = null;
    this.verdictText = "";
    this.stoppedEarly = false;
    this.playedAll = false;
    this.reducedMotion = prefersReducedMotion();

    this._raf = null;
    this._lastFrame = 0;
    this._holdLeft = 0;
    this._segFrom = 0; this._segTo = 0; this._segSpan = 0;
    this._segWaitTotal = 0; this._segWaitLeft = 0;
    this._frameBound = (t) => this._frame(t);

    /* A no-op hook, on purpose. /r/ deliberately loads no analytics
       (see the page's own footnote), so there is nothing to call and
       nothing here may grow into a fetch. If a replay_played event is
       ever wanted, this is where it attaches -- and whoever attaches
       it has to decide what /r/ is allowed to report first. */
    this.onEvent = typeof opts.onEvent === "function" ? opts.onEvent : () => {};

    this._build(opts.button);
    this._buildEngine();
    this.seek(0, { silent: true });

    /* Nothing starts by itself, for anybody. You land on somebody's
       result, the text is sitting there at rest with a Play button
       under it, and the run begins when you press it. A page that
       starts animating at a visitor who did not ask is a worse page
       even for the visitor who would have pressed Play, and under
       prefers-reduced-motion it is the wrong thing outright. */
    this._paint();
  }

  // ---------------------------------------------------------- markup
  _build(existingButton) {
    const doc = this.root.ownerDocument || document;
    injectStyle(doc);

    /* Reuse the button the page already ships rather than minting a
       second one: r.njk put it there, the /r/ gate looks for it by id,
       and a player constructed twice must not leave two Play buttons
       behind. Held by reference across the wipe below. */
    const btn = existingButton || this.root.querySelector("#tt-replay-play") || doc.createElement("button");
    btn.type = "button";
    btn.id = "tt-replay-play";
    btn.className = "btn";
    this.root.textContent = "";

    const wrap = doc.createElement("div");
    wrap.className = "replay";
    wrap.setAttribute("data-replay", "");
    wrap.innerHTML = `
      <div class="replay__head">
        <p class="replay__eyebrow">Their session, replayed</p>
        <div class="live-stats replay__live" data-replay-live aria-live="off" aria-label="Replay stats">
          <div class="live-stats__metric">
            <span class="live-stats__value tabular" data-live="wpm">0</span>
            <span class="live-stats__label">wpm</span>
          </div>
          <div class="live-stats__metric">
            <span class="live-stats__value tabular"><span data-live="acc">100</span><span class="live-stats__suffix">%</span></span>
            <span class="live-stats__label">accuracy</span>
          </div>
          <div class="live-stats__metric">
            <span class="live-stats__value tabular" data-live="time">0</span>
            <span class="live-stats__label" data-live-label="time">seconds elapsed</span>
          </div>
        </div>
      </div>
      <div class="tt-stage replay__stage" data-replay-stage data-mode="time" data-state="idle" data-focused="true">
        <div class="tt-text tt-text--reader tt-text--full" data-replay-surface aria-live="off"></div>
      </div>
      <div class="replay__controls">
        <div class="replay__speeds" role="group" aria-label="Replay speed"></div>
        <label class="replay__scrub">
          <span class="visually-hidden replay__count" data-replay-count></span>
          <input type="range" min="0" step="1" value="0" data-replay-scrub aria-label="Scrub through the replay">
        </label>
        <button type="button" class="btn" data-replay-restart aria-label="Restart the replay from the first keystroke">Restart</button>
        <span class="replay__badge" data-replay-badge hidden>They paused here</span>
      </div>
      <p class="replay__verdict" data-replay-verdict aria-live="polite" hidden></p>
      <p class="replay__hint">Space plays or pauses. Left and right step ten keystrokes; Home and End jump to the ends.</p>
    `;
    this.root.appendChild(wrap);
    this.wrap = wrap;

    this.stage = wrap.querySelector("[data-replay-stage]");
    this.surface = wrap.querySelector("[data-replay-surface]");
    this.liveEl = wrap.querySelector("[data-replay-live]");
    this.countEl = wrap.querySelector("[data-replay-count]");
    this.scrub = wrap.querySelector("[data-replay-scrub]");
    this.badge = wrap.querySelector("[data-replay-badge]");
    this.verdictEl = wrap.querySelector("[data-replay-verdict]");
    this.speedsEl = wrap.querySelector(".replay__speeds");

    /* The toggle. One button, two jobs, and the aria-label says which
       job it is doing right now -- a screen reader that is told "Play"
       while the thing is playing is being lied to. */
    this.button = btn;
    btn.hidden = false;
    /* The button outlives the player: r.njk ships it, and every
       construction reuses it rather than minting a second one. So the
       listener has to be removable, and destroy() has to remove it --
       otherwise seven mounts leave seven listeners, each one holding a
       dead player, its engine and its renderer alive. The count on the
       element is what the gate reads; bind and unbind are the only two
       places that touch it. */
    this._onToggleClick = () => this.toggle();
    btn.addEventListener("click", this._onToggleClick);
    btn.__ttToggleBound = (btn.__ttToggleBound || 0) + 1;
    const controls = wrap.querySelector(".replay__controls");
    controls.insertBefore(btn, controls.firstChild);

    this.speedButtons = SPEEDS.map((s) => {
      const b = doc.createElement("button");
      b.type = "button";
      b.className = "replay__speed";
      b.textContent = `${s}x`;
      b.setAttribute("data-replay-speed", String(s));
      b.setAttribute("aria-label", `Play at ${s} times speed`);
      b.setAttribute("aria-pressed", s === 1 ? "true" : "false");
      b.addEventListener("click", () => this.setSpeed(s));
      this.speedsEl.appendChild(b);
      return b;
    });

    this.scrub.max = String(this.events.length);
    this.scrub.addEventListener("input", () => {
      this.pause();
      this.seek(Number(this.scrub.value) || 0);
    });
    wrap.querySelector("[data-replay-restart]").addEventListener("click", () => this.restart());

    /* Bound to the player, never to the document. input-capture.js
       binds a document keydown on the practice page that pulls focus
       into the hidden input on any keystroke; a player that did the
       same thing would make this page impossible to use with a
       keyboard, and would fight the page it is embedded in. Here the
       shortcuts only fire when focus is already inside the player. */
    wrap.addEventListener("keydown", (e) => this._onKey(e));
  }

  _onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const onRange = t && t.tagName === "INPUT" && t.type === "range";
    const onButton = t && t.tagName === "BUTTON";
    switch (e.key) {
      case " ":
      case "Spacebar":
        /* A focused button already toggles itself on Space; handling
           it here as well would play and pause in the same press. */
        if (onButton) return;
        e.preventDefault();
        this.toggle();
        return;
      case "ArrowLeft":
        if (onRange) return;
        e.preventDefault();
        this.pause();
        this.seek(Math.max(0, this.idx - 10));
        return;
      case "ArrowRight":
        if (onRange) return;
        e.preventDefault();
        this.pause();
        this.seek(Math.min(this.events.length, this.idx + 10));
        return;
      case "Home":
        e.preventDefault();
        this.pause();
        this.seek(0);
        return;
      case "End":
        e.preventDefault();
        this.pause();
        this.seek(this.events.length);
        return;
      default:
    }
  }

  // ---------------------------------------------------------- engine
  _buildEngine() {
    const mode = this.model.mode || "custom";
    const words = this.text ? this.text.split(/\s+/).filter(Boolean).length : 0;
    /* The deadline, and why it is not simply the shared duration.
       `dur` in the query is round(ms / 1000) -- result-link.js writes
       whole seconds -- and the engine ENDS a timed run the moment the
       clock passes its deadline (typing-engine.js, the beginRunning
       loop). A run whose real length rounded DOWN would therefore stop
       a few hundred milliseconds early and swallow the last handful of
       keystrokes, while the verdict happily read "matches" because the
       numbers of a truncated run are close to the numbers of the whole
       one. So the deadline is never allowed to fall before the last
       thing in the log: the log decides when the run is over, and for a
       timed run _finishRun then pushes the clock out to the shared
       duration if it is further. The countdown still reads the shared
       duration in every ordinary case, because a timed run's last
       keystroke lands before its buzzer. */
    const lastTs = this.duration;
    const deadlineMs = Math.max((this.model.dur || 0) * 1000, lastTs + 1);
    this.engine = new TypingEngine({
      host: this.stage,
      inputEl: null,
      textEl: this.surface,
      liveEl: this.liveEl,
      mode,
      durationSec: deadlineMs / 1000,
      words: words || 1,
      /* The five booleans that change what a keystroke MEANS. Without
         them the same keys against the same text paint a different
         screen -- which is the whole reason the bitmask travels. */
      freedom: !this.prefs.stopOnError,
      spaceSkipsWords: !!this.prefs.spaceSkipsWords,
      forgiveErrors: !!this.prefs.forgiveErrors,
      ignoreCapitalization: !!this.prefs.ignoreCapitalization,
      skipPunctuation: !!this.prefs.skipPunctuation,
      caret: "line",
      /* Never scroll the reader's page. The typist's own page followed
         their caret; doing that to somebody who is reading a shared
         result would yank the document out from under them. */
      autoScroll: false,
      /* No keyboard, no focus, no document listener. */
      capture: false,
      now: () => this.clock,
      onFinish: (res) => this._onFinish(res),
    });
    /* The caret is hidden on an unfocused stage, and this stage never
       takes focus -- so say plainly that it is "focused". Nothing is
       listening for keystrokes either way. */
    this.stage.dataset.focused = "true";
  }

  // ------------------------------------------------------- scheduling
  _capMs() { return PAUSE_CAP_MS / Math.max(0.05, this.speed); }

  _prepare() {
    if (this.idx >= this.events.length) {
      this._segWaitTotal = this._segWaitLeft = this._segSpan = 0;
      return;
    }
    const to = this.times[this.idx];
    this._segFrom = this.clock;
    this._segTo = to;
    this._segSpan = Math.max(0, to - this.clock);
    this._segWaitTotal = Math.min(this._segSpan, PAUSE_CAP_MS) / Math.max(0.05, this.speed);
    this._segWaitLeft = this._segWaitTotal;
  }

  _frame(now) {
    this._raf = null;
    if (!this.playing || this.destroyed) return;
    /* A backgrounded tab hands back a gap of seconds on the first
       frame after it wakes. Cap the budget so waking up does not fast
       forward the run; the virtual clock is not driven by wall time,
       so nothing is lost by dropping the excess. */
    const budget = Math.min(250, Math.max(0, now - this._lastFrame));
    this._lastFrame = now;
    this._advance(budget);
    if (this.playing && !this.destroyed) this._raf = requestAnimationFrame(this._frameBound);
  }

  _advance(budget) {
    let left = budget;
    while (!this.destroyed && this.idx < this.events.length) {
      if (this._holdLeft > 0) {
        const use = Math.min(left, this._holdLeft);
        this._holdLeft -= use; left -= use;
        if (this._holdLeft > 0) { this._paint(); return; }
        this._setBadge(false);
      }
      if (this._segWaitLeft > 0) {
        const use = Math.min(left, this._segWaitLeft);
        this._segWaitLeft -= use; left -= use;
        const done = this._segWaitTotal > 0 ? 1 - (this._segWaitLeft / this._segWaitTotal) : 1;
        this.clock = this._segFrom + this._segSpan * done;
        if (this._segWaitLeft > 0) { this._paint(); return; }
      }
      this.clock = this._segTo;
      this._deliver(this.idx);
      if (this.engine.finished) break;
      this._prepare();
      if (left <= 0 && this._segWaitLeft > 0) { this._paint(); return; }
    }
    if (this.idx >= this.events.length && !this.engine.finished) this._finishRun();
    this._paint();
  }

  /* One recorded event into the engine. Markers are not keystrokes:
     a pause is a beat with the clock held, an end marker means they
     pressed Esc or Stop rather than running out of text. */
  _deliver(k) {
    /* Counted before the event is handed over, not after: the engine
       can call finish() from inside onChar (the cursor reaching the end
       of the text), and the verdict asks whether every event was
       played. Incrementing afterwards would have made the last
       keystroke of every completed run look like an event that never
       happened. */
    this.idx = k + 1;
    const ch = this.events[k][0];
    if (ch === MARK_PAUSE) {
      this._holdLeft = this._capMs();
      this._setBadge(true);
      return;
    }
    if (ch === MARK_END) { this.stoppedEarly = true; return; }
    if (ch === MARK_BACKSPACE) { this.engine.onBackspace(false); return; }
    if (ch === MARK_WORD_BACKSPACE) { this.engine.onBackspace(true); return; }
    this.engine.onChar(ch, this.clock);
  }

  _finishRun() {
    if (!this.engine || this.engine.finished) return;
    if (!this.engine.running) {
      /* Nothing was ever typed (an empty or marker-only log). There is
         no run to finish and no numbers to check. */
      this.playing = false;
      this.finishedRun = true;
      this._paint();
      return;
    }
    /* A timed test ends when the clock runs out, not when the last key
       lands. The link carries the length in whole seconds, so this is
       the best reconstruction available -- and it is never allowed to
       be earlier than the last keystroke. */
    const mode = this.engine.mode;
    if ((mode === "time" || mode === "tape") && !this.stoppedEarly && this.engine.duration > 0) {
      this.clock = Math.max(this.clock, this.engine.startTs + this.engine.duration);
    }
    this.engine.finish();
  }

  _onFinish(res) {
    this.finishedRun = true;
    this.playing = false;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    this.result = res;

    const sharedWpm = this.model.wpm;
    const sharedAcc = this.model.acc;
    const wpmOk = sharedWpm == null
      || Math.abs(Math.round(res.wpm) - Math.round(sharedWpm)) <= WPM_TOLERANCE;
    const accOk = sharedAcc == null
      || Math.abs(Math.round(res.accuracy) - Math.round(sharedAcc)) <= ACC_TOLERANCE;
    /* Numbers close to the shared ones are not enough. A run that
       stopped early has close numbers almost by construction -- it is
       the same typing, just less of it -- so a replay that did not play
       every recorded event has no business claiming it is the same run.
       this.idx counts events delivered, and _deliver counts one before
       it hands it over. */
    this.playedAll = this.idx >= this.events.length;
    const ok = wpmOk && accOk && this.playedAll;

    this.verdict = ok ? "match" : "differ";
    this.verdictText = ok ? MATCH_TEXT : DIFFER_TEXT;
    if (this.verdictEl) {
      this.verdictEl.textContent = ok ? `✓ ${MATCH_TEXT}` : DIFFER_TEXT;
      this.verdictEl.classList.toggle("replay__verdict--match", ok);
      this.verdictEl.classList.toggle("replay__verdict--differ", !ok);
      this.verdictEl.hidden = false;
    }
    this._paint();
    this.onEvent("replay_finished", { verdict: this.verdict });
  }

  // ---------------------------------------------------------- controls
  play(speed) {
    if (this.destroyed || !this.events.length) return false;
    if (typeof speed === "number" && speed > 0) this.setSpeed(speed);
    if (this.finishedRun || this.idx >= this.events.length) this.seek(0, { silent: true });
    if (this.playing) return true;
    this.playing = true;
    this._lastFrame = (typeof performance !== "undefined" ? performance.now() : Date.now());
    if (this._segWaitTotal === 0 && this._holdLeft === 0) this._prepare();
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(this._frameBound);
    this._paint();
    this.onEvent("replay_played", { speed: this.speed });
    return true;
  }

  pause() {
    if (!this.playing) return false;
    this.playing = false;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    this._paint();
    return true;
  }

  toggle() { return this.playing ? this.pause() : this.play(); }

  setSpeed(speed) {
    const s = Number(speed);
    if (!(s > 0)) return this.speed;
    /* Rescale whatever wait is in flight so a speed change takes
       effect immediately instead of at the next event. */
    const factor = this.speed / s;
    this._segWaitTotal *= factor;
    this._segWaitLeft *= factor;
    this._holdLeft *= factor;
    this.speed = s;
    for (const b of this.speedButtons || []) {
      b.setAttribute("aria-pressed", Number(b.dataset.replaySpeed) === s ? "true" : "false");
    }
    this._paint();
    return this.speed;
  }

  /* Rebuild the state at event k by replaying 0..k-1 with the clock
     jumped to each event's recorded time. There is no incremental
     rewind here on purpose: backspace, word backspace, forgiven
     characters and skipped punctuation are not invertible, so the only
     state that is certainly right is the one the engine builds from
     the beginning. A few hundred keystrokes through the engine take
     single-digit milliseconds. */
  seek(k, opts = {}) {
    if (this.destroyed) return this.idx;
    const target = Math.max(0, Math.min(this.events.length, Math.round(Number(k) || 0)));
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    this._holdLeft = 0;
    this._setBadge(false);
    this.finishedRun = false;
    this.stoppedEarly = false;
    this.verdict = null;
    this.verdictText = "";
    this.result = null;
    if (this.verdictEl) { this.verdictEl.hidden = true; this.verdictEl.textContent = ""; }

    this.clock = 0;
    this.engine.start(this.text);
    for (let i = 0; i < target; i++) {
      this.clock = this.times[i];
      this._deliver(i);
      if (this.engine.finished) break;
    }
    if (!target) this.idx = 0;
    /* A hold started by the last delivered marker would otherwise make
       the player sit still after a seek. The clock is where it should
       be; the beat is not owed to anybody. */
    this._holdLeft = 0;
    this._setBadge(false);
    this.clock = target > 0 ? this.times[Math.min(target, this.times.length) - 1] : 0;
    this.engine.tickLive();
    if (this.idx >= this.events.length && !this.engine.finished) this._finishRun();
    this._prepare();
    if (this.playing) {
      this._lastFrame = (typeof performance !== "undefined" ? performance.now() : Date.now());
      this._raf = requestAnimationFrame(this._frameBound);
    }
    if (!opts.silent) this._paint();
    return this.idx;
  }

  restart() {
    const wasPlaying = this.playing;
    this.seek(0);
    /* Somebody who was watching it play and pressed Restart wants it
       to keep playing. Nothing here starts on its own, so this is a
       request, not an autoplay. */
    if (wasPlaying) this.play();
    return true;
  }

  // ------------------------------------------------------------ paint
  _setBadge(on) {
    if (this.badge) this.badge.hidden = !on;
  }

  _paint() {
    if (this.destroyed) return;
    const total = this.events.length;
    if (this.button) {
      const playing = this.playing;
      this.button.textContent = playing ? "Pause" : (this.finishedRun ? "Play again" : "Play this run");
      this.button.setAttribute("aria-label", playing ? "Pause the replay" : "Play the replay");
      this.button.setAttribute("aria-pressed", playing ? "true" : "false");
    }
    if (this.scrub && document.activeElement !== this.scrub) this.scrub.value = String(this.idx);
    if (this.scrub) this.scrub.setAttribute("aria-valuetext", `keystroke ${this.idx} of ${total}`);
    if (this.countEl) this.countEl.textContent = `${this.idx} / ${total}`;
    if (this.wrap) this.wrap.dataset.playing = this.playing ? "true" : "false";
  }

  /* Everything the gate needs, and nothing that would let it cheat:
     the glyph counts are read back out of the DOM the renderer
     painted, not from a tally the player kept. */
  state() {
    const correct = this.surface ? this.surface.querySelectorAll(".tt-char--correct").length : 0;
    const incorrect = this.surface ? this.surface.querySelectorAll(".tt-char--incorrect").length : 0;
    return {
      ready: true,
      playing: this.playing,
      speed: this.speed,
      index: this.idx,
      total: this.events.length,
      clockMs: Math.round(this.clock),
      finished: this.finishedRun,
      playedAll: this.playedAll,
      verdict: this.verdict,
      verdictText: this.verdictText,
      reducedMotion: this.reducedMotion,
      correct,
      incorrect,
      cursor: this.engine ? this.engine.cursor : 0,
      keystrokes: this.engine ? this.engine.totalKeystrokes : 0,
      errors: this.engine ? this.engine.errors : 0,
      wpm: this.result ? Math.round(this.result.wpm) : null,
      accuracy: this.result ? Math.round(this.result.accuracy) : null,
      shared: { wpm: this.model.wpm ?? null, acc: this.model.acc ?? null },
    };
  }

  /* Safe to call twice, and safe to call on a player whose root is
     about to be rebuilt by a second construction. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.playing = false;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    if (this.button && this._onToggleClick) {
      this.button.removeEventListener("click", this._onToggleClick);
      this.button.__ttToggleBound = Math.max(0, (this.button.__ttToggleBound || 1) - 1);
      this._onToggleClick = null;
    }
    if (this.engine) {
      this.engine.running = false;
      if (this.engine.tickHandle) cancelAnimationFrame(this.engine.tickHandle);
      const r = this.engine.renderer;
      if (r && r._ro && r._ro.disconnect) { try { r._ro.disconnect(); } catch {} }
      /* Released, not just stopped. A destroyed player that still
         points at an engine keeps a renderer, a Float32Array of every
         character position and a detached DOM tree alive for as long as
         anything holds the player. */
      this.engine = null;
    }
  }
}

/* The one call /r/ makes. Returns null when there is nothing to play,
   so the caller can leave the page exactly as it was: no root, no
   button, no empty panel promising a replay that does not exist. */
export function mountReplay(opts = {}) {
  const root = opts.root;
  const entries = opts.entries;
  if (!root || !Array.isArray(entries) || !entries.length) return null;
  if (!opts.text) return null;
  /* Re-share, a resize, a second boot: tear the old one down rather
     than leaving its scheduler running against a detached surface. */
  if (root.__ttPlayer && typeof root.__ttPlayer.destroy === "function") root.__ttPlayer.destroy();
  const player = new ReplayPlayer(opts);
  root.__ttPlayer = player;
  root.hidden = false;
  return player;
}

export default mountReplay;
