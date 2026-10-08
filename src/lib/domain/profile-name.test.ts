import { describe, expect, it } from "vitest";

import {
  createProfileCopyName,
  normalizeProfileName,
  profileNameKey,
  uniquifyProfileNames,
} from "./profile-name";

describe("Profile names", () => {
  it("stores a trimmed display name and compares NFKC and case variants as the same name", () => {
    expect(normalizeProfileName("  Local API  ")).toBe("Local API");
    expect(profileNameKey("Local API")).toBe(profileNameKey("local api"));
    expect(profileNameKey("Local API")).toBe(profileNameKey("Ｌｏｃａｌ　ＡＰＩ"));
  });

  it("repairs duplicate names in config order without changing profile identity", () => {
    const profiles = [
      { id: "a", name: "Local API" },
      { id: "b", name: " local api " },
      { id: "c", name: "Ｌｏｃａｌ　ＡＰＩ" },
    ];

    expect(uniquifyProfileNames(profiles)).toEqual([
      { id: "a", name: "Local API" },
      { id: "b", name: "local api (2)" },
      { id: "c", name: "Ｌｏｃａｌ　ＡＰＩ (3)" },
    ]);
    expect(profiles[1]?.name).toBe(" local api ");
  });

  it("skips suffixes that are already in use", () => {
    expect(
      uniquifyProfileNames([
        { id: "a", name: "API" },
        { id: "b", name: "API (2)" },
        { id: "c", name: "api" },
      ]),
    ).toEqual([
      { id: "a", name: "API" },
      { id: "b", name: "API (2)" },
      { id: "c", name: "api (3)" },
    ]);
  });

  it("builds a unique Copy of name without changing existing names", () => {
    expect(
      createProfileCopyName(" API ", [
        { id: "a", name: "API" },
        { id: "b", name: "Copy of API" },
        { id: "c", name: "Copy of API 2" },
      ]),
    ).toBe("Copy of API 3");
  });
});
