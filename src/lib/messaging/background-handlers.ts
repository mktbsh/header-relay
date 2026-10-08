import type { AnalyticsTracker } from "../analytics/tracker";
import { parseAuditLogLevel, type AuditLogLevel } from "../domain/audit-level";
import type { ToggleAllProfilesAction } from "../domain/profile-toggle";
import type { AppConfig, AuditLog, UiDensity } from "../domain/types";
import { onMessage, type StatusResponse } from "./messages";

export type ExtensionCommandHandlers = {
  getStatus: () => Promise<StatusResponse>;
  getConfig: () => Promise<AppConfig>;
  saveConfig: (config: AppConfig) => Promise<void>;
  toggleAllProfiles: () => Promise<ToggleAllProfilesAction>;
  deleteProfile: (profileId: string) => Promise<void>;
  toggleProfile: (profileId: string, enabled: boolean) => Promise<void>;
  setUiDensity: (density: UiDensity) => Promise<void>;
  updateFixedHeaderValue: (profileId: string, headerId: string, value: string) => Promise<void>;
  toggleFixedHeader: (profileId: string, headerId: string, enabled: boolean) => Promise<void>;
  updateFixedCookieValue: (profileId: string, cookieId: string, value: string) => Promise<void>;
  clearTrackedCookie: (profileId: string, cookieName: string) => Promise<void>;
  clearTrackedCookies: (profileId: string) => Promise<void>;
  clearSession: (profileId?: string) => Promise<void>;
  getAuditLogs: (limit?: number, minLevel?: AuditLogLevel) => Promise<AuditLog[]>;
  clearAuditLogs: () => Promise<void>;
};

export const registerBackgroundMessageHandlers = (
  handlers: ExtensionCommandHandlers,
  analytics: AnalyticsTracker,
) => [
  onMessage("GET_STATUS", () => handlers.getStatus()),
  onMessage("GET_CONFIG", () => handlers.getConfig()),
  onMessage("SAVE_CONFIG", ({ data }) => handlers.saveConfig(data)),
  onMessage("DELETE_PROFILE", ({ data }) => handlers.deleteProfile(data.profileId)),
  onMessage("TOGGLE_PROFILE", ({ data }) => handlers.toggleProfile(data.profileId, data.enabled)),
  onMessage("SET_UI_DENSITY", ({ data }) => handlers.setUiDensity(data.density)),
  onMessage("UPDATE_FIXED_HEADER_VALUE", ({ data }) =>
    handlers.updateFixedHeaderValue(data.profileId, data.headerId, data.value),
  ),
  onMessage("TOGGLE_FIXED_HEADER", ({ data }) =>
    handlers.toggleFixedHeader(data.profileId, data.headerId, data.enabled),
  ),
  onMessage("UPDATE_FIXED_COOKIE_VALUE", ({ data }) =>
    handlers.updateFixedCookieValue(data.profileId, data.cookieId, data.value),
  ),
  onMessage("CLEAR_TRACKED_COOKIE", ({ data }) =>
    handlers.clearTrackedCookie(data.profileId, data.cookieName),
  ),
  onMessage("CLEAR_TRACKED_COOKIES", ({ data }) => handlers.clearTrackedCookies(data.profileId)),
  onMessage("CLEAR_SESSION", ({ data }) => handlers.clearSession(data?.profileId)),
  onMessage("GET_AUDIT_LOGS", ({ data }) =>
    handlers.getAuditLogs(data?.limit, parseAuditLogLevel(data?.minLevel)),
  ),
  onMessage("CLEAR_AUDIT_LOGS", () => handlers.clearAuditLogs()),
  onMessage("TRACK_ANALYTICS_EVENT", ({ data }) => analytics.track(data)),
];
