import { validateCookieName, validateCookieValue } from "./cookie-policy";
import { CONFIG_SCHEMA_VERSION } from "./default-profile";
import { normalizeHeaderName } from "./header-policy";
import { uniquifyProfileNames, type NamedProfile } from "./profile-name";
import type { FixedHeaderPopupConfig, MigrationIssue, MigrationIssueReason } from "./types";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// v2 stored the runtime profile in activeProfileId; v3 splits that into
// selectedProfileId (manage-page selection) and Profile.enabled (runtime state).
// enabled values are carried over untouched, so what applied before still applies.
const migrateV2 = (config: UnknownRecord): UnknownRecord => {
  const { activeProfileId, ...rest } = config;
  return {
    ...rest,
    schemaVersion: 3,
    ...(typeof activeProfileId === "string" ? { selectedProfileId: activeProfileId } : {}),
  };
};

// v4 adds FixedHeader.popup. Existing headers are left without it on purpose: an
// upgrade must not publish header values to the popup that the user never opted in to.
const migrateV3 = (config: UnknownRecord): UnknownRecord => ({ ...config, schemaVersion: 4 });

// v5 introduces the specialized Cookie feature: Fixed Header "Cookie" entries are
// converted to fixedCookies losslessly when possible; anything that would lose data
// (multi-pair with a popup, duplicate names across headers, malformed pairs) is
// stashed as a MigrationIssue rather than converted or dropped.
type ParsedCookiePair = { name: string; value: string };

const parseCookiePairs = (rawValue: string): { pairs: ParsedCookiePair[]; ok: boolean } => {
  const segments = rawValue.split(";");
  const pairs: ParsedCookiePair[] = [];
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 0) return { pairs: [], ok: false };
    const name = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    const nameCheck = validateCookieName(name);
    const valueCheck = validateCookieValue(value);
    if (!nameCheck.ok || !valueCheck.ok) return { pairs: [], ok: false };
    pairs.push({ name, value });
  }
  if (pairs.length === 0) return { pairs: [], ok: false };
  const seen = new Set<string>();
  for (const pair of pairs) {
    if (seen.has(pair.name)) return { pairs: [], ok: false };
    seen.add(pair.name);
  }
  return { pairs, ok: true };
};

type LegacyHeader = {
  id: string;
  name?: unknown;
  value?: unknown;
  enabled?: unknown;
  popup?: unknown;
};

const isLegacyHeader = (value: unknown): value is LegacyHeader =>
  isRecord(value) && typeof value.id === "string";

const isCookieName = (name: unknown): boolean =>
  typeof name === "string" && normalizeHeaderName(name) === "cookie";

const asPopupConfig = (popup: unknown): FixedHeaderPopupConfig | undefined => {
  if (!isRecord(popup)) return undefined;
  const visible = popup.visible === true;
  const input = popup.input === "select" ? "select" : popup.input === "text" ? "text" : undefined;
  if (input === undefined) return undefined;
  const raw = popup;
  const options =
    input === "select" && Array.isArray(raw.options)
      ? raw.options.filter(
          (option): option is { label: string; value: string } =>
            isRecord(option) &&
            typeof option.label === "string" &&
            typeof option.value === "string",
        )
      : undefined;
  return { visible, input, ...(options ? { options } : {}) };
};

type ConversionOutcome =
  | {
      kind: "fixed";
      fixedCookie: {
        id: string;
        name: string;
        value: string;
        enabled: boolean;
        popup?: FixedHeaderPopupConfig;
      };
    }
  | { kind: "issue"; reason: MigrationIssueReason };

const convertPopupFixedHeaderCookie = (
  header: LegacyHeader,
  popup: FixedHeaderPopupConfig,
): ConversionOutcome => {
  const rawValue = typeof header.value === "string" ? header.value : "";
  const enabled = header.enabled === true;

  const parsed = parseCookiePairs(rawValue);
  if (!parsed.ok || parsed.pairs.length !== 1) {
    return { kind: "issue", reason: "popup-select-options-mismatch" };
  }
  const only = parsed.pairs[0]!;
  let normalizedPopup = popup;
  if (popup.input === "select" && popup.options) {
    // An option value may be either a bare "value" or a full "name=value" pair.
    // The latter only maps losslessly if its name matches the header's cookie name;
    // when it does we strip the "name=" prefix so the popup's saved value is a bare
    // cookie value (matches what FixedCookie.value expects going forward).
    const normalizedOptions: { label: string; value: string }[] = [];
    for (const option of popup.options) {
      const optionParsed = parseCookiePairs(option.value);
      if (optionParsed.ok) {
        const optionOnly = optionParsed.pairs[0]!;
        if (optionParsed.pairs.length !== 1 || optionOnly.name !== only.name) {
          return { kind: "issue", reason: "popup-select-options-mismatch" };
        }
        normalizedOptions.push({ label: option.label, value: optionOnly.value });
      } else {
        const valueCheck = validateCookieValue(option.value);
        if (!valueCheck.ok) return { kind: "issue", reason: "popup-select-options-mismatch" };
        normalizedOptions.push(option);
      }
    }
    normalizedPopup = { ...popup, options: normalizedOptions };
  }
  return {
    kind: "fixed",
    fixedCookie: {
      id: header.id,
      name: only.name,
      value: only.value,
      enabled,
      popup: normalizedPopup,
    },
  };
};

const convertMultiPairFixedHeaderCookie = (
  header: LegacyHeader,
): {
  fixedCookies: { id: string; name: string; value: string; enabled: boolean }[];
} | null => {
  const rawValue = typeof header.value === "string" ? header.value : "";
  const enabled = header.enabled === true;
  const parsed = parseCookiePairs(rawValue);
  if (!parsed.ok) return null;
  return {
    fixedCookies: parsed.pairs.map((pair, index) => ({
      id: `${header.id}-c${index + 1}`,
      name: pair.name,
      value: pair.value,
      enabled,
    })),
  };
};

const migrateProfileCookies = (profile: UnknownRecord): UnknownRecord => {
  const fixedHeaders = Array.isArray(profile.fixedHeaders) ? profile.fixedHeaders : [];
  const captureHeaders = Array.isArray(profile.captureHeaders) ? profile.captureHeaders : [];

  const newFixedHeaders: unknown[] = [];
  const fixedCookies: {
    id: string;
    name: string;
    value: string;
    enabled: boolean;
    popup?: FixedHeaderPopupConfig;
  }[] = [];
  const trackedCookies: { id: string; name: string; enabled: boolean }[] = [];
  const migrationIssues: MigrationIssue[] = [];
  let issueCounter = 0;
  const nextIssueId = (): string => {
    issueCounter += 1;
    return `mig-${issueCounter}`;
  };

  const cookieHeaders = fixedHeaders.filter(
    (header): header is LegacyHeader => isLegacyHeader(header) && isCookieName(header.name),
  );
  const nonCookieHeaders = fixedHeaders.filter(
    (header) => !(isLegacyHeader(header) && isCookieName(header.name)),
  );
  newFixedHeaders.push(...nonCookieHeaders);

  // Two-pass: convert first, then deduplicate across all converted cookies.
  type Pending =
    | { kind: "fixed"; header: LegacyHeader; cookies: typeof fixedCookies }
    | { kind: "issue"; header: LegacyHeader; reason: MigrationIssueReason };
  const pending: Pending[] = [];
  for (const header of cookieHeaders) {
    const popup = asPopupConfig(header.popup);
    if (popup) {
      const outcome = convertPopupFixedHeaderCookie(header, popup);
      if (outcome.kind === "fixed") {
        pending.push({ kind: "fixed", header, cookies: [outcome.fixedCookie] });
      } else {
        pending.push({ kind: "issue", header, reason: outcome.reason });
      }
      continue;
    }
    const multi = convertMultiPairFixedHeaderCookie(header);
    if (!multi) {
      pending.push({ kind: "issue", header, reason: "cookie-parse-failed" });
      continue;
    }
    pending.push({ kind: "fixed", header, cookies: multi.fixedCookies });
  }

  // Detect duplicate names across all successfully converted cookies. If any header's
  // converted names collide with another header's, all involved headers become issues
  // (FR-20 §"複数の旧Fixed Header Cookieがあり、変換結果のCookie名が重複する場合").
  const nameCount = new Map<string, number>();
  for (const item of pending) {
    if (item.kind !== "fixed") continue;
    for (const cookie of item.cookies) {
      nameCount.set(cookie.name, (nameCount.get(cookie.name) ?? 0) + 1);
    }
  }
  const isDupHeader = (item: Pending) =>
    item.kind === "fixed" && item.cookies.some((cookie) => (nameCount.get(cookie.name) ?? 0) > 1);

  for (const item of pending) {
    if (item.kind === "issue") {
      migrationIssues.push({
        id: nextIssueId(),
        source: "fixed-header-cookie",
        originalName: typeof item.header.name === "string" ? item.header.name : "cookie",
        originalValue: typeof item.header.value === "string" ? item.header.value : undefined,
        originalPopup: asPopupConfig(item.header.popup),
        originalEnabled: item.header.enabled === true,
        reason: item.reason,
      });
      continue;
    }
    if (isDupHeader(item)) {
      migrationIssues.push({
        id: nextIssueId(),
        source: "fixed-header-cookie",
        originalName: typeof item.header.name === "string" ? item.header.name : "cookie",
        originalValue: typeof item.header.value === "string" ? item.header.value : undefined,
        originalPopup: asPopupConfig(item.header.popup),
        originalEnabled: item.header.enabled === true,
        reason: "duplicate-cookie-name",
      });
      continue;
    }
    fixedCookies.push(...item.cookies);
  }

  // Captured Header "Cookie" cannot infer a tracked cookie name — preserve for the UI.
  const newCaptureHeaders: unknown[] = [];
  for (const header of captureHeaders) {
    if (isLegacyHeader(header) && isCookieName(header.name)) {
      migrationIssues.push({
        id: nextIssueId(),
        source: "capture-header-cookie",
        originalName: typeof header.name === "string" ? header.name : "cookie",
        originalEnabled: header.enabled === true,
        reason: "capture-cookie-not-convertible",
      });
    } else {
      newCaptureHeaders.push(header);
    }
  }

  return {
    ...profile,
    fixedHeaders: newFixedHeaders,
    captureHeaders: newCaptureHeaders,
    fixedCookies: [
      ...(Array.isArray(profile.fixedCookies) ? profile.fixedCookies : []),
      ...fixedCookies,
    ],
    trackedCookies: [
      ...(Array.isArray(profile.trackedCookies) ? profile.trackedCookies : []),
      ...trackedCookies,
    ],
    migrationIssues: [
      ...(Array.isArray(profile.migrationIssues) ? profile.migrationIssues : []),
      ...migrationIssues,
    ],
  };
};

const migrateV4 = (config: UnknownRecord): UnknownRecord => {
  const profiles = Array.isArray(config.profiles)
    ? config.profiles.map((profile) =>
        isRecord(profile) ? migrateProfileCookies(profile) : profile,
      )
    : config.profiles;
  return { ...config, profiles, schemaVersion: 5 };
};

// v5→v6 was originally for pinnedResponseHeaders (since removed). Bump preserved
// so existing v5 configs still migrate forward.
const migrateV5 = (config: UnknownRecord): UnknownRecord => ({ ...config, schemaVersion: 6 });

const isNamedProfile = (value: unknown): value is UnknownRecord & NamedProfile =>
  isRecord(value) && typeof value.id === "string" && typeof value.name === "string";

// v7 makes the viewed Profile URL state. Remove the persisted selection and repair
// names before the schema starts enforcing their normalized uniqueness.
const migrateV6 = (config: UnknownRecord): UnknownRecord => {
  const { selectedProfileId: _dropped, ...rest } = config;
  if (!Array.isArray(config.profiles)) return { ...rest, schemaVersion: 7 };

  const repaired = uniquifyProfileNames(config.profiles.filter(isNamedProfile));
  let repairedIndex = 0;
  const profiles = config.profiles.map((profile) => {
    if (!isNamedProfile(profile)) return profile;
    const next = repaired[repairedIndex];
    repairedIndex += 1;
    return next;
  });

  return { ...rest, schemaVersion: 7, profiles };
};

export const migrateAppConfig = (input: unknown): unknown => {
  if (!isRecord(input)) return input;

  let config = input;
  // ponytail: sequential steps from v2 (the oldest shipped predecessor); anything
  // older or unknown falls through to parseAppConfig and resets to defaults.
  if (config.schemaVersion === 2) config = migrateV2(config);
  if (config.schemaVersion === 3) config = migrateV3(config);
  if (config.schemaVersion === 4) config = migrateV4(config);
  if (config.schemaVersion === 5) config = migrateV5(config);
  if (config.schemaVersion === 6) config = migrateV6(config);
  if (config.schemaVersion !== CONFIG_SCHEMA_VERSION) return config;

  return config;
};
