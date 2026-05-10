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
  }

  setText(target) {
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
    this.inner.style.transform = "translateY(0)";
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

  setCorrect(i) {
    const c = this.chars[i]; if (!c) return;
    c.el.classList.remove("tt-char--incorrect", "tt-char--extra");
    c.el.classList.add("tt-char--correct");
    // Restore the original target char in case it was swapped to the
    // user's typed char by a prior setIncorrect.
    if (!c.isSpace && c.el.textContent !== c.ch) c.el.textContent = c.ch;
  }
  setIncorrect(i, typedCh) {
    const c = this.chars[i]; if (!c) return;
    c.el.classList.remove("tt-char--correct", "tt-char--extra");
    c.el.classList.add("tt-char--incorrect");
    if (c.isSpace) {
      c.el.dataset.typed = typedCh || "";
    } else if (typedCh) {
      // Show the user's actual keystroke instead of the target char
      // so they see what they hit. The target char is still in c.ch
      // and gets restored via setCorrect / setUntyped.
      c.el.textContent = typedCh;
      c.el.dataset.typed = typedCh;
      c.el.dataset.target = c.ch;
    }
  }
  setUntyped(i) {
    const c = this.chars[i]; if (!c) return;
    c.el.classList.remove("tt-char--correct", "tt-char--incorrect", "tt-char--extra");
    if (!c.isSpace && c.el.textContent !== c.ch) c.el.textContent = c.ch;
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
    const c = this.chars[i];
    const cont = this.container;
    if (!c) {
      const last = this.chars[this.chars.length - 1];
      if (!last) return;
      const r = last.el.getBoundingClientRect();
      const cr = cont.getBoundingClientRect();
      this.caret.style.left = (r.right - cr.left) + "px";
      this.caret.style.top = (r.top - cr.top) + "px";
      return;
    }
    const cr = cont.getBoundingClientRect();
    let r = c.el.getBoundingClientRect();

    // Full-text mode (book reader, custom, long quotes): the parent
    // shows the entire passage, so we don't slide lines up — just
    // pin the caret to the char's actual position. The sliding
    // transform below was causing ghost jumps in paragraph-block mode.
    if (cont.classList.contains("tt-text--full") || cont.classList.contains("tt-text--reader")) {
      if (this.scrollPx !== 0) {
        this.scrollPx = 0;
        this.inner.style.transform = "";
      }
      this.caret.style.left = (r.left - cr.left) + "px";
      this.caret.style.top = (r.top - cr.top) + "px";
      return;
    }

    // Char's bounding rect height = line-height in pixels (since
    // .tt-char is inline its rect spans the full line box). Reliable
    // in pixels, unlike getComputedStyle().lineHeight which returns
    // the unitless value (e.g. "1.55") for unitless line-height.
    const lineHeight = r.height || parseFloat(getComputedStyle(this.inner).lineHeight) || 28;

    // r.top is in viewport coords; cr.top + currentTransform = inner top.
    // caretViewportTop = where the caret sits within the visible viewport.
    let caretViewportTop = r.top - cr.top;

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

    this.caret.style.left = (r.left - cr.left) + "px";
    this.caret.style.top = caretViewportTop + "px";
  }

  setCaretStyle(style) {
    this.caret.className = "tt-caret tt-caret--" + style;
  }

  destroy() {
    this.container.innerHTML = "";
  }
}
