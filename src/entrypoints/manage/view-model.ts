import type { ProbeProfileMatch, ProbeResult } from "../../lib/compiler/compile-config";
import type { ExcludedPathValidationError } from "../../lib/domain/excluded-path";
import {
  normalizeProfileName,
  profileNameKey,
  type NamedProfile,
} from "../../lib/domain/profile-name";
import type { AuditLog, Profile } from "../../lib/domain/types";
import { t } from "../../lib/i18n";
import { evaluateTargetRoute } from "../../lib/matching/route-condition";

export type ProfileNameValidation = { ok: true; value: string } | { ok: false; error: string };

export type ProbeInfoRow = { label: string; value: string; description: string };

// Reads only the compiler's probe result, so the page cannot describe a rule the
// runtime does not have.
export const createProbeSummaryView = (result: ProbeResult): ProbeInfoRow[] => [
  {
    label: t("probeTestedUrl"),
    value: result.url,
    description: t("probeTestedUrlDesc"),
  },
  {
    label: t("probeAllowed"),
    value: result.effectiveHeaders.length > 0 ? t("yes") : t("no"),
    description: t("probeAllowedDesc"),
  },
  {
    label: t("probeMatchedProfileCount"),
    value: String(result.matches.length),
    description: t("probeMatchedProfileCountDesc"),
  },
  {
    label: t("probeEffectiveHeaders"),
    value: [...new Set(result.effectiveHeaders.map((header) => header.name))].join(", ") || "-",
    description: t("probeEffectiveHeadersDesc"),
  },
  {
    label: t("probeCookieHeader"),
    // Values are shown verbatim (spec §Cookieはどこで確認できますか: 値は伏せ字にせず、常に表示する).
    value: result.cookieHeaderValue ?? t("probeCookieHeaderNone"),
    description: t("probeCookieHeaderDesc"),
  },
];

export type ProbeProfileView = {
  origin: string;
  excluded: boolean;
  statusLabel: string;
  headerNames: string;
};

export const createProbeProfileView = (match: ProbeProfileMatch): ProbeProfileView => ({
  origin: match.origin,
  excluded: match.excluded,
  statusLabel: match.excluded
    ? `${t("probeExcluded")}: ${match.matchedExcludedPath ?? ""}`
    : t("probeAttach"),
  headerNames: match.excluded ? "-" : match.headers.map((header) => header.name).join(", ") || "-",
});

export type ProbeUrlValidation = { ok: true; value: string } | { ok: false; error: string };

export const validateProbeUrlInput = (input: string): ProbeUrlValidation => {
  const value = input.trim();
  if (!value) return { ok: false, error: t("probeUrlRequired") };
  try {
    new URL(value);
    return { ok: true, value };
  } catch {
    return { ok: false, error: t("probeUrlInvalid") };
  }
};

export const excludedPathValidationMessage = (error: ExcludedPathValidationError): string => {
  if (error === "required") return t("excludedPathRequired");
  if (error === "must-start-with-slash") return t("excludedPathMustStartWithSlash");
  if (error === "url-not-allowed") return t("excludedPathUrlNotAllowed");
  return t("excludedPathSingleLine");
};

export type ExcludedPathTestResult =
  | { ok: false; error: string }
  | {
      ok: true;
      url: string;
      targetOrigin: string;
      excluded: boolean;
      matchedPath: string;
    };

export const testExcludedPathUrl = (profile: Profile, input: string): ExcludedPathTestResult => {
  const validation = validateProbeUrlInput(input);
  if (!validation.ok) return validation;
  // The tester checks the origin/excluded-path configuration itself, so evaluate as
  // if the profile were enabled — otherwise a disabled profile hides every result.
  const evaluation = evaluateTargetRoute({ ...profile, enabled: true }, validation.value);
  return {
    ok: true,
    url: validation.value,
    targetOrigin: evaluation.targetOrigin?.origin ?? "-",
    excluded: evaluation.excluded,
    matchedPath: evaluation.matchedExcludedPath?.pathPrefix ?? "-",
  };
};

export const reconcileExpandedAuditLogIds = (
  current: ReadonlySet<string>,
  logs: AuditLog[],
): ReadonlySet<string> => {
  const existingIds = new Set(logs.map((log) => log.id));
  return new Set([...current].filter((id) => existingIds.has(id)));
};

export const reconcileAuditLogsById = (current: AuditLog[], next: AuditLog[]): AuditLog[] => {
  const currentById = new Map(current.map((log) => [log.id, log]));
  return next.map((log) => currentById.get(log.id) ?? log);
};

export const updateExpandedAuditLogIds = (
  current: ReadonlySet<string>,
  logId: string,
  expanded: boolean,
): ReadonlySet<string> => {
  const next = new Set(current);
  if (expanded) next.add(logId);
  else next.delete(logId);
  return next;
};

export type AuditLogView = {
  summaryMeta: string[];
  fullUrl?: string;
  message?: string;
  identityRows: [label: string, value: string][];
  headerNames: string;
  dataJson: string;
};

export const validateProfileNameInput = (
  input: string,
  profiles: NamedProfile[] = [],
  excludedProfileId?: string,
): ProfileNameValidation => {
  const value = normalizeProfileName(input);
  if (!value) return { ok: false, error: t("profileNameRequired") };
  const key = profileNameKey(value);
  if (
    profiles.some(
      (profile) => profile.id !== excludedProfileId && profileNameKey(profile.name) === key,
    )
  ) {
    return { ok: false, error: t("profileNameDuplicate") };
  }
  return { ok: true, value };
};

export const shouldRefreshRuntimeForVisibility = (
  visibilityState: DocumentVisibilityState,
): boolean => visibilityState === "visible";

export const createAuditLogView = (log: AuditLog): AuditLogView => {
  const identityRows: [string, string][] = [];
  if (log.profileId) identityRows.push([t("profileLabel"), log.profileId]);
  if (log.tabId !== undefined) identityRows.push([t("auditTab"), String(log.tabId)]);
  if (log.requestId) identityRows.push([t("auditRequest"), log.requestId]);

  return {
    summaryMeta: [
      log.method,
      log.statusCode === undefined ? undefined : String(log.statusCode),
    ].filter((value): value is string => Boolean(value)),
    fullUrl: log.url,
    message: log.message,
    identityRows,
    headerNames: log.headerNames?.join(", ") ?? "",
    dataJson: log.data ? JSON.stringify(log.data, null, 2) : "",
  };
};
