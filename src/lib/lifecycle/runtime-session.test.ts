import { describe, expect, it, vi } from "vitest";

import type { CompiledConfig } from "../compiler/compile-config";
import type { DnrSyncResult } from "../dnr/rule-sync";
import type { AuditLog, Profile, SessionState } from "../domain/types";
import type { NetworkEventDetails } from "./engine";

const localDev: Profile = {
  id: "profile-local",
  name: "Local Development",
  enabled: true,
  targetOrigins: [{ id: "origin-local", origin: "http://localhost:3000", enabled: true }],
  fixedHeaders: [],
  captureHeaders: [{ id: "capture-token", name: "x-auth-token", enabled: true }],
  excludedPaths: [{ id: "exclude-assets", pathPrefix: "/assets/**", enabled: true }],
  fixedCookies: [],
  trackedCookies: [],
  migrationIssues: [],
  createdAt: 1,
  updatedAt: 1,
};

const oauthCapture: Profile = {
  ...localDev,
  id: "profile-oauth",
  name: "OAuth Capture",
  captureHeaders: [{ id: "capture-session", name: "x-session-id", enabled: true }],
  excludedPaths: [],
};

const createDeps = (profiles: Profile[] = [localDev]) => {
  const auditLogs: Array<Omit<AuditLog, "id" | "ts"> & { id?: string; ts?: number }> = [];
  let sessions: Record<string, SessionState> = {};

  return {
    auditLogs,
    get sessions() {
      return sessions;
    },
    getEnabledProfiles: vi.fn(async () => profiles.filter((profile) => profile.enabled)),
    getSessions: vi.fn(async () => structuredClone(sessions)),
    setSessions: vi.fn(async (next: Record<string, SessionState>) => {
      sessions = structuredClone(next);
    }),
    clearSessions: vi.fn(async (profileId?: string) => {
      if (!profileId) sessions = {};
      else delete sessions[profileId];
    }),
    clearTrackedCookiesFor: vi.fn(async (profileId: string, cookieName?: string) => {
      const session = sessions[profileId];
      if (!session) return;
      const nextTracked = cookieName
        ? Object.fromEntries(
            Object.entries(session.trackedCookies ?? {}).filter(([name]) => name !== cookieName),
          )
        : {};
      sessions = { ...sessions, [profileId]: { ...session, trackedCookies: nextTracked } };
    }),
    syncDnrRules: vi.fn(
      async (compiled: CompiledConfig): Promise<DnrSyncResult> => ({
        status: "ok",
        ruleIds: compiled.matchedProfiles.map((_, index) => 10001 + index),
        ruleIdsByProfile: Object.fromEntries(
          compiled.matchedProfiles.map((profile, index) => [profile.profileId, [10001 + index]]),
        ),
      }),
    ),
    addAudit: vi.fn(async (log: Omit<AuditLog, "id" | "ts"> & { id?: string; ts?: number }) => {
      auditLogs.push(log);
    }),
    now: vi.fn(() => 123),
  };
};

const response = (headers: Browser.webRequest.HttpHeader[]): NetworkEventDetails => ({
  event: "headersReceived",
  requestId: "request-1",
  url: "http://localhost:3000/api/me",
  method: "GET",
  type: "xmlhttprequest",
  tabId: 3,
  statusCode: 200,
  responseHeaders: headers,
});

describe("runtime session transitions", () => {
  it("captures target-origin response headers and syncs the compiled ruleset", async () => {
    const deps = createDeps();
    const { createRuntimeSession } = await import("./runtime-session");
    const runtime = createRuntimeSession(deps);

    await runtime.processNetworkEvent(response([{ name: "X-Auth-Token", value: "token-1" }]));

    expect(deps.sessions[localDev.id]).toMatchObject({
      phase: "authenticated",
      trackedCookies: {},
      dnrRuleIds: [10001],
      capturedHeaders: {
        "x-auth-token": { name: "x-auth-token", value: "token-1", capturedAt: 123 },
      },
    });
    expect(deps.syncDnrRules).toHaveBeenCalledTimes(1);
    expect(deps.auditLogs.map((log) => log.event)).toEqual(["origin_matched", "headers_captured"]);
  });

  it("captures for every enabled profile that matches and recompiles once", async () => {
    const deps = createDeps([localDev, oauthCapture]);
    const { createRuntimeSession } = await import("./runtime-session");
    const runtime = createRuntimeSession(deps);

    await runtime.processNetworkEvent(
      response([
        { name: "X-Auth-Token", value: "token-1" },
        { name: "X-Session-Id", value: "session-1" },
      ]),
    );

    expect(deps.sessions[localDev.id]?.capturedHeaders["x-auth-token"]?.value).toBe("token-1");
    expect(deps.sessions[oauthCapture.id]?.capturedHeaders["x-session-id"]?.value).toBe(
      "session-1",
    );
    expect(deps.sessions[localDev.id]?.capturedHeaders["x-session-id"]).toBeUndefined();
    expect(deps.syncDnrRules).toHaveBeenCalledTimes(1);
    expect(deps.auditLogs.filter((log) => log.event === "headers_captured")).toHaveLength(2);
  });

  it("keeps a profile out of the capture when the URL is excluded for it only", async () => {
    const deps = createDeps([localDev, oauthCapture]);
    const { createRuntimeSession } = await import("./runtime-session");
    const runtime = createRuntimeSession(deps);

    await runtime.processNetworkEvent({
      ...response([{ name: "X-Session-Id", value: "session-1" }]),
      url: "http://localhost:3000/assets/app.js",
    });

    expect(deps.sessions[localDev.id]?.capturedHeaders).toEqual({});
    expect(deps.sessions[oauthCapture.id]?.capturedHeaders["x-session-id"]?.value).toBe(
      "session-1",
    );
  });

  it("records a DNR sync failure as session.lastError instead of throwing", async () => {
    const deps = createDeps();
    deps.syncDnrRules = vi.fn(async () => {
      throw new Error("rule quota exceeded");
    });
    const { createRuntimeSession } = await import("./runtime-session");
    const runtime = createRuntimeSession(deps);

    await runtime.processNetworkEvent(response([{ name: "X-Auth-Token", value: "token-1" }]));

    expect(deps.sessions[localDev.id]?.lastError).toBe("rule quota exceeded");
  });

  it("records a compile conflict as lastError on each conflicting profile", async () => {
    const withHeader = (id: string, name: string): Profile => ({
      ...localDev,
      id,
      name: id,
      captureHeaders: [],
      excludedPaths: [],
      fixedHeaders: [{ id: "fixed-auth", name, value: id, enabled: true }],
    });
    const deps = createDeps([
      withHeader("profile-a", "authorization"),
      withHeader("profile-b", "authorization"),
    ]);
    deps.syncDnrRules = vi.fn(async () => ({ status: "ok", ruleIds: [], ruleIdsByProfile: {} }));
    const { createRuntimeSession } = await import("./runtime-session");
    const runtime = createRuntimeSession(deps);

    await runtime.syncRules();

    expect(deps.sessions["profile-a"]?.lastError).toContain("authorization");
    expect(deps.sessions["profile-b"]?.lastError).toContain("authorization");
    expect(deps.sessions["profile-a"]?.dnrRuleIds).toEqual([]);
  });

  it("clears one profile's session and leaves the others alone", async () => {
    const deps = createDeps([localDev, oauthCapture]);
    const { createRuntimeSession } = await import("./runtime-session");
    const runtime = createRuntimeSession(deps);

    await runtime.processNetworkEvent(
      response([
        { name: "X-Auth-Token", value: "token-1" },
        { name: "X-Session-Id", value: "session-1" },
      ]),
    );
    await runtime.clearSession(localDev.id);

    expect(deps.sessions[localDev.id]?.capturedHeaders).toEqual({});
    expect(deps.sessions[oauthCapture.id]?.capturedHeaders["x-session-id"]?.value).toBe(
      "session-1",
    );
    // A successful manual clear is a user operation, not a diagnostic: no audit entry.
    expect(deps.auditLogs.some((log) => log.event === "session_cleared")).toBe(false);
  });

  it("clears every session when no profile is given", async () => {
    const deps = createDeps([localDev, oauthCapture]);
    const { createRuntimeSession } = await import("./runtime-session");
    const runtime = createRuntimeSession(deps);

    await runtime.processNetworkEvent(response([{ name: "X-Auth-Token", value: "token-1" }]));
    await runtime.clearSession();

    expect(Object.values(deps.sessions).every((session) => !session.lastError)).toBe(true);
    expect(deps.sessions[localDev.id]?.capturedHeaders).toEqual({});
  });

  it("clears multiple affected profile sessions in one serialized permission-revocation update", async () => {
    const deps = createDeps([localDev, oauthCapture]);
    const { createRuntimeSession } = await import("./runtime-session");
    const runtime = createRuntimeSession(deps);

    await runtime.processNetworkEvent(
      response([
        { name: "X-Auth-Token", value: "token-1" },
        { name: "X-Session-Id", value: "session-1" },
      ]),
    );
    const syncCountBeforeClear = vi.mocked(deps.syncDnrRules).mock.calls.length;

    await runtime.clearSessions([localDev.id, oauthCapture.id]);

    expect(deps.sessions[localDev.id]?.capturedHeaders).toEqual({});
    expect(deps.sessions[oauthCapture.id]?.capturedHeaders).toEqual({});
    expect(deps.syncDnrRules).toHaveBeenCalledTimes(syncCountBeforeClear + 1);
  });

  it("surfaces a DNR failure during clear as a warn audit instead of throwing", async () => {
    const deps = createDeps();
    deps.syncDnrRules = vi.fn(async () => {
      throw new Error("rule quota exceeded");
    });
    const { createRuntimeSession } = await import("./runtime-session");
    const runtime = createRuntimeSession(deps);

    await expect(runtime.clearSession()).resolves.toBeUndefined();

    const cleared = deps.auditLogs.find((log) => log.event === "session_cleared");
    expect(cleared?.level).toBe("warn");
    expect(cleared?.message).toContain("rule quota exceeded");
  });

  it("never lets captured header values into the audit log", async () => {
    const deps = createDeps([localDev, oauthCapture]);
    const { createRuntimeSession } = await import("./runtime-session");
    const runtime = createRuntimeSession(deps);

    await runtime.processNetworkEvent(
      response([
        { name: "X-Auth-Token", value: "token-value-1" },
        { name: "X-Session-Id", value: "session-value-1" },
      ]),
    );
    await runtime.clearSession();

    // Audit entries persist in IndexedDB; header names are fine, values never are.
    const serialized = JSON.stringify(deps.auditLogs);
    expect(deps.auditLogs.length).toBeGreaterThan(0);
    expect(serialized).not.toContain("token-value-1");
    expect(serialized).not.toContain("session-value-1");
  });

  it("captures Set-Cookie for tracked cookies and never leaks values to the audit log", async () => {
    const withCookies: Profile = {
      ...localDev,
      captureHeaders: [],
      trackedCookies: [
        { id: "tc-sid", name: "SID", enabled: true },
        { id: "tc-csrf", name: "csrf", enabled: true },
      ],
    };
    const deps = createDeps([withCookies]);
    const { createRuntimeSession } = await import("./runtime-session");
    const runtime = createRuntimeSession(deps);

    await runtime.processNetworkEvent(
      response([
        { name: "Set-Cookie", value: "SID=cookie-value-1; Path=/" },
        { name: "Set-Cookie", value: "csrf=csrf-value-1" },
        { name: "Set-Cookie", value: "unregistered=other" },
      ]),
    );

    expect(deps.sessions[withCookies.id]?.trackedCookies.SID?.value).toBe("cookie-value-1");
    expect(deps.sessions[withCookies.id]?.trackedCookies.csrf?.value).toBe("csrf-value-1");
    expect(deps.sessions[withCookies.id]?.trackedCookies.unregistered).toBeUndefined();

    const cookiesUpdated = deps.auditLogs.find((log) => log.event === "cookies_updated");
    expect(cookiesUpdated?.headerNames).toContain("+SID");
    expect(cookiesUpdated?.headerNames).toContain("+csrf");
    const serialized = JSON.stringify(deps.auditLogs);
    expect(serialized).not.toContain("cookie-value-1");
    expect(serialized).not.toContain("csrf-value-1");
  });

  it("deletes a tracked cookie when Set-Cookie has Max-Age=0", async () => {
    const withCookies: Profile = {
      ...localDev,
      captureHeaders: [],
      trackedCookies: [{ id: "tc-sid", name: "SID", enabled: true }],
    };
    const deps = createDeps([withCookies]);
    const { createRuntimeSession } = await import("./runtime-session");
    const runtime = createRuntimeSession(deps);

    await runtime.processNetworkEvent(response([{ name: "Set-Cookie", value: "SID=old" }]));
    expect(deps.sessions[withCookies.id]?.trackedCookies.SID?.value).toBe("old");

    await runtime.processNetworkEvent(
      response([{ name: "Set-Cookie", value: "SID=x; Max-Age=0" }]),
    );
    expect(deps.sessions[withCookies.id]?.trackedCookies.SID).toBeUndefined();

    const deletedLog = deps.auditLogs
      .filter((log) => log.event === "cookies_updated")
      .find((log) => log.headerNames?.some((name) => name === "-SID"));
    expect(deletedLog).toBeDefined();
  });

  it("logs a warn cookie_parse_failed audit for invalid Set-Cookie without leaking the raw header", async () => {
    const withCookies: Profile = {
      ...localDev,
      captureHeaders: [],
      trackedCookies: [{ id: "tc-sid", name: "SID", enabled: true }],
    };
    const deps = createDeps([withCookies]);
    const { createRuntimeSession } = await import("./runtime-session");
    const runtime = createRuntimeSession(deps);

    await runtime.processNetworkEvent(response([{ name: "Set-Cookie", value: "SID=with space" }]));

    const parseFailed = deps.auditLogs.find((log) => log.event === "cookie_parse_failed");
    expect(parseFailed?.level).toBe("warn");
    expect(parseFailed?.headerNames).toContain("SID");
    expect(JSON.stringify(deps.auditLogs)).not.toContain("with space");
  });

  it("skips non-target-origin responses without touching any session", async () => {
    const deps = createDeps();
    const { createRuntimeSession } = await import("./runtime-session");
    const runtime = createRuntimeSession(deps);

    await runtime.processNetworkEvent({
      ...response([{ name: "X-Auth-Token", value: "token-1" }]),
      url: "https://unrelated.example.com/api/me",
    });

    expect(deps.setSessions).not.toHaveBeenCalled();
    expect(deps.syncDnrRules).not.toHaveBeenCalled();
    expect(deps.auditLogs).toEqual([]);
  });

  it("skips compile-and-sync when a matched response captures nothing new", async () => {
    const deps = createDeps();
    const { createRuntimeSession } = await import("./runtime-session");
    const runtime = createRuntimeSession(deps);

    await runtime.processNetworkEvent(response([{ name: "X-Auth-Token", value: "token-1" }]));
    expect(deps.syncDnrRules).toHaveBeenCalledTimes(1);

    // Same header, same value — no session change.
    await runtime.processNetworkEvent(response([{ name: "X-Auth-Token", value: "token-1" }]));
    expect(deps.syncDnrRules).toHaveBeenCalledTimes(1);
  });
});
