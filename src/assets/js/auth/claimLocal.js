/* Claiming local work into an account.

   Someone practises anonymously for a month, then signs in. Their history
   has to come with them. This is the highest-risk data path in the
   project, so it makes two commitments, both borrowed from a sibling
   project that learned them the hard way:

     1. NOTHING IS DESTROYED. The local profiles are left exactly as they
        are. Cleanup is a separate, explicit, later decision -- never a
        side effect of signing in. If the claim is wrong, the original is
        still sitting there.

     2. PARTIAL FAILURE IS REPORTED, NOT SWALLOWED. Claiming five profiles
        can fail on the third. The caller gets counts and reasons so it can
        tell the user the truth rather than a cheerful "done".

   The third rule is subtler and matters most on the SECOND device:

     3. IDS ARE PRESERVED. A claimed profile keeps its id, so the same work
        claimed from a laptop and then a phone reconciles as ONE profile
        rather than silently doubling. This is why claim reuses the merge
        rule instead of appending.
*/

import { mergeProfiles } from "../sync/merge.js";
import { ensureSync } from "../sync/shape.js";

/* A profile nobody has actually typed into. Used to decide whether two
   same-named profiles are really the same one. */
export function isEmptyProfile(p) {
  if (!p) return true;
  const lt = p.lifetime || {};
  return (lt.sessions || 0) === 0 && (p.sessions || []).length === 0;
}

/* Decide what happens to each local profile, WITHOUT touching anything.
   Separating the plan from the apply is what makes this testable and what
   lets the UI show the user the plan before committing to it.

   Match order:
     1. same id            -> merge (this device already knows this profile)
     2. same name, either side empty
                           -> merge (the "two untouched Defaults" case:
                              both devices auto-created one at first run,
                              with different ids, and neither is real work)
     3. otherwise          -> add, keeping both. Never silently discard,
                              and never silently fuse two profiles that
                              both contain real practice. */
export function planClaim(localProfiles = [], accountProfiles = []) {
  const byId = new Map(accountProfiles.map((p) => [p.id, p]));
  const plan = [];

  // Track which account profiles have already been spoken for, so two
  // local "Default" profiles can't both claim the same target.
  const taken = new Set();

  for (const local of localProfiles) {
    if (!local || !local.id) {
      plan.push({ action: "skip", local, reason: "malformed" });
      continue;
    }

    const sameId = byId.get(local.id);
    if (sameId && !taken.has(sameId.id)) {
      taken.add(sameId.id);
      plan.push({ action: "merge", local, target: sameId, reason: "same-id" });
      continue;
    }

    const sameName = accountProfiles.find(
      (p) => !taken.has(p.id) && p.name === local.name && (isEmptyProfile(p) || isEmptyProfile(local)),
    );
    if (sameName) {
      taken.add(sameName.id);
      plan.push({ action: "merge", local, target: sameName, reason: "same-name-one-empty" });
      continue;
    }

    plan.push({ action: "add", local, reason: accountProfiles.length ? "distinct" : "first-claim" });
  }

  return plan;
}

/* Execute a plan. Returns the new account profile set plus an honest
   report. Never throws for one bad profile -- a single malformed entry
   must not cost someone the other four. */
export function applyClaim(localProfiles = [], accountProfiles = [], deviceId, opts = {}) {
  const now = opts.now || 0;
  const plan = planClaim(localProfiles, accountProfiles);

  const result = [...accountProfiles];
  const report = { merged: 0, added: 0, skipped: [], failed: [] };

  for (const step of plan) {
    if (step.action === "skip") {
      report.skipped.push({ id: step.local && step.local.id, reason: step.reason });
      continue;
    }
    try {
      // Lift to the slotted shape first. ensureSync is idempotent, so a
      // re-run cannot nest the counters a level deeper (which would fold
      // to zero and silently wipe the adaptive model).
      const local = ensureSync(step.local, deviceId);

      if (step.action === "merge") {
        const i = result.findIndex((p) => p.id === step.target.id);
        const target = ensureSync(result[i], deviceId);
        // Id is preserved deliberately -- see rule 3 in the header.
        result[i] = { ...mergeProfiles(target, local, { now }), id: target.id, name: target.name };
        report.merged++;
      } else {
        result.push(local);
        report.added++;
      }
    } catch (error) {
      report.failed.push({
        id: step.local && step.local.id,
        name: step.local && step.local.name,
        error: String((error && error.message) || error),
      });
    }
  }

  return { profiles: result, report };
}

/* Human-readable outcome. Deliberately says what did NOT happen when
   something failed, because "moved 4 of 5" with no explanation is worse
   than useless when the missing one is the profile they cared about. */
export function describeClaim(report) {
  const moved = report.merged + report.added;
  if (!moved && !report.failed.length) return "Nothing to move — this device had no saved progress.";

  const parts = [];
  if (report.added) parts.push(`${report.added} profile${report.added === 1 ? "" : "s"} added`);
  if (report.merged) parts.push(`${report.merged} merged with your account`);
  let msg = parts.join(", ") + ".";

  if (report.failed.length) {
    msg += ` ${report.failed.length} couldn't be copied — the originals are still on this device.`;
  }
  return msg;
}
