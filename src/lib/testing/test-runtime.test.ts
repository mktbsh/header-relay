import { describe, expect, it } from "vitest";

import { CONFIG_SCHEMA_VERSION } from "../domain/default-profile";
import type { AppConfig, Profile } from "../domain/types";
import { createTestRuntime } from "./test-runtime";

// Deliberately thin. Unit tests already assert what each module does; running the same
// assertions again through the harness would only mean fixing two places per change.
// What unit tests structurally cannot see is the seams — a module not calling a
// collaborator it should, or the composition root wiring the wrong function — because
// they replace those seams with fakes. That is all this file is for.

const profile = (overrides: Partial<Profile> & Pick<Profile, "id" | "name">): Profile => ({
  enabled: true,
  targetOrigins: [{ id: `${overrides.id}-origin`, origin: "http://localhost:3000", enabled: true }],
  fixedHeaders: [],
  captureHeaders: [],
  excludedPaths: [],
  fixedCookies: [],
  trackedCookies: [],
  migrationIssues: [],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const configOf = (...profiles: Profile[]): AppConfig => ({
  schemaVersion: CONFIG_SCHEMA_VERSION,
  profiles,
});

const commonHeaders = profile({
  id: "profile-common",
  name: "Common Headers",
  fixedHeaders: [{ id: "fixed-platform", name: "x-app-platform", value: "ios", enabled: true }],
});

const oauthCapture = profile({
  id: "profile-oauth",
  name: "OAuth Capture",
  captureHeaders: [{ id: "capture-token", name: "x-auth-token", enabled: true }],
});

const API_URL = "http://localhost:3000/api/me";

describe("header relay driven through in-memory ports", () => {
  it("carries a captured header all the way to the applied ruleset", async () => {
    const runtime = await createTestRuntime({ config: configOf(commonHeaders, oauthCapture) });

    expect(runtime.attachedHeaders(API_URL)).toEqual({ "x-app-platform": "ios" });

    await runtime.respond({
      url: API_URL,
      responseHeaders: [{ name: "X-Auth-Token", value: "t1" }],
    });

    // One path through every seam: config store -> capture -> compile -> DNR sync.
    expect(runtime.attachedHeaders(API_URL)).toEqual({
      "x-app-platform": "ios",
      "x-auth-token": "t1",
    });

    // Read it back through the session store too: the ruleset is compiled from the
    // in-flight sessions, so it stays correct even if nothing was ever persisted. Only
    // this assertion notices a session that was never written.
    const status = await runtime.commands.getStatus();
    expect(status.sessions[oauthCapture.id]?.capturedHeaders["x-auth-token"]?.value).toBe("t1");
  });

  it("applies no rule at all while two enabled profiles conflict, and recovers on disable", async () => {
    const rival = profile({
      id: "profile-rival",
      name: "Rival",
      fixedHeaders: [{ id: "rival-fixed", name: "x-app-platform", value: "web", enabled: true }],
    });
    const runtime = await createTestRuntime({ config: configOf(commonHeaders, rival) });

    expect(runtime.dnr.rules()).toEqual([]);
    expect(runtime.attachedHeaders(API_URL)).toEqual({});
    // An empty ruleset alone would also be produced by the builder's own guard, so pin
    // the path that was actually taken: the sync refused to apply and said why.
    expect(runtime.audit.all()).toContainEqual(
      expect.objectContaining({ level: "error", event: "config_compiled" }),
    );

    // Recovery proves the runtime reads `enabled`, not the selection.
    await runtime.commands.toggleProfile(rival.id, false);
    expect(runtime.attachedHeaders(API_URL)).toEqual({ "x-app-platform": "ios" });
  });

  it("applies a popup header value change through config, compiler and DNR sync", async () => {
    const runtime = await createTestRuntime({
      config: configOf(
        profile({
          id: "profile-canary",
          name: "Canary Routing",
          fixedHeaders: [
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
          ],
        }),
      ),
    });
    expect(runtime.attachedHeaders(API_URL)).toEqual({ "x-release-track": "stable" });

    await runtime.commands.updateFixedHeaderValue("profile-canary", "fixed-track", "canary");

    // The popup writes no rule itself: this value can only be here if the command went
    // through the config store, the compiler and the DNR sync.
    expect(runtime.attachedHeaders(API_URL)).toEqual({ "x-release-track": "canary" });
  });

  it("replaces Chrome's Cookie header for a target URL when the profile has a fixed cookie", async () => {
    const runtime = await createTestRuntime({
      config: configOf(
        profile({
          id: "profile-cookie",
          name: "Cookie",
          fixedCookies: [{ id: "fc-1", name: "session_id", value: "abc123", enabled: true }],
        }),
      ),
    });
    // A fixed cookie is present -> DNR SET rule replaces the browser's Cookie header.
    expect(runtime.attachedHeaders(API_URL)).toEqual({ cookie: "session_id=abc123" });
  });

  it("captures a Set-Cookie via response and sends it on the next request", async () => {
    const runtime = await createTestRuntime({
      config: configOf(
        profile({
          id: "profile-tracked",
          name: "Tracked",
          trackedCookies: [{ id: "tc-sid", name: "SID", enabled: true }],
        }),
      ),
    });
    // Nothing captured yet -> no cookie rule -> Chrome's Cookie header passes through.
    expect(runtime.attachedHeaders(API_URL)).toEqual({});

    await runtime.respond({
      url: API_URL,
      responseHeaders: [{ name: "Set-Cookie", value: "SID=tracked" }],
    });

    expect(runtime.attachedHeaders(API_URL)).toEqual({ cookie: "SID=tracked" });
    // A response on a different origin without the tracked profile mapping does NOT
    // send its cookies there — but the same profile on another target origin does.
  });

  it("emits no cookie rule when the only cookie is disabled (candidates 0)", async () => {
    const runtime = await createTestRuntime({
      config: configOf(
        profile({
          id: "profile-cookie-disabled",
          name: "CookieOff",
          fixedCookies: [{ id: "fc-1", name: "session_id", value: "abc123", enabled: false }],
        }),
      ),
    });
    // No cookie rule at all -> Chrome's original Cookie header must pass through.
    expect(runtime.attachedHeaders(API_URL)).toEqual({});
  });

  it("migrates a stored v2 config on first read", async () => {
    const runtime = await createTestRuntime();
    const v2 = {
      schemaVersion: 2,
      activeProfileId: "profile-legacy",
      profiles: [profile({ id: "profile-legacy", name: "Legacy", enabled: true })],
    };
    // Seed storage the way a pre-upgrade install would have left it: config.set would
    // reject it, which is exactly why the migration runs on load instead.
    await runtime.seedStoredConfig(v2);

    const config = await runtime.config.get();
    expect(config.schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
    expect(config).not.toHaveProperty("selectedProfileId");
  });
});
