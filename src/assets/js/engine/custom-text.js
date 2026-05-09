/* Custom text ingestion. Sanitizes user-supplied content and chunks it
   into ~500-char segments at sentence boundaries. */

import { read, write, KEY_CUSTOM } from "../storage.js";

const MAX_BYTES = 200 * 1024;

export function sanitize(raw) {
  let s = String(raw || "");
  // Strip script/style blocks entirely
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  // Strip remaining HTML tags
  s = s.replace(/<\/?[a-z][^>]*>/gi, "");
  // Decode common entities
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  // Normalize line endings + collapse blank-line runs
  s = s.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n");
  // Strip control chars except \t \n
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  // Trim and cap
  s = s.trim();
  if (s.length > MAX_BYTES) s = s.slice(0, MAX_BYTES);
  return s;
}

export function chunk(text, maxLen = 500) {
  const out = [];
  const re = /[.!?][”"')\]]?\s+/g;
  let last = 0, m;
  let buf = "";
  const sentences = [];
  while ((m = re.exec(text))) {
    sentences.push(text.slice(last, m.index + m[0].length).trim());
    last = m.index + m[0].length;
  }
  if (last < text.length) sentences.push(text.slice(last).trim());

  for (const s of sentences) {
    if ((buf + " " + s).trim().length > maxLen && buf) {
      out.push(buf.trim());
      buf = s;
    } else {
      buf = (buf ? buf + " " : "") + s;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

export function listSaved() {
  return read(KEY_CUSTOM, []);
}

export function saveText({ title, raw, meta }) {
  const content = sanitize(raw);
  if (!content) throw new Error("Empty after sanitization");
  const segments = chunk(content);
  const item = {
    id: "c_" + Math.random().toString(36).slice(2, 8),
    title: (title || "Untitled").slice(0, 80),
    createdAt: new Date().toISOString(),
    bytes: content.length,
    segments,
    // Optional source metadata (author, year, source/work, kind) so
    // the practice page can render an attribution header when typing
    // imported corpus items.
    meta: meta || null,
  };
  const list = listSaved();
  list.unshift(item);
  // Cap total bytes per profile to 200 KB
  let total = list.reduce((s, x) => s + x.bytes, 0);
  while (total > MAX_BYTES && list.length > 1) {
    const drop = list.pop();
    total -= drop.bytes;
  }
  write(KEY_CUSTOM, list);
  return item;
}

export function deleteSaved(id) {
  const list = listSaved().filter((x) => x.id !== id);
  write(KEY_CUSTOM, list);
}

export function getSaved(id) {
  return listSaved().find((x) => x.id === id) || null;
}

/* Pin a saved custom text as a personal lesson — appears on the
   /lessons/ page in a "Your custom lessons" section. */
export function togglePinAsLesson(id) {
  const list = listSaved();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return null;
  list[i].forLesson = !list[i].forLesson;
  write(KEY_CUSTOM, list);
  return list[i];
}

export function listLessonPinned() {
  return listSaved().filter((x) => x.forLesson);
}
