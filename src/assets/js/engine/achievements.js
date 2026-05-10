/* Achievements catalog and evaluator. Each achievement is a pure
   predicate against a profile snapshot. evaluate() returns the IDs that
   are now unlocked but weren't before, so callers can fire celebration
   toasts. */

const minutes = (p) => Math.floor((p.lifetime?.totalMs || 0) / 60_000);
const sessions = (p) => p.lifetime?.sessions || 0;
const chars = (p) => p.lifetime?.chars || 0;
const correct = (p) => p.lifetime?.correctChars || 0;
const bestWpm = (p) => p.lifetime?.bestWpm || 0;
const bestAcc = (p) => p.lifetime?.bestAccuracy || 0;
const streak = (p) => p.lifetime?.streakDays || 0;
const langs = (p) => new Set((p.sessions || []).map((s) => s.lang).filter(Boolean));
const modeBests = (p) => p.modeBests || {};
const challengesWon = (p) => Object.keys(p.challengeBests || {}).length;
const lessonClears = () => {
  let n = 0;
  try { for (let i = 1; i <= 24; i++) if (localStorage.getItem(`tt:lesson-best-${i}`)) n++; } catch {}
  return n;
};

export const ACHIEVEMENTS = [
  // ── First steps ─────────────────────────────────────────────
  { id: "first-session", name: "First keystroke", desc: "Complete your first session.", group: "First steps",
    test: (p) => sessions(p) >= 1 },
  { id: "first-1k-chars", name: "First thousand", desc: "Type 1,000 characters total.", group: "First steps",
    test: (p) => chars(p) >= 1000 },
  { id: "ten-k-chars", name: "Ten thousand", desc: "Type 10,000 characters total.", group: "First steps",
    test: (p) => chars(p) >= 10000 },
  { id: "fifty-k-chars", name: "Fifty thousand", desc: "Type 50,000 characters total.", group: "First steps",
    test: (p) => chars(p) >= 50000 },
  { id: "hundred-k-chars", name: "Six-figure typist", desc: "Type 100,000 characters total.", group: "First steps",
    test: (p) => chars(p) >= 100000 },
  { id: "half-million-chars", name: "Half a million", desc: "Type 500,000 characters total.", group: "First steps",
    test: (p) => chars(p) >= 500000 },
  { id: "million-chars", name: "Millionaire", desc: "Type 1,000,000 characters total.", group: "First steps",
    test: (p) => chars(p) >= 1000000 },

  // ── Speed ──────────────────────────────────────────────────
  { id: "wpm-20", name: "Above water", desc: "Hit 20 wpm in any session.", group: "Speed",
    test: (p) => bestWpm(p) >= 20 },
  { id: "wpm-30", name: "Crossing 30", desc: "Hit 30 wpm in any session.", group: "Speed",
    test: (p) => bestWpm(p) >= 30 },
  { id: "wpm-40", name: "Faster than handwriting", desc: "Hit 40 wpm in any session.", group: "Speed",
    test: (p) => bestWpm(p) >= 40 },
  { id: "wpm-50", name: "50 wpm", desc: "Hit 50 wpm in any session.", group: "Speed",
    test: (p) => bestWpm(p) >= 50 },
  { id: "wpm-60", name: "Above average", desc: "Hit 60 wpm — comfortable typing.", group: "Speed",
    test: (p) => bestWpm(p) >= 60 },
  { id: "wpm-70", name: "70 wpm", desc: "Hit 70 wpm in any session.", group: "Speed",
    test: (p) => bestWpm(p) >= 70 },
  { id: "wpm-80", name: "80 wpm", desc: "Hit 80 wpm — professional pace.", group: "Speed",
    test: (p) => bestWpm(p) >= 80 },
  { id: "wpm-90", name: "90 wpm", desc: "Hit 90 wpm in any session.", group: "Speed",
    test: (p) => bestWpm(p) >= 90 },
  { id: "wpm-100", name: "Triple digits", desc: "Hit 100 wpm in any session.", group: "Speed",
    test: (p) => bestWpm(p) >= 100 },
  { id: "wpm-120", name: "120 wpm", desc: "Sustained 120 wpm. Welcome to the upper deck.", group: "Speed",
    test: (p) => bestWpm(p) >= 120 },
  { id: "wpm-140", name: "Sonic speed", desc: "Hit 140 wpm. Few people get here.", group: "Speed",
    test: (p) => bestWpm(p) >= 140 },
  { id: "wpm-160", name: "Lightning", desc: "Hit 160 wpm. World-class territory.", group: "Speed",
    test: (p) => bestWpm(p) >= 160 },

  // ── Accuracy ───────────────────────────────────────────────
  { id: "acc-90", name: "Reliable", desc: "Reach 90% accuracy in any session.", group: "Accuracy",
    test: (p) => bestAcc(p) >= 90 },
  { id: "acc-95", name: "Steady hand", desc: "Reach 95% accuracy in any session.", group: "Accuracy",
    test: (p) => bestAcc(p) >= 95 },
  { id: "acc-98", name: "Surgical", desc: "Reach 98% accuracy in any session.", group: "Accuracy",
    test: (p) => bestAcc(p) >= 98 },
  { id: "acc-100", name: "Perfect run", desc: "Finish a session at 100% accuracy.", group: "Accuracy",
    test: (p) => bestAcc(p) >= 100 },
  { id: "acc-100-long", name: "Spotless marathon", desc: "100% accuracy in a session ≥ 100 words.", group: "Accuracy",
    test: (p) => (p.sessions || []).some((s) => s.acc >= 100 && s.chars >= 500),
    requires: (s) => s.acc >= 100 && s.chars >= 500 },

  // ── Volume ─────────────────────────────────────────────────
  { id: "sessions-5", name: "Getting going", desc: "Complete five sessions.", group: "Volume",
    test: (p) => sessions(p) >= 5 },
  { id: "sessions-10", name: "Ten sessions", desc: "Complete ten sessions.", group: "Volume",
    test: (p) => sessions(p) >= 10 },
  { id: "sessions-25", name: "Twenty-five sessions", desc: "Complete twenty-five sessions.", group: "Volume",
    test: (p) => sessions(p) >= 25 },
  { id: "sessions-50", name: "Fifty sessions", desc: "Complete fifty sessions.", group: "Volume",
    test: (p) => sessions(p) >= 50 },
  { id: "sessions-100", name: "Centurion", desc: "Complete one hundred sessions.", group: "Volume",
    test: (p) => sessions(p) >= 100 },
  { id: "sessions-200", name: "Two hundred", desc: "Complete two hundred sessions.", group: "Volume",
    test: (p) => sessions(p) >= 200 },
  { id: "sessions-500", name: "Dedicated", desc: "Complete five hundred sessions.", group: "Volume",
    test: (p) => sessions(p) >= 500 },

  // ── Time invested ──────────────────────────────────────────
  { id: "time-30min", name: "Half hour", desc: "Type for 30 minutes total.", group: "Time invested",
    test: (p) => minutes(p) >= 30 },
  { id: "time-2h", name: "Two hours in", desc: "Type for 2 hours total.", group: "Time invested",
    test: (p) => minutes(p) >= 120 },
  { id: "time-10h", name: "Ten hours", desc: "Type for 10 hours total.", group: "Time invested",
    test: (p) => minutes(p) >= 600 },
  { id: "time-50h", name: "Fifty hours", desc: "Type for 50 hours total. Real practice.", group: "Time invested",
    test: (p) => minutes(p) >= 3000 },

  // ── Streaks ────────────────────────────────────────────────
  { id: "streak-2", name: "Day two", desc: "Practice on two consecutive days.", group: "Streaks",
    test: (p) => streak(p) >= 2 },
  { id: "streak-3", name: "Three-day streak", desc: "Practice on three consecutive days.", group: "Streaks",
    test: (p) => streak(p) >= 3 },
  { id: "streak-7", name: "One-week streak", desc: "Practice on seven consecutive days.", group: "Streaks",
    test: (p) => streak(p) >= 7 },
  { id: "streak-14", name: "Two-week streak", desc: "Practice on fourteen consecutive days.", group: "Streaks",
    test: (p) => streak(p) >= 14 },
  { id: "streak-30", name: "Month streak", desc: "Thirty consecutive days. The keyboard is part of you now.", group: "Streaks",
    test: (p) => streak(p) >= 30 },
  { id: "streak-60", name: "Two-month streak", desc: "Sixty consecutive days.", group: "Streaks",
    test: (p) => streak(p) >= 60 },
  { id: "streak-100", name: "Hundred-day streak", desc: "One hundred consecutive days.", group: "Streaks",
    test: (p) => streak(p) >= 100 },

  // ── Lessons ────────────────────────────────────────────────
  { id: "lesson-first", name: "First lesson", desc: "Clear lesson 1.", group: "Lessons",
    test: () => { try { return !!localStorage.getItem("tt:lesson-best-1"); } catch { return false; } } },
  { id: "lesson-stage-1", name: "Home row complete", desc: "Clear all home-row lessons (1–7).", group: "Lessons",
    test: () => {
      try { for (let i = 1; i <= 7; i++) if (!localStorage.getItem(`tt:lesson-best-${i}`)) return false; return true; }
      catch { return false; }
    } },
  { id: "lesson-half", name: "Halfway through", desc: "Clear 12 lessons.", group: "Lessons",
    test: () => lessonClears() >= 12 },
  { id: "lesson-graduate", name: "Lesson graduate", desc: "Clear a final-stage lesson (20+).", group: "Lessons",
    test: () => {
      try { for (let i = 20; i <= 24; i++) if (localStorage.getItem(`tt:lesson-best-${i}`)) return true; }
      catch {}
      return false;
    } },
  { id: "lesson-all", name: "Curriculum complete", desc: "Clear all 80 lessons.", group: "Lessons",
    test: () => lessonClears() >= 80 },

  // ── Modes & languages ──────────────────────────────────────
  { id: "polyglot", name: "Polyglot", desc: "Practice in three or more languages.", group: "Modes",
    test: (p) => langs(p).size >= 3 },
  { id: "five-modes", name: "Mode explorer", desc: "Use five different modes.", group: "Modes",
    test: (p) => new Set((p.sessions || []).map((s) => s.mode)).size >= 5 },
  { id: "code-mode-50", name: "Code monkey", desc: "Hit 50 wpm in code mode.", group: "Modes",
    test: (p) => (p.sessions || []).some((s) => /code/.test(s.lang || "") && s.wpm >= 50) },
  { id: "code-mode-80", name: "Code maestro", desc: "Hit 80 wpm in code mode.", group: "Modes",
    test: (p) => (p.sessions || []).some((s) => /code/.test(s.lang || "") && s.wpm >= 80) },
  { id: "numbers-master", name: "Numbers master", desc: "Hit 50 wpm on the numbers gauntlet.", group: "Modes",
    test: (p) => (p.sessions || []).some((s) => /numbers/.test(s.lang || "") && s.wpm >= 50) },
  { id: "punctuation-master", name: "Punctuation master", desc: "Hit 60 wpm on the punctuation gauntlet.", group: "Modes",
    test: (p) => (p.sessions || []).some((s) => /punctuation/.test(s.lang || "") && s.wpm >= 60) },
  { id: "zen-1k", name: "Zen mile", desc: "Type 1,000 characters in a single zen session.", group: "Modes",
    test: (p) => (p.sessions || []).some((s) => s.mode === "zen" && s.chars >= 1000) },

  // ── Challenges ─────────────────────────────────────────────
  { id: "challenge-first", name: "Challenge victor", desc: "Beat any challenge's goal.", group: "Challenges",
    test: (p) => challengesWon(p) >= 1 },
  { id: "challenge-five", name: "Five challenges down", desc: "Beat five different challenges.", group: "Challenges",
    test: (p) => challengesWon(p) >= 5 },
  { id: "challenge-all", name: "Challenge sweep", desc: "Beat every challenge.", group: "Challenges",
    test: (p) => challengesWon(p) >= 11 },

  // ── Personal-best moments ──────────────────────────────────
  { id: "pr-time-30", name: "30-second PR", desc: "Set a personal best at the 30-second test.", group: "Bests",
    test: (p) => !!modeBests(p)["time:30"] },
  { id: "pr-time-60", name: "Minute PR", desc: "Set a personal best at the 60-second test.", group: "Bests",
    test: (p) => !!modeBests(p)["time:60"] },
  { id: "pr-time-300", name: "Five-minute PR", desc: "Set a personal best at the 5-minute test.", group: "Bests",
    test: (p) => !!modeBests(p)["time:300"] },
  { id: "pr-words-25", name: "25-word PR", desc: "Set a personal best at 25 words.", group: "Bests",
    test: (p) => !!modeBests(p)["words:25"] },
  { id: "pr-words-100", name: "100-word PR", desc: "Set a personal best at 100 words.", group: "Bests",
    test: (p) => !!modeBests(p)["words:100"] },
  { id: "all-time-prs", name: "Time-mode collector", desc: "Set a personal best at every time duration.", group: "Bests",
    test: (p) => ["time:15","time:30","time:60","time:120","time:300"].every((k) => !!modeBests(p)[k]) },

  // ── Special / hidden ───────────────────────────────────────
  { id: "comeback", name: "Comeback", desc: "Practice again after a 7+ day gap.", group: "Special",
    test: (p) => {
      const days = (p.sessions || []).map((s) => s.at).filter(Boolean).sort();
      if (days.length < 2) return false;
      for (let i = 1; i < days.length; i++) {
        const a = new Date(days[i - 1]).getTime();
        const b = new Date(days[i]).getTime();
        if (b - a > 7 * 86400000) return true;
      }
      return false;
    } },
  { id: "consistency-90", name: "Metronome", desc: "Hit 90% consistency in any session.", group: "Special",
    test: (p) => (p.sessions || []).some((s) => s.cons >= 90) },
  { id: "consistency-95", name: "Tempo lord", desc: "Hit 95% consistency in any session.", group: "Special",
    test: (p) => (p.sessions || []).some((s) => s.cons >= 95) },
  { id: "custom-text", name: "Bring your own", desc: "Type a custom-text session.", group: "Special",
    test: (p) => (p.sessions || []).some((s) => s.mode === "custom") },
  { id: "library-reader", name: "Library reader", desc: "Type a passage from the public-domain library.", group: "Special",
    test: () => { try { return JSON.parse(localStorage.getItem("tt:custom-texts") || "[]").some((t) => /passage/.test(t.title || "")); } catch { return false; } } },
  // (night-owl + early-bird previously here; canonical entries with
  // requires-hooks live in the Time of day group below.)
  { id: "speed-and-acc", name: "Speed and grace", desc: "Hit 80 wpm at 98% accuracy in the same session.", group: "Special",
    test: (p) => (p.sessions || []).some((s) => s.wpm >= 80 && s.acc >= 98),
    requires: (s) => s.wpm >= 80 && s.acc >= 98 },
  { id: "epic-quote", name: "Epic-quote tamer", desc: "Type a epic-length quote (500+ chars).", group: "Special",
    test: (p) => (p.sessions || []).some((s) => s.mode === "quote" && s.chars >= 500),
    requires: (s) => s.mode === "quote" && s.chars >= 500 },
  { id: "quote-collector", name: "Quote collector", desc: "Build a collection with at least 5 quotes.", group: "Special",
    test: () => { try { return (JSON.parse(localStorage.getItem("tt:collections") || "[]")).some((c) => (c.ids || []).length >= 5); } catch { return false; } } },

  // ── Phase 4.3 — additional achievement set ─────────────────────
  // Speed milestones (every 5 wpm)
  { id: "wpm-35", name: "Climbing — 35 wpm", desc: "Hit 35 wpm in any session.", group: "Speed", test: (p) => (p.lifetime?.bestWpm || 0) >= 35 },
  { id: "wpm-45", name: "Building speed — 45 wpm", desc: "Hit 45 wpm in any session.", group: "Speed", test: (p) => (p.lifetime?.bestWpm || 0) >= 45 },
  { id: "wpm-55", name: "Cruising — 55 wpm", desc: "Hit 55 wpm in any session.", group: "Speed", test: (p) => (p.lifetime?.bestWpm || 0) >= 55 },
  { id: "wpm-65", name: "Highway — 65 wpm", desc: "Hit 65 wpm in any session.", group: "Speed", test: (p) => (p.lifetime?.bestWpm || 0) >= 65 },
  { id: "wpm-75", name: "Sprint — 75 wpm", desc: "Hit 75 wpm in any session.", group: "Speed", test: (p) => (p.lifetime?.bestWpm || 0) >= 75 },
  { id: "wpm-85", name: "Above average — 85 wpm", desc: "Hit 85 wpm in any session.", group: "Speed", test: (p) => (p.lifetime?.bestWpm || 0) >= 85 },
  { id: "wpm-95", name: "Fast — 95 wpm", desc: "Hit 95 wpm in any session.", group: "Speed", test: (p) => (p.lifetime?.bestWpm || 0) >= 95 },
  { id: "wpm-110", name: "Very fast — 110 wpm", desc: "Hit 110 wpm in any session.", group: "Speed", test: (p) => (p.lifetime?.bestWpm || 0) >= 110 },
  { id: "wpm-130", name: "Blazing — 130 wpm", desc: "Hit 130 wpm in any session.", group: "Speed", test: (p) => (p.lifetime?.bestWpm || 0) >= 130 },
  { id: "wpm-150", name: "Inhuman — 150 wpm", desc: "Hit 150 wpm in any session.", group: "Speed", test: (p) => (p.lifetime?.bestWpm || 0) >= 150 },

  // Volume milestones
  { id: "vol-1k", name: "1,000 chars typed", desc: "Cumulative 1,000 keystrokes.", group: "Volume", test: (p) => (p.lifetime?.chars || 0) >= 1000 },
  { id: "vol-10k", name: "10,000 chars typed", desc: "Cumulative 10,000 keystrokes.", group: "Volume", test: (p) => (p.lifetime?.chars || 0) >= 10000 },
  { id: "vol-100k", name: "100,000 chars typed", desc: "Cumulative 100,000 keystrokes.", group: "Volume", test: (p) => (p.lifetime?.chars || 0) >= 100000 },
  { id: "vol-1m", name: "Million-char milestone", desc: "One million characters in your lifetime.", group: "Volume", test: (p) => (p.lifetime?.chars || 0) >= 1_000_000 },

  // Accuracy
  { id: "acc-99", name: "Three-nines — 99%", desc: "Finish a session at 99%+ accuracy.", group: "Accuracy",
    test: (p) => (p.sessions || []).some((s) => s.acc >= 99),
    requires: (s) => s.acc >= 99 },
  { id: "acc-995", name: "Surgical — 99.5%", desc: "Finish a session at 99.5%+ accuracy.", group: "Accuracy",
    test: (p) => (p.sessions || []).some((s) => s.acc >= 99.5),
    requires: (s) => s.acc >= 99.5 },

  // Streak milestones beyond the basic set above. (streak-30/60/100
   // were duplicated here previously -- removed; they live in the
   // original Streaks block.)
  { id: "streak-365", name: "Year of practice", desc: "Maintain a 365-day streak.", group: "Streaks",
    test: (p) => (p.lifetime?.streakDays || 0) >= 365 },

  // (Time-of-day, endurance, and variety achievements moved into the
  // Phase 4.3 expansion block below where they have proper `requires`
  // hooks so the celebration toast doesn't fire retroactively on
  // unrelated sessions.)

  // Recovery -- celebration only fires on the comeback session.
  { id: "recover-bad-session", name: "Comeback", desc: "Recover from an accuracy ≤ 60% session by hitting 95%+ within 3 sessions.", group: "Recovery",
    test: (p) => {
      const s = p.sessions || [];
      for (let i = 0; i < s.length - 1; i++) {
        if (s[i].acc <= 60) {
          for (let j = i + 1; j < Math.min(s.length, i + 4); j++) if (s[j].acc >= 95) return true;
        }
      }
      return false;
    },
    // The session list is unshifted (newest first), so the current
    // session is at index 0. Comeback fires when the current session
    // is the high-accuracy follow-up to a recent bad-accuracy run.
    requires: (s, p) => {
      if ((s.acc || 0) < 95) return false;
      const arr = p.sessions || [];
      // Look at the next 3 entries (index 1..3, i.e., the 3 sessions
      // before this one in time) for a ≤60% acc session.
      for (let i = 1; i <= 3 && i < arr.length; i++) {
        if ((arr[i].acc || 0) <= 60) return true;
      }
      return false;
    } },

  // Lessons
  { id: "lesson-3-passed", name: "Three down", desc: "Pass 3 lessons.", group: "Lessons",
    test: (p) => new Set((p.lessonResults || []).filter((r) => r.passed).map((r) => r.lessonId)).size >= 3 },
  { id: "lesson-10-passed", name: "Ten down", desc: "Pass 10 lessons.", group: "Lessons",
    test: (p) => new Set((p.lessonResults || []).filter((r) => r.passed).map((r) => r.lessonId)).size >= 10 },
  { id: "lesson-25-passed", name: "Quarter way", desc: "Pass 25 lessons.", group: "Lessons",
    test: (p) => new Set((p.lessonResults || []).filter((r) => r.passed).map((r) => r.lessonId)).size >= 25 },
  { id: "lesson-50-passed", name: "Halfway there", desc: "Pass 50 lessons.", group: "Lessons",
    test: (p) => new Set((p.lessonResults || []).filter((r) => r.passed).map((r) => r.lessonId)).size >= 50 },

  // Easter eggs -- celebrate only when the CURRENT session is the
  // qualifier. Without `requires`, these fire on whatever session
  // the catalog first sees a matching prior session, even if THIS
  // session was unrelated.
  { id: "fox-pangram", name: "Quick brown fox", desc: "Type a complete pangram (every letter A–Z).", group: "Special", secret: true,
    test: (p) => (p.sessions || []).some((s) => {
      const t = (s.target || "").toLowerCase();
      const letters = new Set(t.replace(/[^a-z]/g, ""));
      return letters.size === 26;
    }),
    requires: (s) => {
      const t = (s.target || "").toLowerCase();
      return new Set(t.replace(/[^a-z]/g, "")).size === 26;
    } },
  { id: "no-mistakes", name: "Untouchable", desc: "Finish a 100+ char session with zero errors.", group: "Special", secret: true,
    test: (p) => (p.sessions || []).some((s) => s.errors === 0 && s.chars >= 100),
    requires: (s) => s.errors === 0 && s.chars >= 100 },

  // ── Phase 4.3 expansion -- bringing total to ~120 ─────────────
  // Each of these has a `requires(session)` hook so the celebration
  // toast only fires when the CURRENT session is the qualifier --
  // otherwise newly-added or grandfathered achievements would all
  // pop on the next unrelated session.
  //
  // Time-of-day. Use local time on the actual session that just
  // finished; profile-level `test` still passes if any prior session
  // matches (so the achievement appears unlocked retroactively in
  // the grid), but the toast only fires when THIS session matched.
  { id: "early-bird", name: "Early bird", desc: "Finish a session before 7 AM local time.", group: "Time of day",
    test: (p) => (p.sessions || []).some((s) => {
      const d = new Date(s.at); return !isNaN(d) && d.getHours() < 7;
    }),
    requires: (s) => { const d = new Date(s.at); return !isNaN(d) && d.getHours() < 7; } },
  { id: "night-owl", name: "Night owl", desc: "Finish a session after midnight (between 12 AM and 4 AM).", group: "Time of day",
    test: (p) => (p.sessions || []).some((s) => {
      const d = new Date(s.at); const h = d.getHours();
      return !isNaN(d) && h >= 0 && h < 4;
    }),
    requires: (s) => { const d = new Date(s.at); const h = d.getHours(); return !isNaN(d) && h >= 0 && h < 4; } },
  { id: "lunch-break", name: "Lunch break", desc: "Finish a session between noon and 1 PM.", group: "Time of day",
    test: (p) => (p.sessions || []).some((s) => {
      const d = new Date(s.at); const h = d.getHours();
      return !isNaN(d) && h === 12;
    }),
    requires: (s) => { const d = new Date(s.at); return !isNaN(d) && d.getHours() === 12; } },
  { id: "weekend-warrior", name: "Weekend warrior", desc: "Type at least one session on a Saturday and one on a Sunday.", group: "Time of day",
    test: (p) => {
      const days = new Set((p.sessions || []).map((s) => {
        const d = new Date(s.at); return isNaN(d) ? -1 : d.getDay();
      }));
      return days.has(0) && days.has(6);
    },
    // Only celebrate on the session that completed the pair (Sat or Sun).
    requires: (s) => { const d = new Date(s.at); const dy = d.getDay(); return dy === 0 || dy === 6; } },

  // Endurance: a single long session without bail. Celebrate only on
  // the session that crosses the threshold for the first time.
  { id: "endurance-5", name: "Five-minute mile", desc: "Complete a single session lasting 5 minutes.", group: "Endurance",
    test: (p) => (p.sessions || []).some((s) => (s.duration || 0) >= 300),
    requires: (s) => (s.duration || 0) >= 300 },
  { id: "endurance-15", name: "Quarter hour", desc: "Complete a single session lasting 15 minutes.", group: "Endurance",
    test: (p) => (p.sessions || []).some((s) => (s.duration || 0) >= 900),
    requires: (s) => (s.duration || 0) >= 900 },
  { id: "endurance-30", name: "Half hour", desc: "Complete a single session lasting 30 minutes.", group: "Endurance",
    test: (p) => (p.sessions || []).some((s) => (s.duration || 0) >= 1800),
    requires: (s) => (s.duration || 0) >= 1800 },

  // Missed-words mastery. "Cleaning house" now uses the persistent
  // missedWordsPeak counter (recorded in session-recorder) so it
  // can't fire from a profile that never grew the list above 25.
  { id: "missed-curated", name: "Self-aware", desc: "Track at least 25 different missed words.", group: "Practice",
    test: (p) => Object.keys(p.missedWords || {}).length >= 25 },
  { id: "missed-cleared", name: "Cleaning house", desc: "Reduce your missed-words list below 10 after it grew above 25.", group: "Practice",
    secret: true,
    test: (p) => {
      const cur = Object.keys(p.missedWords || {}).length;
      const peak = p.missedWordsPeak || 0;
      return peak >= 25 && cur < 10;
    } },

  // Library reading. All three require the current session to be a
  // book session so they don't fire during unrelated drills.
  { id: "library-first-paragraph", name: "First paragraph", desc: "Type your first paragraph from a public-domain book.", group: "Library",
    test: (p) => {
      const bp = p.bookProgress || {};
      return Object.values(bp).some((b) => b.typed && Object.keys(b.typed).length > 0);
    },
    requires: (s) => s.mode === "book" },
  { id: "library-first-chapter", name: "Chapter complete", desc: "Type at least 10 paragraphs in a single book.", group: "Library",
    test: (p) => Object.values(p.bookProgress || {}).some((b) => b.typed && Object.keys(b.typed).length >= 10),
    requires: (s) => s.mode === "book" },
  { id: "library-bookworm", name: "Bookworm", desc: "Have typed paragraphs across 5 different books.", group: "Library",
    test: (p) => Object.values(p.bookProgress || {}).filter((b) => b.typed && Object.keys(b.typed).length > 0).length >= 5,
    requires: (s) => s.mode === "book" },

  // Variety. The "Sampler" achievement naturally only triggers when
  // the user JUST completed the missing mode -- the requires hook
  // confirms the current session adds to the set.
  { id: "variety-modes", name: "Sampler", desc: "Try all six modes: time, words, quote, zen, custom, adaptive.", group: "Variety",
    test: (p) => {
      const used = new Set((p.sessions || []).map((s) => s.mode));
      return ["time", "words", "quote", "zen", "custom", "adaptive"].every((m) => used.has(m));
    },
    requires: (s) => ["time", "words", "quote", "zen", "custom", "adaptive"].includes(s.mode) },
  { id: "variety-langs", name: "Polyglot typist", desc: "Practice from 10 different word lists.", group: "Variety",
    test: (p) => langs(p).size >= 10,
    requires: (s) => !!s.lang },

  // Easter eggs / specials -- celebrate only on the qualifying session.
  { id: "alphabet-word", name: "Whole alphabet", desc: "Type the whole alphabet a-z in a single session's target.", group: "Special", secret: true,
    test: (p) => (p.sessions || []).some((s) => /a.*b.*c.*d.*e.*f.*g.*h.*i.*j.*k.*l.*m.*n.*o.*p.*q.*r.*s.*t.*u.*v.*w.*x.*y.*z/i.test(s.target || "")),
    requires: (s) => /a.*b.*c.*d.*e.*f.*g.*h.*i.*j.*k.*l.*m.*n.*o.*p.*q.*r.*s.*t.*u.*v.*w.*x.*y.*z/i.test(s.target || "") },
  { id: "speed-300-chars", name: "Sprint demon", desc: "Hit 100 wpm on a session of 300+ characters.", group: "Speed",
    test: (p) => (p.sessions || []).some((s) => (s.wpm || 0) >= 100 && (s.chars || 0) >= 300),
    requires: (s) => (s.wpm || 0) >= 100 && (s.chars || 0) >= 300 },

  // ── Speed milestones (5-wpm increments)
  { id: "wpm-25", name: "25 wpm",  desc: "Hit 25 wpm.",  group: "Speed", test: (p) => bestWpm(p) >= 25 },
  { id: "wpm-35", name: "35 wpm",  desc: "Hit 35 wpm.",  group: "Speed", test: (p) => bestWpm(p) >= 35 },
  { id: "wpm-45", name: "45 wpm",  desc: "Hit 45 wpm.",  group: "Speed", test: (p) => bestWpm(p) >= 45 },
  { id: "wpm-55", name: "55 wpm",  desc: "Hit 55 wpm.",  group: "Speed", test: (p) => bestWpm(p) >= 55 },
  { id: "wpm-65", name: "65 wpm",  desc: "Hit 65 wpm.",  group: "Speed", test: (p) => bestWpm(p) >= 65 },
  { id: "wpm-75", name: "75 wpm",  desc: "Hit 75 wpm.",  group: "Speed", test: (p) => bestWpm(p) >= 75 },
  { id: "wpm-85", name: "85 wpm",  desc: "Hit 85 wpm.",  group: "Speed", test: (p) => bestWpm(p) >= 85 },
  { id: "wpm-95", name: "95 wpm",  desc: "Hit 95 wpm.",  group: "Speed", test: (p) => bestWpm(p) >= 95 },
  { id: "wpm-110", name: "110 wpm", desc: "Hit 110 wpm.", group: "Speed", test: (p) => bestWpm(p) >= 110 },
  { id: "wpm-130", name: "130 wpm", desc: "Hit 130 wpm. World-class territory.", group: "Speed", test: (p) => bestWpm(p) >= 130 },
  { id: "wpm-150", name: "150 wpm", desc: "Hit 150 wpm. Elite tier.", group: "Speed", test: (p) => bestWpm(p) >= 150 },
  { id: "wpm-170", name: "Mach 1",  desc: "Hit 170 wpm. Almost too fast to read.", group: "Speed", test: (p) => bestWpm(p) >= 170 },
  { id: "wpm-180", name: "180 wpm", desc: "Hit 180 wpm. Record-book territory.", group: "Speed", test: (p) => bestWpm(p) >= 180 },
  { id: "wpm-200", name: "Two hundred",  desc: "Hit 200 wpm. The ceiling.", group: "Speed", test: (p) => bestWpm(p) >= 200 },

  // ── Sustained-speed milestones (require N+ chars for credit)
  { id: "sustain-60-500", name: "Sustained 60", desc: "60 wpm on a 500+ char session.", group: "Speed",
    test: (p) => (p.sessions || []).some((s) => (s.wpm || 0) >= 60 && (s.chars || 0) >= 500),
    requires: (s) => (s.wpm || 0) >= 60 && (s.chars || 0) >= 500 },
  { id: "sustain-80-500", name: "Sustained 80", desc: "80 wpm on a 500+ char session.", group: "Speed",
    test: (p) => (p.sessions || []).some((s) => (s.wpm || 0) >= 80 && (s.chars || 0) >= 500),
    requires: (s) => (s.wpm || 0) >= 80 && (s.chars || 0) >= 500 },
  { id: "sustain-100-1000", name: "Sustained 100", desc: "100 wpm on a 1,000+ char session.", group: "Speed",
    test: (p) => (p.sessions || []).some((s) => (s.wpm || 0) >= 100 && (s.chars || 0) >= 1000),
    requires: (s) => (s.wpm || 0) >= 100 && (s.chars || 0) >= 1000 },
  { id: "sustain-120-2000", name: "Sustained 120", desc: "120 wpm on a 2,000+ char session.", group: "Speed",
    test: (p) => (p.sessions || []).some((s) => (s.wpm || 0) >= 120 && (s.chars || 0) >= 2000),
    requires: (s) => (s.wpm || 0) >= 120 && (s.chars || 0) >= 2000 },

  // ── Streak extensions
  { id: "streak-30",  name: "Month-long focus", desc: "30-day streak.",  group: "Streaks",  test: (p) => streak(p) >= 30 },
  { id: "streak-60",  name: "Two months",        desc: "60-day streak.",  group: "Streaks",  test: (p) => streak(p) >= 60 },
  { id: "streak-100", name: "Hundred days",      desc: "100-day streak.", group: "Streaks",  test: (p) => streak(p) >= 100 },
  { id: "streak-180", name: "Half year",         desc: "180-day streak.", group: "Streaks",  test: (p) => streak(p) >= 180 },
  { id: "streak-365", name: "Year of typing",    desc: "365-day streak. A full year.", group: "Streaks", test: (p) => streak(p) >= 365 },

  // ── Volume tiers (sessions)
  { id: "sessions-25",   name: "25 sessions",  desc: "Complete 25 sessions.",  group: "Volume", test: (p) => sessions(p) >= 25 },
  { id: "sessions-100",  name: "100 sessions", desc: "Complete 100 sessions.", group: "Volume", test: (p) => sessions(p) >= 100 },
  { id: "sessions-250",  name: "250 sessions", desc: "Complete 250 sessions.", group: "Volume", test: (p) => sessions(p) >= 250 },
  { id: "sessions-500",  name: "500 sessions", desc: "Complete 500 sessions.", group: "Volume", test: (p) => sessions(p) >= 500 },
  { id: "sessions-1000", name: "1,000 sessions", desc: "Complete a thousand sessions.", group: "Volume", test: (p) => sessions(p) >= 1000 },

  // ── Volume tiers (characters)
  { id: "chars-2m", name: "Two million chars",   desc: "Type 2,000,000 characters.",  group: "Volume", test: (p) => chars(p) >= 2_000_000 },
  { id: "chars-5m", name: "Five million chars",  desc: "Type 5,000,000 characters.",  group: "Volume", test: (p) => chars(p) >= 5_000_000 },
  { id: "chars-10m", name: "Ten million chars",  desc: "Type 10,000,000 characters.", group: "Volume", test: (p) => chars(p) >= 10_000_000 },

  // ── Time-spent tiers
  { id: "time-1h",   name: "One hour",     desc: "Spend a total of one hour typing.",      group: "Time", test: (p) => minutes(p) >= 60 },
  { id: "time-5h",   name: "Five hours",   desc: "Spend five hours typing.",               group: "Time", test: (p) => minutes(p) >= 300 },
  { id: "time-25h",  name: "Twenty-five hours", desc: "Spend a full day's worth of focus.", group: "Time", test: (p) => minutes(p) >= 25 * 60 },
  { id: "time-100h", name: "One hundred hours", desc: "Spend 100 hours typing.",            group: "Time", test: (p) => minutes(p) >= 100 * 60 },
  { id: "time-500h", name: "Five hundred hours", desc: "Spend 500 hours -- expert territory.", group: "Time", test: (p) => minutes(p) >= 500 * 60 },

  // ── Single-session endurance (consecutive minutes typing)
  { id: "endurance-5",  name: "Five-minute focus",   desc: "Type for 5 minutes in a single session.",  group: "Endurance",
    test: (p) => (p.sessions || []).some((s) => (s.duration || 0) >= 300),
    requires: (s) => (s.duration || 0) >= 300 },
  { id: "endurance-10", name: "Ten-minute focus",    desc: "Type for 10 minutes in a single session.", group: "Endurance",
    test: (p) => (p.sessions || []).some((s) => (s.duration || 0) >= 600),
    requires: (s) => (s.duration || 0) >= 600 },
  { id: "endurance-30", name: "Half-hour deep work", desc: "Type for 30 minutes in a single session.", group: "Endurance",
    test: (p) => (p.sessions || []).some((s) => (s.duration || 0) >= 1800),
    requires: (s) => (s.duration || 0) >= 1800 },
  { id: "endurance-60", name: "Hour of typing",      desc: "Type for an entire hour in one session.",  group: "Endurance",
    test: (p) => (p.sessions || []).some((s) => (s.duration || 0) >= 3600),
    requires: (s) => (s.duration || 0) >= 3600 },

  // ── Time-of-day flavor
  { id: "time-day-early-bird", name: "Early bird", desc: "Complete a session before 7am local time.", group: "Time of day",
    test: (p) => (p.sessions || []).some((s) => {
      try { return new Date(s.at).getHours() < 7; } catch { return false; }
    }),
    requires: (s) => { try { return new Date(s.at).getHours() < 7; } catch { return false; } } },
  { id: "time-day-night-owl", name: "Night owl", desc: "Complete a session after midnight local time.", group: "Time of day",
    test: (p) => (p.sessions || []).some((s) => {
      try { const h = new Date(s.at).getHours(); return h >= 0 && h < 5; } catch { return false; }
    }),
    requires: (s) => { try { const h = new Date(s.at).getHours(); return h >= 0 && h < 5; } catch { return false; } } },
  { id: "time-day-lunch", name: "Lunch break", desc: "Complete a session between 12pm and 1pm.", group: "Time of day",
    test: (p) => (p.sessions || []).some((s) => {
      try { const h = new Date(s.at).getHours(); return h === 12; } catch { return false; }
    }),
    requires: (s) => { try { const h = new Date(s.at).getHours(); return h === 12; } catch { return false; } } },
  { id: "time-day-weekend", name: "Weekend warrior", desc: "Complete a session on a Saturday or Sunday.", group: "Time of day",
    test: (p) => (p.sessions || []).some((s) => {
      try { const d = new Date(s.at).getDay(); return d === 0 || d === 6; } catch { return false; }
    }),
    requires: (s) => { try { const d = new Date(s.at).getDay(); return d === 0 || d === 6; } catch { return false; } } },

  // ── Accuracy tiers
  { id: "acc-99",          name: "Near-perfect",   desc: "Reach 99% accuracy in a session.", group: "Accuracy",
    test: (p) => bestAcc(p) >= 99 },
  { id: "acc-99-medium",   name: "Steady at 99",   desc: "99% accuracy on a 200+ char session.", group: "Accuracy",
    test: (p) => (p.sessions || []).some((s) => (s.acc || 0) >= 99 && (s.chars || 0) >= 200),
    requires: (s) => (s.acc || 0) >= 99 && (s.chars || 0) >= 200 },
  { id: "acc-100-1000",    name: "Spotless thousand", desc: "100% accuracy on a 1,000+ char session.", group: "Accuracy",
    test: (p) => (p.sessions || []).some((s) => (s.acc || 0) >= 100 && (s.chars || 0) >= 1000),
    requires: (s) => (s.acc || 0) >= 100 && (s.chars || 0) >= 1000 },

  // ── Speed-tier challenge clears (matching the new tiered challenges)
  { id: "tier-bronze",   name: "Bronze tier",   desc: "Clear the Bronze speed challenge.",   group: "Challenges", test: (p) => !!(p.challengeBests || {})["speed-tier-bronze"] },
  { id: "tier-silver",   name: "Silver tier",   desc: "Clear the Silver speed challenge.",   group: "Challenges", test: (p) => !!(p.challengeBests || {})["speed-tier-silver"] },
  { id: "tier-gold",     name: "Gold tier",     desc: "Clear the Gold speed challenge.",     group: "Challenges", test: (p) => !!(p.challengeBests || {})["speed-tier-gold"] },
  { id: "tier-platinum", name: "Platinum tier", desc: "Clear the Platinum speed challenge.", group: "Challenges", test: (p) => !!(p.challengeBests || {})["speed-tier-platinum"] },
  { id: "tier-diamond",  name: "Diamond tier",  desc: "Clear the Diamond speed challenge.",  group: "Challenges", test: (p) => !!(p.challengeBests || {})["speed-tier-diamond"] },

  // ── Challenge clears (specific named challenges)
  { id: "challenge-perfect-100",  name: "Perfect hundred",  desc: "Clear Perfect 100 (100 words at 100%).", group: "Challenges", test: (p) => !!(p.challengeBests || {})["perfect-100"] },
  { id: "challenge-precision-50", name: "Precision keeper", desc: "Clear the Precision Run.",              group: "Challenges", test: (p) => !!(p.challengeBests || {})["precision-50"] },
  { id: "challenge-stop-error",   name: "No mistakes",      desc: "Clear the Stop on Error challenge.",    group: "Challenges", test: (p) => !!(p.challengeBests || {})["stop-on-error"] },
  { id: "challenge-no-backspace", name: "Forward only",     desc: "Clear the No Backspace challenge.",     group: "Challenges", test: (p) => !!(p.challengeBests || {})["no-backspace"] },
  { id: "challenge-hour",         name: "An hour straight", desc: "Clear the Hour of Power challenge.",    group: "Challenges", test: (p) => !!(p.challengeBests || {})["hour-of-power"] },
  { id: "challenge-1000-words",   name: "Word marathon",    desc: "Clear the 1000 Words challenge.",       group: "Challenges", test: (p) => !!(p.challengeBests || {})["word-1000"] },
  { id: "challenge-lightning",    name: "Faster than thought", desc: "Clear the Lightning 15s challenge.", group: "Challenges", test: (p) => !!(p.challengeBests || {})["lightning-15"] },
  { id: "challenge-alphabet",     name: "Alphabet master",  desc: "Clear the Alphabet Sprint.",            group: "Challenges", test: (p) => !!(p.challengeBests || {})["alphabet-sprint"] },
  { id: "challenge-poetry",       name: "Poet typist",      desc: "Clear the Poetry Run.",                 group: "Challenges", test: (p) => !!(p.challengeBests || {})["poetry-run"] },
  { id: "challenge-speech",       name: "Orator",           desc: "Clear the Famous Speech challenge.",    group: "Challenges", test: (p) => !!(p.challengeBests || {})["speech-run"] },
  { id: "challenges-all-classic", name: "Classic complete", desc: "Clear all 11 original challenges.",     group: "Challenges",
    test: (p) => ["sprint","marathon","word-100","word-500","quote-chase","mountain-climb","pangram","numbers","punctuation","code-mode","zen"].every((id) => !!(p.challengeBests || {})[id]) },
  { id: "challenges-all-tiers",   name: "Tier ladder",      desc: "Clear every speed tier (Bronze through Diamond).", group: "Challenges",
    test: (p) => ["speed-tier-bronze","speed-tier-silver","speed-tier-gold","speed-tier-platinum","speed-tier-diamond"].every((id) => !!(p.challengeBests || {})[id]) },

  // ── Lesson-progress milestones (lesson IDs 1..500)
  { id: "lesson-foundation", name: "Foundation cleared",   desc: "Clear the home-row foundation lessons (1-9).", group: "Lessons",
    test: () => { try { for (let i = 1; i <= 9; i++) if (!localStorage.getItem(`tt:lesson-best-${i}`)) return false; return true; } catch { return false; } } },
  { id: "lesson-50",  name: "First fifty",   desc: "Clear 50 lessons.",  group: "Lessons",
    test: () => { try { let n=0; for (let i=1; i<=500; i++) if (localStorage.getItem(`tt:lesson-best-${i}`)) n++; return n>=50; } catch { return false; } } },
  { id: "lesson-100", name: "First hundred", desc: "Clear 100 lessons.", group: "Lessons",
    test: () => { try { let n=0; for (let i=1; i<=500; i++) if (localStorage.getItem(`tt:lesson-best-${i}`)) n++; return n>=100; } catch { return false; } } },
  { id: "lesson-250", name: "Halfway there", desc: "Clear 250 lessons.", group: "Lessons",
    test: () => { try { let n=0; for (let i=1; i<=500; i++) if (localStorage.getItem(`tt:lesson-best-${i}`)) n++; return n>=250; } catch { return false; } } },
  { id: "lesson-500", name: "Curriculum master", desc: "Clear all 500 lessons.", group: "Lessons",
    test: () => { try { for (let i=1; i<=500; i++) if (!localStorage.getItem(`tt:lesson-best-${i}`)) return false; return true; } catch { return false; } } },

  // ── Variety / coverage
  { id: "variety-langs-3",    name: "Multi-list", desc: "Practice from 3 different word lists.",  group: "Variety",
    test: (p) => langs(p).size >= 3, requires: (s) => !!s.lang },
  { id: "variety-langs-5",    name: "Diverse drills", desc: "Practice from 5 different word lists.", group: "Variety",
    test: (p) => langs(p).size >= 5, requires: (s) => !!s.lang },
  { id: "variety-langs-20",   name: "Curriculum tourist", desc: "Practice from 20 different word lists.", group: "Variety",
    test: (p) => langs(p).size >= 20, requires: (s) => !!s.lang },
  { id: "variety-drills-half", name: "Drill explorer", desc: "Practice with 35+ different drills.", group: "Variety",
    test: (p) => {
      const drills = new Set((p.sessions || []).map((s) => s.drill).filter(Boolean));
      return drills.size >= 35;
    } },
  { id: "variety-fingers", name: "All ten fingers", desc: "Have samples on all 10 fingers in your per-finger map.", group: "Variety",
    test: (p) => {
      const pf = p.perFinger || {};
      const required = ["L_pinky","L_ring","L_middle","L_index","L_thumb","R_thumb","R_index","R_middle","R_ring","R_pinky"];
      return required.every((f) => (pf[f]?.n || 0) > 0);
    } },

  // ── Library-content tiers
  { id: "library-chars-10k", name: "First chapter",  desc: "Type 10,000 characters from the public-domain library.", group: "Library",
    test: (p) => Object.values(p.bookProgress || {}).reduce((sum, b) => sum + (b.chars || 0), 0) >= 10000,
    requires: (s) => s.mode === "book" },
  { id: "library-chars-50k", name: "Bound volume",   desc: "Type 50,000 characters from the library.", group: "Library",
    test: (p) => Object.values(p.bookProgress || {}).reduce((sum, b) => sum + (b.chars || 0), 0) >= 50000,
    requires: (s) => s.mode === "book" },
  { id: "library-chars-200k", name: "Full novel",    desc: "Type 200,000 characters from the library.", group: "Library",
    test: (p) => Object.values(p.bookProgress || {}).reduce((sum, b) => sum + (b.chars || 0), 0) >= 200000,
    requires: (s) => s.mode === "book" },
  { id: "library-books-10",  name: "Ten authors",    desc: "Have typed paragraphs across 10 different books.", group: "Library",
    test: (p) => Object.values(p.bookProgress || {}).filter((b) => b.typed && Object.keys(b.typed).length > 0).length >= 10,
    requires: (s) => s.mode === "book" },

  // ── Easter eggs / specials (secret)
  { id: "easter-fox", name: "Quick brown fox", desc: "Type the classic pangram in one session.", group: "Special", secret: true,
    test: (p) => (p.sessions || []).some((s) => /quick brown fox jumps over the lazy dog/i.test(s.target || "")),
    requires: (s) => /quick brown fox jumps over the lazy dog/i.test(s.target || "") },
  { id: "easter-pangram-2", name: "Sphinx of quartz", desc: "Type the 'Sphinx of black quartz' pangram.", group: "Special", secret: true,
    test: (p) => (p.sessions || []).some((s) => /sphinx of black quartz/i.test(s.target || "")),
    requires: (s) => /sphinx of black quartz/i.test(s.target || "") },
  { id: "easter-100-on-fox", name: "Fox runner", desc: "Hit 100 wpm on a pangram session.", group: "Special", secret: true,
    test: (p) => (p.sessions || []).some((s) => (s.wpm || 0) >= 100 && /quick brown fox jumps over the lazy dog/i.test(s.target || "")),
    requires: (s) => (s.wpm || 0) >= 100 && /quick brown fox jumps over the lazy dog/i.test(s.target || "") },
  { id: "easter-leetspeak", name: "Pi mind", desc: "Type a session whose target contains the first 50 digits of pi.", group: "Special", secret: true,
    test: (p) => (p.sessions || []).some((s) => /3\.14159265358979323846264338327950288419716939937510/.test(s.target || "")),
    requires: (s) => /3\.14159265358979323846264338327950288419716939937510/.test(s.target || "") },
  { id: "easter-call-me-ishmael", name: "Call me Ishmael", desc: "Type the opening of Moby-Dick.", group: "Special", secret: true,
    test: (p) => (p.sessions || []).some((s) => /^Call me Ishmael/.test(s.target || "")),
    requires: (s) => /^Call me Ishmael/.test(s.target || "") },
  { id: "easter-zen-master", name: "Zen master", desc: "Complete a 30+ minute Zen session.", group: "Special", secret: true,
    test: (p) => (p.sessions || []).some((s) => s.mode === "zen" && (s.duration || 0) >= 1800),
    requires: (s) => s.mode === "zen" && (s.duration || 0) >= 1800 },
  { id: "easter-no-mistakes-1k", name: "Untouchable", desc: "1000+ chars at 100% accuracy with zero backspaces.", group: "Special", secret: true,
    test: (p) => (p.sessions || []).some((s) => (s.acc || 0) >= 100 && (s.chars || 0) >= 1000 && (s.backspaces || 0) === 0),
    requires: (s) => (s.acc || 0) >= 100 && (s.chars || 0) >= 1000 && (s.backspaces || 0) === 0 },
  { id: "easter-three-in-row", name: "Hat trick", desc: "Three sessions in a row at 90+ wpm and 95+ accuracy.", group: "Special", secret: true,
    test: (p) => {
      const recent = (p.sessions || []).slice(0, 3);
      return recent.length === 3 && recent.every((s) => (s.wpm || 0) >= 90 && (s.acc || 0) >= 95);
    },
    requires: (s, p) => {
      const recent = (p.sessions || []).slice(0, 3);
      return recent.length === 3 && recent.every((x) => (x.wpm || 0) >= 90 && (x.acc || 0) >= 95);
    } },

  // ── Phase 2 expansion — 56 → ~120 ──────────────────────────────
  // New categories: extended streaks, big volume tiers, fine-grain
  // speed milestones, dawn/dusk hours, mode mastery, endurance,
  // streak recovery, social-ish, easter eggs. All predicates
  // operate on the existing profile shape (sessions[], lifetime,
  // daily, perKey, etc.) -- no new fields required.

  // ── Streak milestones (extended) ────────────────────────────────
  { id: "streak-30", name: "Thirty-day streak", desc: "Type every day for thirty days running.", group: "Streaks",
    test: (p) => (p.lifetime && p.lifetime.streakDays || 0) >= 30 },
  { id: "streak-60", name: "Sixty-day streak", desc: "Two months of unbroken daily practice.", group: "Streaks",
    test: (p) => (p.lifetime && p.lifetime.streakDays || 0) >= 60 },
  { id: "streak-100", name: "Hundred-day streak", desc: "Hundred consecutive days. Ritual achieved.", group: "Streaks",
    test: (p) => (p.lifetime && p.lifetime.streakDays || 0) >= 100 },
  { id: "streak-180", name: "Half-year streak", desc: "180 days in a row. The keyboard is a third hand.", group: "Streaks",
    test: (p) => (p.lifetime && p.lifetime.streakDays || 0) >= 180 },
  { id: "streak-365", name: "Year-long streak", desc: "A full year without skipping a day.", group: "Streaks",
    test: (p) => (p.lifetime && p.lifetime.streakDays || 0) >= 365 },

  // ── Volume tiers (extended) ─────────────────────────────────────
  { id: "five-million-chars", name: "Five million", desc: "Type five million characters lifetime.", group: "Volume",
    test: (p) => (p.lifetime && p.lifetime.totalChars || 0) >= 5_000_000 },
  { id: "ten-million-chars", name: "Ten million", desc: "Type ten million characters lifetime.", group: "Volume",
    test: (p) => (p.lifetime && p.lifetime.totalChars || 0) >= 10_000_000 },
  { id: "sessions-500", name: "Five hundred sessions", desc: "Complete five hundred sessions.", group: "Volume",
    test: (p) => (p.sessions || []).length >= 500 },
  { id: "sessions-1000", name: "Thousand sessions", desc: "Complete a thousand sessions.", group: "Volume",
    test: (p) => (p.sessions || []).length >= 1000 },
  { id: "hours-10", name: "Ten hours", desc: "Spend ten hours actively typing.", group: "Volume",
    test: (p) => (p.lifetime && p.lifetime.totalMs || 0) >= 10 * 3600 * 1000 },
  { id: "hours-50", name: "Fifty hours", desc: "Spend fifty hours actively typing.", group: "Volume",
    test: (p) => (p.lifetime && p.lifetime.totalMs || 0) >= 50 * 3600 * 1000 },
  { id: "hours-100", name: "Hundred hours", desc: "A hundred hours of focused typing.", group: "Volume",
    test: (p) => (p.lifetime && p.lifetime.totalMs || 0) >= 100 * 3600 * 1000 },

  // ── Fine-grain speed milestones (every 5 wpm in the upper deck) ─
  { id: "wpm-45", name: "Forty-five", desc: "Hit 45 wpm in any session.", group: "Speed",
    test: (p) => (p.lifetime && p.lifetime.bestWpm || 0) >= 45 },
  { id: "wpm-55", name: "Fifty-five", desc: "Hit 55 wpm in any session.", group: "Speed",
    test: (p) => (p.lifetime && p.lifetime.bestWpm || 0) >= 55 },
  { id: "wpm-65", name: "Sixty-five", desc: "Hit 65 wpm in any session.", group: "Speed",
    test: (p) => (p.lifetime && p.lifetime.bestWpm || 0) >= 65 },
  { id: "wpm-75", name: "Seventy-five", desc: "Hit 75 wpm in any session.", group: "Speed",
    test: (p) => (p.lifetime && p.lifetime.bestWpm || 0) >= 75 },
  { id: "wpm-85", name: "Eighty-five", desc: "Hit 85 wpm in any session.", group: "Speed",
    test: (p) => (p.lifetime && p.lifetime.bestWpm || 0) >= 85 },
  { id: "wpm-95", name: "Ninety-five", desc: "Hit 95 wpm in any session.", group: "Speed",
    test: (p) => (p.lifetime && p.lifetime.bestWpm || 0) >= 95 },
  { id: "wpm-110", name: "One ten", desc: "Hit 110 wpm in any session.", group: "Speed",
    test: (p) => (p.lifetime && p.lifetime.bestWpm || 0) >= 110 },
  { id: "wpm-130", name: "One thirty", desc: "Hit 130 wpm in any session.", group: "Speed",
    test: (p) => (p.lifetime && p.lifetime.bestWpm || 0) >= 130 },
  { id: "wpm-150", name: "One fifty", desc: "Hit 150 wpm in any session.", group: "Speed",
    test: (p) => (p.lifetime && p.lifetime.bestWpm || 0) >= 150 },

  // ── Accuracy tiers (extended) ───────────────────────────────────
  { id: "acc-99", name: "Pristine", desc: "Reach 99% accuracy in any session.", group: "Accuracy",
    test: (p) => (p.sessions || []).some((s) => (s.acc || 0) >= 99) },
  { id: "acc-99-5", name: "Razor-sharp", desc: "Reach 99.5% accuracy in any session ≥ 50 words.", group: "Accuracy",
    test: (p) => (p.sessions || []).some((s) => (s.acc || 0) >= 99.5 && (s.chars || 0) >= 250) },
  { id: "acc-100-marathon", name: "Spotless marathon+", desc: "100% accuracy in a session ≥ 500 chars.", group: "Accuracy",
    test: (p) => (p.sessions || []).some((s) => (s.acc || 0) >= 100 && (s.chars || 0) >= 500) },
  { id: "no-backspace-100", name: "First take", desc: "Finish a session ≥ 100 chars with zero backspaces.", group: "Accuracy",
    test: (p) => (p.sessions || []).some((s) => (s.chars || 0) >= 100 && (s.backspaces || 0) === 0) },

  // ── Time-of-day badges ──────────────────────────────────────────
  { id: "early-bird", name: "Early bird", desc: "Complete a session before 7 AM.", group: "Rituals",
    test: (p) => (p.sessions || []).some((s) => { try { return new Date(s.at).getHours() < 7; } catch { return false; } }) },
  { id: "night-owl", name: "Night owl", desc: "Complete a session after midnight.", group: "Rituals",
    test: (p) => (p.sessions || []).some((s) => { try { const h = new Date(s.at).getHours(); return h >= 0 && h < 5; } catch { return false; } }) },
  { id: "lunch-break", name: "Lunch break", desc: "Complete a session between noon and 1 PM.", group: "Rituals",
    test: (p) => (p.sessions || []).some((s) => { try { const h = new Date(s.at).getHours(); return h === 12; } catch { return false; } }) },
  { id: "monday-morning", name: "Monday momentum", desc: "Practice on a Monday before 9 AM.", group: "Rituals",
    test: (p) => (p.sessions || []).some((s) => { try { const d = new Date(s.at); return d.getDay() === 1 && d.getHours() < 9; } catch { return false; } }) },
  { id: "weekend-warrior", name: "Weekend warrior", desc: "Complete five sessions on weekends.", group: "Rituals",
    test: (p) => {
      const w = (p.sessions || []).filter((s) => { try { const d = new Date(s.at).getDay(); return d === 0 || d === 6; } catch { return false; } });
      return w.length >= 5;
    } },

  // ── Endurance ───────────────────────────────────────────────────
  { id: "endurance-5min", name: "Five-minute push", desc: "One continuous session ≥ 5 minutes.", group: "Endurance",
    test: (p) => (p.sessions || []).some((s) => (s.ms || 0) >= 5 * 60 * 1000) },
  { id: "endurance-15min", name: "Fifteen-minute push", desc: "One continuous session ≥ 15 minutes.", group: "Endurance",
    test: (p) => (p.sessions || []).some((s) => (s.ms || 0) >= 15 * 60 * 1000) },
  { id: "endurance-30min", name: "Half-hour push", desc: "One continuous session ≥ 30 minutes.", group: "Endurance",
    test: (p) => (p.sessions || []).some((s) => (s.ms || 0) >= 30 * 60 * 1000) },
  { id: "endurance-60min", name: "Hour-long push", desc: "One continuous session ≥ 60 minutes.", group: "Endurance",
    test: (p) => (p.sessions || []).some((s) => (s.ms || 0) >= 60 * 60 * 1000) },

  // ── Variety ─────────────────────────────────────────────────────
  { id: "modes-5", name: "Mode explorer", desc: "Use five different practice modes.", group: "Variety",
    test: (p) => new Set((p.sessions || []).map((s) => s.mode).filter(Boolean)).size >= 5 },
  { id: "modes-all", name: "Mode collector", desc: "Use every practice mode at least once.", group: "Variety",
    test: (p) => {
      const modes = new Set((p.sessions || []).map((s) => s.mode).filter(Boolean));
      const required = ["time","words","quote","zen","custom","adaptive","idiom","poem"];
      return required.every((m) => modes.has(m));
    } },
  { id: "langs-3", name: "Polyglot starter", desc: "Practice in three different word sources.", group: "Variety",
    test: (p) => new Set((p.sessions || []).map((s) => s.lang).filter(Boolean)).size >= 3 },
  { id: "authors-5", name: "Curator", desc: "Type quotes from five different authors.", group: "Variety",
    test: (p) => {
      const authors = new Set();
      (p.corpusProgress && p.corpusProgress.quote ? Object.keys(p.corpusProgress.quote) : []).forEach((id) => authors.add(id.split("-")[1] || id));
      return authors.size >= 5;
    } },

  // ── Mode mastery ────────────────────────────────────────────────
  { id: "quote-25", name: "Quote collector", desc: "Complete twenty-five different quotes.", group: "Mastery",
    test: (p) => Object.keys((p.corpusProgress && p.corpusProgress.quote) || {}).length >= 25 },
  { id: "quote-100", name: "Quote scholar", desc: "Complete one hundred different quotes.", group: "Mastery",
    test: (p) => Object.keys((p.corpusProgress && p.corpusProgress.quote) || {}).length >= 100 },
  { id: "idiom-25", name: "Phrase keeper", desc: "Complete twenty-five different idioms.", group: "Mastery",
    test: (p) => Object.keys((p.corpusProgress && p.corpusProgress.idiom) || {}).length >= 25 },
  { id: "poem-10", name: "Verse keeper", desc: "Complete ten public-domain poems.", group: "Mastery",
    test: (p) => Object.keys((p.corpusProgress && p.corpusProgress.poem) || {}).length >= 10 },
  { id: "poem-25", name: "Verse scholar", desc: "Complete twenty-five public-domain poems.", group: "Mastery",
    test: (p) => Object.keys((p.corpusProgress && p.corpusProgress.poem) || {}).length >= 25 },
  { id: "books-1", name: "First chapter", desc: "Start typing a book from the library.", group: "Mastery",
    test: (p) => Object.keys((p.bookProgress || {})).length >= 1 },
  { id: "books-5", name: "Five-book shelf", desc: "Begin five different books.", group: "Mastery",
    test: (p) => Object.keys((p.bookProgress || {})).length >= 5 },

  // ── Streak recovery + comebacks ────────────────────────────────
  { id: "comeback", name: "Comeback", desc: "Beat your previous best by 5+ wpm.", group: "Growth",
    test: (p) => {
      const sessions = p.sessions || [];
      if (sessions.length < 2) return false;
      const sorted = [...sessions].sort((a, b) => new Date(a.at) - new Date(b.at));
      let bestSoFar = 0;
      for (let i = 0; i < sorted.length; i++) {
        if (i > 0 && sorted[i].wpm >= bestSoFar + 5) return true;
        bestSoFar = Math.max(bestSoFar, sorted[i].wpm || 0);
      }
      return false;
    } },
  { id: "from-the-pit", name: "From the pit", desc: "Recover from a sub-60% accuracy session to 90%+ within three runs.", group: "Growth",
    test: (p) => {
      const sessions = [...(p.sessions || [])].sort((a, b) => new Date(a.at) - new Date(b.at));
      for (let i = 0; i < sessions.length; i++) {
        if ((sessions[i].acc || 100) < 60) {
          for (let j = i + 1; j < Math.min(sessions.length, i + 4); j++) {
            if ((sessions[j].acc || 0) >= 90) return true;
          }
        }
      }
      return false;
    } },

  // ── Easter eggs (revealed only when unlocked) ───────────────────
  { id: "easter-alphabet", name: "Full alphabet", desc: "Type a session containing every letter of the alphabet.", group: "Special", secret: true,
    test: (p) => (p.sessions || []).some((s) => {
      const target = (s.target || "").toLowerCase();
      return /a/.test(target) && /b/.test(target) && /c/.test(target) && /d/.test(target) && /e/.test(target) &&
             /f/.test(target) && /g/.test(target) && /h/.test(target) && /i/.test(target) && /j/.test(target) &&
             /k/.test(target) && /l/.test(target) && /m/.test(target) && /n/.test(target) && /o/.test(target) &&
             /p/.test(target) && /q/.test(target) && /r/.test(target) && /s/.test(target) && /t/.test(target) &&
             /u/.test(target) && /v/.test(target) && /w/.test(target) && /x/.test(target) && /y/.test(target) && /z/.test(target);
    }) },
  { id: "easter-leap", name: "Leap day", desc: "Practice on February 29.", group: "Special", secret: true,
    test: (p) => (p.sessions || []).some((s) => { try { const d = new Date(s.at); return d.getMonth() === 1 && d.getDate() === 29; } catch { return false; } }) },
  { id: "easter-pi", name: "Pi day", desc: "Practice on March 14.", group: "Special", secret: true,
    test: (p) => (p.sessions || []).some((s) => { try { const d = new Date(s.at); return d.getMonth() === 2 && d.getDate() === 14; } catch { return false; } }) },
  { id: "easter-newyear", name: "Resolution kept", desc: "Practice on January 1.", group: "Special", secret: true,
    test: (p) => (p.sessions || []).some((s) => { try { const d = new Date(s.at); return d.getMonth() === 0 && d.getDate() === 1; } catch { return false; } }) },
  { id: "easter-friday-13", name: "Unlucky day", desc: "Practice on Friday the 13th.", group: "Special", secret: true,
    test: (p) => (p.sessions || []).some((s) => { try { const d = new Date(s.at); return d.getDay() === 5 && d.getDate() === 13; } catch { return false; } }) },
];

/* Evaluate a profile snapshot. Returns { unlocked, earned }.
   `unlocked` reflects every achievement whose state predicate passes
   (used to paint the grid). `earned` is the subset that just newly
   unlocked AND -- when the achievement has a `requires(session)`
   predicate -- whose qualifying activity happened in THIS session.
   That second filter prevents new or retro-applied achievements from
   firing celebration toasts during unrelated sessions (e.g., a
   "First paragraph" book achievement spawning during a word-list
   drill just because the user happened to type a book paragraph
   weeks ago). */
export function evaluate(profile, currentSession) {
  const have = new Set(profile.achievements || []);
  const unlocked = [];
  const earned = [];
  for (const a of ACHIEVEMENTS) {
    let pass = false;
    try { pass = !!a.test(profile); } catch { pass = false; }
    if (!pass) continue;
    unlocked.push(a.id);
    if (have.has(a.id)) continue;
    // Newly unlocked. Decide whether to celebrate it or absorb it
    // silently. If the achievement specifies a `requires` predicate
    // and we have a current session, the session must match.
    let celebrate = true;
    if (a.requires && currentSession) {
      try { celebrate = !!a.requires(currentSession, profile); }
      catch { celebrate = false; }
    } else if (a.requires && !currentSession) {
      // Evaluation outside a session context (e.g., page load) --
      // suppress the celebration; the achievement still goes into
      // unlocked so the grid shows it as earned.
      celebrate = false;
    }
    if (celebrate) earned.push(a.id);
  }
  return { unlocked, earned };
}

export function byId(id) { return ACHIEVEMENTS.find((a) => a.id === id) || null; }
