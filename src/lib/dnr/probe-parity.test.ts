import { describe, expect, it } from "vitest";

import { compileConfig, probeUrl } from "../compiler/compile-config";
import type { Profile, SessionState } from "../domain/types";
import { buildDnrRules } from "./header-rule-builder";

// compileConfig is the single source of truth, but URL Probe and the DNR builder read
// it through two different matching implementations: the probe runs a glob regex against
// `URL.pathname`, the builder emits a regexFilter string matched against the whole URL.
// Conflict detection is shared; matching cannot be (DNR only takes regex strings), so
// this is the one place the two can drift. These tests pin them together.
//
// ponytail: this models Chrome's modifyHeaders evaluation, it is not Chrome. It proves
// the generated ruleset agrees with the probe; that the browser then behaves this way is
// what e2e and real-browser checks are for.
const evaluateRuleset = (
  rules: Browser.declarativeNetRequest.Rule[],
  url: string,
): Record<string, string> => {
  // Chrome matches regexFilter against the canonicalized URL, so canonicalize first
  // (drops default ports, adds the root path, ...) instead of the raw input string.
  const href = new URL(url).href;
  const matched = rules
    .filter((rule) => new RegExp(rule.condition.regexFilter ?? "").test(href))
    // Higher priority first; a header touched by a higher-priority rule is locked and
    // cannot be modified again by a lower-priority one.
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const headers: Record<string, string> = {};
  const locked = new Set<string>();

  for (const rule of matched) {
    for (const info of rule.action.requestHeaders ?? []) {
      if (locked.has(info.header)) continue;
      locked.add(info.header);
      if (info.operation === "set") headers[info.header] = info.value ?? "";
    }
  }

  return headers;
};

const expectedFromProbe = (
  compiled: ReturnType<typeof compileConfig>,
  url: string,
): Record<string, string> =>
  Object.fromEntries(
    probeUrl(compiled, url).effectiveHeaders.map((header) => [header.name, header.value]),
  );

const commonHeaders: Profile = {
  id: "profile-common",
  name: "Common Headers",
  enabled: true,
  targetOrigins: [{ id: "origin-local", origin: "http://localhost:3000", enabled: true }],
  fixedHeaders: [{ id: "fixed-platform", name: "x-app-platform", value: "ios", enabled: true }],
  captureHeaders: [],
  excludedPaths: [],
  fixedCookies: [],
  trackedCookies: [],
  migrationIssues: [],
  createdAt: 1,
  updatedAt: 1,
};

const localDev: Profile = {
  ...commonHeaders,
  id: "profile-local",
  name: "Local Development",
  targetOrigins: [
    { id: "origin-local", origin: "http://localhost:3000", enabled: true },
    { id: "origin-loopback", origin: "http://127.0.0.1:3000", enabled: true },
  ],
  fixedHeaders: [{ id: "fixed-env", name: "x-env", value: "local", enabled: true }],
  captureHeaders: [{ id: "capture-token", name: "x-auth-token", enabled: true }],
  excludedPaths: [
    { id: "exclude-assets", pathPrefix: "/assets/**", enabled: true },
    { id: "exclude-internal", pathPrefix: "/api/internal/*", enabled: true },
  ],
};

const remoteApi: Profile = {
  ...commonHeaders,
  id: "profile-api",
  name: "Remote API",
  targetOrigins: [{ id: "origin-api", origin: "https://api.example.test", enabled: true }],
  fixedHeaders: [{ id: "fixed-auth", name: "authorization", value: "token-a", enabled: true }],
  excludedPaths: [],
};

const localSession: SessionState = {
  profileId: localDev.id,
  phase: "authenticated",
  capturedHeaders: {
    "x-auth-token": { name: "x-auth-token", value: "captured-token", capturedAt: 1 },
  },
  trackedCookies: {},
  dnrRuleIds: [],
  updatedAt: 1,
};

const URLS = [
  "http://localhost:3000/api/me",
  "http://localhost:3000",
  "http://localhost:3000/",
  // Excluded for Local Development only: Common Headers must keep its header.
  "http://localhost:3000/assets/app.js",
  "http://localhost:3000/assets/app.js?v=1",
  "http://localhost:3000/assets/nested/deep/app.js",
  // Glob boundary: /assets/** must not match /assets itself.
  "http://localhost:3000/assets",
  "http://localhost:3000/assetsx/app.js",
  // Single-segment * must not cross a path separator.
  "http://localhost:3000/api/internal/secret",
  "http://localhost:3000/api/internal/secret#frag",
  "http://localhost:3000/api/internal/nested/secret",
  // A glob-looking query string must not exclude a non-excluded path.
  "http://localhost:3000/api/me?next=/assets/app.js",
  // Origin traps: host suffix, port prefix, scheme.
  "http://localhost.evil.test:3000/api/me",
  "http://localhost:30000/api/me",
  "https://localhost:3000/api/me",
  "http://127.0.0.1:3000/api/me",
  "https://api.example.test/v1/users",
  "https://other.example.test/v1/users",
];

describe("URL probe and DNR ruleset agree", () => {
  const compiled = compileConfig([commonHeaders, localDev, remoteApi], {
    [localDev.id]: localSession,
  });
  const { rules } = buildDnrRules(compiled);

  it.each(URLS)("attaches the same headers for %s", (url) => {
    expect(evaluateRuleset(rules, url)).toEqual(expectedFromProbe(compiled, url));
  });

  it("keeps another profile's header on a path excluded by one profile", () => {
    const url = "http://localhost:3000/assets/app.js";

    // Guards the parity assertion above from passing on two empty objects, and pins the
    // Excluded Path requirement: a remove rule strips only its own profile's headers.
    expect(evaluateRuleset(rules, url)).toEqual({ "x-app-platform": "ios" });
    expect(evaluateRuleset(rules, "http://localhost:3000/api/me")).toEqual({
      "x-app-platform": "ios",
      "x-env": "local",
      "x-auth-token": "captured-token",
    });
  });

  it("attaches nothing from either path while a conflict is unresolved", () => {
    const conflicting: Profile = {
      ...remoteApi,
      id: "profile-conflict",
      name: "Conflict",
      targetOrigins: commonHeaders.targetOrigins,
      fixedHeaders: [{ id: "fixed-dupe", name: "x-app-platform", value: "web", enabled: true }],
    };
    const conflicted = compileConfig([commonHeaders, conflicting]);
    const url = "http://localhost:3000/api/me";

    expect(conflicted.errors).toHaveLength(1);
    expect(buildDnrRules(conflicted).rules).toEqual([]);
    expect(evaluateRuleset([], url)).toEqual(expectedFromProbe(conflicted, url));
  });
});

// Cookie SET rules live in a separate priority tier (base 200, per-glob override 300)
// and are emitted by buildDnrRules from compiled.cookieRules. These tests pin the
// three FR/AC cases the adversarial review flagged as untested: multi-profile
// override, single-profile fallback, and 0-candidate silence.
describe("URL probe and DNR ruleset agree on cookies", () => {
  const cookieOnly: Profile = {
    ...commonHeaders,
    id: "profile-cookies",
    name: "Cookies",
    fixedHeaders: [],
    fixedCookies: [{ id: "c1", name: "sidA", value: "1", enabled: true }],
    trackedCookies: [],
    migrationIssues: [],
    excludedPaths: [],
  };
  const cookieOther: Profile = {
    ...cookieOnly,
    id: "profile-cookies-b",
    name: "Cookies B",
    fixedCookies: [{ id: "c1", name: "sidB", value: "2", enabled: true }],
  };

  const cookieHeader = (
    rules: Browser.declarativeNetRequest.Rule[],
    url: string,
  ): string | undefined => evaluateRuleset(rules, url)["cookie"];

  it("keeps another profile's cookie on a path excluded by one profile (AC-10)", () => {
    const bExcluded: Profile = {
      ...cookieOther,
      excludedPaths: [{ id: "e1", pathPrefix: "/admin/**", enabled: true }],
    };
    const compiled = compileConfig([cookieOnly, bExcluded]);
    const { rules } = buildDnrRules(compiled);

    // /api/me: no exclusion → base rule fires → merged value.
    expect(cookieHeader(rules, "http://localhost:3000/api/me")).toBe("sidA=1; sidB=2");
    // /admin/dashboard: B excluded → override rule (priority 300) wins over base.
    expect(cookieHeader(rules, "http://localhost:3000/admin/dashboard")).toBe("sidA=1");
  });

  it("emits NO cookie rule when a sole-profile exclusion would leave 0 candidates (FR-13, AC-23)", () => {
    const soleExcluded: Profile = {
      ...cookieOnly,
      excludedPaths: [{ id: "e1", pathPrefix: "/admin/**", enabled: true }],
    };
    const compiled = compileConfig([soleExcluded]);
    const { rules } = buildDnrRules(compiled);

    // No Header Relay cookie rule at all — Chrome's original Cookie flows on every URL.
    expect(rules.some((r) => r.action.requestHeaders?.some((h) => h.header === "cookie"))).toBe(
      false,
    );
    expect(cookieHeader(rules, "http://localhost:3000/admin/dashboard")).toBeUndefined();
    expect(cookieHeader(rules, "http://localhost:3000/api/me")).toBeUndefined();
    expect(compiled.warnings.some((w) => w.code === "cookie-exclusion-cannot-preserve")).toBe(true);
  });

  it("emits NO cookie rule when only unfetched tracked cookies exist (AC-24)", () => {
    const trackedOnly: Profile = {
      ...cookieOnly,
      fixedCookies: [],
      trackedCookies: [{ id: "t1", name: "SID", enabled: true }],
    };
    const compiled = compileConfig([trackedOnly]);
    const { rules } = buildDnrRules(compiled);
    expect(rules.some((r) => r.action.requestHeaders?.some((h) => h.header === "cookie"))).toBe(
      false,
    );
    expect(cookieHeader(rules, "http://localhost:3000/api/me")).toBeUndefined();
  });
});
