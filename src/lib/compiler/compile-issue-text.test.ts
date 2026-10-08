import { describe, expect, it } from "vitest";

import { describeCompileIssue } from "./compile-issue-text";

const names: Record<string, string> = { a: "Local", b: "Staging" };
const profileName = (id: string) => names[id] ?? id;

describe("describeCompileIssue", () => {
  it("names profiles instead of their IDs", () => {
    expect(
      describeCompileIssue(
        {
          code: "header-conflict",
          profileIds: ["a", "b", "gone"],
          origin: "https://api.example.test",
          headerName: "x-env",
          message: "",
        },
        profileName,
      ),
    ).toBe(
      'Header "x-env" on https://api.example.test is set by more than one enabled profile (Local, Staging, gone). Disable all but one.',
    );
  });

  it("does not leak internal references into the cookie exclusion warning", () => {
    const text = describeCompileIssue(
      {
        code: "cookie-exclusion-cannot-preserve",
        profileIds: ["a"],
        origin: "https://api.example.test",
        excludedPathGlobs: ["/health", "/assets/**"],
        message: "See ADR 2026-07-21-cookie-dnr-rule-composition.",
      },
      profileName,
    );
    expect(text).toContain("https://api.example.test");
    expect(text).toContain("/health, /assets/**");
    expect(text).not.toContain("ADR");
  });

  it("describes profile warnings by profile name", () => {
    expect(
      describeCompileIssue({ code: "no-target-origins", profileId: "a", message: "" }, profileName),
    ).toBe('Profile "Local" has no enabled target origin.');
  });
});
