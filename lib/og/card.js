/* The share card, as a satori element tree.
 *
 * No JSX and no React: satori accepts plain `{type, props}` objects, and
 * this file has to run in a Cloudflare Worker where a JSX transform is
 * not available. `h()` below is the whole abstraction.
 *
 * Two satori rules that this file obeys everywhere, because breaking
 * either produces a card that is silently wrong rather than an error:
 *
 *   1. Every element with more than one child MUST have display:flex.
 *      satori's default is `display: block` only for a single text
 *      child; anything else lays out as flex and an unset `display`
 *      throws. So: every div here sets it.
 *   2. satori does not synthesise weights or slants. Asking for
 *      fontWeight 400 when only 500-italic and 600 exist gets you
 *      500 italic, silently. Every text node states both fontWeight
 *      and fontStyle.
 *
 * Layouts: `result` (a finished session) and `content` (a quote, poem,
 * book page, lesson…). One model shape feeds both; `model.layout`
 * chooses. `variant: "grid"` is the Free-plan pre-render: the same
 * result card with an accuracy BAND instead of exact numbers, because
 * those cards are built ahead of time for every wpm x band pair.
 */
import { COLORS, CARD, FONTS, SITE } from "./theme.js";
import { KIND_EYEBROW, BANDS, durationLabel } from "./labels.js";

/* ── element helpers ─────────────────────────────────────────────── */

export function h(type, style, children) {
  return { type, props: { style, children } };
}

const row = (style, children) => h("div", { display: "flex", flexDirection: "row", ...style }, children);
const col = (style, children) => h("div", { display: "flex", flexDirection: "column", ...style }, children);
const text = (style, value) => h("div", { display: "flex", ...style }, String(value));

const mono = (size, weight, color, extra) => ({
  fontFamily: FONTS.mono, fontSize: size, fontWeight: weight, fontStyle: "normal", color, ...extra,
});
const sans = (size, weight, color, extra) => ({
  fontFamily: FONTS.sans, fontSize: size, fontWeight: weight, fontStyle: "normal", color, ...extra,
});
const serif = (size, weight, color, extra) => ({
  fontFamily: FONTS.serif, fontSize: size, fontWeight: weight, fontStyle: "normal", color, ...extra,
});
const serifItalic = (size, color, extra) => ({
  fontFamily: FONTS.serif, fontSize: size, fontWeight: 500, fontStyle: "italic", color, ...extra,
});

/* Hard character caps. satori will happily lay text out past the bottom
   edge of the canvas, so nothing is allowed in unbounded. The panels
   also carry overflow:hidden as a second line of defence. */
export const CAPS = {
  title: 260,
  quote: 420,     // quotes and idioms: the text IS the headline
  prose: 560,     // book pages, parables, lesson blurbs
  poemLines: 8,
  line: 92,
  byline: 110,
  meaning: 180,
  /* A result card already spent 160px on the wpm number, so its excerpt
     gets three lines. The arithmetic, at 24px JetBrains Mono in a
     1016px-wide panel: 0.6em advance -> ~70 characters a line, x3 =
     210, minus the ~15% a word-wrapped line wastes = 180. Raise this
     and the fourth line gets sliced in half by the panel's overflow. */
  resultText: 180,
  resultLines: 3,
};

/* The body of a card is a FIXED-HEIGHT box, not a growing one.
   630 - 8 (accent strip) - 44 (top pad) - 40 (bottom pad) = 538 for the
   three rows; the header is one 68px brand tile and the footer is one
   chip plus its rule. What is left is the middle. Overflowing text then
   clips at the bottom of that box instead of shoving the footer off the
   canvas -- which is exactly what a 5-paragraph book page did before
   this was a fixed height. */
export const BODY = { header: 68, middle: 415, footer: 55 };

export function clamp(s, max) {
  const t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  /* Cut on a word boundary when there is one near the end. */
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}

/* Font size from text length. satori cannot measure before layout, so
   the card picks a size from the one thing it knows: how much there is.
   Values tuned against the widest real strings in src/data. */
function fitTitle(s) {
  const n = s.length;
  if (n <= 32) return 68;
  if (n <= 64) return 56;
  if (n <= 110) return 46;
  if (n <= 180) return 38;
  if (n <= 240) return 33;
  return 29;
}

function fitExcerpt(s) {
  const n = s.length;
  if (n <= 180) return 28;
  if (n <= 320) return 25;
  if (n <= 460) return 22;
  return 20;
}

/* ── shared furniture ────────────────────────────────────────────── */

/* The brand mark from og-default.svg: an accent square with a square
   hole and an italic serif G in it. */
function brandTile(size = 68) {
  const inset = Math.round(size * 0.175);
  const inner = size - inset * 2;
  return h("div", {
    display: "flex", width: size, height: size, backgroundColor: COLORS.accent,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  }, [
    h("div", {
      display: "flex", width: inner, height: inner, backgroundColor: COLORS.bg,
      alignItems: "center", justifyContent: "center",
    }, [
      text({ ...serifItalic(Math.round(size * 0.62), COLORS.accent), lineHeight: 1, marginTop: -Math.round(size * 0.06) }, "G"),
    ]),
  ]);
}

function eyebrowRow(label, right) {
  const kids = [
    brandTile(),
    text({ ...mono(21, 500, COLORS.muted), letterSpacing: 3, marginLeft: 22, marginTop: 22 }, label),
  ];
  const children = [row({ alignItems: "flex-start" }, kids)];
  if (right) {
    children.push(text({ ...mono(20, 400, COLORS.muted), letterSpacing: 2, marginTop: 24 }, right));
  }
  return row({ alignItems: "flex-start", justifyContent: "space-between", width: "100%" }, children);
}

function chip(label, color) {
  return text({
    ...mono(19, 500, color), letterSpacing: 1.5,
    border: `1px solid ${COLORS.rule}`, borderRadius: 4,
    padding: "6px 12px", marginLeft: 10,
  }, label);
}

function footerRow(left, chips) {
  const children = [text({ ...mono(19, 400, COLORS.muted), letterSpacing: 1.5, marginTop: 8 }, left)];
  if (chips && chips.length) children.push(row({ alignItems: "center" }, chips));
  return row({
    alignItems: "center", justifyContent: "space-between", width: "100%",
    borderTop: `1px solid ${COLORS.rule}`, paddingTop: 18,
  }, children);
}

/* The dark panel a passage of typeable text sits in. */
function excerptPanel(children, maxHeight) {
  return col({
    backgroundColor: COLORS.bg1, borderLeft: `4px solid ${COLORS.accent}`,
    padding: "20px 26px", maxHeight, overflow: "hidden", width: "100%",
  }, children);
}

function shell([header, middle, footer]) {
  return col({
    width: CARD.width, height: CARD.height, backgroundColor: COLORS.bg,
    fontFamily: FONTS.sans, overflow: "hidden",
  }, [
    h("div", { display: "flex", width: "100%", height: 8, backgroundColor: COLORS.accent }, []),
    col({
      height: CARD.height - 8, padding: `44px ${CARD.pad}px 40px`, width: "100%",
    }, [
      col({ height: BODY.header, width: "100%", flexShrink: 0, overflow: "hidden" }, [header]),
      col({ height: BODY.middle, width: "100%", flexShrink: 0, overflow: "hidden", justifyContent: "center" }, [middle]),
      col({ height: BODY.footer, width: "100%", flexShrink: 0, justifyContent: "flex-end" }, [footer]),
    ]),
  ]);
}

/* ── result card ─────────────────────────────────────────────────── */

function statBits(m) {
  const bits = [];
  if (m.raw != null) bits.push(`${Math.round(m.raw)} raw`);
  if (m.acc != null) bits.push(`${round1(m.acc)}% accuracy`);
  if (m.con != null) bits.push(`${round1(m.con)}% consistency`);
  if (m.dur != null) bits.push(durationLabel(m.dur));
  else if (m.n != null) bits.push(`${m.n} words`);
  return bits;
}

function round1(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function badge(label, color) {
  return text({
    ...mono(20, 500, color), letterSpacing: 2.5,
    border: `2px solid ${color}`, borderRadius: 6, padding: "10px 16px",
  }, label);
}

function resultCard(m) {
  const wpmLabel = m.wpmLabel != null ? String(m.wpmLabel) : String(Math.round(m.wpm ?? 0));

  const badges = [];
  if (m.pb === 1) badges.push(badge("PERSONAL BEST", COLORS.good));
  if (m.pb === 2) badges.push(badge("ALL-TIME BEST", COLORS.accent));
  if (m.ok === true) badges.push(badge("CHALLENGE PASSED", COLORS.secondary));
  if (m.ok === false) badges.push(badge("NOT CLEARED", COLORS.muted));

  const wpmRow = row({ alignItems: "flex-end", justifyContent: "space-between", width: "100%" }, [
    row({ alignItems: "flex-end" }, [
      text({ ...serif(168, 600, COLORS.fg), lineHeight: 0.95, letterSpacing: -2 }, wpmLabel),
      text({ ...sans(44, 600, COLORS.accent), marginLeft: 16, marginBottom: 22 }, "wpm"),
    ]),
    badges.length ? row({ alignItems: "center", marginBottom: 26, gap: 12 }, badges) : text({ display: "flex" }, ""),
  ]);

  const middle = [wpmRow];

  if (m.variant === "grid") {
    middle.push(text({ ...mono(32, 400, COLORS.fg1), marginTop: 14, letterSpacing: 1 },
      `${BANDS[m.band] || BANDS.u80} accuracy`));
  } else {
    const bits = statBits(m);
    if (bits.length) {
      const kids = [];
      bits.forEach((b, i) => {
        if (i) kids.push(text({ ...mono(27, 400, COLORS.muted), margin: "0 12px" }, "·"));
        kids.push(text(mono(27, 400, COLORS.fg1), b));
      });
      middle.push(row({ alignItems: "center", marginTop: 14, flexWrap: "nowrap", overflow: "hidden" }, kids));
    }
  }

  const c = m.content;
  if (m.variant !== "grid" && c) {
    const body = excerptBody(c, { maxLines: CAPS.resultLines, cap: CAPS.resultText, size: 24 });
    if (body.length) {
      middle.push(col({ marginTop: 20, width: "100%" }, [
        c.title && c.kind !== "quote" && c.kind !== "idiom"
          ? text({ ...sans(21, 600, COLORS.secondary), letterSpacing: 1, marginBottom: 10 },
            clamp(c.title, CAPS.byline))
          : text({ display: "flex" }, ""),
        excerptPanel(body, 152),
      ]));
    }
  }

  const chips = [];
  if (m.modeLabel) chips.push(chip(m.modeLabel, COLORS.secondary));
  if (m.langLabel) chips.push(chip(m.langLabel, COLORS.fg1));
  if (m.layLabel && m.layLabel !== "QWERTY") chips.push(chip(m.layLabel, COLORS.fg1));

  return shell([
    eyebrowRow(SITE.resultEyebrow, m.date ? dateLabel(m.date) : null),
    col({ width: "100%" }, middle),
    footerRow(SITE.resultFooter, chips),
  ]);
}

/* 2026-09-16 -> 16 SEP 2026. Fixed English month names: a card is not
   the place for locale-dependent output, it has to be reproducible. */
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function dateLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) return "";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] || ""} ${m[1]}`;
}

/* Text lines for an excerpt panel: poems keep their line breaks, prose
   is one wrapped block. `maxLines` caps the poem case. */
function excerptBody(c, opts = {}) {
  const maxLines = opts.maxLines || CAPS.poemLines;
  if (c.lines && c.lines.length) {
    const lines = c.lines.slice(0, maxLines).map((l) => clamp(l, CAPS.line));
    if (c.lines.length > maxLines) lines[lines.length - 1] += " …";
    const size = opts.size || (lines.length > 5 ? 24 : 27);
    return lines.map((l, i) => text({
      ...mono(size, 400, COLORS.fg1), lineHeight: 1.45, marginTop: i ? 2 : 0,
    }, l || " "));
  }
  if (c.text) {
    const cap = opts.cap || (c.kind === "quote" || c.kind === "idiom" ? CAPS.quote : CAPS.prose);
    const t = clamp(c.text, cap);
    return [text({ ...mono(opts.size || fitExcerpt(t), 400, COLORS.fg1), lineHeight: 1.5, width: "100%" }, t)];
  }
  return [];
}

/* ── content card ────────────────────────────────────────────────── */

function bylineOf(c) {
  const bits = [];
  if (c.author) bits.push(c.author);
  if (c.year) bits.push(String(c.year));
  if (c.source) bits.push(c.source);
  if (!bits.length) return null;
  return clamp(bits.join(" · "), CAPS.byline);
}

function contentCard(m) {
  const c = m.content || {};
  const kind = c.kind || "quote";
  const eyebrow = KIND_EYEBROW[kind] || String(kind).toUpperCase();

  /* For a quote or an idiom the text IS the headline — that is the
     thing being shared. For everything else the title is a title and
     the text goes in the panel below it. */
  const headlineIsText = kind === "quote" || kind === "idiom";
  const headline = clamp(headlineIsText ? c.text || c.title || "" : c.title || "", CAPS.title);

  const middle = [];
  if (headlineIsText) {
    middle.push(text({
      ...serif(fitTitle(headline), 600, COLORS.fg), lineHeight: 1.18, width: "100%",
    }, kind === "quote" ? `“${headline}”` : headline));
  } else {
    middle.push(text({
      ...serif(fitTitle(headline), 600, COLORS.fg), lineHeight: 1.18, width: "100%",
    }, headline));
  }

  const byline = bylineOf(c);
  if (byline) {
    middle.push(text({ ...sans(26, 400, COLORS.fg1), marginTop: 16 }, `— ${byline}`));
  }

  const note = c.meaning ? `Meaning: ${c.meaning}` : c.moral ? `Moral: ${c.moral}` : null;
  if (note) {
    middle.push(text({
      ...serifItalic(27, COLORS.secondary), marginTop: 18, lineHeight: 1.4, width: "100%",
    }, clamp(note, CAPS.meaning)));
  }

  if (!headlineIsText) {
    const body = excerptBody(c);
    if (body.length) middle.push(col({ marginTop: 22, width: "100%" }, [excerptPanel(body, 232)]));
  }

  const chips = [chip(KIND_EYEBROW[kind] ? titleCase(kind) : String(kind), COLORS.secondary)];

  return shell([
    eyebrowRow(`GUERILLATYPE · ${eyebrow}`, null),
    col({ width: "100%", overflow: "hidden" }, middle),
    footerRow(SITE.contentFooter, chips),
  ]);
}

function titleCase(s) {
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

/* ── the default card ────────────────────────────────────────────── */

/* The site-wide og:image. Same design as src/assets/img/og-default.svg,
   which stays the design source: brand tile at (80,150), eyebrow,
   italic headline, sub-headline, footer. Redrawn here so the one
   committed PNG comes out of the same renderer as every other card
   (the Phase D0 version was a Playwright screenshot of an HTML copy,
   which needed a browser and a network connection to Bunny Fonts). */
export function defaultCard() {
  return col({
    width: CARD.width, height: CARD.height, backgroundColor: COLORS.bg,
    fontFamily: FONTS.sans, padding: "0 80px", justifyContent: "center", overflow: "hidden",
    /* og-default.svg puts the brand tile's top edge at y=150 and the
       footer baseline at y=560. Centring alone lands 24px high, so the
       block is pushed back down with padding. */
    paddingTop: 68,
  }, [
    row({ alignItems: "center", marginBottom: 54 }, [
      h("div", {
        display: "flex", width: 80, height: 80, backgroundColor: COLORS.accent,
        alignItems: "center", justifyContent: "center", flexShrink: 0,
      }, [
        h("div", {
          display: "flex", width: 52, height: 52, backgroundColor: COLORS.bg,
          alignItems: "center", justifyContent: "center",
        }, [text({ ...serifItalic(50, COLORS.accent), lineHeight: 1, marginTop: -3 }, "G")]),
      ]),
      text({ ...mono(22, 400, COLORS.muted), letterSpacing: 3, marginLeft: 20 }, "ISSUE NO. 01 · OPEN SOURCE"),
    ]),
    /* Three nodes, not one string with colour spans: satori trims the
       trailing space of a flex item, so "Guerilla " + "Type." rendered
       as "GuerillaType." until the gap became a margin. The full stop
       is cream in og-default.svg, only the word is accent. */
    row({ alignItems: "baseline" }, [
      text({ ...serifItalic(104, COLORS.fg), lineHeight: 1.1, marginRight: 26 }, "Guerilla"),
      text({ ...serifItalic(104, COLORS.accent), lineHeight: 1.1 }, "Type"),
      text({ ...serifItalic(104, COLORS.fg), lineHeight: 1.1 }, "."),
    ]),
    text({ ...serif(54, 400, COLORS.fg1), marginTop: 26, lineHeight: 1.2 }, "A free typing tutor for everyone."),
    text({ ...mono(22, 400, COLORS.muted), letterSpacing: 2, marginTop: 54 },
      "guerillatype.com · localStorage only · No accounts"),
  ]);
}

/* ── entry point ─────────────────────────────────────────────────── */

export function buildCard(model) {
  if (!model) throw new Error("buildCard: no model");
  if (model.layout === "default") return defaultCard();
  if (model.layout === "content") return contentCard(model);
  if (model.layout === "result") return resultCard(model);
  throw new Error(`buildCard: unknown layout ${JSON.stringify(model.layout)}`);
}

export default buildCard;
