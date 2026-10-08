import { describe, expect, it } from "vitest";

import type { AppConfig, Profile } from "../domain/types";
import {
  enabledOriginPatterns,
  isOriginGranted,
  missingOriginPatterns,
  originsMissingAccess,
  originToMatchPattern,
  orphanedPatterns,
  patternCoversOrigin,
} from "./host-permission";

const profileWith = (
  origins: { origin: string; enabled?: boolean }[],
  overrides: Partial<Profile> = {},
): Profile => ({
  id: overrides.id ?? "profile-a",
  name: "Profile",
  enabled: true,
  targetOrigins: origins.map((entry, index) => ({
    id: `origin-${index}`,
    origin: entry.origin,
    enabled: entry.enabled ?? true,
  })),
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

const configWith = (profiles: Profile[]): AppConfig => ({
  schemaVersion: 5,
  profiles,
});

describe("originToMatchPattern", () => {
  it("drops the port: Chrome match patterns cannot carry one", () => {
    expect(originToMatchPattern("http://localhost:3000")).toBe("http://localhost/*");
    expect(originToMatchPattern("https://api.example.test:8443")).toBe(
      "https://api.example.test/*",
    );
  });

  it("keeps IP literals, including bracketed IPv6", () => {
    expect(originToMatchPattern("http://127.0.0.1:8080")).toBe("http://127.0.0.1/*");
    expect(originToMatchPattern("http://[::1]:3000")).toBe("http://[::1]/*");
  });

  it("normalizes case and tolerates a full URL as input", () => {
    expect(originToMatchPattern("HTTP://LocalHost:3000")).toBe("http://localhost/*");
    expect(originToMatchPattern("https://example.com/some/path?q=1")).toBe("https://example.com/*");
  });

  it("rejects unsupported schemes and unparsable input", () => {
    expect(originToMatchPattern("file:///etc/passwd")).toBeUndefined();
    expect(originToMatchPattern("ws://localhost:3000")).toBeUndefined();
    expect(originToMatchPattern("chrome-extension://abc")).toBeUndefined();
    expect(originToMatchPattern("not an origin")).toBeUndefined();
    expect(originToMatchPattern("")).toBeUndefined();
  });
});

describe("patternCoversOrigin", () => {
  it("treats <all_urls> and full wildcards as covering any http(s) origin", () => {
    expect(patternCoversOrigin("<all_urls>", "http://localhost:3000")).toBe(true);
    expect(patternCoversOrigin("*://*/*", "https://api.example.test")).toBe(true);
    expect(patternCoversOrigin("http://*/*", "http://localhost:3000")).toBe(true);
  });

  it("matches per scheme", () => {
    expect(patternCoversOrigin("http://*/*", "https://example.com")).toBe(false);
    expect(patternCoversOrigin("https://*/*", "https://example.com")).toBe(true);
  });

  it("matches an exact host regardless of the origin's port", () => {
    expect(patternCoversOrigin("http://localhost/*", "http://localhost:3000")).toBe(true);
    expect(patternCoversOrigin("http://localhost/*", "http://localhost:9999")).toBe(true);
    expect(patternCoversOrigin("http://localhost/*", "http://other:3000")).toBe(false);
  });

  it("expands *.domain to the domain and its subdomains", () => {
    expect(patternCoversOrigin("https://*.example.com/*", "https://api.example.com")).toBe(true);
    expect(patternCoversOrigin("https://*.example.com/*", "https://example.com")).toBe(true);
    expect(patternCoversOrigin("https://*.example.com/*", "https://badexample.com")).toBe(false);
  });

  it("covers IPv6 hosts", () => {
    expect(patternCoversOrigin("http://[::1]/*", "http://[::1]:3000")).toBe(true);
  });

  it("never covers unsupported or unparsable origins", () => {
    expect(patternCoversOrigin("<all_urls>", "file:///etc/passwd")).toBe(false);
    expect(patternCoversOrigin("<all_urls>", "junk")).toBe(false);
  });
});

describe("pattern selection over profiles", () => {
  it("enabledOriginPatterns skips disabled profiles, disabled origins, and dedupes by pattern", () => {
    const enabled = profileWith([
      { origin: "http://localhost:3000" },
      { origin: "http://localhost:4000" },
      { origin: "https://api.example.test", enabled: false },
    ]);
    const disabled = profileWith([{ origin: "https://other.example.test" }], {
      id: "profile-b",
      enabled: false,
    });

    expect(enabledOriginPatterns([enabled, disabled])).toEqual(["http://localhost/*"]);
  });

  it("missingOriginPatterns requests for disabled profiles too, but respects grants", () => {
    const disabledProfile = profileWith([{ origin: "http://localhost:3000" }], {
      enabled: false,
    });

    expect(missingOriginPatterns([disabledProfile], [])).toEqual(["http://localhost/*"]);
    expect(missingOriginPatterns([disabledProfile], ["http://localhost/*"])).toEqual([]);
    expect(missingOriginPatterns([disabledProfile], ["<all_urls>"])).toEqual([]);
  });

  it("originsMissingAccess reports enabled origins of enabled profiles only", () => {
    const profile = profileWith([
      { origin: "http://localhost:3000" },
      { origin: "https://api.example.test" },
    ]);

    expect(originsMissingAccess([profile], ["http://localhost/*"])).toEqual([
      "https://api.example.test",
    ]);
    expect(originsMissingAccess([{ ...profile, enabled: false }], [])).toEqual([]);
  });

  it("isOriginGranted checks the origin against every granted pattern", () => {
    expect(isOriginGranted(["https://*/*"], "http://localhost:3000")).toBe(false);
    expect(isOriginGranted(["https://*/*", "http://localhost/*"], "http://localhost:3000")).toBe(
      true,
    );
  });
});

describe("orphanedPatterns", () => {
  it("reports patterns no origin references anymore", () => {
    const previous = configWith([
      profileWith([{ origin: "http://localhost:3000" }, { origin: "https://api.example.test" }]),
    ]);
    const next = configWith([profileWith([{ origin: "http://localhost:3000" }])]);

    expect(orphanedPatterns(previous, next)).toEqual(["https://api.example.test/*"]);
  });

  it("keeps a pattern while any origin on the same host remains, across profiles and ports", () => {
    const previous = configWith([
      profileWith([{ origin: "http://localhost:3000" }]),
      profileWith([{ origin: "http://localhost:4000" }], { id: "profile-b" }),
    ]);
    const next = configWith([
      profileWith([{ origin: "http://localhost:3000" }]),
      profileWith([], { id: "profile-b" }),
    ]);

    expect(orphanedPatterns(previous, next)).toEqual([]);
  });

  it("counts disabled origins as still referenced", () => {
    const previous = configWith([profileWith([{ origin: "http://localhost:3000" }])]);
    const next = configWith([profileWith([{ origin: "http://localhost:3000", enabled: false }])]);

    expect(orphanedPatterns(previous, next)).toEqual([]);
  });
});
