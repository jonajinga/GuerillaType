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

export function pickQuote(quotes, b, tag, excludeId) {
  // "random" is a non-bucket selector that means "any quote, picked
  // uniformly at random across the full corpus". Falls through to the
  // un-filtered branch below. Without this, "random" gets passed to
  // filterByBucket as if it were a length bucket and matches nothing,
  // returning null and breaking the daily-quote -> Next-quote flow.
  const isBucket = b && b !== "random";
  let list = isBucket ? filterByBucket(quotes, b) : quotes;
  if (tag) list = list.filter((q) => Array.isArray(q.tags) && q.tags.includes(tag));
  if (!list.length) {
    // Fall back to bucket-only if the tag filter wiped everything.
    list = isBucket ? filterByBucket(quotes, b) : quotes;
  }
  if (!list.length) return null;
  // Exclude the previously-served quote so "Next test" produces a
  // different one. Only when the pool has more than one candidate;
  // otherwise we'd hand back null.
  if (excludeId && list.length > 1) {
    const filtered = list.filter((q) => q.id !== excludeId);
    if (filtered.length) list = filtered;
  }
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
