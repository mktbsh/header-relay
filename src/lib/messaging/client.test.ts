import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../domain/types";

const sendMessage = vi.fn();
const featureFlags = vi.hoisted(() => ({ analyticsTracking: true }));

vi.mock("./messages", () => ({
  sendMessage: (...args: unknown[]) => sendMessage(...args),
}));

vi.mock("../feature-flags", () => ({ featureFlags }));

const config: AppConfig = {
  schemaVersion: 5,
  profiles: [
    {
      id: "profile-test",
      name: "Test",
      enabled: true,
      targetOrigins: [],
      fixedHeaders: [],
      captureHeaders: [],
      excludedPaths: [],
      fixedCookies: [],
      trackedCookies: [],
      migrationIssues: [],
      createdAt: 1,
      updatedAt: 1,
    },
  ],
};

describe("extensionClient", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMessage.mockReset();
    featureFlags.analyticsTracking = true;
  });

  it("sends typed background commands through the shared messenger", async () => {
    const status = {
      profiles: [],
      sessions: {},
      runtime: { enabledProfileIds: [], dnrRuleCount: 0, errors: [], warnings: [] },
    };
    sendMessage.mockResolvedValueOnce(status);
    const { extensionClient } = await import("./client");

    await expect(extensionClient.getStatus()).resolves.toEqual(status);

    expect(sendMessage).toHaveBeenCalledWith("GET_STATUS");
  });

  it("keeps command payload shapes out of UI callers", async () => {
    sendMessage.mockResolvedValueOnce(undefined);
    const { extensionClient } = await import("./client");

    await extensionClient.saveConfig(config);

    expect(sendMessage).toHaveBeenNthCalledWith(1, "SAVE_CONFIG", config);
  });

  it("sends the audit log query to the background", async () => {
    sendMessage.mockResolvedValueOnce([]);
    const { extensionClient } = await import("./client");

    await extensionClient.getAuditLogs(25, "warn");

    expect(sendMessage).toHaveBeenCalledWith("GET_AUDIT_LOGS", {
      limit: 25,
      minLevel: "warn",
    });
  });

  it("sends analytics events without exposing messenger details", async () => {
    sendMessage.mockResolvedValueOnce(undefined);
    const { extensionClient } = await import("./client");
    const event = { name: "page_view", params: { surface: "popup" } } as const;

    await extensionClient.trackAnalyticsEvent(event);

    expect(sendMessage).toHaveBeenCalledWith("TRACK_ANALYTICS_EVENT", event);
  });

  it("keeps analytics best-effort when the UI context is closing", async () => {
    sendMessage.mockRejectedValueOnce(new Error("Extension context invalidated"));
    const { extensionClient } = await import("./client");

    await expect(
      extensionClient.trackAnalyticsEvent({ name: "page_view", params: { surface: "popup" } }),
    ).resolves.toBeUndefined();
  });

  it("does not wake the service worker when analytics is disabled", async () => {
    featureFlags.analyticsTracking = false;
    const { extensionClient } = await import("./client");

    await extensionClient.trackAnalyticsEvent({
      name: "page_view",
      params: { surface: "popup" },
    });

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
