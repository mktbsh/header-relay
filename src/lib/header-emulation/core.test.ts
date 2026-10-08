import { describe, expect, it } from "vitest";

import type { Profile, SessionState } from "../domain/types";
import { captureResponseHeaders, createHeaderPlan, selectCapturedRows } from "./core";

const profile: Profile = {
  id: "profile-test",
  name: "Test",
  enabled: true,
  targetOrigins: [{ id: "origin-local", origin: "http://localhost:3000", enabled: true }],
  fixedHeaders: [{ id: "fixed-platform", name: "X-App-Platform", value: "ios", enabled: true }],
  captureHeaders: [
    { id: "capture-token", name: "X-Auth-Token", enabled: true },
    { id: "capture-disabled", name: "X-Disabled-Token", enabled: false },
  ],
  excludedPaths: [{ id: "exclude-assets", pathPrefix: "/assets/**", enabled: true }],
  fixedCookies: [],
  trackedCookies: [],
  migrationIssues: [],
  createdAt: 1,
  updatedAt: 1,
};

const session: SessionState = {
  profileId: "profile-test",
  phase: "authenticated",
  capturedHeaders: {
    "x-auth-token": { name: "x-auth-token", value: "captured-token", capturedAt: 1 },
    "x-disabled-token": { name: "x-disabled-token", value: "disabled-token", capturedAt: 1 },
    "x-stale-token": { name: "x-stale-token", value: "stale-token", capturedAt: 1 },
  },
  trackedCookies: {},
  dnrRuleIds: [],
  updatedAt: 1,
};

describe("header emulation core", () => {
  it("plans fixed headers plus enabled configured captured values", () => {
    const plan = createHeaderPlan(profile, session);

    expect(plan.attachHeaders).toEqual([
      { name: "x-app-platform", value: "ios", source: "fixed" },
      { name: "x-auth-token", value: "captured-token", source: "captured" },
    ]);
    expect(plan.fixedHeaderNames).toEqual(["x-app-platform"]);
    expect(plan.capturedHeaderNames).toEqual(["x-auth-token"]);
  });

  it("prefers fixed headers when captured values have the same name", () => {
    const plan = createHeaderPlan(
      {
        ...profile,
        fixedHeaders: [
          {
            id: "fixed-token",
            name: "x-auth-token",
            value: "fixed-token",
            enabled: true,
          },
        ],
      },
      session,
    );

    expect(plan.attachHeaders).toEqual([
      { name: "x-auth-token", value: "fixed-token", source: "fixed" },
    ]);
  });

  it("selects captured rows newest-first", () => {
    const rows = selectCapturedRows({
      capturedHeaders: {
        older: { name: "older", value: "a", capturedAt: 1 },
        newer: { name: "newer", value: "b", capturedAt: 2 },
      },
    });

    expect(rows.map((row) => row.name)).toEqual(["newer", "older"]);
  });

  it("returns no captured rows without a session", () => {
    expect(selectCapturedRows(null)).toEqual([]);
    expect(selectCapturedRows(undefined)).toEqual([]);
  });

  it("captures configured response headers into the next session", () => {
    const result = captureResponseHeaders({
      profile,
      session: {
        ...session,
        phase: "unauthenticated",
        capturedHeaders: {},
      },
      responseHeaders: [
        { name: "X-Auth-Token", value: "next-token" },
        { name: "X-Stale-Token", value: "ignored-token" },
      ],
      now: 123,
    });

    expect(result.capturedNames).toEqual(["x-auth-token"]);
    expect(result.session.phase).toBe("authenticated");
    expect(result.session.capturedHeaders).toEqual({
      "x-auth-token": { name: "x-auth-token", value: "next-token", capturedAt: 123 },
    });
  });

  it("returns the original session when no configured response headers are captured", () => {
    const result = captureResponseHeaders({
      profile,
      session,
      responseHeaders: [{ name: "X-Other-Token", value: "ignored" }],
      now: 123,
    });

    expect(result.capturedNames).toEqual([]);
    expect(result.session).toBe(session);
  });
});
