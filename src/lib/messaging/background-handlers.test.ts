import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExtensionProtocolMap } from "./messages";

type Listener = (message: { data: unknown }) => unknown;

const listeners = new Map<keyof ExtensionProtocolMap, Listener>();

vi.mock("./messages", () => ({
  onMessage: vi.fn((type: keyof ExtensionProtocolMap, listener: Listener) => {
    listeners.set(type, listener);
    return () => listeners.delete(type);
  }),
}));

const commandHandlers = () => ({
  getStatus: vi.fn(async () => ({
    profiles: [],
    sessions: {},
    runtime: { enabledProfileIds: [], dnrRuleCount: 0, errors: [], warnings: [] },
  })),
  getConfig: vi.fn(async () => ({ schemaVersion: 5, profiles: [] })),
  saveConfig: vi.fn(async () => undefined),
  toggleAllProfiles: vi.fn(async () => "noop" as const),
  deleteProfile: vi.fn(async () => undefined),
  toggleProfile: vi.fn(async () => undefined),
  setUiDensity: vi.fn(async () => undefined),
  updateFixedHeaderValue: vi.fn(async () => undefined),
  toggleFixedHeader: vi.fn(async () => undefined),
  updateFixedCookieValue: vi.fn(async () => undefined),
  clearTrackedCookie: vi.fn(async () => undefined),
  clearTrackedCookies: vi.fn(async () => undefined),
  clearSession: vi.fn(async () => undefined),
  getAuditLogs: vi.fn(async () => []),
  clearAuditLogs: vi.fn(async () => undefined),
});

const analyticsTracker = () => ({
  track: vi.fn(async () => undefined),
});

describe("registerBackgroundMessageHandlers", () => {
  beforeEach(() => {
    vi.resetModules();
    listeners.clear();
  });

  it("registers every background command on the shared messenger", async () => {
    const { registerBackgroundMessageHandlers } = await import("./background-handlers");

    registerBackgroundMessageHandlers(commandHandlers(), analyticsTracker());

    expect([...listeners.keys()]).toEqual([
      "GET_STATUS",
      "GET_CONFIG",
      "SAVE_CONFIG",
      "DELETE_PROFILE",
      "TOGGLE_PROFILE",
      "SET_UI_DENSITY",
      "UPDATE_FIXED_HEADER_VALUE",
      "TOGGLE_FIXED_HEADER",
      "UPDATE_FIXED_COOKIE_VALUE",
      "CLEAR_TRACKED_COOKIE",
      "CLEAR_TRACKED_COOKIES",
      "CLEAR_SESSION",
      "GET_AUDIT_LOGS",
      "CLEAR_AUDIT_LOGS",
      "TRACK_ANALYTICS_EVENT",
    ]);
  });

  it("adapts messenger payloads to command handler arguments", async () => {
    const handlers = commandHandlers();
    const analytics = analyticsTracker();
    const { registerBackgroundMessageHandlers } = await import("./background-handlers");

    registerBackgroundMessageHandlers(handlers, analytics);

    await listeners.get("TOGGLE_PROFILE")?.({
      data: { profileId: "profile-test", enabled: false },
    });
    await listeners.get("GET_AUDIT_LOGS")?.({ data: { limit: 25, minLevel: "warn" } });
    await listeners.get("CLEAR_SESSION")?.({ data: { profileId: "profile-test" } });
    await listeners.get("UPDATE_FIXED_HEADER_VALUE")?.({
      data: { profileId: "profile-test", headerId: "fixed-track", value: "canary" },
    });
    await listeners.get("TOGGLE_FIXED_HEADER")?.({
      data: { profileId: "profile-test", headerId: "fixed-track", enabled: false },
    });
    await listeners.get("DELETE_PROFILE")?.({ data: { profileId: "profile-test" } });
    await listeners.get("SET_UI_DENSITY")?.({ data: { density: "compact" } });
    const event = { name: "page_view", params: { surface: "popup" } } as const;
    await listeners.get("TRACK_ANALYTICS_EVENT")?.({ data: event });

    expect(handlers.updateFixedHeaderValue).toHaveBeenCalledWith(
      "profile-test",
      "fixed-track",
      "canary",
    );
    expect(handlers.toggleFixedHeader).toHaveBeenCalledWith("profile-test", "fixed-track", false);
    expect(handlers.deleteProfile).toHaveBeenCalledWith("profile-test");
    expect(handlers.setUiDensity).toHaveBeenCalledWith("compact");
    expect(handlers.toggleProfile).toHaveBeenCalledWith("profile-test", false);
    expect(handlers.getAuditLogs).toHaveBeenCalledWith(25, "warn");
    expect(handlers.clearSession).toHaveBeenCalledWith("profile-test");
    expect(analytics.track).toHaveBeenCalledWith(event);
  });

  it("normalizes an unknown audit level from another extension context", async () => {
    const handlers = commandHandlers();
    const { registerBackgroundMessageHandlers } = await import("./background-handlers");

    registerBackgroundMessageHandlers(handlers, analyticsTracker());
    await listeners.get("GET_AUDIT_LOGS")?.({
      data: { limit: 25, minLevel: "unknown" },
    });

    expect(handlers.getAuditLogs).toHaveBeenCalledWith(25, "debug");
  });
});
