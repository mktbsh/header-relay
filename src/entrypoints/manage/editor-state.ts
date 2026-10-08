import { parseAppConfig } from "../../lib/domain/config-schema";
import { CONFIG_SCHEMA_VERSION } from "../../lib/domain/default-profile";
import type { AppConfig, Profile } from "../../lib/domain/types";

export type ManageDraft = {
  config: AppConfig;
  jsonText: string;
  dirty: boolean;
};

const clone = <T>(value: T): T => structuredClone(value);

const stringifyConfig = (config: AppConfig): string => JSON.stringify(config, null, 2);

export const createManageDraft = (config: AppConfig, dirty = false): ManageDraft => ({
  config,
  jsonText: stringifyConfig(config),
  dirty,
});

export const findProfile = (
  config: AppConfig | undefined,
  profileId: string | undefined,
): Profile | undefined => config?.profiles.find((item) => item.id === profileId);

export const updateProfileDraft = (
  draft: ManageDraft,
  profileId: string,
  now: number,
  updater: (profile: Profile) => void,
): ManageDraft => {
  const next = clone(draft.config);
  const nextProfile = next.profiles.find((item) => item.id === profileId);
  if (!nextProfile) return draft;

  updater(nextProfile);
  nextProfile.updatedAt = now;

  return createManageDraft(next, true);
};

export const addProfileDraft = (draft: ManageDraft, profile: Profile): ManageDraft =>
  createManageDraft(
    {
      ...draft.config,
      profiles: [...draft.config.profiles, profile],
    },
    true,
  );

export const removeProfileDraft = (draft: ManageDraft, profileId: string): ManageDraft =>
  createManageDraft(
    {
      ...draft.config,
      profiles: draft.config.profiles.filter((item) => item.id !== profileId),
    },
    true,
  );

export const parseJsonDraft = (jsonText: string): ManageDraft => {
  const parsed = parseAppConfig({
    ...JSON.parse(jsonText),
    schemaVersion: CONFIG_SCHEMA_VERSION,
  });

  return createManageDraft(parsed, true);
};

export type ProfileSectionKey = "basics" | "origins" | "fixed" | "capture" | "exclude" | "cookies";

export const PROFILE_SECTION_KEYS: ProfileSectionKey[] = [
  "basics",
  "origins",
  "fixed",
  "capture",
  "exclude",
  "cookies",
];

// Key order is not part of the value: the draft is built by the editor while the saved
// baseline comes back from Zod, which rebuilds objects in schema order. Comparing raw
// JSON would report a section as dirty forever over that alone.
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );

const sliceEqual = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);

const sectionEqual: Record<ProfileSectionKey, (a: Profile, b: Profile) => boolean> = {
  basics: (a, b) => a.name === b.name,
  origins: (a, b) => sliceEqual(a.targetOrigins, b.targetOrigins),
  fixed: (a, b) => sliceEqual(a.fixedHeaders, b.fixedHeaders),
  capture: (a, b) => sliceEqual(a.captureHeaders, b.captureHeaders),
  exclude: (a, b) => sliceEqual(a.excludedPaths, b.excludedPaths),
  cookies: (a, b) =>
    sliceEqual(a.fixedCookies, b.fixedCookies) &&
    sliceEqual(a.trackedCookies, b.trackedCookies) &&
    sliceEqual(a.migrationIssues, b.migrationIssues),
};

const sectionAssign: Record<ProfileSectionKey, (target: Profile, source: Profile) => void> = {
  basics: (target, source) => {
    target.name = source.name;
  },
  origins: (target, source) => {
    target.targetOrigins = clone(source.targetOrigins);
  },
  fixed: (target, source) => {
    target.fixedHeaders = clone(source.fixedHeaders);
  },
  capture: (target, source) => {
    target.captureHeaders = clone(source.captureHeaders);
  },
  exclude: (target, source) => {
    target.excludedPaths = clone(source.excludedPaths);
  },
  cookies: (target, source) => {
    target.fixedCookies = clone(source.fixedCookies);
    target.trackedCookies = clone(source.trackedCookies);
    target.migrationIssues = clone(source.migrationIssues);
  },
};

// Whether a single section of the active profile diverges from its saved baseline.
export const isProfileSectionDirty = (
  draft: Profile | undefined,
  saved: Profile | undefined,
  key: ProfileSectionKey,
): boolean => {
  if (!draft || !saved) return false;
  return !sectionEqual[key](draft, saved);
};

// Merge a single section of the draft profile into the saved config, leaving other
// sections (and other profiles) at their persisted values so each save stays independent.
export const applyProfileSection = (
  saved: AppConfig,
  draftProfile: Profile,
  key: ProfileSectionKey,
  now: number,
): AppConfig => ({
  ...saved,
  profiles: saved.profiles.map((profile) => {
    if (profile.id !== draftProfile.id) return profile;
    const next = clone(profile);
    sectionAssign[key](next, draftProfile);
    next.updatedAt = now;
    return next;
  }),
});

// The Save button and the eventual save use the same whole-config schema. This keeps
// inline validation from saying "blocked" while still offering an action that can only
// fail, and covers cross-row constraints such as duplicate header names as well.
export const isProfileSectionValid = (
  saved: AppConfig,
  draftProfile: Profile,
  key: ProfileSectionKey,
): boolean => {
  try {
    parseAppConfig(applyProfileSection(saved, draftProfile, key, Date.now()));
    return true;
  } catch {
    return false;
  }
};
