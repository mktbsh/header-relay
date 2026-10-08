import { describe, expect, it } from "vitest";

import { createInitialProfile, createProfile } from "./default-profile";

describe("profile defaults", () => {
  it("keeps only localhost origins in the initial profile", () => {
    const profile = createInitialProfile();
    expect(profile.targetOrigins).toHaveLength(2);
    expect(profile.fixedHeaders).toEqual([]);
    expect(profile.captureHeaders).toEqual([]);
    expect(profile.excludedPaths).toEqual([]);
  });

  it("creates later profiles without sample settings", () => {
    const profile = createProfile();
    expect(profile.targetOrigins).toEqual([]);
    expect(profile.fixedHeaders).toEqual([]);
    expect(profile.captureHeaders).toEqual([]);
    expect(profile.excludedPaths).toEqual([]);
  });
});
