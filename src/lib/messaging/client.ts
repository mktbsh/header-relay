import type { AnalyticsEvent } from "../analytics/events";
import type { AuditLogLevel } from "../domain/audit-level";
import type { AppConfig, UiDensity } from "../domain/types";
import { featureFlags } from "../feature-flags";
import { sendMessage } from "./messages";

export const extensionClient = {
  getStatus: () => sendMessage("GET_STATUS"),
  getConfig: () => sendMessage("GET_CONFIG"),
  saveConfig: (config: AppConfig) => sendMessage("SAVE_CONFIG", config),
  deleteProfile: (profileId: string) => sendMessage("DELETE_PROFILE", { profileId }),
  toggleProfile: (profileId: string, enabled: boolean) =>
    sendMessage("TOGGLE_PROFILE", { profileId, enabled }),
  setUiDensity: (density: UiDensity) => sendMessage("SET_UI_DENSITY", { density }),
  updateFixedHeaderValue: (profileId: string, headerId: string, value: string) =>
    sendMessage("UPDATE_FIXED_HEADER_VALUE", { profileId, headerId, value }),
  toggleFixedHeader: (profileId: string, headerId: string, enabled: boolean) =>
    sendMessage("TOGGLE_FIXED_HEADER", { profileId, headerId, enabled }),
  updateFixedCookieValue: (profileId: string, cookieId: string, value: string) =>
    sendMessage("UPDATE_FIXED_COOKIE_VALUE", { profileId, cookieId, value }),
  clearTrackedCookie: (profileId: string, cookieName: string) =>
    sendMessage("CLEAR_TRACKED_COOKIE", { profileId, cookieName }),
  clearTrackedCookies: (profileId: string) => sendMessage("CLEAR_TRACKED_COOKIES", { profileId }),
  clearSession: (profileId?: string) => sendMessage("CLEAR_SESSION", { profileId }),
  getAuditLogs: (limit?: number, minLevel?: AuditLogLevel) =>
    sendMessage("GET_AUDIT_LOGS", { limit, minLevel }),
  clearAuditLogs: () => sendMessage("CLEAR_AUDIT_LOGS"),
  // Analytics is deliberately best-effort: losing telemetry must never block a user action.
  async trackAnalyticsEvent(event: AnalyticsEvent) {
    if (!featureFlags.analyticsTracking) return;
    try {
      await sendMessage("TRACK_ANALYTICS_EVENT", event);
    } catch {
      // The caller may be closing (especially the popup) while the message is in flight.
    }
  },
};
