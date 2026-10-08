import { describe, expect, it, vi } from "vitest";

import type { AppConfig, Profile, SessionState } from "../domain/types";

const profile = (id: string, enabled: boolean): Profile => ({
  id,
  name: id,
  enabled,
  targetOrigins: [{ id: `${id}-origin`, origin: "http://localhost:3000", enabled: true }],
  fixedHeaders: [{ id: `${id}-fixed`, name: `x-${id}`, value: "v", enabled: true }],
  captureHeaders: [],
  excludedPaths: [],
  fixedCookies: [],
  trackedCookies: [],
  migrationIssues: [],
  createdAt: 1,
  updatedAt: 1,
});

const session = (profileId: string): SessionState => ({
  profileId,
  phase: "authenticated",
  capturedHeaders: { "x-token": { name: "x-token", value: "token", capturedAt: 1 } },
  trackedCookies: {},
  dnrRuleIds: [10001],
  updatedAt: 1,
});

const createDeps = (initial: AppConfig) => {
  let config = initial;
  let pausedProfileIds: string[] | null = null;
  let sessions: Record<string, SessionState> = {
    "profile-a": session("profile-a"),
    "profile-b": session("profile-b"),
  };

  return {
    get config() {
      return config;
    },
    get sessions() {
      return sessions;
    },
    get pausedProfileIds() {
      return pausedProfileIds;
    },
    deps: {
      runtime: {
        syncRules: vi.fn(async () => [10001]),
        clearSession: vi.fn(async () => undefined),
        getLastSyncStatus: vi.fn(() => ({ status: "ok" as const })),
        clearTrackedCookies: vi.fn(async (profileId: string, cookieName?: string) => {
          const s = sessions[profileId];
          if (!s) return;
          const nextTracked = cookieName
            ? Object.fromEntries(
                Object.entries(s.trackedCookies ?? {}).filter(([n]) => n !== cookieName),
              )
            : {};
          sessions = { ...sessions, [profileId]: { ...s, trackedCookies: nextTracked } };
        }),
      },
      config: {
        get: vi.fn(async () => config),
        set: vi.fn(async (next: AppConfig) => {
          config = next;
        }),
      },
      session: {
        getAll: vi.fn(async () => sessions),
        clear: vi.fn(async (profileId?: string) => {
          if (!profileId) sessions = {};
          else delete sessions[profileId];
        }),
        clearTrackedCookies: vi.fn(async (profileId: string, cookieName?: string) => {
          const s = sessions[profileId];
          if (!s) return;
          const nextTracked = cookieName
            ? Object.fromEntries(
                Object.entries(s.trackedCookies ?? {}).filter(([n]) => n !== cookieName),
              )
            : {};
          sessions = { ...sessions, [profileId]: { ...s, trackedCookies: nextTracked } };
        }),
      },
      audit: {
        add: vi.fn(async () => undefined),
        recent: vi.fn(async () => []),
        clear: vi.fn(async () => undefined),
      },
      pausedProfileIds: {
        getValue: vi.fn(async () => pausedProfileIds),
        setValue: vi.fn(async (next: string[] | null) => {
          pausedProfileIds = next;
        }),
      },
    },
  };
};

const baseConfig = (): AppConfig => ({
  schemaVersion: 5,
  profiles: [profile("profile-a", true), profile("profile-b", true)],
});

const createCommands = async (state: ReturnType<typeof createDeps>) => {
  const { createExtensionCommands } = await import("./extension-commands");
  return createExtensionCommands(
    state.deps as unknown as Parameters<typeof createExtensionCommands>[0],
  );
};

describe("extension commands", () => {
  it("passes the audit log query to the audit port", async () => {
    const state = createDeps(baseConfig());
    const commands = await createCommands(state);

    await commands.getAuditLogs(25, "warn");

    expect(state.deps.audit.recent).toHaveBeenCalledWith({ limit: 25, minLevel: "warn" });
  });

  it("reports every enabled profile and the compiled runtime state", async () => {
    const state = createDeps(baseConfig());
    const commands = await createCommands(state);

    const status = await commands.getStatus();

    expect(status).not.toHaveProperty("selectedProfileId");
    expect(status.runtime.enabledProfileIds).toEqual(["profile-a", "profile-b"]);
    expect(status.runtime.dnrRuleCount).toBe(1);
    expect(status.runtime.errors).toEqual([]);
    expect(Object.keys(status.sessions)).toEqual(["profile-a", "profile-b"]);
  });

  it("reports the conflict when two enabled profiles claim the same header", async () => {
    const conflicting = baseConfig();
    conflicting.profiles[1] = {
      ...conflicting.profiles[1]!,
      fixedHeaders: [{ id: "b-fixed", name: "x-profile-a", value: "other", enabled: true }],
    };
    const state = createDeps(conflicting);
    const commands = await createCommands(state);

    const status = await commands.getStatus();

    expect(status.runtime.errors).toHaveLength(1);
    const [firstError] = status.runtime.errors;
    expect(firstError?.code === "header-conflict" && firstError.headerName).toBe("x-profile-a");
  });

  it("deletes a profile and drops its session", async () => {
    const state = createDeps(baseConfig());
    const commands = await createCommands(state);

    await commands.deleteProfile("profile-a");

    expect(state.config.profiles.map((profile) => profile.id)).toEqual(["profile-b"]);
    expect(Object.keys(state.sessions)).toEqual(["profile-b"]);
    // Deletion is a user operation, not a diagnostic: it must not be audited.
    expect(state.deps.audit.add).not.toHaveBeenCalled();
    expect(state.deps.runtime.syncRules).toHaveBeenCalled();
  });

  it("keeps surviving profiles when deleting another profile", async () => {
    const state = createDeps(baseConfig());
    const commands = await createCommands(state);

    await commands.deleteProfile("profile-b");

    expect(state.config.profiles.map((profile) => profile.id)).toEqual(["profile-a"]);
  });

  it("refuses to delete the last profile or an unknown one", async () => {
    const single: AppConfig = {
      schemaVersion: 5,
      profiles: [profile("profile-a", true)],
    };
    const state = createDeps(single);
    const commands = await createCommands(state);

    await expect(commands.deleteProfile("profile-a")).rejects.toThrow("last profile");
    await expect(commands.deleteProfile("profile-x")).rejects.toThrow("no longer exists");
    expect(state.deps.config.set).not.toHaveBeenCalled();
  });

  it("persists ui density without touching rules or sessions", async () => {
    const state = createDeps(baseConfig());
    const commands = await createCommands(state);

    await commands.setUiDensity("compact");
    expect(state.config.uiDensity).toBe("compact");

    await commands.setUiDensity("compact");
    expect(state.deps.config.set).toHaveBeenCalledTimes(1);
    expect(state.deps.runtime.syncRules).not.toHaveBeenCalled();
    expect(state.deps.session.clear).not.toHaveBeenCalled();
  });

  it("clears only the disabled profile's session when toggling it off", async () => {
    const state = createDeps(baseConfig());
    const commands = await createCommands(state);

    await commands.toggleProfile("profile-a", false);

    expect(state.config.profiles[0]?.enabled).toBe(false);
    expect(Object.keys(state.sessions)).toEqual(["profile-b"]);
    expect(state.deps.runtime.syncRules).toHaveBeenCalled();
    // The toggle is a user operation, not a diagnostic: it must not be audited.
    expect(state.deps.audit.add).not.toHaveBeenCalled();
  });

  it("pauses all enabled profiles and restores the saved set", async () => {
    const state = createDeps(baseConfig());
    const commands = await createCommands(state);

    await expect(commands.toggleAllProfiles()).resolves.toBe("paused");
    expect(state.config.profiles.map((item) => item.enabled)).toEqual([false, false]);
    expect(state.pausedProfileIds).toEqual(["profile-a", "profile-b"]);
    expect(state.sessions).toEqual({});

    await expect(commands.toggleAllProfiles()).resolves.toBe("restored");
    expect(state.config.profiles.map((item) => item.enabled)).toEqual([true, true]);
    expect(state.pausedProfileIds).toBeNull();
  });

  it("does nothing when all profiles are disabled without a saved set", async () => {
    const state = createDeps({
      ...baseConfig(),
      profiles: baseConfig().profiles.map((item) => ({ ...item, enabled: false })),
    });
    const commands = await createCommands(state);

    await expect(commands.toggleAllProfiles()).resolves.toBe("noop");
    expect(state.deps.config.set).not.toHaveBeenCalled();
    expect(state.deps.runtime.syncRules).not.toHaveBeenCalled();
  });

  it("clears the saved set when a normal profile toggle follows a pause", async () => {
    const state = createDeps(baseConfig());
    const commands = await createCommands(state);

    await commands.toggleAllProfiles();
    await commands.toggleProfile("profile-a", true);

    expect(state.pausedProfileIds).toBeNull();
  });

  it("clears the session only of profiles whose rules changed on save", async () => {
    const state = createDeps(baseConfig());
    const commands = await createCommands(state);

    const next = structuredClone(state.config);
    next.profiles[0] = {
      ...next.profiles[0]!,
      fixedHeaders: [{ id: "a-fixed", name: "x-changed", value: "v", enabled: true }],
    };
    next.profiles[1] = { ...next.profiles[1]!, name: "renamed only" };

    await commands.saveConfig(next);

    expect(Object.keys(state.sessions)).toEqual(["profile-b"]);
    expect(state.deps.runtime.syncRules).toHaveBeenCalled();
  });

  it("clears the profile session when a Target Origin is removed", async () => {
    const state = createDeps(baseConfig());
    const commands = await createCommands(state);
    const next = structuredClone(state.config);
    next.profiles[0] = { ...next.profiles[0]!, targetOrigins: [] };

    await commands.saveConfig(next);

    expect(Object.keys(state.sessions)).toEqual(["profile-b"]);
    expect(state.deps.session.clear).toHaveBeenCalledWith("profile-a");
  });

  describe("updateFixedHeaderValue", () => {
    const publishedConfig = (): AppConfig => {
      const config = baseConfig();
      config.profiles[0] = {
        ...config.profiles[0]!,
        fixedHeaders: [
          {
            id: "fixed-note",
            name: "x-note",
            value: "before",
            enabled: true,
            popup: { visible: true, input: "text" },
          },
          {
            id: "fixed-track",
            name: "x-release-track",
            value: "stable",
            enabled: true,
            popup: {
              visible: true,
              input: "select",
              options: [
                { label: "Stable", value: "stable" },
                { label: "Canary", value: "canary" },
              ],
            },
          },
          { id: "fixed-private", name: "x-private", value: "v", enabled: true },
        ],
      };
      return config;
    };

    const headerValues = (state: ReturnType<typeof createDeps>) =>
      Object.fromEntries(state.config.profiles[0]!.fixedHeaders.map((h) => [h.id, h.value]));

    it("updates a text header and a select header, touching nothing else", async () => {
      const state = createDeps(publishedConfig());
      const commands = await createCommands(state);

      await commands.updateFixedHeaderValue("profile-a", "fixed-note", "after");
      await commands.updateFixedHeaderValue("profile-a", "fixed-track", "canary");

      expect(headerValues(state)).toEqual({
        "fixed-note": "after",
        "fixed-track": "canary",
        "fixed-private": "v",
      });
      expect(state.config.profiles[1]).toEqual(publishedConfig().profiles[1]);
      expect(state.deps.runtime.syncRules).toHaveBeenCalledTimes(2);
    });

    it("keeps the captured session: a fixed value says nothing about what is captured", async () => {
      const state = createDeps(publishedConfig());
      const commands = await createCommands(state);

      await commands.updateFixedHeaderValue("profile-a", "fixed-track", "canary");

      expect(state.deps.session.clear).not.toHaveBeenCalled();
      expect(Object.keys(state.sessions)).toEqual(["profile-a", "profile-b"]);
    });

    it("writes no audit entry: value edits are user operations and values can be tokens", async () => {
      const state = createDeps(publishedConfig());
      const commands = await createCommands(state);

      await commands.updateFixedHeaderValue("profile-a", "fixed-track", "canary");

      expect(state.deps.audit.add).not.toHaveBeenCalled();
    });

    it("fails without writing when the target is gone, disabled or unpublished", async () => {
      const config = publishedConfig();
      config.profiles[0]!.fixedHeaders[0] = {
        ...config.profiles[0]!.fixedHeaders[0]!,
        enabled: false,
      };
      const state = createDeps(config);
      const commands = await createCommands(state);

      await expect(commands.updateFixedHeaderValue("profile-a", "fixed-gone", "x")).rejects.toThrow(
        "no longer exists",
      );
      await expect(
        commands.updateFixedHeaderValue("profile-x", "fixed-track", "x"),
      ).rejects.toThrow("no longer exists");
      // disabled header, and one that was never published to the popup
      await expect(commands.updateFixedHeaderValue("profile-a", "fixed-note", "x")).rejects.toThrow(
        "no longer editable",
      );
      await expect(
        commands.updateFixedHeaderValue("profile-a", "fixed-private", "x"),
      ).rejects.toThrow("no longer editable");

      expect(state.deps.config.set).not.toHaveBeenCalled();
      expect(state.deps.runtime.syncRules).not.toHaveBeenCalled();
    });
  });

  describe("toggleFixedHeader", () => {
    const publishedConfig = (): AppConfig => {
      const config = baseConfig();
      config.profiles[0] = {
        ...config.profiles[0]!,
        fixedHeaders: [
          {
            id: "fixed-track",
            name: "x-release-track",
            value: "stable",
            enabled: false,
            popup: { visible: true, input: "text" },
          },
          { id: "fixed-private", name: "x-private", value: "v", enabled: true },
        ],
      };
      return config;
    };

    it("toggles a popup-visible fixed header without clearing captured values", async () => {
      const state = createDeps(publishedConfig());
      const commands = await createCommands(state);

      await commands.toggleFixedHeader("profile-a", "fixed-track", true);

      expect(state.config.profiles[0]?.fixedHeaders[0]?.enabled).toBe(true);
      expect(state.deps.session.clear).not.toHaveBeenCalled();
      expect(state.deps.runtime.syncRules).toHaveBeenCalledTimes(1);
    });

    it("rejects unknown, disabled-profile, and unpublished headers", async () => {
      const config = publishedConfig();
      const state = createDeps(config);
      const commands = await createCommands(state);

      await expect(commands.toggleFixedHeader("profile-a", "fixed-gone", true)).rejects.toThrow(
        "no longer exists",
      );
      await expect(commands.toggleFixedHeader("profile-a", "fixed-private", false)).rejects.toThrow(
        "no longer toggleable",
      );

      const disabledProfile = publishedConfig();
      disabledProfile.profiles[0] = { ...disabledProfile.profiles[0]!, enabled: false };
      const disabledState = createDeps(disabledProfile);
      const disabledCommands = await createCommands(disabledState);
      await expect(
        disabledCommands.toggleFixedHeader("profile-a", "fixed-track", true),
      ).rejects.toThrow("no longer toggleable");

      expect(state.deps.config.set).not.toHaveBeenCalled();
      expect(state.deps.runtime.syncRules).not.toHaveBeenCalled();
    });
  });

  describe("cookie commands", () => {
    const cookieConfig = (): AppConfig => ({
      schemaVersion: 5,
      profiles: [
        {
          ...profile("profile-a", true),
          fixedCookies: [
            {
              id: "fc-1",
              name: "SID",
              value: "before",
              enabled: true,
              popup: { visible: true, input: "text" },
            },
            { id: "fc-2", name: "PRIVATE", value: "x", enabled: true },
            {
              id: "fc-3",
              name: "DISABLED",
              value: "d",
              enabled: false,
              popup: { visible: true, input: "text" },
            },
          ],
          trackedCookies: [{ id: "tc-1", name: "SESSION", enabled: true }],
          migrationIssues: [],
        },
      ],
    });

    const withTracked = (state: ReturnType<typeof createDeps>) => {
      Object.assign(state.sessions, {
        "profile-a": {
          ...state.sessions["profile-a"],
          trackedCookies: {
            SESSION: { name: "SESSION", value: "abc", updatedAt: 1 },
            OTHER: { name: "OTHER", value: "xyz", updatedAt: 1 },
          },
        },
      });
    };

    it("updates a popup-visible fixed cookie value and clears the tracked cookies (AC-15)", async () => {
      const state = createDeps(cookieConfig());
      withTracked(state);
      const commands = await createCommands(state);

      await commands.updateFixedCookieValue("profile-a", "fc-1", "after");

      expect(state.config.profiles[0]!.fixedCookies[0]!.value).toBe("after");
      // Tracked cookies wiped because fixed value change invalidates the effective Cookie header.
      expect(state.deps.session.clear).toHaveBeenCalledWith("profile-a");
      expect(state.deps.runtime.syncRules).toHaveBeenCalled();
    });

    it("rejects an unknown, disabled, or non-popup cookie", async () => {
      const state = createDeps(cookieConfig());
      const commands = await createCommands(state);

      await expect(commands.updateFixedCookieValue("profile-a", "fc-gone", "x")).rejects.toThrow(
        "no longer exists",
      );
      await expect(commands.updateFixedCookieValue("profile-a", "fc-3", "x")).rejects.toThrow(
        "no longer editable",
      );
      // fc-2 has no popup config → not editable from popup.
      await expect(commands.updateFixedCookieValue("profile-a", "fc-2", "x")).rejects.toThrow(
        "no longer editable",
      );
      expect(state.deps.config.set).not.toHaveBeenCalled();
    });

    it("clears a single tracked cookie by name (AC-16)", async () => {
      const state = createDeps(cookieConfig());
      withTracked(state);
      const commands = await createCommands(state);

      await commands.clearTrackedCookie("profile-a", "SESSION");
      expect(state.deps.runtime.clearTrackedCookies).toHaveBeenCalledWith("profile-a", "SESSION");
    });

    it("clears every tracked cookie for one profile (AC-36)", async () => {
      const state = createDeps(cookieConfig());
      withTracked(state);
      const commands = await createCommands(state);

      await commands.clearTrackedCookies("profile-a");
      expect(state.deps.runtime.clearTrackedCookies).toHaveBeenCalledWith("profile-a");
    });
  });
});
