/* A `src` token -> the public content it names, from the repo's data.
 *
 * The privacy rule in one sentence: a share link may name public
 * content by id, and the text is then looked up HERE, from files that
 * ship with the site. Text never travels in the query string, so the
 * server never sees anything the user typed that is not already public
 * on guerillatype.com.
 *
 * `load(name)` is supplied by the host and must resolve:
 *   "quotes" "idioms" "parables" "poetry"   -> the arrays in src/data/
 *   "lessons" "challenges" "drills"         -> the arrays in src/_data/
 *   "books/<slug>"                          -> src/data/books/<slug>.json
 * It may throw or return null for a missing file; resolveSrc turns that
 * into null rather than propagating.
 *
 * Returns { kind, title?, author?, year?, source?, meaning?, moral?,
 *           text? | lines? } or null.
 */
import { parseSrc } from "./validate.js";

/* Kept in step with PARAS_PER_PAGE in src/assets/js/pages/practice-boot.js
   (line 113). A book page card must show the same six paragraphs the
   practice page would hand you. */
export const PARAS_PER_PAGE = 6;

async function load(fetchJson, name) {
  try {
    const d = await fetchJson(name);
    return d || null;
  } catch {
    return null;
  }
}

const byId = (arr, id) => (Array.isArray(arr) ? arr.find((x) => String(x && x.id) === String(id)) : null) || null;

export async function resolveSrc(src, fetchJson) {
  const s = typeof src === "string" ? parseSrc(src) : src;
  if (!s || !s.kind || typeof fetchJson !== "function") return null;

  switch (s.kind) {
    case "quote": {
      const q = byId(await load(fetchJson, "quotes"), s.id);
      if (!q) return null;
      return { kind: "quote", text: q.text, author: q.author || null };
    }
    case "idiom": {
      const i = byId(await load(fetchJson, "idioms"), s.id);
      if (!i) return null;
      return { kind: "idiom", text: i.text, meaning: i.meaning || null };
    }
    case "poem": {
      const p = byId(await load(fetchJson, "poetry"), s.id);
      if (!p) return null;
      return {
        kind: "poem",
        title: p.title || null,
        author: p.author || null,
        year: p.year || null,
        source: p.source || null,
        lines: String(p.text || "").split("\n"),
      };
    }
    case "parable": {
      const p = byId(await load(fetchJson, "parables"), s.id);
      if (!p) return null;
      return {
        kind: "parable",
        title: p.title || null,
        source: p.source || null,
        moral: p.moral || null,
        text: p.text || "",
      };
    }
    case "book": {
      const book = await load(fetchJson, `books/${s.id}`);
      if (!book || !Array.isArray(book.chapters) || !book.chapters.length) return null;
      /* bk:<slug>            whole book, first page of the first chapter
         bk:<slug>:<ch>:<pg>  0-based, same indices the practice page uses
         bk:<slug>:p:<pid>    one paragraph by its id */
      const rest = s.parts.slice(1);
      let chIdx = 0, page = null, paraId = null;
      if (rest[0] === "p") {
        paraId = rest[1] || null;
      } else {
        if (rest[0] != null) chIdx = Number(rest[0]);
        if (rest[1] != null) page = Number(rest[1]);
      }
      if (!Number.isInteger(chIdx) || chIdx < 0 || chIdx >= book.chapters.length) chIdx = 0;
      const ch = book.chapters[chIdx];
      const paras = (ch && ch.paragraphs) || [];
      if (!paras.length) return null;

      let slice, where;
      if (paraId) {
        const found = paras.find((p) => p.id === paraId);
        if (!found) return null;
        slice = [found];
        where = `${ch.title || `Chapter ${chIdx + 1}`}`;
      } else {
        const pg = Number.isInteger(page) && page >= 0 ? page : 0;
        slice = paras.slice(pg * PARAS_PER_PAGE, pg * PARAS_PER_PAGE + PARAS_PER_PAGE);
        if (!slice.length) return null;
        where = `${ch.title || `Chapter ${chIdx + 1}`} · page ${pg + 1}`;
      }
      return {
        kind: "book",
        title: book.title || s.id,
        author: book.author || null,
        year: book.year || null,
        source: where,
        text: slice.map((p) => p.text).join(" "),
      };
    }
    case "lesson": {
      const l = byId(await load(fetchJson, "lessons"), s.id);
      if (!l) return null;
      /* `text` is the lesson's literal content and 475 of the 500
         lessons have one -- that is what you would be typing, so it is
         what the card shows. The 20 foundation lessons have `keys`
         instead (their stream is generated from that set), and lessons
         20-24 have neither: adaptive review and the three
         picker-driven speed builders. Those get the title-only layout.

         The first version of this read `l.bestFor`, a field the
         lessons.js header comment documents but which NO lesson
         actually has, so 480 of 500 lesson cards came out with an
         empty panel. Verifier round 1 caught it. */
      const body = l.text || (l.keys ? `Keys: ${l.keys}` : "");
      return {
        kind: "lesson",
        title: l.title || `Lesson ${l.id}`,
        source: `Lesson ${l.id}`,
        text: body,
      };
    }
    case "challenge": {
      const c = byId(await load(fetchJson, "challenges"), s.id);
      if (!c) return null;
      const goal = c.goal ? `Target ${c.goal.wpm} wpm at ${c.goal.acc}%` : null;
      return { kind: "challenge", title: c.name || c.id, source: goal, text: c.blurb || "" };
    }
    case "drill": {
      const d = byId(await load(fetchJson, "drills"), s.id);
      if (!d) return null;
      return {
        kind: "drill",
        title: d.name || d.id,
        source: d.keys ? `Keys: ${d.keys}` : null,
        text: d.desc || "",
      };
    }
    default:
      return null;
  }
}

export default resolveSrc;
