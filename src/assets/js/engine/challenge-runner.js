/* Challenge runner — converts a challenge definition into typing-engine
   options, then evaluates the goal predicate on finish. */

import { TypingEngine } from "./typing-engine.js";
import { uniformText } from "./wordpicker.js";
import { loadQuotes, pickQuote } from "./quotes.js";

export async function buildSourceText(source, opts = {}) {
  const { wordlist, pangrams, numbers } = opts;
  switch (source.type) {
    case "wordlist": {
      const list = wordlist || [];
      return uniformText(list, source.words || 60);
    }
    case "quote": {
      const quotes = await loadQuotes();
      const q = pickQuote(quotes, source.length);
      return q ? q.text : "the quick brown fox jumps over the lazy dog";
    }
    case "pangrams": {
      const list = pangrams || ["the quick brown fox jumps over the lazy dog"];
      return list[Math.floor(Math.random() * list.length)];
    }
    case "numbers": {
      const list = numbers || Array.from({ length: 100 }, (_, i) => String(i + 1));
      return uniformText(list, 50);
    }
    case "punctuation": {
      const list = ["it's", "well-being", "don't", "isn't", "they're", "we're", "couldn't", "shouldn't", "you'll", "rock-solid"];
      return uniformText(list, 30);
    }
    case "code": {
      const list = ["function", "const", "let", "return", "if", "else", "for", "while", "import", "export", "await", "async", "class", "this", "=>", "===", "!==", "&&", "||"];
      return uniformText(list, 30);
    }
    case "mountain": {
      // Escalating tier: easy → medium → hard
      const easy = wordlist?.slice(0, 200) || [];
      const med = wordlist?.slice(200, 1000) || [];
      const hard = wordlist?.slice(1000) || [];
      return [
        uniformText(easy, 20),
        uniformText(med, 30),
        uniformText(hard, 30),
      ].join(" ");
    }
    default: return "the quick brown fox jumps over the lazy dog";
  }
}

export function evaluateGoal(goal, result) {
  if (!goal) return { passed: true, reasons: [] };
  const reasons = [];
  let passed = true;
  if (goal.wpm != null && result.wpm < goal.wpm) { passed = false; reasons.push(`wpm ${Math.round(result.wpm)} < ${goal.wpm}`); }
  if (goal.acc != null && result.accuracy < goal.acc) { passed = false; reasons.push(`acc ${Math.round(result.accuracy)} < ${goal.acc}`); }
  if (goal.consistency != null && result.consistency < goal.consistency) { passed = false; reasons.push(`cons ${Math.round(result.consistency)} < ${goal.consistency}`); }
  return { passed, reasons };
}
