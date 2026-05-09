/* Quote loader. Loads /assets/data/quotes.json once; filters by length bucket. */

let _quotes = null;

export async function loadQuotes() {
  if (_quotes) return _quotes;
  const res = await fetch("/data/quotes.json", { cache: "default" });
  if (!res.ok) throw new Error("Failed to load quotes");
  _quotes = await res.json();
  return _quotes;
}

export function bucket(quote) {
  const n = quote.text.length;
  if (n < 80) return "short";
  if (n < 200) return "medium";
  return "long";
}

export function filterByBucket(quotes, b) {
  return quotes.filter((q) => bucket(q) === b);
}

/* Defensive normalization: trim whitespace, force the first letter
   uppercase. Some imported quotes start lowercase or have leading
   spaces — looks unfinished in the UI. Returns a new object. */
function normalize(q) {
  if (!q || !q.text) return q;
  let t = String(q.text).replace(/^\s+/, "");
  t = t.replace(/^([a-z])/, (m) => m.toUpperCase());
  return t === q.text ? q : { ...q, text: t };
}

export function pickQuote(quotes, b) {
  const list = b ? filterByBucket(quotes, b) : quotes;
  if (!list.length) return null;
  return normalize(list[Math.floor(Math.random() * list.length)]);
}

/* Date-stable quote: every visitor sees the same quote on the same day,
   and rotates daily across the full quote list. UTC day-index avoids
   timezone drift. */
export function dailyQuote(quotes) {
  if (!quotes || !quotes.length) return null;
  const day = Math.floor(Date.now() / 86400000);
  return normalize(quotes[day % quotes.length]);
}
