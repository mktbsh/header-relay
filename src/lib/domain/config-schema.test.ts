import { describe, expect, it } from "vitest";

import { parseAppConfig } from "./config-schema";
import { CONFIG_SCHEMA_VERSION } from "./default-profile";
import type { AppConfig, FixedHeaderPopupConfig } from "./types";

const baseProfile = () => ({
  id: "p1",
  name: "Test",
  enabled: true,
  targetOrigins: [{ id: "o1", origin: "http://localhost:3000", enabled: true }],
  fixedHeaders: [{ id: "f1", name: "x-app-platform", value: "ios", enabled: true }],
  captureHeaders: [{ id: "c1", name: "x-auth-token", enabled: true }],
  excludedPaths: [{ id: "e1", pathPrefix: "/assets/", enabled: true }],
  createdAt: 1,
  updatedAt: 1,
});

const wrap = (profile: ReturnType<typeof baseProfile>) => ({
  schemaVersion: CONFIG_SCHEMA_VERSION,
  profiles: [profile],
});

const publishedProfile = (popup: FixedHeaderPopupConfig) => ({
  ...baseProfile(),
  fixedHeaders: [{ id: "f1", name: "x-release-track", value: "stable", enabled: true, popup }],
});

const firstProfile = (config: AppConfig) => config.profiles[0]!;

describe("config-schema validation", () => {
  it("rejects duplicate Profile names after display normalization", () => {
    const first = baseProfile();
    first.name = "Local API";
    const second = { ...baseProfile(), id: "p2", name: "ｌｏｃａｌ　ａｐｉ" };

    expect(() =>
      parseAppConfig({
        schemaVersion: CONFIG_SCHEMA_VERSION,
        profiles: [first, second],
      }),
    ).toThrow("duplicate profile name");
  });

  it("accepts an optional uiDensity but rejects unknown values", () => {
    expect(parseAppConfig({ ...wrap(baseProfile()), uiDensity: "compact" }).uiDensity).toBe(
      "compact",
    );
    expect(parseAppConfig(wrap(baseProfile())).uiDensity).toBeUndefined();
    expect(() => parseAppConfig({ ...wrap(baseProfile()), uiDensity: "tiny" })).toThrow(
      "Invalid app config",
    );
  });

  it("normalizes header names (trim + lowercase)", () => {
    const profile = baseProfile();
    profile.fixedHeaders[0]!.name = "  X-App-Platform  ";
    profile.captureHeaders[0]!.name = "X-Auth-Token";

    const config = parseAppConfig(wrap(profile));
    expect(firstProfile(config).fixedHeaders[0]!.name).toBe("x-app-platform");
    expect(firstProfile(config).captureHeaders[0]!.name).toBe("x-auth-token");
  });

  it("rejects header names that are not valid HTTP tokens", () => {
    const profile = baseProfile();
    profile.fixedHeaders[0]!.name = "bad header"; // contains space
    expect(() => parseAppConfig(wrap(profile))).toThrow("valid HTTP token");
  });

  it.each(["set-cookie", "HOST", "Content-Length", "Transfer-Encoding"])(
    "rejects browser- or transport-owned header %s after normalization",
    (name) => {
      const fixed = baseProfile();
      fixed.fixedHeaders[0]!.name = `  ${name}  `;
      expect(() => parseAppConfig(wrap(fixed))).toThrow("managed by the browser or HTTP transport");

      const captured = baseProfile();
      captured.captureHeaders[0]!.name = name;
      expect(() => parseAppConfig(wrap(captured))).toThrow(
        "managed by the browser or HTTP transport",
      );
    },
  );

  it.each(["Authorization", "X-Auth-Token", "x-api-key"])(
    "allows credential-bearing header %s so the UI can warn without disabling the core use case",
    (name) => {
      const profile = baseProfile();
      profile.fixedHeaders[0]!.name = name;
      expect(() => parseAppConfig(wrap(profile))).not.toThrow();
    },
  );

  it.each(["Cookie", "cookie", "COOKIE"])(
    "routes header %s to the dedicated Cookie feature instead of accepting it as a generic header",
    (name) => {
      const fixed = baseProfile();
      fixed.fixedHeaders[0]!.name = name;
      expect(() => parseAppConfig(wrap(fixed))).toThrow("dedicated Cookie feature");

      const captured = baseProfile();
      captured.captureHeaders[0]!.name = name;
      expect(() => parseAppConfig(wrap(captured))).toThrow("dedicated Cookie feature");
    },
  );

  it("rejects duplicate fixed header names after normalization", () => {
    const profile = baseProfile();
    profile.fixedHeaders = [
      { id: "f1", name: "x-app-platform", value: "ios", enabled: true },
      { id: "f2", name: "X-App-Platform", value: "android", enabled: true },
    ];
    expect(() => parseAppConfig(wrap(profile))).toThrow("duplicate fixed header name");
  });

  it("rejects duplicate captured header names", () => {
    const profile = baseProfile();
    profile.captureHeaders = [
      { id: "c1", name: "x-auth-token", enabled: true },
      { id: "c2", name: "x-auth-token", enabled: false },
    ];
    expect(() => parseAppConfig(wrap(profile))).toThrow("duplicate captured header name");
  });

  it("allows the same name across fixed and captured headers (fixed wins in core)", () => {
    const profile = baseProfile();
    profile.fixedHeaders[0]!.name = "x-auth-token";
    expect(() => parseAppConfig(wrap(profile))).not.toThrow();
  });

  it("rejects target origins that include a path or trailing slash", () => {
    const withPath = baseProfile();
    withPath.targetOrigins[0]!.origin = "http://localhost:3000/api";
    expect(() => parseAppConfig(wrap(withPath))).toThrow("must be an origin");

    const withSlash = baseProfile();
    withSlash.targetOrigins[0]!.origin = "http://localhost:3000/";
    expect(() => parseAppConfig(wrap(withSlash))).toThrow("must be an origin");
  });

  it("rejects excluded paths that do not start with /", () => {
    const profile = baseProfile();
    profile.excludedPaths[0]!.pathPrefix = "assets/";
    expect(() => parseAppConfig(wrap(profile))).toThrow("must start with /");
  });

  it("allows empty disabled draft rows but rejects empty enabled rows", () => {
    const disabled = baseProfile();
    disabled.excludedPaths[0] = { id: "e1", pathPrefix: "", enabled: false };
    disabled.fixedHeaders[0] = { id: "f1", name: "", value: "", enabled: false };
    disabled.captureHeaders[0] = { id: "c1", name: "", enabled: false };
    expect(() => parseAppConfig(wrap(disabled))).not.toThrow();

    const enabled = baseProfile();
    enabled.excludedPaths[0] = { id: "e1", pathPrefix: "", enabled: true };
    expect(() => parseAppConfig(wrap(enabled))).toThrow("required when the rule is enabled");
  });

  it("rejects full URLs and multiline excluded paths", () => {
    const fullUrl = baseProfile();
    fullUrl.excludedPaths[0]!.pathPrefix = "https://example.test/assets/";
    expect(() => parseAppConfig(wrap(fullUrl))).toThrow("not a full URL");

    const multiline = baseProfile();
    multiline.excludedPaths[0]!.pathPrefix = "/assets/\n/api/";
    expect(() => parseAppConfig(wrap(multiline))).toThrow("single line");
  });

  it("keeps a fixed header value verbatim, including surrounding whitespace", () => {
    const profile = baseProfile();
    profile.fixedHeaders[0]!.value = "  spaced  ";
    expect(firstProfile(parseAppConfig(wrap(profile))).fixedHeaders[0]!.value).toBe("  spaced  ");
  });

  it("accepts a popup-published header and a select with options", () => {
    expect(() =>
      parseAppConfig(wrap(publishedProfile({ visible: true, input: "text" }))),
    ).not.toThrow();
    expect(() =>
      parseAppConfig(
        wrap(
          publishedProfile({
            visible: true,
            input: "select",
            options: [{ label: "Stable", value: "stable" }],
          }),
        ),
      ),
    ).not.toThrow();
  });

  it("rejects a select without options or with duplicate option values", () => {
    expect(() =>
      parseAppConfig(wrap(publishedProfile({ visible: true, input: "select", options: [] }))),
    ).toThrow("at least one option");
    expect(() =>
      parseAppConfig(wrap(publishedProfile({ visible: true, input: "select" }))),
    ).toThrow("at least one option");
    expect(() =>
      parseAppConfig(
        wrap(
          publishedProfile({
            visible: true,
            input: "select",
            options: [
              { label: "Stable", value: "stable" },
              { label: "Also stable", value: "stable" },
            ],
          }),
        ),
      ),
    ).toThrow("duplicate option value");
  });
});
