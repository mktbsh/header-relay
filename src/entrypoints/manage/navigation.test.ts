import { describe, expect, it } from "vitest";

import { profilePath, profileSwitchPath, settingsPath, viewedProfileLocation } from "./navigation";

describe("Manage navigation", () => {
  it("builds every canonical Profile and Settings path", () => {
    expect(profilePath("profile-a", "overview")).toBe("/profiles/profile-a");
    expect(profilePath("profile-a", "origins")).toBe("/profiles/profile-a/origins");
    expect(profilePath("profile-a", "headers")).toBe("/profiles/profile-a/headers");
    expect(profilePath("profile-a", "exclude")).toBe("/profiles/profile-a/excluded-paths");
    expect(profilePath("profile-a", "cookies")).toBe("/profiles/profile-a/cookies");
    expect(profilePath("profile-a", "probe")).toBe("/profiles/profile-a/url-probe");
    expect(settingsPath("general")).toBe("/settings");
    expect(settingsPath("logs")).toBe("/settings/audit-logs");
    expect(settingsPath("json")).toBe("/settings/json-editor");
  });

  it("parses only canonical Profile paths at the URL trust boundary", () => {
    expect(viewedProfileLocation("/profiles/profile-a/headers")).toEqual({
      profileId: "profile-a",
      tab: "headers",
    });
    expect(viewedProfileLocation("/profiles/profile%20a/url-probe")).toEqual({
      profileId: "profile a",
      tab: "probe",
    });
    expect(viewedProfileLocation("/origins")).toBeUndefined();
    expect(viewedProfileLocation("/profiles/profile-a/unknown")).toBeUndefined();
  });

  it("keeps the current Profile tab while switching and uses Overview from Settings", () => {
    expect(profileSwitchPath("profile-b", "/profiles/profile-a/cookies")).toBe(
      "/profiles/profile-b/cookies",
    );
    expect(profileSwitchPath("profile-b", "/settings/audit-logs")).toBe("/profiles/profile-b");
  });
});
