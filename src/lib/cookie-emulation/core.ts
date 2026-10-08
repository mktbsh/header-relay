import { validateCookieName, validateCookieValue } from "../domain/cookie-policy";
import type { Profile, SessionState, TrackedCookie, TrackedCookieValue } from "../domain/types";

// Parse and evaluate a single Set-Cookie response header into one of three outcomes:
// update (name/value pair, replaces the tracked value), delete (Max-Age<=0 or past
// Expires), or invalid (bad syntax; the response ignores just this pair). Everything
// callers need to know about RFC 6265 name/value rules, attribute case-insensitivity,
// Max-Age precedence over Expires and safe audit input lives inside this module.

export type SetCookieParseUpdate = {
  kind: "update";
  name: string;
  value: string;
};

export type SetCookieParseDelete = {
  kind: "delete";
  name: string;
};

export type SetCookieParseInvalid = {
  kind: "invalid";
  // Populated when the pair was structurally parseable enough to isolate a name that
  // passes cookie-name validation, but its attribute values (Max-Age, Expires) were
  // invalid. Callers may audit-log the name; when undefined the audit log omits it.
  name?: string;
};

export type SetCookieParseResult =
  | SetCookieParseUpdate
  | SetCookieParseDelete
  | SetCookieParseInvalid;

type ParsedAttributes = {
  maxAge?: number;
  expires?: number;
  maxAgeInvalid: boolean;
  expiresInvalid: boolean;
};

const parseIntegerMaxAge = (raw: string): number | undefined => {
  // Max-Age is a decimal integer (may start with -). Whitespace surrounding the value
  // is ignored (RFC 6265 §5.2 uses OWS around attribute values).
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseExpiresTimestamp = (raw: string): number | undefined => {
  // Date.parse accepts the common HTTP-date formats (RFC 1123, RFC 850, asctime) plus
  // ISO 8601. That is more permissive than RFC 6265 §5.1.1 but matches how browsers
  // in the wild treat Set-Cookie Expires — being strict would reject valid live cookies.
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseAttributes = (attributePart: string): ParsedAttributes => {
  const result: ParsedAttributes = { maxAgeInvalid: false, expiresInvalid: false };
  if (!attributePart) return result;

  for (const segment of attributePart.split(";")) {
    const eqIndex = segment.indexOf("=");
    const rawName = (eqIndex >= 0 ? segment.slice(0, eqIndex) : segment).trim();
    const rawValue = eqIndex >= 0 ? segment.slice(eqIndex + 1) : "";
    const name = rawName.toLowerCase();
    if (name === "max-age") {
      const parsed = parseIntegerMaxAge(rawValue);
      if (parsed === undefined) result.maxAgeInvalid = true;
      else result.maxAge = parsed;
    } else if (name === "expires") {
      const parsed = parseExpiresTimestamp(rawValue);
      if (parsed === undefined) result.expiresInvalid = true;
      else result.expires = parsed;
    }
  }
  return result;
};

export const parseSetCookie = (raw: string, now: number): SetCookieParseResult => {
  // Split "name=value; attr; attr" on the FIRST ';' only; only the first '=' inside
  // the name/value part is treated as the separator so values with embedded '=' pass
  // through intact (RFC 6265 §5.2 step 2).
  const semiIndex = raw.indexOf(";");
  const pairPart = (semiIndex >= 0 ? raw.slice(0, semiIndex) : raw).trim();
  const attributePart = semiIndex >= 0 ? raw.slice(semiIndex + 1) : "";

  const eqIndex = pairPart.indexOf("=");
  if (eqIndex < 0) return { kind: "invalid" };

  const rawName = pairPart.slice(0, eqIndex).trim();
  const rawValue = pairPart.slice(eqIndex + 1).trim();

  const nameCheck = validateCookieName(rawName);
  if (!nameCheck.ok) return { kind: "invalid" };
  const name = nameCheck.value;

  const valueCheck = validateCookieValue(rawValue);
  if (!valueCheck.ok) return { kind: "invalid", name };

  const attributes = parseAttributes(attributePart);

  // Max-Age wins over Expires when both are present (RFC 6265 §5.3 step 3). A parseable
  // Max-Age <= 0 is a deletion regardless of Expires.
  if (attributes.maxAge !== undefined) {
    if (attributes.maxAge <= 0) return { kind: "delete", name };
    return { kind: "update", name, value: valueCheck.value };
  }
  if (attributes.expires !== undefined && attributes.expires <= now) {
    return { kind: "delete", name };
  }
  return { kind: "update", name, value: valueCheck.value };
};

export type ApplySetCookiesInput = {
  session: SessionState;
  trackedCookies: TrackedCookie[];
  // Multiple Set-Cookie header values in the response order. Ordering matters for
  // "last valid wins" (FR-05); parse failures do not participate in ordering.
  setCookies: string[];
  now: number;
};

export type ApplySetCookiesResult = {
  session: SessionState;
  // Names actually written (either updated or deleted). Audit-log input; values are
  // deliberately absent.
  updatedNames: string[];
  deletedNames: string[];
  // Names that were structurally parseable but had bad attributes/values; safe to log.
  invalidNames: string[];
  // Count of Set-Cookie inputs where we could not safely isolate a name (log-only).
  invalidUnnamed: number;
};

const isTrackedName = (trackedCookies: TrackedCookie[], name: string): boolean =>
  trackedCookies.some((cookie) => cookie.enabled && cookie.name === name);

// Apply Set-Cookie parse results to a session state. Untracked names are skipped
// silently: the sec spec (FR-04) says only registered names participate.
export const applySetCookies = ({
  session,
  trackedCookies,
  setCookies,
  now,
}: ApplySetCookiesInput): ApplySetCookiesResult => {
  const next: Record<string, TrackedCookieValue> = { ...session.trackedCookies };
  const updatedNames: string[] = [];
  const deletedNames: string[] = [];
  const invalidNames: string[] = [];
  let invalidUnnamed = 0;
  let changed = false;

  for (const raw of setCookies) {
    const parsed = parseSetCookie(raw, now);
    if (parsed.kind === "invalid") {
      if (parsed.name) invalidNames.push(parsed.name);
      else invalidUnnamed += 1;
      continue;
    }
    if (!isTrackedName(trackedCookies, parsed.name)) continue;

    if (parsed.kind === "delete") {
      if (parsed.name in next) {
        delete next[parsed.name];
        deletedNames.push(parsed.name);
        changed = true;
      }
      continue;
    }

    next[parsed.name] = { name: parsed.name, value: parsed.value, capturedAt: now };
    updatedNames.push(parsed.name);
    changed = true;
  }

  const outSession = changed ? { ...session, trackedCookies: next, updatedAt: now } : session;
  return { session: outSession, updatedNames, deletedNames, invalidNames, invalidUnnamed };
};

export type PlannedCookie = { name: string; value: string };

export type CookiePlanInput = {
  profile: Profile;
  session?: Pick<SessionState, "trackedCookies"> | null;
};

// Send candidates for one profile: enabled Fixed Cookies first (in config order),
// then enabled Tracked Cookies whose value has been captured (also in config order).
// Same-name collision between Fixed and Tracked resolves to Fixed only (FR-10).
export const buildProfileCookieCandidates = ({
  profile,
  session,
}: CookiePlanInput): PlannedCookie[] => {
  const fixed: PlannedCookie[] = profile.fixedCookies
    .filter((cookie) => cookie.enabled)
    .map((cookie) => ({ name: cookie.name, value: cookie.value }));
  const fixedNames = new Set(fixed.map((cookie) => cookie.name));
  const tracked: PlannedCookie[] = profile.trackedCookies
    .filter((cookie) => cookie.enabled && !fixedNames.has(cookie.name))
    .flatMap((cookie): PlannedCookie[] => {
      const captured = session?.trackedCookies?.[cookie.name];
      if (!captured) return [];
      return [{ name: cookie.name, value: captured.value }];
    });
  return [...fixed, ...tracked];
};

// One Cookie header value from many candidates, joined per RFC 6265 §5.4.2: `name=value`
// pairs separated by "; ". Callers must not emit a Cookie header at all when the
// candidate list is empty (that is FR-13 / AC-24), which is why this returns a string
// or undefined instead of an empty string.
export const composeCookieHeaderValue = (candidates: PlannedCookie[]): string | undefined => {
  if (candidates.length === 0) return undefined;
  return candidates.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
};

// Helper that exposes both the Fixed-only helper (still useful for the popup) and the
// list of tracked cookie names a caller should track for a profile.
export const cookieNamesToTrack = (profile: Profile): string[] =>
  profile.trackedCookies.filter((cookie) => cookie.enabled).map((cookie) => cookie.name);

// Redact a Set-Cookie / cookie name+value combination down to the audit-safe subset.
// The audit port itself refuses value fields (see audit-db adapter), but centralising
// the redaction here removes the temptation to pass raw values through as `data`.
export type CookieAuditEntry = {
  name?: string;
  outcome: "updated" | "deleted" | "invalid";
};
