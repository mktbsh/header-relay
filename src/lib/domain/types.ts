import type { AuditLogLevel } from "./audit-level";

export type AuthPhase = "disabled" | "unauthenticated" | "authenticated";

export type TargetOrigin = {
  id: string;
  origin: string;
  enabled: boolean;
};

export type FixedHeaderValueOption = {
  label: string;
  value: string;
};

// Absent popup config means the header stays out of the popup: existing headers must
// not become editable (or even visible) there just because the schema grew a field.
export type FixedHeaderPopupConfig = {
  visible: boolean;
  input: "text" | "select";
  options?: FixedHeaderValueOption[];
};

export type FixedHeader = {
  id: string;
  name: string;
  value: string;
  enabled: boolean;
  popup?: FixedHeaderPopupConfig;
};

export type CaptureHeader = {
  id: string;
  name: string;
  enabled: boolean;
};

export type ExcludedPath = {
  id: string;
  pathPrefix: string;
  enabled: boolean;
};

// Cookie names are case-sensitive per RFC 6265bis: names are stored verbatim (no
// normalization). fixedCookies and trackedCookies live alongside fixed/capture
// headers, but never in the same code path: the general header helpers must not
// touch cookies, and the cookie helpers must not touch general headers.
export type FixedCookie = {
  id: string;
  name: string;
  value: string;
  enabled: boolean;
  popup?: FixedHeaderPopupConfig;
};

export type TrackedCookie = {
  id: string;
  name: string;
  enabled: boolean;
};

// A migration issue is a snapshot of the raw header that could not be losslessly
// converted to Fixed/Tracked Cookie. Compiler and DNR builder must never read this
// field; it exists only so the UI can show the user what to fix.
export type MigrationIssueSource = "fixed-header-cookie" | "capture-header-cookie";

export type MigrationIssue = {
  id: string;
  source: MigrationIssueSource;
  originalName: string;
  originalValue?: string;
  originalPopup?: FixedHeaderPopupConfig;
  originalEnabled: boolean;
  reason: MigrationIssueReason;
};

export type MigrationIssueReason =
  | "cookie-parse-failed"
  | "duplicate-cookie-name"
  | "popup-select-options-mismatch"
  | "capture-cookie-not-convertible";

export type Profile = {
  id: string;
  name: string;
  enabled: boolean;
  targetOrigins: TargetOrigin[];
  fixedHeaders: FixedHeader[];
  captureHeaders: CaptureHeader[];
  excludedPaths: ExcludedPath[];
  fixedCookies: FixedCookie[];
  trackedCookies: TrackedCookie[];
  migrationIssues: MigrationIssue[];
  createdAt: number;
  updatedAt: number;
};

export type CapturedHeaderValue = {
  name: string;
  value: string;
  capturedAt: number;
};

export type TrackedCookieValue = {
  name: string;
  value: string;
  capturedAt: number;
};

export type SessionState = {
  profileId: string;
  phase: AuthPhase;
  capturedHeaders: Record<string, CapturedHeaderValue>;
  // Keyed by cookie name (case-sensitive). Cleared on profile disable, config
  // change, permission revoke, manual clear, extension reload/update, browser restart.
  trackedCookies: Record<string, TrackedCookieValue>;
  dnrRuleIds: number[];
  lastError?: string;
  updatedAt: number;
};

// Only events needed to debug header capture and DNR sync failures. User operations
// (enabling a profile, editing a value, a successful manual clear) are derivable from
// the current config/session state and are deliberately NOT recorded — the audit log
// must stay a diagnostic tool, not a user-activity history (issue #56).
export type AuditLogEvent =
  | "origin_matched"
  | "headers_captured"
  | "session_cleared"
  | "config_compiled"
  | "dnr_rules_synced"
  | "cookies_updated"
  | "cookie_parse_failed"
  | "error";

export type AuditLog = {
  id: string;
  ts: number;
  level: AuditLogLevel;
  profileId?: string;
  tabId?: number;
  requestId?: string;
  event: AuditLogEvent;
  // Runtime/display data only — audit adapters must never persist this field.
  // Header values likewise must never appear in message/data/headerNames: audit
  // entries outlive the session and are the one place secrets could leak to disk.
  url?: string;
  method?: string;
  statusCode?: number;
  headerNames?: string[];
  message?: string;
  data?: Record<string, unknown>;
};

// Display density shared by the popup and manage pages. Absent means "comfortable";
// it is presentation only and never influences which headers the browser applies.
export type UiDensity = "comfortable" | "compact";

export type AppConfig = {
  schemaVersion: number;
  uiDensity?: UiDensity;
  profiles: Profile[];
};

// Sessions are keyed by profile id: every enabled profile captures and attaches
// headers independently.
export type RuntimeState = {
  sessions: Record<string, SessionState>;
};
