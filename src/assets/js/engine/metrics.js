import { stdev, mean, clamp } from "../util/stats-math.js";

const STD_WORD = 5; // chars per "word" by convention

export function netWpm(correctChars, elapsedMs) {
  if (elapsedMs <= 0) return 0;
  const min = elapsedMs / 60000;
  return (correctChars / STD_WORD) / min;
}
export function rawWpm(totalChars, elapsedMs) {
  if (elapsedMs <= 0) return 0;
  const min = elapsedMs / 60000;
  return (totalChars / STD_WORD) / min;
}
export function accuracy(correct, total) {
  if (total <= 0) return 0;
  return (correct / total) * 100;
}
export function consistency(perWordWpm) {
  if (perWordWpm.length < 2) return 100;
  const m = mean(perWordWpm);
  if (!m) return 0;
  const cv = (stdev(perWordWpm) / m) * 100;
  return clamp(100 - cv, 0, 100);
}
