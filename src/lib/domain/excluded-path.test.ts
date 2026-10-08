import { describe, expect, it } from "vitest";

import { normalizeStoredExcludedPaths, validateExcludedPathPrefix } from "./excluded-path";
import type { AppConfig } from "./types";

describe("excluded path validation", () => {
  it.each([
    ["", "required"],
    ["   ", "required"],
    ["assets/", "must-start-with-slash"],
    ["https://example.test/assets/", "url-not-allowed"],
    ["/assets/\n/api/", "single-line"],
  ] as const)("rejects %j with %s", (value, error) => {
    expect(validateExcludedPathPrefix(value)).toMatchObject({ ok: false, error });
  });

  it.each(["/", "/assets/", "/api"])("accepts %s", (value) => {
    expect(validateExcludedPathPrefix(value)).toEqual({ ok: true, value });
  });

  it("trims valid prefixes", () => {
    expect(validateExcludedPathPrefix("  /assets/  ")).toEqual({
      ok: true,
      value: "/assets/",
    });
  });

  it("disables unsafe stored rules without deleting their rows", () => {
    const config: AppConfig = {
      schemaVersion: 2,
      profiles: [
        {
          id: "profile-test",
          name: "Test",
          enabled: true,
          targetOrigins: [],
          fixedHeaders: [],
          captureHeaders: [],
          excludedPaths: [{ id: "exclude-empty", pathPrefix: "", enabled: true }],
          fixedCookies: [],
          trackedCookies: [],
          migrationIssues: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };

    const result = normalizeStoredExcludedPaths(config);
    expect(result.changed).toBe(true);
    expect(result.config.profiles[0]?.excludedPaths).toEqual([
      { id: "exclude-empty", pathPrefix: "", enabled: false },
    ]);
  });
});
