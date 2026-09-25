/* Typing engine — orchestrates input capture, renderer, and metrics.
   Modes:
     time   — type freely; ends at duration
     words  — type N words; ends after the last char of last word
     quote  — type a fixed text; ends after the last char
     custom — like quote, but text comes from the user
     zen    — endless; ends only on Escape
     adaptive — dynamic stream from the adaptive word picker
*/
import { attachInput } from "./input-capture.js";
import { Renderer } from "./renderer.js";
import { netWpm, rawWpm, accuracy, consistency } from "./metrics.js";
import { toast } from "../util/dom.js";
/* The four non-character markers a keystroke log can carry. They live
   in share/codec.js because that file is the one that has to turn them
   into bytes, and a second table would be a second opinion. codec.js
   is pure -- no DOM, no imports of its own -- so this costs the
   practice page nothing but the fetch. */
import { MARK_BACKSPACE, MARK_WORD_BACKSPACE, MARK_PAUSE, MARK_END } from "../share/codec.js";

/* Touch-only detection: does this device type with a soft keyboard?
   True for phones and tablets, false for desktops and laptops, and
   deliberately so even when the desktop has a touch digitizer or the
   browser window is narrow. An earlier version returned true on any
   single touch signal (a window under 768 px, a bare coarse pointer,
   ontouchstart, maxTouchPoints > 0). A zoomed-in desktop browser, or a
   Windows machine with a touch monitor and a mouse, then never got
   auto-focus and could never switch auto-advance on (the Auto button
   read as unavailable and the header ignored the Settings switch).
   What remains:
   - the primary input cannot hover and is coarse: the standard
     touch-first query. iPadOS keeps reporting it with a trackpad or
     keyboard attached, so iPads stay on the tap-to-start path (known
     limit, and the safe direction to be wrong in);
   - a phone or tablet user agent. (Chrome for Android in "desktop
     site" mode sends a Linux UA with neither word, and then depends
     on the media query above staying coarse, which it does unless a
     mouse is paired: with a mouse, it is a desktop here.)
   - iPadOS in desktop-UA mode, which says Macintosh but has touch points.
   Windows reports the primary pointer as fine and hover as possible
   whenever a mouse or trackpad is present, so touch laptops count as
   desktops, which is what their keyboards make them. */
/* Copied by hand into src/_includes/partials/practice/typing-shell.njk,
   which stamps <html data-touch> before any module loads. Change both. */
export function isMobileLike() {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches) return true;
    const ua = (navigator.userAgent || "").toLowerCase();
    if (/iphone|ipad|ipod|android|mobile/.test(ua)) return true;
    if (/macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  } catch {}
  return false;
}

export class TypingEngine {
  constructor(opts) {
    this.opts = opts;
    this.host = opts.host;
    this.inputEl = opts.inputEl;
    this.textEl = opts.textEl;
    this.liveEl = opts.liveEl;          // element receiving live stat updates
    this.timerEl = opts.timerEl;        // optional progress bar fill
    this.onFinish = opts.onFinish || (() => {});
    this.onTick = opts.onTick || (() => {});
    this.onError = opts.onError || (() => {});
    this.onCorrect = opts.onCorrect || (() => {});
    this.adaptive = opts.adaptive || null;  // { onChar(prev, ch, correct, ms), nextWords(n) }

    /* The clock, injectable. Everything that asks the time asks this,
       so the replay player (share/replay.js, Phase D3) can drive a
       recorded session through the real engine on a virtual clock and
       get the same numbers out. Default is performance.now, so every
       existing caller behaves exactly as before. */
    this.now = typeof opts.now === "function" ? opts.now : () => performance.now();
    /* capture:false builds an engine with no keyboard: no input
       binding, no focus or blur handling, nothing that would steal the
       caret from the page it is embedded in. The replay player feeds
       onChar/onBackspace itself. Absent or true -> the normal engine. */
    this.capturing = opts.capture !== false;

    /* The user's answer to "does this device have a physical
       keyboard", when they have given one. isMobileLike() above is a
       guess about hardware and it cannot be right for a tablet with a
       keyboard case: an iPad with a Magic Keyboard reports the
       touch-first media query and a tablet user agent exactly like a
       bare iPad. The page that owns the profile passes this in (a
       boolean, or a function when the preference can change under a
       live engine) -- the engine reads no storage of its own. */
    this.physicalKeyboard = opts.physicalKeyboard;

    /* Append-only keystroke log: [char-or-marker, ms since the previous
       entry]. typed[] cannot do this job -- backspace truncates it, so
       by the end of a session it holds what survived rather than what
       happened. Reset in start(); see _klog(). */
    this.keylog = [];
    this._keylogTs = 0;

    this.renderer = new Renderer(this.textEl, opts.caret || "line", { autoScroll: opts.autoScroll !== false });

    this.target = "";       // chars (string)
    this.targetArr = [];
    this.typed = [];        // {ch, correct, extras:[el], tsKeyMs}
    this.cursor = 0;
    // Set of cursor positions where the user struck a wrong key at
    // some point during the session, even if they later backspaced
    // and corrected it. Used to derive missed-word data that survives
    // the typed[] truncation that backspace performs. */
    this._erroredCursorSet = new Set();
    this.startTs = 0;
    this.lastTs = 0;
    this.lastWordStartTs = 0;
    this.perWordWpm = [];
    this.errors = 0;
    this.totalKeystrokes = 0;
    this.correctChars = 0;
    this.suspect = false;
    this.running = false;
    this.finished = false;
    // Pause / typing-guard state. Initialized to 0 (not undefined)
    // so the keystroke guard in pauseTimer() has well-defined
    // arithmetic from the very first call -- otherwise the guard's
    // `if (this._lastTypedAt && ...)` short-circuits on undefined
    // and a pre-typing pause click slips through.
    this._lastTypedAt = 0;
    this._pauseAt = 0;
    this._userPaused = false;
    this.mode = opts.mode || "time";
    this.duration = (opts.durationSec || 30) * 1000;
    this.wordsTarget = opts.words || 25;
    this.freedom = opts.freedom !== false;
    this.spaceSkipsWords = !!opts.spaceSkipsWords;
    this.forgiveErrors = !!opts.forgiveErrors;
    this.ignoreCapitalization = !!opts.ignoreCapitalization;
    this.skipPunctuation = !!opts.skipPunctuation;
    this.tickHandle = null;

    this.host.dataset.mode = this.mode;
    this.host.dataset.state = "idle";
    if (opts.hint) this.setHint(opts.hint);

    this.capture = !this.capturing ? null : attachInput(this.inputEl, this.host, {
      onChar: (k, ts) => this.onChar(k, ts),
      onBackspace: (word) => this.onBackspace(word),
      onRestart: () => this.restart(),
      onEscape: () => this.escape(),
      onPaste: () => toast("Paste disabled — practice the keys.", "bad"),
      // IME + blur paths no longer auto-pause. Mobile browsers
      // fire compositionstart on programmatic input.value writes
      // (virtual keyboard taps) which was the last remaining
      // accidental-pause source. Pause now happens via the
      // Pause button or Esc -- nowhere else.
      onImeStart: () => {},
      onImeEnd: () => {},
      onBlur: () => {},
      onFocus: () => {
        // Don't auto-resume when the user explicitly hit Pause.
        // Without this, the virtual-keyboard refocus cycle (or
        // any incidental refocus) immediately undoes the pause.
        if (!this._userPaused) this.resumeTimer();
        // Clear the mobile "tap to start" hint once the surface gets
        // its first real focus -- whether from a tap or otherwise.
        if (this.host.dataset.mobileWaiting === "true") {
          delete this.host.dataset.mobileWaiting;
          this.setHint("");
        }
      },
      onRestartArmed: () => this.host.dataset.restartArmed = "true",
      onRestartDisarmed: () => delete this.host.dataset.restartArmed,
    });
    // Mobile: skip auto-focus. iOS Safari + Chrome Android won't raise
    // the soft keyboard from a programmatic focus() call on page load
    // anyway, and the keyboard sliding up the moment the page renders
    // is a jarring experience. Show the unfocused state instead;
    // input-capture's touchend/click handlers will turn the user's
    // first tap on the typing surface into a real focus that raises
    // the keyboard. The predicate is isMobileLike() above: touch-first
    // media query or a phone/tablet user agent, and nothing weaker,
    // because a desktop that lands here by mistake has to click the
    // surface before every run and can never auto-advance.
    if (!this.capturing) {
      /* No keyboard, so no focus story to tell. */
    } else if (this.softKeyboardOnly()) {
      this.host.dataset.mobileWaiting = "true";
      this.host.dataset.focused = "false";
      this.setHint("");
    } else {
      this.capture.focus();
    }
  }

  /* "Nothing here can type without a tap first." Touch-first hardware
     AND no physical keyboard declared for this device. Every place the
     engine decides whether to take focus by itself asks this rather
     than isMobileLike() directly, so a tablet with a keyboard case
     starts its next run already able to type. */
  softKeyboardOnly() {
    const pk = typeof this.physicalKeyboard === "function"
      ? this.physicalKeyboard() : this.physicalKeyboard;
    return !pk && isMobileLike();
  }

  /* Append one entry to the keystroke log. `op` is a single character:
     the character typed, or one of the MARK_* values. The delta is
     milliseconds since the previous entry -- for the first entry,
     since the session started. One push and one subtraction per key:
     no layout is read, which is what keeps check-typing-perf honest. */
  _klog(op, ts) {
    const prev = this._keylogTs || this.startTs || ts;
    this._keylogTs = ts;
    this.keylog.push([op, Math.max(0, Math.round(ts - prev))]);
  }

  setHint(text) {
    if (!this.opts.hintEl) return;
    this.opts.hintEl.textContent = text;
  }

  /* start(target, opts?)
       target  string OR array of paragraph strings
       opts.paragraphs  optional array (legacy form). When target is
                        an array OR opts.paragraphs is given, the
                        renderer paints visible paragraph breaks while
                        the engine's targetArr stays flat so cursor
                        logic doesn't change. */
  start(target, opts = {}) {
    const paragraphs = Array.isArray(target) ? target : opts.paragraphs;
    if (paragraphs && paragraphs.length > 1) {
      // Engine target = paragraphs joined with a single space (the
      // user types one space to cross between paragraphs). The
      // renderer wraps each paragraph in its own visible block.
      this.target = paragraphs.join(" ");
      this._paragraphs = paragraphs;
    } else {
      this.target = (typeof target === "string" ? target : (paragraphs && paragraphs[0])) || "";
      this._paragraphs = null;
    }
    this.targetArr = Array.from(this.target);
    this.typed = [];
    this.cursor = 0;
    this.keylog = [];
    this._keylogTs = 0;
    this.startTs = 0;
    this.lastKeyTs = 0;
    this.errors = 0;
    this.totalKeystrokes = 0;
    this.correctChars = 0;
    this.perWordWpm = [];
    this.lastWordStartTs = 0;
    this.suspect = false;
    this.running = false;
    this.finished = false;
    // Reset pause-related state on every new session so a stale
    // pauseAt from a previous engine instance can't carry over.
    // _lastTypedAt at 0 (not undefined) keeps the pauseTimer guard's
    // arithmetic well-defined from the first keystroke onward.
    this._lastTypedAt = 0;
    this._pauseAt = 0;
    this._userPaused = false;
    this._erroredCursorSet = new Set();
    this.host.dataset.state = "ready";
    this.renderer.setText(this._paragraphs || this.target);
    this.updateLive(0, 100);
    if (this.timerEl) this.timerEl.style.width = "0%";
    // Mobile: never auto-focus, never tell the user to "press any key".
    // The surface stays blurred until they tap. We re-arm the waiting
    // flag on every start() (not just the constructor) so restart and
    // post-completion flows behave the same way.
    if (!this.capturing) {
      /* capture:false -- nothing to focus and nobody to ask for a key. */
    } else if (this.softKeyboardOnly()) {
      this.host.dataset.mobileWaiting = "true";
      this.host.dataset.focused = "false";
      try {
        if (document.activeElement === this.inputEl) this.inputEl.blur();
      } catch {}
      this.setHint("");
    } else {
      this.setHint("Press any key to start");
    }
  }

  appendStream(text) {
    this.target += (this.target.endsWith(" ") || !this.target.length ? "" : " ") + text;
    this.targetArr = Array.from(this.target);
    this.renderer.appendText(text);
  }

  onChar(ch, tsRaw) {
    const ts = this.now();
    // Auto-advance swaps the text in place the instant a run ends. A
    // trailing keystroke from the previous run (the user's hand is
    // still moving) would otherwise land as the first error of the
    // new one. practice-boot sets _ignoreUntil for a few hundred ms
    // after the swap; keystrokes inside that window are dropped.
    if (this._ignoreUntil && ts < this._ignoreUntil) return;
    // Stamp the very last keystroke so any pause path (notably the
    // mobile soft-keyboard tap accidentally hitting the Pause button)
    // can short-circuit when the user was clearly mid-typing.
    this._lastTypedAt = ts;
    if (!this.running && !this.finished) this.beginRunning(ts);
    if (this.finished) return;
    /* Logged here, next to totalKeystrokes++, so the log and the
       keystroke count stay one-to-one: every key that counts is in the
       log, and a key dropped by the _ignoreUntil guard above is in
       neither. */
    this._klog(ch, ts);
    this.totalKeystrokes++;

    const expected = this.targetArr[this.cursor];
    const lastTs = this.lastKeyTs || this.startTs;
    const keyMs = ts - lastTs;
    this.lastKeyTs = ts;

    if (expected === undefined) {
      // Typed beyond the end of target — for fixed-length modes this is a no-op;
      // for adaptive/zen we should have streamed more by now.
      if (this.mode === "zen") return;
      return;
    }

    // ── Preferences-driven equivalence ──────────────────────────
    // ignoreCapitalization: case-insensitive match.
    let correct = this.ignoreCapitalization
      ? ch.toLowerCase() === (expected || "").toLowerCase()
      : ch === expected;
    let extras = [];

    // skipPunctuation: any expected punctuation char auto-clears, no
    // matter what the user types. We mark each skipped position correct
    // and advance until we land on a non-punctuation expected char.
    if (this.skipPunctuation && expected && /[.,;:'"!?\-]/.test(expected) && ch !== expected) {
      while (this.cursor < this.targetArr.length && /[.,;:'"!?\-]/.test(this.targetArr[this.cursor])) {
        this.renderer.setCorrect(this.cursor);
        this.correctChars++;
        this.cursor++;
      }
      this.renderer.moveCaretTo(this.cursor);
      // Re-evaluate against the new expected char.
      const nextExpected = this.targetArr[this.cursor];
      if (nextExpected !== undefined) {
        correct = this.ignoreCapitalization
          ? ch.toLowerCase() === (nextExpected || "").toLowerCase()
          : ch === nextExpected;
      }
    }

    // spaceSkipsWords: pressing space mid-word jumps to the start of
    // the next word. We mark unfilled positions in the current word
    // incorrect-skipped (correct=false) but advance the cursor past
    // the upcoming space.
    if (this.spaceSkipsWords && ch === " " && expected !== " ") {
      while (this.cursor < this.targetArr.length && this.targetArr[this.cursor] !== " ") {
        if (!this.typed[this.cursor]) {
          this.renderer.setIncorrect(this.cursor, "·");
          this.errors++;
        }
        this.cursor++;
      }
      // Skip the space itself, count it as a correct keystroke.
      if (this.cursor < this.targetArr.length && this.targetArr[this.cursor] === " ") {
        this.renderer.setCorrect(this.cursor);
        this.correctChars++;
        this.cursor++;
      }
      this.renderer.moveCaretTo(this.cursor);
      this.lastKeyTs = ts;
      this.lastWordStartTs = ts;
      return;
    }

    if (ch === " " && expected !== " ") {
      // Pressed space mid-word in normal (non-skip) mode → mark wrong.
      correct = false;
    }

    // forgiveErrors: when the typed char is wrong but matches the
    // EXPECTED char one position ahead, treat as a "skipped char" —
    // the user dropped one and continued. Auto-insert a synthetic
    // wrong on the missed position and advance.
    if (!correct && this.forgiveErrors && expected !== undefined) {
      const next = this.targetArr[this.cursor + 1];
      const matchAhead = next !== undefined && (this.ignoreCapitalization
        ? ch.toLowerCase() === next.toLowerCase()
        : ch === next);
      if (matchAhead) {
        // Mark current as incorrect-skipped but quiet, advance one.
        this.renderer.setIncorrect(this.cursor, "·");
        this.errors++;
        this.cursor++;
        correct = true; // the keystroke is correct for the next slot
      }
    }

    if (correct) {
      this.renderer.setCorrect(this.cursor);
      this.correctChars++;
      this.onCorrect(ch, this.cursor);
    } else {
      this.renderer.setIncorrect(this.cursor, ch);
      this.errors++;
      // Persistent flag: this position had at least one wrong key.
      // Survives backspace+retype so the missed-word recorder can
      // still credit the word with a flub even if the user fixed it.
      this._erroredCursorSet.add(this.cursor);
      this.onError(ch, expected, this.cursor);
    }

    // Adaptive learning hook
    if (this.adaptive && this.adaptive.onChar) {
      const prev = this.cursor > 0 ? this.targetArr[this.cursor - 1] : null;
      this.adaptive.onChar(prev, expected, correct, keyMs);
    }

    this.typed[this.cursor] = { ch, correct, extras, ts, keyMs };

    // Word-WPM bookkeeping: when finishing a word boundary, snapshot.
    if (expected === " " && correct) {
      const wordMs = ts - this.lastWordStartTs;
      // assume 5-char standard word: chars in this word = positions since last space
      const wordChars = this._charsBetweenLastSpace();
      const wpm = (wordChars / 5) / (wordMs / 60000 || 1);
      if (wpm > 0 && wpm < 400) this.perWordWpm.push(wpm);
      this.lastWordStartTs = ts;
    }

    // Advance cursor if freedom-allowed or correct.
    if (correct || this.freedom) {
      this.cursor++;
      this.renderer.moveCaretTo(this.cursor);
    }

    // Check end conditions. Adaptive mode is bounded (a 60-word session
    // generated from your weak keys); zen mode is endless and only ends
    // on Escape — so it gets the streaming branch below.
    if (this.mode === "words" || this.mode === "quote" || this.mode === "custom" ||
        this.mode === "challenge" || this.mode === "lesson" || this.mode === "drill" ||
        this.mode === "adaptive" || this.mode === "book" ||
        this.mode === "idiom" || this.mode === "poem" || this.mode === "parable" ||
        this.mode === "tape") {
      if (this.cursor >= this.targetArr.length) this.finish();
    }
    // Zen: stream more words as we approach the end.
    if (this.mode === "zen" && this.adaptive && this.adaptive.nextWords && this.targetArr.length - this.cursor < 30) {
      const more = this.adaptive.nextWords(20);
      if (more) this.appendStream(more);
    }

    this.tickLive();
  }

  _charsBetweenLastSpace() {
    let n = 0;
    for (let i = this.cursor - 1; i >= 0; i--) {
      if (this.targetArr[i] === " ") break;
      n++;
    }
    return n;
  }

  onBackspace(wholeWord = false) {
    if (this.finished) return;
    if (this.cursor === 0) return;
    const ts = this.now();
    this.lastKeyTs = ts;
    this._klog(wholeWord ? MARK_WORD_BACKSPACE : MARK_BACKSPACE, ts);
    let steps = 1;
    if (wholeWord) {
      // Walk back until we hit a space.
      steps = 0;
      let i = this.cursor - 1;
      while (i >= 0 && this.targetArr[i] === " ") { steps++; i--; }
      while (i >= 0 && this.targetArr[i] !== " ") { steps++; i--; }
      if (steps === 0) steps = 1;
    }
    for (let s = 0; s < steps; s++) {
      if (this.cursor === 0) break;
      this.cursor--;
      this.renderer.setUntyped(this.cursor);
      // Trim the typed array so subsequent reads never see undefined holes.
      if (this.typed.length > this.cursor) this.typed.length = this.cursor;
    }
    this.renderer.moveCaretTo(this.cursor);
    this.tickLive();
  }

  beginRunning(ts) {
    this.running = true;
    this.startTs = ts;
    this.lastKeyTs = ts;
    this.lastWordStartTs = ts;
    this.host.dataset.state = "running";
    this.setHint("");
    if (this.tickHandle) cancelAnimationFrame(this.tickHandle);
    const loop = () => {
      if (!this.running) return;
      this.tickLive();
      // Don't tick the deadline while paused.
      if (!this._pauseAt && (this.mode === "time" || this.mode === "tape") && this.now() - this.startTs >= this.duration) {
        this.finish();
        return;
      }
      this.tickHandle = requestAnimationFrame(loop);
    };
    this.tickHandle = requestAnimationFrame(loop);
  }

  pauseTimer(reason) {
    // Definitive lock: only the explicit Pause button click can
    // pause a session. Every other path -- blur, IME, focus shift,
    // soft-keyboard tap that bled onto the button -- is rejected.
    // The Pause-button onclick (window.ttPause in practice-boot)
    // passes the magic token "user-pause"; nothing else does.
    if (reason !== "user-pause") return;
    const now = this.now();
    // Belt + suspenders: even with the token, reject if the user
    // typed within the last 450 ms. Catches accidental physical-
    // button presses during fast typing too.
    if (this._lastTypedAt && (now - this._lastTypedAt) < 450) return;
    this._pauseAt = now;
  }
  resumeTimer() {
    if (this._pauseAt) {
      const now = this.now();
      const delta = now - this._pauseAt;
      /* The pause marker is stamped at the moment the pause BEGAN and
         the log clock then restarts at the moment it ended, so the
         time somebody spent away from the keyboard is not charged to
         the next keystroke. A replay reads the marker and knows to
         skip rather than sit there for four minutes. */
      if (this.running) {
        this._klog(MARK_PAUSE, this._pauseAt);
        this._keylogTs = now;
      }
      this.startTs += delta;
      this._pauseAt = 0;
    }
  }

  tickLive() {
    if (!this.running) return;
    // While paused, freeze the displayed time at the pause moment so the
    // live wpm/timer doesn't keep ticking when the user steps away.
    const now = this._pauseAt || this.now();
    const ms = now - this.startTs;
    const w = netWpm(this.correctChars, ms);
    const acc = accuracy(this.correctChars, this.totalKeystrokes);
    this.updateLive(w, acc, ms);
    this.onTick({ wpm: w, accuracy: acc, ms });
  }

  updateLive(wpm, acc, ms) {
    if (this.liveEl) {
      const wel = this.liveEl.querySelector("[data-live='wpm']");
      const ael = this.liveEl.querySelector("[data-live='acc']");
      const tel = this.liveEl.querySelector("[data-live='time']");
      const tlb = this.liveEl.querySelector("[data-live-label='time']");
      if (wel) wel.textContent = String(Math.round(wpm));
      if (ael) ael.textContent = String(Math.round(acc));
      if (tel) {
        if (this.mode === "time" || this.mode === "tape") {
          const remain = Math.max(0, this.duration - (ms || 0));
          tel.textContent = String(Math.ceil(remain / 1000));
          if (tlb) tlb.textContent = "seconds left";
        } else if (this.mode === "words") {
          const wordsDone = this.targetArr.slice(0, this.cursor).join("").split(/\s+/).filter(Boolean).length;
          tel.textContent = `${wordsDone}/${this.wordsTarget}`;
          if (tlb) tlb.textContent = "words typed";
        } else if (this.mode === "quote" || this.mode === "custom" || this.mode === "lesson" || this.mode === "drill" || this.mode === "challenge" || this.mode === "adaptive" || this.mode === "book" || this.mode === "idiom" || this.mode === "poem" || this.mode === "parable") {
          const pct = this.targetArr.length ? Math.round((this.cursor / this.targetArr.length) * 100) : 0;
          tel.textContent = `${pct}%`;
          if (tlb) tlb.textContent = "complete";
        } else {
          tel.textContent = String(Math.round((ms || 0) / 1000));
          if (tlb) tlb.textContent = "seconds elapsed";
        }
      }
    }
    if (this.timerEl) {
      let pct = 0;
      if (this.mode === "time" && this.duration) {
        pct = Math.min(100, ((ms || 0) / this.duration) * 100);
      } else if (this.targetArr.length) {
        pct = Math.min(100, (this.cursor / this.targetArr.length) * 100);
      }
      this.timerEl.style.width = pct + "%";
    }
  }

  finish() {
    if (this.finished) return;
    const ms = this.now() - this.startTs;
    /* _stopped is set by the page (Esc, the Stop button) immediately
       before finish(). Recording it means a replay can tell "they ran
       out of text" from "they stopped here", which are different
       endings and look different on screen. */
    if (this._stopped) this._klog(MARK_END, this.now());
    const w = netWpm(this.correctChars, ms);
    const r = rawWpm(this.totalKeystrokes, ms);
    const acc = accuracy(this.correctChars, this.totalKeystrokes);
    const cons = consistency(this.perWordWpm);
    // Paint the FINAL live stats once before stopping the loop so the
    // user actually sees 100% / final wpm in the toolbar -- otherwise
    // the last paint reflects the state before the closing keystroke
    // (e.g. 98% on a 50-char quote, since cursor advances to length
    // and finish triggers without a follow-up tickLive frame).
    this.updateLive(w, acc, ms);
    this.finished = true;
    this.running = false;
    if (this.tickHandle) cancelAnimationFrame(this.tickHandle);
    if (w > 250) this.suspect = true;
    this.host.dataset.state = "done";
    this.onFinish({
      wpm: w, raw: r, accuracy: acc, consistency: cons,
      ms, chars: this.totalKeystrokes, correctChars: this.correctChars,
      errors: this.errors, suspect: this.suspect, mode: this.mode,
      duration: Math.round(this.duration / 1000),
      target: this.target, typed: this.typed.map((t) => t ? t.ch : ""),
      perWordWpm: this.perWordWpm.slice(),
      /* The append-only record of the session. Never persisted by
         session-recorder.js and never sent anywhere: the results card
         hands it to share/codec.js, which puts it in a URL fragment,
         and engine/replay-store.js keeps it in this browser. */
      keylog: this.keylog.slice(),
      // Missed-word capture. _erroredCursorSet survives backspace+retype
      // so even fixed errors get credited at the word level. The
      // recorder turns this into actual word strings.
      erroredCursors: Array.from(this._erroredCursorSet),
      // How far the cursor got into the target — used by book mode to
      // determine which paragraphs were ACTUALLY completed (vs the user
      // hitting Esc after only typing a few characters).
      endCursor: this.cursor,
      targetLen: this.targetArr.length,
    });
  }

  restart() {
    if (this.opts.onRestart) this.opts.onRestart();
  }
  escape() {
    // Always end the session if it's running — gives users a way to
    // commit a partial session for stats. The host can still override.
    if (this.opts.onEscape) this.opts.onEscape();
    else if (this.running) this.finish();
  }
}
