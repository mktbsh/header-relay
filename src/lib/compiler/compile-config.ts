import {
  buildProfileCookieCandidates,
  composeCookieHeaderValue,
  type PlannedCookie,
} from "../cookie-emulation/core";
import { validateExcludedPathPrefix } from "../domain/excluded-path";
import type { Profile, SessionState } from "../domain/types";
import { createHeaderPlan } from "../header-emulation/core";
import { getUrlParts, matchesExcludedGlob, normalizeOrigin } from "../matching/route-condition";

export type CompiledHeader = {
  name: string;
  value: string;
  source: "fixed" | "captured";
};

export type CompiledExcludedPath = {
  id: string;
  pathGlob: string;
};

// One logical rule per (enabled profile, enabled target origin). Rules with no
// headers are kept so URL Probe can still report the profile as matched; the DNR
// builder skips them.
export type CompiledRule = {
  profileId: string;
  profileName: string;
  originId: string;
  origin: string;
  headers: CompiledHeader[];
  excludedPaths: CompiledExcludedPath[];
};

export type CompiledProfileSummary = {
  profileId: string;
  name: string;
  origins: string[];
  headerNames: string[];
};

export type CompileWarning =
  | {
      code: "no-target-origins" | "no-headers" | "excluded-paths-remove-headers";
      profileId: string;
      message: string;
    }
  | {
      // Emitted when honoring FR-13/FR-14 on this origin would require a URL-path
      // partition we can't express with a single positive RE2 regex (spec Ticket 00
      // stopping condition #1+#2 conflict without partition). We fall back to
      // "no Cookie rule for this origin" so Chrome's original Cookie survives on
      // the excluded path; the price is losing Header Relay Cookie relay on non-
      // excluded paths of the same origin. Surfaced to Runtime Status / URL Probe.
      code: "cookie-exclusion-cannot-preserve";
      profileIds: string[];
      origin: string;
      excludedPathGlobs: string[];
      message: string;
    };

export type CompileError =
  | {
      code: "header-conflict";
      profileIds: string[];
      origin: string;
      headerName: string;
      message: string;
    }
  | {
      code: "cookie-conflict";
      profileIds: string[];
      origin: string;
      cookieName: string;
      message: string;
    };

// Contribution from one profile to a Cookie SET on a target origin: the ordered
// cookie candidates it wants to send. Kept flat (no per-region information yet) so
// Ticket 01 can implement the "no excluded paths for cookie-holding profiles" case
// as one region per origin. Ticket 03 layers the region partition on top.
export type CookieProfileContribution = {
  profileId: string;
  profileName: string;
  originId: string;
  origin: string;
  candidates: PlannedCookie[];
  excludedPaths: CompiledExcludedPath[];
};

export type CompiledCookieRule = {
  origin: string;
  // The effective Cookie header value ("name=value; name=value"). undefined means the
  // partition has zero candidates and the DNR builder must emit no rule for it.
  cookieHeaderValue: string;
  // Profiles contributing to this region, in a deterministic order (config order).
  contributingProfileIds: string[];
  // Path glob patterns that DEFINE this region. Empty means "the whole origin, no
  // excluded paths". A non-empty value is Ticket 03 territory; the Ticket 01 builder
  // only emits rules for empty ones.
  urlRegionKey: string;
  excludedPathGlobs: string[];
};

export type CompiledConfig = {
  rules: CompiledRule[];
  matchedProfiles: CompiledProfileSummary[];
  warnings: CompileWarning[];
  errors: CompileError[];
  cookieRules: CompiledCookieRule[];
  cookieContributions: CookieProfileContribution[];
};

export type SessionsByProfileId = Record<string, SessionState | undefined>;

export const selectEnabledProfiles = (profiles: Profile[]): Profile[] =>
  profiles.filter((profile) => profile.enabled);

const compileExcludedPaths = (profile: Profile): CompiledExcludedPath[] =>
  profile.excludedPaths.flatMap((path) => {
    if (!path.enabled) return [];
    const validation = validateExcludedPathPrefix(path.pathPrefix);
    return validation.ok ? [{ id: path.id, pathGlob: validation.value }] : [];
  });

const compileProfile = (profile: Profile, session: SessionState | undefined): CompiledRule[] => {
  const { attachHeaders } = createHeaderPlan(profile, session);
  const excludedPaths = compileExcludedPaths(profile);

  return profile.targetOrigins
    .filter((origin) => origin.enabled)
    .map((origin) => ({
      profileId: profile.id,
      profileName: profile.name,
      originId: origin.id,
      origin: normalizeOrigin(origin.origin),
      headers: attachHeaders.map((header) => ({
        name: header.name,
        value: header.value,
        source: header.source,
      })),
      excludedPaths,
    }));
};

const collectWarnings = (profile: Profile, rules: CompiledRule[]): CompileWarning[] => {
  const warnings: CompileWarning[] = [];
  if (rules.length === 0) {
    warnings.push({
      code: "no-target-origins",
      profileId: profile.id,
      message: `Profile "${profile.name}" has no enabled target origin.`,
    });
    return warnings;
  }
  if (rules.every((rule) => rule.headers.length === 0)) {
    warnings.push({
      code: "no-headers",
      profileId: profile.id,
      message: `Profile "${profile.name}" attaches no headers yet.`,
    });
  }
  if (rules.some((rule) => rule.excludedPaths.length > 0 && rule.headers.length > 0)) {
    warnings.push({
      code: "excluded-paths-remove-headers",
      profileId: profile.id,
      message: `Profile "${profile.name}" removes its own relay-managed headers on excluded paths.`,
    });
  }
  return warnings;
};

// Two enabled profiles writing the same header name on the same origin have no
// deterministic winner (no priority model), so this is an error, not a merge.
// Covers fixed vs fixed, fixed vs captured and captured vs captured alike, because
// compiled rules no longer distinguish the source when addressing a header slot.
const detectConflicts = (rules: CompiledRule[]): CompileError[] => {
  type Slot = { origin: string; headerName: string; profileIds: Set<string> };
  const slots = new Map<string, Slot>();

  for (const rule of rules) {
    for (const header of rule.headers) {
      const key = `${rule.origin} ${header.name}`;
      const slot: Slot = slots.get(key) ?? {
        origin: rule.origin,
        headerName: header.name,
        profileIds: new Set(),
      };
      slot.profileIds.add(rule.profileId);
      slots.set(key, slot);
    }
  }

  return [...slots.values()]
    .filter((slot) => slot.profileIds.size > 1)
    .map((slot) => {
      const profileIds = [...slot.profileIds];
      return {
        code: "header-conflict" as const,
        profileIds,
        origin: slot.origin,
        headerName: slot.headerName,
        message: `Header "${slot.headerName}" on ${slot.origin} is set by more than one enabled profile (${profileIds.join(", ")}). Disable one of them.`,
      };
    });
};

// Same policy as detectConflicts, but for cookies: same-name cookie enabled in two
// enabled profiles targeting the same origin is a conflict regardless of tracked
// value presence and BEFORE excluded paths (FR-12, AC-31).
const detectCookieConflicts = (
  contributions: CookieProfileContribution[],
  profiles: Profile[],
): CompileError[] => {
  type Slot = { origin: string; cookieName: string; profileIds: Set<string> };
  const slots = new Map<string, Slot>();
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  for (const contribution of contributions) {
    const profile = profileById.get(contribution.profileId);
    if (!profile) continue;
    // Enumerate ALL enabled cookies (fixed + tracked), not just candidates — an
    // enabled tracked cookie without a captured value still counts (AC-31).
    const names = new Set<string>();
    for (const cookie of profile.fixedCookies) if (cookie.enabled) names.add(cookie.name);
    for (const cookie of profile.trackedCookies) if (cookie.enabled) names.add(cookie.name);
    for (const name of names) {
      const key = `${contribution.origin} ${name}`;
      const slot: Slot = slots.get(key) ?? {
        origin: contribution.origin,
        cookieName: name,
        profileIds: new Set(),
      };
      slot.profileIds.add(contribution.profileId);
      slots.set(key, slot);
    }
  }

  return [...slots.values()]
    .filter((slot) => slot.profileIds.size > 1)
    .map((slot) => {
      const profileIds = [...slot.profileIds];
      return {
        code: "cookie-conflict" as const,
        profileIds,
        origin: slot.origin,
        cookieName: slot.cookieName,
        message: `Cookie "${slot.cookieName}" on ${slot.origin} is set by more than one enabled profile (${profileIds.join(", ")}). Disable one of them.`,
      };
    });
};

// Cookie rules are compiled per URL region on each origin:
//   Region "all": matches every URL on the origin. Value = merge of profiles with
//     NO enabled excluded paths (their cookies always apply).
//   Region per excluded glob: matches origin+glob. Value = merge of profiles whose
//     enabled excluded paths do NOT include this glob (i.e., are still contributing
//     even on that path).
//
// The DNR builder assigns a HIGHER priority to per-glob regions so the browser picks
// the reduced value on excluded paths (spec FR-14, AC-10). Regions whose merged
// value is empty emit NO rule at all, preserving Chrome's Cookie header (AC-24).
//
// ponytail: this covers "one profile per origin has excluded paths" (the common
// case). A profile whose excluded paths COMPLETELY hide the origin from Chrome's
// original Cookie for some URL region isn't representable without RE2-negative
// path filters — that scenario surfaces as `cookie-exclusion-may-empty` warning,
// documented in the ADR. Ticket 07 / follow-up: full path partition module.
type CookieRegion = { key: string; globs: string[] };

// Profiles that still contribute to a region (i.e., NONE of their own excluded
// globs matches this region). For region "all", exclusions are ignored — the base
// rule sends the full merged value everywhere on the origin, and per-glob overrides
// reduce that value where needed.
const contributionsInRegion = (
  contributions: CookieProfileContribution[],
  region: CookieRegion,
): CookieProfileContribution[] => {
  if (region.key === "all") return contributions;
  return contributions.filter(
    (contribution) =>
      !contribution.excludedPaths.some((path) => region.globs.includes(path.pathGlob)),
  );
};

export type CookieBuildOutput = {
  rules: CompiledCookieRule[];
  warnings: CompileWarning[];
};

const buildCookieRules = (contributions: CookieProfileContribution[]): CookieBuildOutput => {
  const byOrigin = new Map<string, CookieProfileContribution[]>();
  for (const contribution of contributions) {
    const list = byOrigin.get(contribution.origin) ?? [];
    list.push(contribution);
    byOrigin.set(contribution.origin, list);
  }
  const rules: CompiledCookieRule[] = [];
  const warnings: CompileWarning[] = [];
  for (const [origin, list] of byOrigin) {
    // Distinct globs across all contributing profiles on this origin.
    const distinctGlobs = [
      ...new Set(list.flatMap((contribution) => contribution.excludedPaths.map((p) => p.pathGlob))),
    ];

    // Base rule (region "all", priority 200): the full merge from every enabled
    // profile on this origin. This value fires on ALL URLs on the origin; per-glob
    // override rules below take priority 300 and REPLACE this on excluded paths.
    const baseMerged: PlannedCookie[] = list.flatMap((c) => c.candidates);
    const baseValue = composeCookieHeaderValue(baseMerged);

    // Detect the case where an excluded region reduces to 0 candidates: an override
    // rule can't restore Chrome's original Cookie (DNR SET is destructive and RE2
    // has no negative-path matcher), so the base rule at priority 200 would keep
    // firing on the excluded URL, violating FR-13/FR-14. Fall back to "no cookie
    // rule for this origin" and surface a warning; Chrome's original Cookie then
    // flows unmodified on every URL of this origin.
    const unpreservableGlobs: string[] = [];
    for (const glob of distinctGlobs) {
      const region: CookieRegion = { key: `glob:${glob}`, globs: [glob] };
      const merged = contributionsInRegion(list, region).flatMap((c) => c.candidates);
      if (!composeCookieHeaderValue(merged)) unpreservableGlobs.push(glob);
    }
    if (unpreservableGlobs.length > 0 && baseValue) {
      warnings.push({
        code: "cookie-exclusion-cannot-preserve",
        profileIds: list.map((c) => c.profileId),
        origin,
        excludedPathGlobs: unpreservableGlobs,
        message: `Cookie rules skipped on ${origin}: excluded path(s) ${unpreservableGlobs.join(", ")} would leave 0 candidates on that region, and DNR cannot restore Chrome's original Cookie without a URL-path partition. See ADR 2026-07-21-cookie-dnr-rule-composition.`,
      });
      continue;
    }

    if (baseValue) {
      rules.push({
        origin,
        cookieHeaderValue: baseValue,
        contributingProfileIds: list.map((c) => c.profileId),
        urlRegionKey: "all",
        excludedPathGlobs: [],
      });
    }

    // Per-glob override: reduce the base value on paths matching this glob to the
    // subset of profiles that DON'T exclude it. Only reached when every per-glob
    // region has ≥1 candidate (unpreservableGlobs is empty), so `value` is always
    // truthy here.
    for (const glob of distinctGlobs) {
      const region: CookieRegion = { key: `glob:${glob}`, globs: [glob] };
      const regionContributions = contributionsInRegion(list, region);
      const merged: PlannedCookie[] = regionContributions.flatMap((c) => c.candidates);
      const value = composeCookieHeaderValue(merged);
      if (!value) continue;
      // No point emitting an override whose value equals the base.
      if (value === baseValue) continue;
      rules.push({
        origin,
        cookieHeaderValue: value,
        contributingProfileIds: regionContributions.map((c) => c.profileId),
        urlRegionKey: region.key,
        excludedPathGlobs: [glob],
      });
    }
  }
  return { rules, warnings };
};

// Single source of truth: DNR generation, URL Probe, validation and runtime status
// all read this result instead of re-deriving matching or conflict rules.
export const compileConfig = (
  enabledProfiles: Profile[],
  sessions: SessionsByProfileId = {},
): CompiledConfig => {
  const rules: CompiledRule[] = [];
  const matchedProfiles: CompiledProfileSummary[] = [];
  const warnings: CompileWarning[] = [];
  const cookieContributions: CookieProfileContribution[] = [];

  for (const profile of enabledProfiles) {
    const profileRules = compileProfile(profile, sessions[profile.id]);
    rules.push(...profileRules);
    warnings.push(...collectWarnings(profile, profileRules));
    matchedProfiles.push({
      profileId: profile.id,
      name: profile.name,
      origins: profileRules.map((rule) => rule.origin),
      headerNames: [...new Set(profileRules.flatMap((rule) => rule.headers.map((h) => h.name)))],
    });

    const excludedPaths = compileExcludedPaths(profile);
    const candidates = buildProfileCookieCandidates({ profile, session: sessions[profile.id] });
    for (const origin of profile.targetOrigins.filter((o) => o.enabled)) {
      cookieContributions.push({
        profileId: profile.id,
        profileName: profile.name,
        originId: origin.id,
        origin: normalizeOrigin(origin.origin),
        candidates,
        excludedPaths,
      });
    }
  }

  const errors: CompileError[] = [
    ...detectConflicts(rules),
    ...detectCookieConflicts(cookieContributions, enabledProfiles),
  ];

  const cookieBuild =
    errors.length === 0 ? buildCookieRules(cookieContributions) : { rules: [], warnings: [] };

  return {
    rules,
    matchedProfiles,
    warnings: [...warnings, ...cookieBuild.warnings],
    errors,
    cookieRules: cookieBuild.rules,
    cookieContributions,
  };
};

export type ProbeProfileMatch = {
  profileId: string;
  profileName: string;
  origin: string;
  excluded: boolean;
  matchedExcludedPath?: string;
  headers: CompiledHeader[];
};

export type EffectiveHeader = CompiledHeader & {
  profileId: string;
  profileName: string;
};

export type ProbeCookieMatch = {
  profileId: string;
  profileName: string;
  origin: string;
  excluded: boolean;
  matchedExcludedPath?: string;
  candidates: PlannedCookie[];
};

export type ProbeResult = {
  url: string;
  matches: ProbeProfileMatch[];
  effectiveHeaders: EffectiveHeader[];
  cookieMatches: ProbeCookieMatch[];
  // The final Cookie header value that will be sent, or undefined when the DNR
  // ruleset must not modify Chrome's original Cookie (0 candidates, or errors).
  cookieHeaderValue?: string;
  warnings: CompileWarning[];
  errors: CompileError[];
};

// Evaluates the same compiled rules the DNR ruleset is built from, so the probe
// cannot drift from what the browser actually does.
export const probeUrl = (compiled: CompiledConfig, url: string): ProbeResult => {
  const parts = getUrlParts(url);
  const matches: ProbeProfileMatch[] = [];

  for (const rule of compiled.rules) {
    if (!parts || rule.origin !== parts.origin) continue;
    const excludedPath = rule.excludedPaths.find((path) =>
      matchesExcludedGlob(path.pathGlob, parts.path),
    );
    matches.push({
      profileId: rule.profileId,
      profileName: rule.profileName,
      origin: rule.origin,
      excluded: Boolean(excludedPath),
      matchedExcludedPath: excludedPath?.pathGlob,
      headers: rule.headers,
    });
  }

  // A compile error blocks the DNR sync entirely, so no header is effective.
  const effectiveHeaders =
    compiled.errors.length > 0
      ? []
      : matches
          .filter((match) => !match.excluded)
          .flatMap((match) =>
            match.headers.map((header) => ({
              ...header,
              profileId: match.profileId,
              profileName: match.profileName,
            })),
          );

  const cookieMatches: ProbeCookieMatch[] = [];
  for (const contribution of compiled.cookieContributions) {
    if (!parts || contribution.origin !== parts.origin) continue;
    const excludedPath = contribution.excludedPaths.find((path) =>
      matchesExcludedGlob(path.pathGlob, parts.path),
    );
    cookieMatches.push({
      profileId: contribution.profileId,
      profileName: contribution.profileName,
      origin: contribution.origin,
      excluded: Boolean(excludedPath),
      matchedExcludedPath: excludedPath?.pathGlob,
      candidates: contribution.candidates,
    });
  }

  // Origins where compileConfig fell back to "no cookie rule" (see FR-13/FR-14
  // fallback in buildCookieRules) send Chrome's original Cookie unmodified —
  // Header Relay contributes nothing on any URL of that origin.
  const cannotPreserveOrigins = new Set(
    compiled.warnings
      .filter((warning) => warning.code === "cookie-exclusion-cannot-preserve")
      .map((warning) => warning.origin),
  );
  const effectiveCookies =
    compiled.errors.length > 0
      ? []
      : cookieMatches
          .filter((match) => !match.excluded && !cannotPreserveOrigins.has(match.origin))
          .flatMap((match) => match.candidates);
  const cookieHeaderValue = composeCookieHeaderValue(effectiveCookies);

  const matchedIds = new Set([
    ...matches.map((match) => match.profileId),
    ...cookieMatches.map((match) => match.profileId),
  ]);

  return {
    url,
    matches,
    effectiveHeaders,
    cookieMatches,
    cookieHeaderValue,
    warnings: compiled.warnings.filter((warning) =>
      warning.code === "cookie-exclusion-cannot-preserve"
        ? warning.profileIds.some((id) => matchedIds.has(id))
        : matchedIds.has(warning.profileId),
    ),
    errors: compiled.errors,
  };
};
