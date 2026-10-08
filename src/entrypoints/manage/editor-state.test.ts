import { describe, expect, it } from "vitest";

import type { AppConfig, FixedHeaderPopupConfig, Profile } from "../../lib/domain/types";
import {
  applyProfileSection,
  createManageDraft,
  findProfile,
  isProfileSectionDirty,
  isProfileSectionValid,
  removeProfileDraft,
  updateProfileDraft,
} from "./editor-state";

const config: AppConfig = {
  schemaVersion: 7,
  profiles: [
    {
      id: "profile-a",
      name: "Profile A",
      enabled: true,
      targetOrigins: [],
      fixedHeaders: [],
      captureHeaders: [],
      excludedPaths: [],
      fixedCookies: [],
      trackedCookies: [],
      migrationIssues: [],
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "profile-b",
      name: "Profile B",
      enabled: false,
      targetOrigins: [],
      fixedHeaders: [],
      captureHeaders: [],
      excludedPaths: [],
      fixedCookies: [],
      trackedCookies: [],
      migrationIssues: [],
      createdAt: 1,
      updatedAt: 1,
    },
  ],
};

describe("manage editor state", () => {
  it("updates the addressed profile draft and keeps JSON text synchronized", () => {
    const draft = updateProfileDraft(createManageDraft(config), "profile-a", 123, (profile) => {
      profile.name = "Renamed";
    });

    expect(findProfile(draft.config, "profile-a")?.name).toBe("Renamed");
    expect(findProfile(draft.config, "profile-a")?.updatedAt).toBe(123);
    expect(JSON.parse(draft.jsonText).profiles[0].name).toBe("Renamed");
    expect(draft.dirty).toBe(true);
  });

  it("removes a profile from the draft without mutating the original config", () => {
    const draft = removeProfileDraft(createManageDraft(config), "profile-a");

    expect(draft.config.profiles.map((profile) => profile.id)).toEqual(["profile-b"]);
    expect(JSON.parse(draft.jsonText).profiles).toHaveLength(1);
    expect(config.profiles).toHaveLength(2);
    expect(draft.dirty).toBe(true);
  });
});

describe("manage section save state", () => {
  const savedProfile = config.profiles[0];

  it("detects dirtiness per section independently", () => {
    const draft = updateProfileDraft(createManageDraft(config), "profile-a", 200, (profile) => {
      profile.fixedHeaders.push({ id: "fixed-1", name: "x-token", value: "abc", enabled: true });
    });
    const draftProfile = findProfile(draft.config, "profile-a");

    expect(isProfileSectionDirty(draftProfile, savedProfile, "fixed")).toBe(true);
    expect(isProfileSectionDirty(draftProfile, savedProfile, "origins")).toBe(false);
    expect(isProfileSectionDirty(draftProfile, savedProfile, "basics")).toBe(false);
  });

  it("merges only the given section into the saved config, leaving others untouched", () => {
    const draft = updateProfileDraft(createManageDraft(config), "profile-a", 300, (profile) => {
      profile.name = "Renamed";
      profile.fixedHeaders.push({ id: "fixed-1", name: "x-token", value: "abc", enabled: true });
    });
    const draftProfile = findProfile(draft.config, "profile-a")!;

    const next = applyProfileSection(config, draftProfile, "fixed", 999);
    const nextProfile = next.profiles.find((item) => item.id === draftProfile.id)!;

    expect(nextProfile.fixedHeaders).toHaveLength(1);
    expect(nextProfile.name).toBe("Profile A");
    expect(nextProfile.updatedAt).toBe(999);
    expect(config.profiles[0]!.fixedHeaders).toHaveLength(0);
    expect(next.profiles[1]).toBe(config.profiles[1]);
  });

  it("uses the config schema to block a section that cannot be saved", () => {
    const draft = updateProfileDraft(createManageDraft(config), "profile-a", 300, (profile) => {
      profile.fixedHeaders.push({
        id: "fixed-1",
        name: "Host",
        value: "example.test",
        enabled: false,
      });
    });
    const draftProfile = findProfile(draft.config, "profile-a")!;

    expect(isProfileSectionValid(config, draftProfile, "fixed")).toBe(false);

    // Cookie is now owned by the dedicated Cookie feature and is refused from the
    // generic fixed-header list; picking any allowed header name should re-validate.
    draftProfile.fixedHeaders[0]!.name = "Authorization";
    expect(isProfileSectionValid(config, draftProfile, "fixed")).toBe(true);
  });
});

describe("isProfileSectionDirty", () => {
  const withPopup = (popup: FixedHeaderPopupConfig): Profile => ({
    ...config.profiles[0]!,
    fixedHeaders: [{ id: "f1", name: "x-track", value: "stable", enabled: true, popup }],
  });

  // The editor writes the draft; the saved baseline comes back rebuilt by Zod. The two
  // can hold the same popup config with the keys in a different order.
  it("ignores key order so a saved section does not stay dirty forever", () => {
    const draft = withPopup({ input: "text", visible: true });
    const saved = withPopup({ visible: true, input: "text" });

    expect(isProfileSectionDirty(draft, saved, "fixed")).toBe(false);
  });

  it("still reports a real value change", () => {
    const draft = withPopup({ visible: true, input: "select" });
    const saved = withPopup({ visible: true, input: "text" });

    expect(isProfileSectionDirty(draft, saved, "fixed")).toBe(true);
  });
});
