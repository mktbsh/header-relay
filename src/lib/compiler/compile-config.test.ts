import { describe, expect, it } from "vitest";

import type { Profile, SessionState } from "../domain/types";
import { compileConfig, probeUrl, selectEnabledProfiles } from "./compile-config";

const makeProfile = (overrides: Partial<Profile> & Pick<Profile, "id" | "name">): Profile => ({
  enabled: true,
  targetOrigins: [{ id: "origin-local", origin: "http://localhost:3000", enabled: true }],
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

const session = (profileId: string, headers: Record<string, string>): SessionState => ({
  profileId,
  phase: "authenticated",
  capturedHeaders: Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, { name, value, capturedAt: 1 }]),
  ),
  trackedCookies: {},
  dnrRuleIds: [],
  updatedAt: 1,
});

const commonHeaders = makeProfile({
  id: "profile-common",
  name: "Common Headers",
  fixedHeaders: [{ id: "fixed-platform", name: "x-app-platform", value: "ios", enabled: true }],
});

const localDev = makeProfile({
  id: "profile-local",
  name: "Local Development",
  fixedHeaders: [{ id: "fixed-env", name: "x-env", value: "local", enabled: true }],
});

describe("selectEnabledProfiles", () => {
  it("keeps every enabled profile regardless of selection", () => {
    const disabled = makeProfile({ id: "profile-off", name: "Off", enabled: false });
    expect(selectEnabledProfiles([commonHeaders, disabled, localDev])).toEqual([
      commonHeaders,
      localDev,
    ]);
  });
});

describe("compileConfig", () => {
  it("compiles several enabled profiles on the same origin into independent rules", () => {
    const compiled = compileConfig([commonHeaders, localDev]);

    expect(compiled.errors).toEqual([]);
    expect(compiled.rules).toHaveLength(2);
    expect(compiled.matchedProfiles.map((profile) => profile.profileId)).toEqual([
      "profile-common",
      "profile-local",
    ]);
    expect(compiled.rules.flatMap((rule) => rule.headers.map((header) => header.name))).toEqual([
      "x-app-platform",
      "x-env",
    ]);
  });

  it("compiles profiles that target different origins", () => {
    const enterprise = makeProfile({
      id: "profile-ghe",
      name: "GitHub Enterprise",
      targetOrigins: [{ id: "origin-ghe", origin: "https://ghe.example.test", enabled: true }],
      fixedHeaders: [{ id: "fixed-auth", name: "authorization", value: "token-a", enabled: true }],
    });
    const compiled = compileConfig([commonHeaders, enterprise]);

    expect(compiled.errors).toEqual([]);
    expect(compiled.rules.map((rule) => rule.origin)).toEqual([
      "http://localhost:3000",
      "https://ghe.example.test",
    ]);
  });

  it("resolves captured values per profile session", () => {
    const capture = makeProfile({
      id: "profile-oauth",
      name: "OAuth Capture",
      captureHeaders: [{ id: "capture-token", name: "x-auth-token", enabled: true }],
    });
    const compiled = compileConfig([capture], {
      [capture.id]: session(capture.id, { "x-auth-token": "captured-token" }),
    });

    expect(compiled.rules[0]?.headers).toEqual([
      { name: "x-auth-token", value: "captured-token", source: "captured" },
    ]);
  });

  it("reports a conflict when two profiles set the same header on the same origin", () => {
    const a = makeProfile({
      id: "profile-a",
      name: "A",
      fixedHeaders: [{ id: "fixed-auth", name: "authorization", value: "token-a", enabled: true }],
    });
    const b = makeProfile({
      id: "profile-b",
      name: "B",
      fixedHeaders: [{ id: "fixed-auth", name: "authorization", value: "token-b", enabled: true }],
    });

    const compiled = compileConfig([a, b]);

    expect(compiled.errors).toHaveLength(1);
    expect(compiled.errors[0]).toMatchObject({
      code: "header-conflict",
      origin: "http://localhost:3000",
      headerName: "authorization",
      profileIds: ["profile-a", "profile-b"],
    });
  });

  it("reports a conflict between a fixed header and another profile's captured value", () => {
    const fixed = makeProfile({
      id: "profile-fixed",
      name: "Fixed",
      fixedHeaders: [{ id: "fixed-auth", name: "authorization", value: "token-a", enabled: true }],
    });
    const captured = makeProfile({
      id: "profile-captured",
      name: "Captured",
      captureHeaders: [{ id: "capture-auth", name: "authorization", enabled: true }],
    });

    const compiled = compileConfig([fixed, captured], {
      [captured.id]: session(captured.id, { authorization: "token-b" }),
    });

    expect(compiled.errors).toHaveLength(1);
    const [firstError] = compiled.errors;
    expect(firstError?.code === "header-conflict" && firstError.headerName).toBe("authorization");
  });

  it("allows the same header name on different origins", () => {
    const other = makeProfile({
      id: "profile-other",
      name: "Other",
      targetOrigins: [{ id: "origin-api", origin: "https://api.example.test", enabled: true }],
      fixedHeaders: [{ id: "fixed-platform", name: "x-app-platform", value: "web", enabled: true }],
    });

    expect(compileConfig([commonHeaders, other]).errors).toEqual([]);
  });

  it("does not treat one profile's own fixed/captured collision as a conflict", () => {
    const both = makeProfile({
      id: "profile-both",
      name: "Both",
      fixedHeaders: [{ id: "fixed-auth", name: "authorization", value: "fixed", enabled: true }],
      captureHeaders: [{ id: "capture-auth", name: "authorization", enabled: true }],
    });

    const compiled = compileConfig([both], {
      [both.id]: session(both.id, { authorization: "captured" }),
    });

    expect(compiled.errors).toEqual([]);
    expect(compiled.rules[0]?.headers).toEqual([
      { name: "authorization", value: "fixed", source: "fixed" },
    ]);
  });

  it("warns about profiles without origins, headers or with excluded paths", () => {
    const noOrigins = makeProfile({ id: "profile-empty", name: "Empty", targetOrigins: [] });
    const excluded = makeProfile({
      id: "profile-excluded",
      name: "Excluded",
      fixedHeaders: [{ id: "fixed-env", name: "x-env", value: "local", enabled: true }],
      excludedPaths: [{ id: "exclude-assets", pathPrefix: "/assets/**", enabled: true }],
    });
    const noHeaders = makeProfile({ id: "profile-bare", name: "Bare" });

    const codes = compileConfig([noOrigins, excluded, noHeaders]).warnings.map(
      (warning) => warning.code,
    );

    expect(codes).toEqual(["no-target-origins", "excluded-paths-remove-headers", "no-headers"]);
  });
});

describe("probeUrl", () => {
  const excluded = makeProfile({
    id: "profile-excluded",
    name: "Excluded",
    fixedHeaders: [{ id: "fixed-env", name: "x-env", value: "local", enabled: true }],
    excludedPaths: [{ id: "exclude-assets", pathPrefix: "/assets/**", enabled: true }],
  });

  it("reports every matched profile and the effective headers", () => {
    const result = probeUrl(
      compileConfig([commonHeaders, localDev]),
      "http://localhost:3000/api/me",
    );

    expect(result.matches.map((match) => match.profileName)).toEqual([
      "Common Headers",
      "Local Development",
    ]);
    expect(result.effectiveHeaders.map((header) => header.name)).toEqual([
      "x-app-platform",
      "x-env",
    ]);
  });

  it("drops the excluded profile's headers but keeps it in the match list", () => {
    const result = probeUrl(
      compileConfig([commonHeaders, excluded]),
      "http://localhost:3000/assets/app.js",
    );

    expect(result.matches).toHaveLength(2);
    expect(result.matches[1]).toMatchObject({ excluded: true, matchedExcludedPath: "/assets/**" });
    expect(result.effectiveHeaders.map((header) => header.name)).toEqual(["x-app-platform"]);
  });

  it("reports no matches for an unrelated origin", () => {
    const result = probeUrl(compileConfig([commonHeaders]), "https://example.test/api");
    expect(result.matches).toEqual([]);
    expect(result.effectiveHeaders).toEqual([]);
  });

  it("attaches nothing while a conflict is unresolved", () => {
    const a = makeProfile({
      id: "profile-a",
      name: "A",
      fixedHeaders: [{ id: "fixed-auth", name: "authorization", value: "token-a", enabled: true }],
    });
    const b = makeProfile({
      id: "profile-b",
      name: "B",
      fixedHeaders: [{ id: "fixed-auth", name: "authorization", value: "token-b", enabled: true }],
    });

    const result = probeUrl(compileConfig([a, b]), "http://localhost:3000/api/me");

    expect(result.errors).toHaveLength(1);
    expect(result.effectiveHeaders).toEqual([]);
  });
});

describe("compileConfig - cookies", () => {
  const cookieA = makeProfile({
    id: "profile-cookie-a",
    name: "A",
    fixedCookies: [{ id: "fc-a1", name: "sidA", value: "1", enabled: true }],
  });
  const cookieB = makeProfile({
    id: "profile-cookie-b",
    name: "B",
    fixedCookies: [{ id: "fc-b1", name: "sidB", value: "2", enabled: true }],
  });

  it("merges cookies from every enabled profile on the same origin (order: profile, then intra-profile)", () => {
    const compiled = compileConfig([cookieA, cookieB]);
    expect(compiled.cookieRules).toHaveLength(1);
    expect(compiled.cookieRules[0]!.cookieHeaderValue).toBe("sidA=1; sidB=2");
  });

  it("reports a cookie-conflict when two enabled profiles set the same cookie name", () => {
    const rival = makeProfile({
      id: "profile-cookie-rival",
      name: "Rival",
      fixedCookies: [{ id: "fc-r1", name: "sidA", value: "3", enabled: true }],
    });
    const compiled = compileConfig([cookieA, rival]);
    expect(compiled.errors).toHaveLength(1);
    const [error] = compiled.errors;
    expect(error?.code === "cookie-conflict" && error.cookieName).toBe("sidA");
    // Compile error blocks ALL cookie rules for safety (rule-sync's contract).
    expect(compiled.cookieRules).toEqual([]);
  });

  it("includes tracked cookies without captured values in the conflict check (AC-31)", () => {
    const tracker = makeProfile({
      id: "profile-cookie-tracker",
      name: "Tracker",
      trackedCookies: [{ id: "tc-sida", name: "sidA", enabled: true }],
    });
    // sidA is fixed in one profile and tracked (but not yet captured) in another —
    // the conflict fires anyway (before excluded paths, before capture).
    const compiled = compileConfig([cookieA, tracker]);
    expect(compiled.errors).toHaveLength(1);
    expect(compiled.errors[0]?.code).toBe("cookie-conflict");
  });

  it("preserves per-profile order in the cookieMatches probe result", () => {
    const compiled = compileConfig([cookieB, cookieA]);
    const probe = probeUrl(compiled, "http://localhost:3000/api/me");
    expect(probe.cookieMatches.map((m) => m.profileId)).toEqual([
      "profile-cookie-b",
      "profile-cookie-a",
    ]);
    expect(probe.cookieHeaderValue).toBe("sidB=2; sidA=1");
  });

  it("emits a per-glob override rule when a profile has an excluded path (AC-10)", () => {
    const withExclusion = makeProfile({
      ...cookieA,
      id: "profile-cookie-a-ex",
      name: "A-ex",
      excludedPaths: [{ id: "e1", pathPrefix: "/admin/**", enabled: true }],
    });
    const compiled = compileConfig([withExclusion, cookieB]);
    // Base = full merge from every profile ("sidA=1; sidB=2");
    // /admin/** override = profiles NOT excluding /admin/** (only cookieB → "sidB=2").
    const base = compiled.cookieRules.find((r) => r.urlRegionKey === "all");
    expect(base?.cookieHeaderValue).toBe("sidA=1; sidB=2");
    const override = compiled.cookieRules.find((r) => r.urlRegionKey === "glob:/admin/**");
    expect(override?.cookieHeaderValue).toBe("sidB=2");
  });

  it("probe returns the merged Cookie value across profiles and reduces on excluded paths (AC-17)", () => {
    const bWithExclusion = makeProfile({
      ...cookieB,
      id: "profile-cookie-b-ex",
      excludedPaths: [{ id: "e1", pathPrefix: "/admin/**", enabled: true }],
    });
    const compiled = compileConfig([cookieA, bWithExclusion]);
    const probeApi = probeUrl(compiled, "http://localhost:3000/api/me");
    expect(probeApi.cookieHeaderValue).toBe("sidA=1; sidB=2");
    const probeAdmin = probeUrl(compiled, "http://localhost:3000/admin/dashboard");
    // B is excluded on /admin/** so its cookies drop out; only A remains.
    expect(probeAdmin.cookieHeaderValue).toBe("sidA=1");
  });

  it("reports 0 candidates on excluded path as no cookie modification (AC-24)", () => {
    const soleWithExclusion = makeProfile({
      ...cookieA,
      excludedPaths: [{ id: "e1", pathPrefix: "/admin/**", enabled: true }],
    });
    const compiled = compileConfig([soleWithExclusion]);
    // FR-13/FR-14 fallback: the sole profile on this origin has an excluded path,
    // so the /admin/** region would reduce to 0 candidates. DNR SET is destructive
    // and RE2 has no negative path matcher, so keeping the base rule at priority
    // 200 would leak the cookie onto excluded URLs. compileConfig falls back to
    // "no cookie rule for this origin" and raises a warning; both URLs pass
    // Chrome's original Cookie through unchanged.
    expect(compiled.cookieRules).toEqual([]);
    const warning = compiled.warnings.find((w) => w.code === "cookie-exclusion-cannot-preserve");
    expect(warning).toBeDefined();
    if (warning?.code === "cookie-exclusion-cannot-preserve") {
      expect(warning.origin).toBe("http://localhost:3000");
      expect(warning.excludedPathGlobs).toEqual(["/admin/**"]);
    }
    expect(
      probeUrl(compiled, "http://localhost:3000/admin/dashboard").cookieHeaderValue,
    ).toBeUndefined();
    expect(probeUrl(compiled, "http://localhost:3000/api/me").cookieHeaderValue).toBeUndefined();
  });
});
