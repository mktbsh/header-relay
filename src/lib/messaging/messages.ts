import { defineExtensionMessaging } from "@webext-core/messaging";

import type { AnalyticsEvent } from "../analytics/events";
import type { CompileError, CompileWarning } from "../compiler/compile-config";
import type { DnrSyncStatus } from "../dnr/rule-sync";
import type { AuditLogLevel } from "../domain/audit-level";
import type { AppConfig, AuditLog, Profile, SessionState, UiDensity } from "../domain/types";

export type ToggleProfilePayload = {
  profileId: string;
  enabled: boolean;
};

export type SetUiDensityPayload = {
  density: UiDensity;
};

export type GetAuditLogsPayload = {
  limit?: number;
  minLevel?: AuditLogLevel;
};

export type ClearSessionPayload = {
  profileId?: string;
};

// Value-only patch addressed by id. The popup never round-trips the whole config, so a
// popup left open across an unrelated save cannot resurrect the settings it was showing.
export type UpdateFixedHeaderValuePayload = {
  profileId: string;
  headerId: string;
  value: string;
};

export type ToggleFixedHeaderPayload = {
  profileId: string;
  headerId: string;
  enabled: boolean;
};

export type UpdateFixedCookieValuePayload = {
  profileId: string;
  cookieId: string;
  value: string;
};

export type ClearTrackedCookiePayload = {
  profileId: string;
  cookieName: string;
};

export type ClearTrackedCookiesPayload = {
  profileId: string;
};

export interface ExtensionProtocolMap {
  GET_STATUS(): StatusResponse;
  GET_CONFIG(): AppConfig;
  SAVE_CONFIG(config: AppConfig): void;
  DELETE_PROFILE(data: { profileId: string }): void;
  TOGGLE_PROFILE(data: ToggleProfilePayload): void;
  SET_UI_DENSITY(data: SetUiDensityPayload): void;
  UPDATE_FIXED_HEADER_VALUE(data: UpdateFixedHeaderValuePayload): void;
  TOGGLE_FIXED_HEADER(data: ToggleFixedHeaderPayload): void;
  UPDATE_FIXED_COOKIE_VALUE(data: UpdateFixedCookieValuePayload): void;
  CLEAR_TRACKED_COOKIE(data: ClearTrackedCookiePayload): void;
  CLEAR_TRACKED_COOKIES(data: ClearTrackedCookiesPayload): void;
  CLEAR_SESSION(data?: ClearSessionPayload): void;
  GET_AUDIT_LOGS(data?: GetAuditLogsPayload): AuditLog[];
  CLEAR_AUDIT_LOGS(): void;
  TRACK_ANALYTICS_EVENT(event: AnalyticsEvent): void;
}

// Whole-runtime view: enabled profiles, the single session ruleset they compiled
// into, and the compiler's verdict. syncStatus is the outcome of the most recent
// DNR sync attempt (Ticket 06); UI uses it to distinguish "everything is live" from
// "we kept the previous ruleset because a sync failed" from "stale rules may still
// be firing that we couldn't remove."
export type RuntimeStatus = {
  enabledProfileIds: string[];
  dnrRuleCount: number;
  errors: CompileError[];
  warnings: CompileWarning[];
  syncStatus?: DnrSyncStatus;
  syncError?: string;
  unremovedRuleIds?: number[];
};

export type StatusResponse = {
  uiDensity?: UiDensity;
  profiles: Profile[];
  sessions: Record<string, SessionState>;
  runtime: RuntimeStatus;
};

export const { sendMessage, onMessage } = defineExtensionMessaging<ExtensionProtocolMap>();
