import { describe, expect, it } from "vitest";

import { toggleAllProfiles } from "./profile-toggle";
import type { Profile } from "./types";

const profile = (id: string, enabled: boolean): Profile => ({
  id,
  name: id,
  enabled,
  targetOrigins: [],
  fixedHeaders: [],
  captureHeaders: [],
  excludedPaths: [],
  fixedCookies: [],
  trackedCookies: [],
  migrationIssues: [],
  createdAt: 1,
  updatedAt: 1,
});

describe("toggleAllProfiles", () => {
  it("pauses enabled profiles and records their ids", () => {
    const source = [profile("a", true), profile("b", false)];
    const result = toggleAllProfiles(source, null, 10);

    expect(result).toMatchObject({
      action: "paused",
      pausedProfileIds: ["a"],
    });
    expect(result.profiles.map((item) => item.enabled)).toEqual([false, false]);
    expect(result.profiles[0]?.updatedAt).toBe(10);
    expect(source[0]?.enabled).toBe(true);
  });

  it("restores only existing paused profiles", () => {
    const result = toggleAllProfiles([profile("a", false), profile("b", false)], ["a", "gone"], 20);

    expect(result.action).toBe("restored");
    expect(result.profiles.map((item) => item.enabled)).toEqual([true, false]);
    expect(result.pausedProfileIds).toBeNull();
  });

  it("does nothing when every profile is disabled without a pause set", () => {
    const result = toggleAllProfiles([profile("a", false)], null, 30);

    expect(result).toMatchObject({ action: "noop", pausedProfileIds: null });
    expect(result.profiles[0]?.updatedAt).toBe(1);
  });
});
