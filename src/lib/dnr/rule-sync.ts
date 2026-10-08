import type { CompiledConfig } from "../compiler/compile-config";
import { isOriginGranted } from "../permissions/host-permission";
import type { AuditPort, DnrPort, PermissionsPort, SessionRuleUpdate } from "../ports";
import { buildDnrRules } from "./header-rule-builder";
import { isOwnedRuleId } from "./rule-id";

// Result of one DNR sync attempt. The plan (Ticket 06) needs three distinct states:
//   ok           — atomic replace succeeded; the applied ruleset matches the plan.
//   stale-ok     — atomic replace failed; the previous, still-correct-for-safety
//                  ruleset stays in place. Nothing needs removing (the failure was
//                  an add/update the browser rejected).
//   stale-failed — atomic replace failed AND a follow-up remove-only pass to strip
//                  owned rules that MUST NOT fire (a profile disabled, a cookie
//                  cleared, an origin removed) also failed. Old headers may still
//                  be sent. Runtime Status surfaces this as a stronger warning.
export type DnrSyncStatus = "ok" | "stale-ok" | "stale-failed";

export type DnrSyncResult = {
  // Legacy fields kept so existing callers (runtime-session) keep compiling. They
  // reflect the ruleset actually applied on Chrome after the sync attempt — for
  // "stale-*" that is the PREVIOUS ruleset (not the plan).
  ruleIds: number[];
  ruleIdsByProfile: Record<string, number[]>;
  status: DnrSyncStatus;
  // Populated for "stale-*"; the raw underlying error message for Runtime Status.
  error?: string;
  // Populated only for "stale-failed"; identifies rules that should no longer fire
  // but could not be removed. Runtime Status uses this to warn about stale headers.
  unremovedRuleIds?: number[];
};

export type RuleSyncDependencies = {
  dnr: DnrPort;
  audit: AuditPort;
  permissions: PermissionsPort;
};

export type RuleSync = {
  syncDnrRules: (compiled: CompiledConfig) => Promise<DnrSyncResult>;
};

export const createRuleSync = ({ dnr, audit, permissions }: RuleSyncDependencies): RuleSync => {
  const tryUpdate = async (update: SessionRuleUpdate): Promise<string | null> => {
    try {
      await dnr.updateSessionRules(update);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };

  // Every enabled profile's rules land in one session ruleset: the owned ID range is
  // replaced wholesale on each sync, so no partial state survives.
  const syncDnrRules = async (compiled: CompiledConfig): Promise<DnrSyncResult> => {
    const existing = await dnr.getSessionRules();
    const ownedRuleIds = existing.filter((rule) => isOwnedRuleId(rule.id)).map((rule) => rule.id);
    const profileIds = compiled.matchedProfiles.map((profile) => profile.profileId);

    // A conflict has no safe resolution, so nothing is applied: the ruleset is emptied
    // rather than left holding stale rules the URL probe no longer describes.
    if (compiled.errors.length > 0) {
      const removeError = await tryUpdate({ removeRuleIds: ownedRuleIds });
      if (removeError) {
        await audit.add({
          level: "error",
          event: "error",
          message: `Compile failed with ${compiled.errors.length} conflict(s), and stale rules could NOT be removed: ${removeError}`,
          data: { profileIds, errors: compiled.errors, unremovedRuleIds: ownedRuleIds },
        });
        return {
          ruleIds: ownedRuleIds,
          ruleIdsByProfile: {},
          status: "stale-failed",
          error: removeError,
          unremovedRuleIds: ownedRuleIds,
        };
      }
      await audit.add({
        level: "error",
        event: "config_compiled",
        message: `Compile failed with ${compiled.errors.length} conflict(s). No DNR rule is active.`,
        data: { profileIds, errors: compiled.errors },
      });
      return { ruleIds: [], ruleIdsByProfile: {}, status: "ok" };
    }

    // Fail closed on host permissions: an origin the user has not granted gets no
    // DNR rule at all (skipped origins are user config, so naming them in the audit
    // data is fine — they are settings, not browsing history).
    const granted = await permissions.grantedOriginPatterns();
    const skippedOrigins = [
      ...new Set(
        compiled.rules
          .filter((rule) => !isOriginGranted(granted, rule.origin))
          .map((rule) => rule.origin),
      ),
    ];
    const permitted: CompiledConfig = {
      ...compiled,
      rules: compiled.rules.filter((rule) => isOriginGranted(granted, rule.origin)),
    };

    const { rules, ruleIdsByProfile, warnings } = buildDnrRules(permitted);
    const newRuleIds = new Set(rules.map((rule) => rule.id));

    // Surplus = owned rules currently on Chrome that the new plan does not carry
    // forward. Removing them is safety-critical (a disabled profile's rules must
    // stop firing); adding new ones is a best-effort improvement.
    const surplusRuleIds = ownedRuleIds.filter((id) => !newRuleIds.has(id));

    // Skip the DNR API call when the new plan is identical to the existing ruleset
    // and there is nothing noteworthy to audit (no skipped origins, no warnings).
    if (
      surplusRuleIds.length === 0 &&
      rules.length === ownedRuleIds.length &&
      skippedOrigins.length === 0 &&
      warnings.length === 0 &&
      compiled.warnings.length === 0
    ) {
      const existingById = new Map(
        existing.filter((rule) => isOwnedRuleId(rule.id)).map((rule) => [rule.id, rule]),
      );
      const allMatch = rules.every((rule) => {
        const prev = existingById.get(rule.id);
        return prev && JSON.stringify(prev) === JSON.stringify(rule);
      });
      if (allMatch) {
        return { ruleIds: rules.map((rule) => rule.id), ruleIdsByProfile, status: "ok" };
      }
    }

    const updateError = await tryUpdate({ removeRuleIds: ownedRuleIds, addRules: rules });

    if (!updateError) {
      await audit.add({
        level:
          skippedOrigins.length > 0 || warnings.length > 0 || compiled.warnings.length > 0
            ? "warn"
            : "debug",
        event: "dnr_rules_synced",
        message:
          `DNR synced. ${rules.length} session rule(s) active from ${profileIds.length} enabled profile(s).` +
          (skippedOrigins.length > 0
            ? ` ${skippedOrigins.length} origin(s) skipped: host permission not granted.`
            : ""),
        data: {
          profileIds,
          ruleIdsByProfile,
          ...(skippedOrigins.length > 0 ? { skippedOrigins } : {}),
          ...(warnings.length > 0 ? { warnings } : {}),
          ...(compiled.warnings.length > 0 ? { compileWarnings: compiled.warnings } : {}),
        },
      });
      return { ruleIds: rules.map((rule) => rule.id), ruleIdsByProfile, status: "ok" };
    }

    // Atomic replace failed. If the plan had only additions or value-only updates
    // (surplus empty), we're safe — the previous ruleset stays in place and is still
    // correct-for-safety. Report stale-ok and let the next sync try again.
    if (surplusRuleIds.length === 0) {
      await audit.add({
        level: "warn",
        event: "error",
        message: `Failed to sync DNR session rules: ${updateError}. Previous ruleset kept.`,
        data: { profileIds, retainedRuleIds: ownedRuleIds },
      });
      return {
        ruleIds: ownedRuleIds,
        ruleIdsByProfile: {},
        status: "stale-ok",
        error: updateError,
      };
    }

    // Plan included removals (a profile was disabled, a cookie cleared, a Target
    // Origin removed, or excluded paths grew). Retry with remove-only once so the
    // surplus rules stop firing — even if the additions can't be made this attempt.
    const removeError = await tryUpdate({ removeRuleIds: surplusRuleIds });
    if (removeError) {
      await audit.add({
        level: "error",
        event: "error",
        message: `Failed to sync DNR session rules and remove-only retry failed: ${updateError}; ${removeError}. Stale headers may still be sent.`,
        data: { profileIds, unremovedRuleIds: surplusRuleIds },
      });
      return {
        ruleIds: ownedRuleIds,
        ruleIdsByProfile: {},
        status: "stale-failed",
        error: updateError,
        unremovedRuleIds: surplusRuleIds,
      };
    }

    const retainedRuleIds = ownedRuleIds.filter((id) => !surplusRuleIds.includes(id));
    await audit.add({
      level: "warn",
      event: "error",
      message: `Failed to sync DNR session rules: ${updateError}. Removed ${surplusRuleIds.length} stale rule(s) via remove-only retry; ${retainedRuleIds.length} previous rule(s) still active.`,
      data: { profileIds, retainedRuleIds, removedRuleIds: surplusRuleIds },
    });
    return {
      ruleIds: retainedRuleIds,
      ruleIdsByProfile: {},
      status: "stale-ok",
      error: updateError,
    };
  };

  return { syncDnrRules };
};
