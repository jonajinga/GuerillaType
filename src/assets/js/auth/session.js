/* Cached sign-in state.

   Two jobs, and the second is the interesting one:

   1. Let the app paint immediately. Blocking first render on a network
      round-trip would make a signed-in user's page slower than a signed-
      out one, which is exactly backwards.

   2. Keep working offline. This is a local-first typing tutor with a
      service worker -- it works on a plane. A signed-in user who loses
      the network must not be silently signed out, so a verified session
      stays trusted for a grace window and revalidates in the background
      whenever it can.

   Note this is the ONE place the app stores anything auth-related, and it
   holds NO token -- only a display profile and two timestamps. The actual
   session lives in an HttpOnly cookie that JavaScript cannot read. */

const KEY = "tt:session.v1";

// How long a previously-verified session keeps working with no network.
const GRACE_MS = 14 * 24 * 60 * 60 * 1000;

export function readSession() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.user ? s : null;
  } catch { return null; }
}

export function writeSession(user, expiresAt) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      user, expiresAt: expiresAt || null, lastVerifiedAt: new Date().toISOString(),
    }));
  } catch {}
}

export function clearSession() {
  try { localStorage.removeItem(KEY); } catch {}
}

export const isExpired = (s) =>
  !!(s && s.expiresAt && Date.parse(s.expiresAt) <= Date.now());

export function isWithinGrace(s) {
  if (!s || !s.lastVerifiedAt) return false;
  return Date.now() - Date.parse(s.lastVerifiedAt) < GRACE_MS;
}

export function graceDaysRemaining(s) {
  if (!s || !s.lastVerifiedAt) return 0;
  const left = GRACE_MS - (Date.now() - Date.parse(s.lastVerifiedAt));
  return Math.max(0, Math.ceil(left / 86400000));
}

/* What the app should do on boot, decided without ever blocking paint.

     "signed-out"  render as anonymous (which is a full experience here --
                   sign-in is optional, not a wall)
     "signed-in"   paint now; caller should revalidate in the background
     "verify"      cache is past grace, so confirm before trusting it */
export function resolveStartup(session = readSession()) {
  if (!session) return { state: "signed-out" };
  if (isExpired(session)) return { state: "signed-out", reason: "expired" };
  if (isWithinGrace(session)) return { state: "signed-in", session, revalidate: true };
  return { state: "verify", session };
}
