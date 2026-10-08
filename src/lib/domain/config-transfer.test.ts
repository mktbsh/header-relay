import { describe, expect, it } from "vitest";

import { parseConfigImport, serializeConfigForExport } from "./config-transfer";
import type { AppConfig } from "./types";

const config = (): AppConfig => ({
  schemaVersion: 7,
  profiles: [
    {
      id: "profile-a",
      name: "API",
      enabled: true,
      targetOrigins: [],
      fixedHeaders: [
        {
          id: "header-a",
          name: "x-token",
          value: "header-secret",
          enabled: true,
          popup: {
            visible: true,
            input: "select",
            options: [{ label: "Secret", value: "header-secret" }],
          },
        },
      ],
      captureHeaders: [],
      excludedPaths: [],
      fixedCookies: [{ id: "cookie-a", name: "sid", value: "cookie-secret", enabled: true }],
      trackedCookies: [{ id: "tracked-a", name: "csrf", enabled: true }],
      migrationIssues: [
        {
          id: "issue-a",
          source: "fixed-header-cookie",
          originalName: "Cookie",
          originalValue: "sid=cookie-secret",
          originalPopup: {
            visible: true,
            input: "select",
            options: [{ label: "Secret", value: "cookie-secret" }],
          },
          originalEnabled: true,
          reason: "cookie-parse-failed",
        },
      ],
      createdAt: 1,
      updatedAt: 2,
    },
  ],
});

describe("configuration transfer", () => {
  it("redacts every persisted secret value by default", () => {
    const source = config();
    const exported = JSON.parse(serializeConfigForExport(source, false)) as AppConfig;
    const profile = exported.profiles[0]!;

    expect(profile.fixedHeaders[0]?.value).toBe("");
    expect(profile.fixedHeaders[0]?.popup?.options?.[0]?.value).toBe("");
    expect(profile.fixedCookies[0]?.value).toBe("");
    expect(profile.migrationIssues[0]?.originalValue).toBe("");
    expect(profile.migrationIssues[0]?.originalPopup?.options?.[0]?.value).toBe("");
    expect(source.profiles[0]?.fixedHeaders[0]?.value).toBe("header-secret");
  });

  it("keeps a redacted export importable without restoring secrets", () => {
    const imported = parseConfigImport(serializeConfigForExport(config(), false));
    const profile = imported.profiles[0]!;

    expect(profile.fixedHeaders[0]?.value).toBe("");
    expect(profile.fixedCookies[0]).toMatchObject({ value: "", enabled: false });
  });

  it("removes multiple redacted select options instead of creating duplicates", () => {
    const source = config();
    source.profiles[0]!.fixedHeaders[0]!.popup!.options?.push({
      label: "Another secret",
      value: "another-secret",
    });

    const text = serializeConfigForExport(source, false);
    const exported = JSON.parse(text) as AppConfig;

    expect(exported.profiles[0]?.fixedHeaders[0]?.popup).toEqual({
      visible: true,
      input: "text",
    });
    expect(() => parseConfigImport(text)).not.toThrow();
  });

  it("includes values only when explicitly requested", () => {
    const exported = JSON.parse(serializeConfigForExport(config(), true)) as AppConfig;
    const profile = exported.profiles[0]!;

    expect(profile.fixedHeaders[0]?.value).toBe("header-secret");
    expect(profile.fixedCookies[0]?.value).toBe("cookie-secret");
    expect(profile.migrationIssues[0]?.originalValue).toBe("sid=cookie-secret");
  });

  it("migrates and validates imported JSON before returning an AppConfig", () => {
    const imported = parseConfigImport(JSON.stringify(config()));

    expect(imported).toEqual(config());
    expect(() => parseConfigImport(JSON.stringify({ schemaVersion: 7, profiles: [] }))).toThrow(
      "Invalid app config",
    );
  });
});
