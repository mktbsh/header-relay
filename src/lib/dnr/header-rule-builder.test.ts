import { describe, expect, it } from "vitest";

import { compileConfig } from "../compiler/compile-config";
import type { Profile, SessionState } from "../domain/types";

const profile: Profile = {
  id: "profile-test",
  name: "Test",
  enabled: true,
  targetOrigins: [{ id: "origin-local", origin: "http://localhost:3000", enabled: true }],
  fixedHeaders: [
    { id: "fixed-platform", name: "x-auth-token", value: "fixed-token", enabled: true },
  ],
  captureHeaders: [{ id: "capture-token", name: "x-auth-token", enabled: true }],
  excludedPaths: [{ id: "exclude-assets", pathPrefix: "/assets/**", enabled: true }],
  fixedCookies: [],
  trackedCookies: [],
  migrationIssues: [],
  createdAt: 1,
  updatedAt: 1,
};

const session = (capturedHeaders: SessionState["capturedHeaders"]): SessionState => ({
  profileId: profile.id,
  phase: "authenticated",
  capturedHeaders,
  trackedCookies: {},
  dnrRuleIds: [],
  updatedAt: 1,
});

const setRules = (rules: Browser.declarativeNetRequest.Rule[]) =>
  rules.filter((rule) => rule.priority !== 100);
const removeRules = (rules: Browser.declarativeNetRequest.Rule[]) =>
  rules.filter((rule) => rule.priority === 100);

// No browser stub anywhere in this file on purpose: the builder must not read any
// browser global at runtime (Chrome's DNR enums are unavailable in a service worker
// cold start), and an absent `browser` proves it.
describe("buildDnrRules", () => {
  it("builds Chrome-compatible modify-header rules without runtime enum objects", async () => {
    const { buildDnrRules } = await import("./header-rule-builder");
    const { rules } = buildDnrRules(compileConfig([profile]));

    const setRule = setRules(rules)[0];
    expect(setRule?.action.type).toBe("modifyHeaders");
    expect(setRule?.action.requestHeaders?.[0]).toMatchObject({
      operation: "set",
      header: "x-auth-token",
      value: "fixed-token",
    });
    // Subresources of a protected origin need the headers too, and omitting
    // resourceTypes would drop main_frame — so every type is listed.
    expect(setRule?.condition.resourceTypes).toEqual(
      expect.arrayContaining(["main_frame", "script", "stylesheet", "image", "xmlhttprequest"]),
    );
  });

  it("aggregates one set rule per profile and origin", async () => {
    const { buildDnrRules } = await import("./header-rule-builder");
    const multiOrigin: Profile = {
      ...profile,
      targetOrigins: [
        { id: "origin-local", origin: "http://localhost:3000", enabled: true },
        { id: "origin-loopback", origin: "http://127.0.0.1:3000", enabled: true },
      ],
      fixedHeaders: [{ id: "fixed-platform", name: "x-app-platform", value: "ios", enabled: true }],
    };
    const { rules } = buildDnrRules(
      compileConfig([multiOrigin], {
        [profile.id]: session({
          "x-auth-token": { name: "x-auth-token", value: "captured-token", capturedAt: 1 },
        }),
      }),
    );

    expect(setRules(rules)).toHaveLength(2);
    for (const rule of setRules(rules)) {
      expect(rule.action.requestHeaders).toHaveLength(2);
    }
  });

  it("keeps every enabled profile's rules in the same ruleset with distinct IDs", async () => {
    const { buildDnrRules } = await import("./header-rule-builder");
    const other: Profile = {
      ...profile,
      id: "profile-other",
      name: "Other",
      fixedHeaders: [{ id: "fixed-env", name: "x-env", value: "local", enabled: true }],
      captureHeaders: [],
      excludedPaths: [],
    };

    const { rules, ruleIdsByProfile } = buildDnrRules(compileConfig([profile, other]));

    expect(Object.keys(ruleIdsByProfile)).toEqual(["profile-test", "profile-other"]);
    expect(new Set(rules.map((rule) => rule.id)).size).toBe(rules.length);
    expect(rules.map((rule) => rule.id).sort()).toEqual(
      Object.values(ruleIdsByProfile).flat().sort(),
    );
  });

  it("builds no rule at all when the compiled config has a conflict", async () => {
    const { buildDnrRules } = await import("./header-rule-builder");
    const conflicting: Profile = { ...profile, id: "profile-conflict", captureHeaders: [] };

    const compiled = compileConfig([{ ...profile, captureHeaders: [] }, conflicting]);
    expect(compiled.errors).toHaveLength(1);
    expect(buildDnrRules(compiled)).toMatchObject({ rules: [], ruleIdsByProfile: {} });
  });

  it("does not emit duplicate header names in set or remove rules", async () => {
    const { buildDnrRules } = await import("./header-rule-builder");
    // profile has fixed and captured headers both named x-auth-token.
    const { rules } = buildDnrRules(
      compileConfig([profile], {
        [profile.id]: session({
          "x-auth-token": { name: "x-auth-token", value: "captured-token", capturedAt: 1 },
        }),
      }),
    );

    expect(setRules(rules)[0]?.action.requestHeaders).toHaveLength(1);
    expect(removeRules(rules)[0]?.action.requestHeaders).toHaveLength(1);
  });

  it("adds remove rules for excluded paths", async () => {
    const { buildDnrRules } = await import("./header-rule-builder");
    const { rules } = buildDnrRules(compileConfig([profile]));

    const removeRule = removeRules(rules)[0];
    expect(removeRule?.condition.regexFilter).toBe("^http://localhost:3000/assets/.*(?:$|[?#])");
    expect(removeRule?.action.requestHeaders?.[0]?.operation).toBe("remove");
  });

  it("matches case-sensitively on every rule, like the runtime path evaluation does", async () => {
    const { buildDnrRules } = await import("./header-rule-builder");
    // DNR defaults to case-insensitive; matchesExcludedGlob and URL Probe do not.
    // A drift here strips headers on a casing the probe reports as attached.
    const { rules } = buildDnrRules(compileConfig([profile]));

    expect(rules).not.toHaveLength(0);
    for (const rule of rules) {
      expect(rule.condition.isUrlFilterCaseSensitive).toBe(true);
    }
  });

  it("does not build remove rules for invalid excluded paths", async () => {
    const { buildDnrRules } = await import("./header-rule-builder");
    const { rules } = buildDnrRules(
      compileConfig([
        { ...profile, excludedPaths: [{ id: "exclude-empty", pathPrefix: "", enabled: true }] },
      ]),
    );

    expect(removeRules(rules)).toEqual([]);
  });

  it("builds no rule for a profile that attaches no header", async () => {
    const { buildDnrRules } = await import("./header-rule-builder");
    const { rules } = buildDnrRules(
      compileConfig([{ ...profile, fixedHeaders: [], captureHeaders: [] }]),
    );

    expect(rules).toEqual([]);
  });
});
