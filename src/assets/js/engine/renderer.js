/* Renderer — paints the target string as words/chars and updates spans
   in place as the user types. Caret is positioned absolutely against
   the leading edge of the current char. */

const SPACE = " "; // non-breaking display char for spaces (visual only)

export class Renderer {
  constructor(container, caretStyle = "line") {
    this.container = container;
    this.caretStyle = caretStyle;
    this.inner = document.createElement("div");
    this.inner.className = "tt-text__inner";
    container.innerHTML = "";
    container.appendChild(this.inner);

    this.caret = document.createElement("span");
    this.caret.className = "tt-caret tt-caret--" + caretStyle;
    container.appendChild(this.caret);

    this.chars = []; // {el, ch, isSpace}
    this.cursor = 0;
    this.scrollPx = 0;

    /* Character position cache.

       moveCaretTo runs on EVERY keystroke. It used to call
       getBoundingClientRect() two or three times per press, and because
       the engine mutates classes/textContent immediately before it, each
       read forced a synchronous layout -- the classic typing-jank
       pattern, and it got worse the longer the passage was.

       Instead we measure every char ONCE into a flat Float32Array
       [x, y, w, h, x, y, w, h, ...] and read from that. Positions are
       stored relative to `inner`, not the container, which makes them
       invariant under the translate we put on `inner` for scrolling and
       for tape -- char and parent shift together, so the delta never
       changes. A scroll or a tape slide therefore does NOT invalidate
       the cache.

       The cache only goes stale when the box actually reflows: setText
       (new spans), appendText (more spans), a container resize, or a
       webfont swapping in. Notably NOT on setIncorrect -- the typing
       font is monospace, so swapping one glyph for another keeps the
       same advance width. */
    this._pos = null;
    this._posCount = 0;   // chars measured so far
    this._zeroWidth = false;  // passage contains 0px chars (para breaks)
    this._dirty = true;   // full re-measure needed
    this._contW = 0;
    this._innerOffX = 0;  // inner's offset inside container, pre-transform
    this._innerOffY = 0;
    this._reflowHandle = null;

    // A resize changes wrapping, so every position moves.
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => this._onReflow());
      this._ro.observe(container);
    }
    // A webfont swapping in after first paint changes every advance
    // width. Without this the caret sits fractionally off until the
    // next resize.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => this._onReflow()).catch(() => {});
    }
  }

  /* Something reflowed the text box. Drop the cache and re-place the
     caret next frame -- the user may not be typing, and without this the
     caret would sit at a stale position until the next keypress. */
  _onReflow() {
    this._dirty = true;
    if (this._reflowHandle) return;
    this._reflowHandle = requestAnimationFrame(() => {
      this._reflowHandle = null;
      if (this.chars.length) this.moveCaretTo(this.cursor);
    });
  }

  _ensureCapacity(n) {
    if (this._pos && this._pos.length >= n * 4) return;
    const next = new Float32Array(Math.max(n, 64) * 8);
    if (this._pos) next.set(this._pos);
    this._pos = next;
  }

  /* Measure chars [from, n) in one batched read pass. Appending never
     shifts earlier content in normal LTR flow, so appendText measures
     only the new tail instead of re-walking thousands of spans -- which
     keeps long zen / adaptive streams from degrading to O(n^2). */
  /* Keep the caret on screen while typing a long passage.

     These modes -- book reader, custom text, long quotes -- render the
     whole passage into the page and deliberately do not slide lines up
     the way the default mode does. That is right for short passages,
     where the reader wants the paragraph to sit still. For a long one it
     meant the caret simply walked off the bottom of the window and the
     typist had to stop and scroll by hand to see what to type next.

     Costs no getBoundingClientRect: the container's document-space top
     is cached in _measure, so this needs only window.scrollY, which the
     typing-perf gate's budget of 0.5 rect reads per keystroke does not
     count and which cannot force layout when read before the caret
     style writes.

     Scrolls only when the caret leaves a comfortable band, so an
     ordinary line of typing moves nothing. */
  _followCaretInPage(contY, lineH) {
    if (this._contDocTop == null) return;
    const vh = window.innerHeight || 0;
    if (!vh) return;

    const line = lineH || 28;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const top = this._contDocTop + contY - scrollY;

    /* Headroom above so you can see the line you just finished, and a
       deeper margin below so the NEXT line is already on screen rather
       than arriving flush with the bottom edge. */
    const min = Math.max(line * 2, vh * 0.15);
    const max = vh - Math.max(line * 4, vh * 0.28);
    if (top >= min && top <= max) return;

    const delta = Math.round(top - vh * 0.38);
    if (Math.abs(delta) < 4) return;

    /* Instant, not smooth, and deliberately so.

       A smooth scroll is asynchronous: the following keystrokes read a
       scrollY that has not caught up, so either they stack corrections
       on top of an in-flight animation or -- if you suppress that with a
       cooldown -- the caret keeps travelling during the cooldown and
       leaves the screen anyway. Measured with a 320ms cooldown while
       typing a 521-character poem: the caret left a 700px viewport three
       times, ranging from 0 to 779px.

       Instant also matches the rest of the app. The default mode slides
       lines with an immediate transform; a page that eases underneath
       you while you type reads as drift, not polish. */
    try {
      window.scrollBy({ top: delta, behavior: "auto" });
    } catch {
      window.scrollBy(0, delta);
    }
  }

  _measure(from = 0) {
    const n = this.chars.length;
    if (!n) { this._posCount = 0; this._dirty = false; return; }
    this._ensureCapacity(n);

    const cr = this.container.getBoundingClientRect();
    const ir = this.inner.getBoundingClientRect();
    this._contW = cr.width;
    // ir is post-transform; add back the shift we applied so the caret
    // math stays correct when measured mid-scroll or mid-tape-slide.
    this._innerOffX = (ir.left - cr.left) + (this._tapeShift || 0);
    this._innerOffY = (ir.top - cr.top) + (this.scrollPx || 0);
    /* Container top in DOCUMENT space, so it stays valid as the page
       scrolls and the per-keystroke caret-follow below never needs a
       rect of its own. _measure only runs when the layout is dirty or
       new characters arrive, never per keypress. */
    this._contDocTop = cr.top + (window.scrollY || window.pageYOffset || 0);

    const pos = this._pos;
    for (let k = from; k < n; k++) {
      const r = this.chars[k].el.getBoundingClientRect();
      const o = k * 4;
      pos[o]     = r.left - ir.left;
      pos[o + 1] = r.top - ir.top;
      pos[o + 2] = r.width;
      pos[o + 3] = r.height;
    }
    /* Is this surface actually monospace? The widths are already in the
       cache, so this costs no extra layout read. It matters because the
       reader surface renders in Lora, a proportional serif with 21
       distinct advance widths -- see _glyphChanged below. */
    this._monospace = true;
    let ref = -1;
    for (let k = 0; k < n; k++) {
      if (this.chars[k] && this.chars[k].isSpace) continue;
      const w = pos[k * 4 + 2];
      if (w <= 0) continue;
      if (ref < 0) { ref = w; continue; }
      if (Math.abs(w - ref) > 0.5) { this._monospace = false; break; }
    }

    /* Does the passage contain a zero-width character? Paragraph breaks
       render as one. They void the monospace assumption below: swapping
       a visible glyph in beside a 0px character changes THAT character's
       width too, so the rest of the line shifts even though every glyph
       is nominally the same width. Costs no layout read -- the widths
       are already in the cache. */
    this._zeroWidth = false;
    for (let k = 0; k < n; k++) {
      if (pos[k * 4 + 2] <= 0) { this._zeroWidth = true; break; }
    }

    this._posCount = n;
    this._dirty = false;
  }

  _sync() {
    if (this._dirty) this._measure(0);
    else if (this._posCount < this.chars.length) this._measure(this._posCount);
  }

  setText(target) {
    // Defensive class cleanup: when tape mode is the new active
    // mode, scrub any lingering --full / --reader class on the
    // container. The toggles in practice-boot SHOULD already do
    // this, but cross-class !important rules (typing-surface.css)
    // make any leftover state catastrophic for tape's transform.
    if (this.container.classList.contains("tt-text--tape")) {
      this.container.classList.remove("tt-text--full", "tt-text--reader");
    }
    // Build word-grouped spans; each char gets its own <span>.
    // If target is an array, treat each entry as a separate paragraph
    // and render with visible block breaks between them. The chars[]
    // array stays flat across paragraphs so the engine cursor logic
    // is unchanged. Paragraphs are joined by a single space char in
    // the engine's target — that space sits inside a synthetic span
    // hidden from the visual flow but counted as a typeable keystroke.
    this.inner.innerHTML = "";
    this.chars = [];
    const isBlocks = Array.isArray(target);
    const blocks = isBlocks ? target : [target];

    blocks.forEach((block, bi) => {
      const blockEl = isBlocks ? document.createElement("div") : this.inner;
      if (isBlocks) blockEl.className = "tt-paragraph";

      const words = String(block).split(" ");
      words.forEach((w, wi) => {
        const wordEl = document.createElement("span");
        wordEl.className = "tt-word";
        for (const ch of w) {
          const sp = document.createElement("span");
          sp.className = "tt-char";
          sp.textContent = ch;
          wordEl.appendChild(sp);
          this.chars.push({ el: sp, ch, isSpace: false });
        }
        blockEl.appendChild(wordEl);
        if (wi < words.length - 1) {
          const sp = document.createElement("span");
          sp.className = "tt-char tt-char--space";
          sp.innerHTML = "&nbsp;";
          blockEl.appendChild(sp);
          this.chars.push({ el: sp, ch: " ", isSpace: true });
        }
      });

      if (isBlocks) this.inner.appendChild(blockEl);

      // Inter-paragraph separator: a space char that lives in a
      // span styled to be hidden visually (the paragraph break is
      // already provided by the block element). The user types ONE
      // space to cross between paragraphs.
      if (isBlocks && bi < blocks.length - 1) {
        const sep = document.createElement("span");
        sep.className = "tt-char tt-char--space tt-char--paraspace";
        sep.innerHTML = "&nbsp;";
        this.inner.appendChild(sep);
        this.chars.push({ el: sep, ch: " ", isSpace: true });
      }
    });

    this.cursor = 0;
    this.scrollPx = 0;
    this._tapeShift = 0;
    this._tapeTarget = 0;
    if (this._tapeAnimHandle) {
      cancelAnimationFrame(this._tapeAnimHandle);
      this._tapeAnimHandle = null;
    }
    this.inner.style.transform = "";
    // Every span is new, so every cached position is meaningless.
    // _measure (via moveCaretTo -> _sync) does its own reads, which
    // implicitly flushes the pending layout for the spans we just
    // inserted -- so the old explicit `void this.inner.offsetWidth`
    // reflow-forcer is no longer needed.
    this._dirty = true;
    this._posCount = 0;
    this.moveCaretTo(0);
  }

  appendText(target) {
    // Append additional words/chars (used by zen + adaptive streams).
    const words = target.split(" ");
    words.forEach((w, wi) => {
      // If we already have content, leading space is always needed before a new word
      // unless the previous char is already a space.
      if (this.chars.length && (wi > 0 || !this._lastIsSpace())) {
        const sp = document.createElement("span");
        sp.className = "tt-char tt-char--space";
        sp.innerHTML = "&nbsp;";
        this.inner.appendChild(sp);
        this.chars.push({ el: sp, ch: " ", isSpace: true });
      }
      const wordEl = document.createElement("span");
      wordEl.className = "tt-word";
      for (const ch of w) {
        const sp = document.createElement("span");
        sp.className = "tt-char";
        sp.textContent = ch;
        wordEl.appendChild(sp);
        this.chars.push({ el: sp, ch, isSpace: false });
      }
      this.inner.appendChild(wordEl);
    });
  }
  _lastIsSpace() { return this.chars.length && this.chars[this.chars.length - 1].isSpace; }

  /* A glyph was swapped in or out at index i.

     On a monospace surface this changes nothing: one advance width is
     the same as another, which is why the position cache deliberately
     ignores it. On a PROPORTIONAL surface it is not -- and the reader
     styling (books, quotes, idioms, poems, parables) renders in Lora.
     Substituting a narrow glyph for a wide one there shifts every
     character after it, and with the cache untouched the caret stays
     where the old positions said. Measured before this fix: 24
     wide-to-narrow substitutions left the caret 646px adrift, to the
     left of the character it belonged on, and the error accumulated
     with every further mistake.

     Re-measure from the start of the affected WORD, not from i: the
     word is an inline-block and can re-wrap as a unit, which moves the
     characters before i within it. Everything earlier is untouched, so
     this is far cheaper than a full re-measure and leaves the monospace
     path at exactly zero extra reads. */
  _glyphChanged(i) {
    /* The monospace fast-path is only sound when every glyph really does
       occupy the same width. A paragraph break is 0px wide, and typing a
       visible character against it expands the following break to a full
       column -- measured on the custom reader as every character after
       the chapter title moving one column right, which left the caret
       exactly one character to the LEFT of its target. */
    if (this._monospace !== false && !this._zeroWidth) return;
    let w = i;
    while (w > 0 && this.chars[w - 1] && !this.chars[w - 1].isSpace) w--;
    if (w < this._posCount) this._posCount = w;
  }

  setCorrect(i) {
    const c = this.chars[i]; if (!c) return;
    c.el.classList.remove("tt-char--incorrect", "tt-char--extra");
    c.el.classList.add("tt-char--correct");
    // Restore the original target char in case it was swapped to the
    // user's typed char by a prior setIncorrect.
    if (!c.isSpace && c.el.textContent !== c.ch) {
      c.el.textContent = c.ch;
      this._glyphChanged(i);
    }
  }
  setIncorrect(i, typedCh) {
    const c = this.chars[i]; if (!c) return;
    c.el.classList.remove("tt-char--correct", "tt-char--extra");
    c.el.classList.add("tt-char--incorrect");
    if (c.isSpace) {
      c.el.dataset.typed = typedCh || "";
    } else if (typedCh && /\S/.test(typedCh)) {
      // Only swap visible content for printable, non-whitespace
      // chars. Whitespace typed against a letter target would
      // visually erase the character ("hello" -> "h ello"), so we
      // keep the target char visible and just mark as incorrect.
      const swapped = c.el.textContent !== typedCh;
      c.el.textContent = typedCh;
      c.el.dataset.typed = typedCh;
      c.el.dataset.target = c.ch;
      if (swapped) this._glyphChanged(i);
    } else if (typedCh) {
      // Whitespace-typed error: target char stays visible, just
      // the incorrect class applies its red strikethrough/tint.
      c.el.dataset.typed = typedCh;
    }
  }
  setUntyped(i) {
    const c = this.chars[i]; if (!c) return;
    c.el.classList.remove("tt-char--correct", "tt-char--incorrect", "tt-char--extra");
    if (!c.isSpace && c.el.textContent !== c.ch) {
      c.el.textContent = c.ch;
      // Same reflow as setCorrect/setIncorrect: undoing a substitution
      // moves the line back, so the cache is just as stale either way.
      this._glyphChanged(i);
    }
  }
  insertExtra(i, ch) {
    // Render an extra (typed but not in target) char inline.
    const c = this.chars[i]; if (!c) return null;
    const sp = document.createElement("span");
    sp.className = "tt-char tt-char--extra";
    sp.textContent = ch;
    c.el.parentNode.insertBefore(sp, c.el);
    return sp;
  }
  removeExtra(extraEl) { if (extraEl && extraEl.parentNode) extraEl.parentNode.removeChild(extraEl); }

  moveCaretTo(i) {
    this.cursor = i;
    const cont = this.container;
    const n = this.chars.length;
    if (!n) return;

    // Reads the cache; only measures when something actually reflowed.
    // Nothing below this line touches the DOM for layout, which is what
    // keeps a keystroke off the forced-synchronous-layout path.
    this._sync();

    // Anchor point relative to `inner`. Past the final char (end of a
    // finished passage) we pin to that char's trailing edge instead.
    // The old code early-returned here and so skipped the tape and
    // full/reader branches entirely, which left the caret misplaced at
    // end-of-text in those modes; the unified path fixes that.
    const past = i >= n || !this.chars[i];
    const k = (past ? n - 1 : i) * 4;
    const x = past ? this._pos[k] + this._pos[k + 2] : this._pos[k];
    const y = this._pos[k + 1];
    const h = this._pos[k + 3];

    // Pre-transform position in container coordinates.
    const contX = this._innerOffX + x;
    const contY = this._innerOffY + y;

    // Tape mode FIRST -- the tape class is mutually exclusive with
    // --full and --reader, but if a stale class lingers from a prior
    // session (mode switch, restart), checking tape first guarantees
    // the tape branch runs and the user sees scrolling. The previous
    // ordering would short-circuit on a leftover --reader class and
    // emit translateY(0) instead of tape's translateX.
    if (cont.classList.contains("tt-text--tape")) {
      // contX is already the char's untransformed x, so the old
      // char0-delta bookkeeping (_tapeChar0X) is no longer needed.
      this._tapeTarget = Math.max(0, contX - this._contW * 0.3);
      this._tapeAnchorTop = contY;
      this._tapeCaretContentX = contX;
      this._startTapeAnim();
      return;
    }

    // Full-text mode (book reader, custom, long quotes): the parent
    // shows the entire passage, so we don't slide lines up — just
    // pin the caret to the char's actual position. The sliding
    // transform below was causing ghost jumps in paragraph-block mode.
    if (cont.classList.contains("tt-text--full") || cont.classList.contains("tt-text--reader")) {
      if (this.scrollPx !== 0) {
        this.scrollPx = 0;
        this.inner.style.transform = "";
      }
      /* Before the style writes below, so reading scrollY cannot be
         forced to flush them. */
      this._followCaretInPage(contY, h);
      this.caret.style.left = contX + "px";
      this.caret.style.top = contY + "px";
      return;
    }

    // Cached char rect height = line-height in pixels (since .tt-char is
    // inline, its rect spans the full line box). Reliable in pixels,
    // unlike getComputedStyle().lineHeight which returns the unitless
    // value (e.g. "1.55") for a unitless line-height. The computed-style
    // fallback only fires if measurement somehow yielded zero.
    const lineHeight = h || parseFloat(getComputedStyle(this.inner).lineHeight) || 28;

    // contY is untransformed; subtracting the current scroll gives where
    // the caret sits within the visible viewport.
    let caretViewportTop = contY - this.scrollPx;

    // Slide up: caret has wrapped past line 2 of the visible viewport.
    let scrolled = false;
    while (caretViewportTop > lineHeight * 1.5) {
      this.scrollPx += lineHeight;
      caretViewportTop -= lineHeight;
      scrolled = true;
    }
    // Slide down: caret rose above line 1 (e.g. from heavy backspace).
    while (caretViewportTop < 0 && this.scrollPx > 0) {
      const delta = Math.min(lineHeight, this.scrollPx);
      this.scrollPx -= delta;
      caretViewportTop += delta;
      scrolled = true;
    }
    if (scrolled) {
      this.inner.style.transform = this.scrollPx > 0 ? `translateY(-${this.scrollPx}px)` : "";
    }

    this.caret.style.left = contX + "px";
    this.caret.style.top = caretViewportTop + "px";
  }

  setCaretStyle(style) {
    this.caret.className = "tt-caret tt-caret--" + style;
  }

  /* Tape-mode interpolator. Each keystroke updates _tapeTarget;
     this rAF loop eases _tapeShift toward it. Fast typing feels
     smooth because there's no CSS transition to restart -- the
     same animation just retargets each frame. */
  _startTapeAnim() {
    if (this._tapeAnimHandle) return; // already running
    const step = () => {
      const target = this._tapeTarget || 0;
      const current = this._tapeShift || 0;
      const delta = target - current;
      // Lerp factor 0.28 ~ 7-frame catch-up at 60fps. Tunable for
      // feel. Cap the integer-rounded change at <=1px for the
      // final approach so the inner doesn't sit ~0.3px off-target
      // forever (sub-pixel rendering blurs the text).
      let next;
      if (Math.abs(delta) < 0.5) next = target;
      else next = current + delta * 0.28;
      this._tapeShift = next;
      this.inner.style.transform = next > 0 ? `translateX(${-next}px)` : "";
      // Caret tracks the typed char's POST-transform viewport x.
      const caretX = (this._tapeCaretContentX || 0) - next;
      this.caret.style.left = caretX + "px";
      if (this._tapeAnchorTop != null) this.caret.style.top = this._tapeAnchorTop + "px";
      if (next === target) {
        this._tapeAnimHandle = null;
        return;
      }
      this._tapeAnimHandle = requestAnimationFrame(step);
    };
    this._tapeAnimHandle = requestAnimationFrame(step);
  }

  destroy() {
    // Mode switches build a fresh Renderer against the same container,
    // so an un-disconnected observer would keep firing against detached
    // nodes and slowly stack up across a session.
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
    if (this._reflowHandle) {
      cancelAnimationFrame(this._reflowHandle);
      this._reflowHandle = null;
    }
    if (this._tapeAnimHandle) {
      cancelAnimationFrame(this._tapeAnimHandle);
      this._tapeAnimHandle = null;
    }
    this._pos = null;
    this.chars = [];
    this.container.innerHTML = "";
  }
}
