/* Lessons page boot — marks completed lessons based on session history. */
import { getActive } from "../profiles.js";

const profile = getActive();
const sessions = profile.sessions || [];
const completed = new Set();
for (const s of sessions) {
  // Tag if the URL had ?lesson=N — but we don't store the lesson id on session.
  // Instead, treat any session over 80% accuracy with > 30 chars as "passed practice".
  if (s.acc >= 80 && s.chars >= 30) completed.add(s.id);
}

// Highlight cards based on a separate localStorage key per lesson if used in future.
const cards = document.querySelectorAll(".lesson-card");
cards.forEach((card) => {
  const id = card.dataset.lesson;
  const key = `tt:lesson-best-${id}`;
  let raw = null;
  try { raw = localStorage.getItem(key); } catch {}
  if (raw) {
    card.dataset.mastered = "true";
  }
});
