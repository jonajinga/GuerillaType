export const fmtInt = (n) => Number.isFinite(n) ? Math.round(n).toLocaleString() : "0";
export const fmtDec = (n, d = 1) => Number.isFinite(n) ? n.toFixed(d) : (0).toFixed(d);
export const fmtPct = (n, d = 0) => `${fmtDec(n, d)}%`;
export const fmtMs = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
};
export const fmtDuration = (sec) => {
  const s = Math.floor(sec || 0);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
};
export const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch { return iso; }
};
/* "YYYY-MM-DD" in the user's LOCAL timezone. We previously used
   `new Date().toISOString().slice(0, 10)` which returns the UTC date,
   so a session typed at 9 PM on Dec 31 EST landed under Jan 1 UTC --
   shifting the user's daily streak / contribution grid forward by a
   day. Using local components fixes that.
   The output format is unchanged ("YYYY-MM-DD") so existing data
   files keyed under UTC dates still display in the contribution grid;
   they'll just appear on the LOCAL day they happen to match. */
export const todayIso = () => localDayIso(new Date());
export function localDayIso(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
/* "YYYY-MM-DDTHH" in the user's local timezone -- used for the
   hourly contribution drill-down so a session at 11 PM local doesn't
   show up in the next-day's 4 AM column. */
export function localHourKey(d = new Date()) {
  return `${localDayIso(d)}T${String(d.getHours()).padStart(2, "0")}`;
}
