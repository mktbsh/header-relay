import { describe, expect, it } from "vitest";

import type { Profile } from "../domain/types";
import {
  createDnrExcludedPathRegex,
  createDnrOriginRegex,
  evaluateTargetRoute,
  httpOriginOf,
  matchesTargetRoute,
} from "./route-condition";

const profile: Profile = {
  id: "profile-test",
  name: "Test",
  enabled: true,
  targetOrigins: [{ id: "origin-local", origin: "http://localhost:3000", enabled: true }],
  fixedHeaders: [],
  captureHeaders: [],
  excludedPaths: [{ id: "exclude-assets", pathPrefix: "/assets/**", enabled: true }],
  fixedCookies: [],
  trackedCookies: [],
  migrationIssues: [],
  createdAt: 1,
  updatedAt: 1,
};

describe("route condition", () => {
  it("extracts the origin of HTTP and HTTPS URLs only", () => {
    expect(httpOriginOf("https://app.example.test:8443/path?q=1#top")).toBe(
      "https://app.example.test:8443",
    );
    expect(httpOriginOf("http://localhost:3000")).toBe("http://localhost:3000");
    expect(httpOriginOf("chrome://extensions")).toBeUndefined();
    expect(httpOriginOf("not a url")).toBeUndefined();
    expect(httpOriginOf(undefined)).toBeUndefined();
  });

  it("evaluates target origin and excluded path with one route result", () => {
    expect(evaluateTargetRoute(profile, "http://localhost:3000/api/me")).toEqual({
      targetOrigin: profile.targetOrigins[0],
      excluded: false,
      allowed: true,
    });

    expect(evaluateTargetRoute(profile, "http://localhost:3000/assets/app.js")).toEqual({
      targetOrigin: profile.targetOrigins[0],
      matchedExcludedPath: profile.excludedPaths[0],
      excluded: true,
      allowed: false,
    });
  });

  it("ignores invalid rules and matches globs against the pathname without query or fragment", () => {
    const withUnsafeRules: Profile = {
      ...profile,
      excludedPaths: [
        { id: "empty", pathPrefix: "", enabled: true },
        { id: "invalid", pathPrefix: "assets/", enabled: true },
        { id: "api", pathPrefix: "/api/**", enabled: true },
      ],
    };

    expect(evaluateTargetRoute(withUnsafeRules, "http://localhost:3000/anything").excluded).toBe(
      false,
    );
    expect(
      evaluateTargetRoute(withUnsafeRules, "http://localhost:3000/api/users?q=1#details"),
    ).toMatchObject({
      excluded: true,
      allowed: false,
      matchedExcludedPath: { id: "api" },
    });
  });

  it("matches whole paths with glob wildcards and honors segment boundaries", () => {
    const globProfile: Profile = {
      ...profile,
      excludedPaths: [
        { id: "exact", pathPrefix: "/health", enabled: true },
        { id: "single", pathPrefix: "/assets/*.js", enabled: true },
        { id: "deep", pathPrefix: "/static/**", enabled: true },
      ],
    };

    // Exact match only; a subpath must not match a wildcard-less pattern.
    expect(evaluateTargetRoute(globProfile, "http://localhost:3000/health").excluded).toBe(true);
    expect(evaluateTargetRoute(globProfile, "http://localhost:3000/health/live").excluded).toBe(
      false,
    );

    // `*` stays inside a single segment.
    expect(evaluateTargetRoute(globProfile, "http://localhost:3000/assets/app.js").excluded).toBe(
      true,
    );
    expect(
      evaluateTargetRoute(globProfile, "http://localhost:3000/assets/nested/app.js").excluded,
    ).toBe(false);

    // `**` crosses segments.
    expect(
      evaluateTargetRoute(globProfile, "http://localhost:3000/static/img/logo.png").excluded,
    ).toBe(true);
  });

  it("does not mark URLs outside target origins as excluded", () => {
    expect(evaluateTargetRoute(profile, "https://example.com/assets/app.js")).toEqual({
      targetOrigin: undefined,
      excluded: false,
      allowed: false,
    });
  });

  it("can match a configured route without requiring the Profile to be enabled", () => {
    const disabled = { ...profile, enabled: false };

    expect(matchesTargetRoute(disabled, "http://localhost:3000/api/me")).toBe(true);
    expect(matchesTargetRoute(disabled, "http://localhost:3000/assets/app.js")).toBe(false);
    expect(evaluateTargetRoute(disabled, "http://localhost:3000/api/me")).toEqual({
      allowed: false,
      excluded: false,
    });
  });

  it("builds DNR regex conditions from the same route semantics", () => {
    expect(createDnrOriginRegex("http://localhost:3000/path")).toBe(
      "^http://localhost:3000(?:/|$)",
    );
    expect(createDnrExcludedPathRegex("http://localhost:3000", "/assets/**")).toBe(
      "^http://localhost:3000/assets/.*(?:$|[?#])",
    );
    expect(createDnrExcludedPathRegex("http://localhost:3000", "/assets/*.js")).toBe(
      "^http://localhost:3000/assets/[^/]*\\.js(?:$|[?#])",
    );
  });
});
