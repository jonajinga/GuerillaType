/* Populate "Best:" labels from profile.challengeBests. */
import { getActive } from "../profiles.js";
const p = getActive();
const bests = p.challengeBests || {};
document.querySelectorAll("[data-best]").forEach((el) => {
  const id = el.dataset.best;
  const b = bests[id];
  if (b) el.textContent = `Best: ${Math.round(b.wpm)} wpm · ${Math.round(b.acc)}%`;
});
