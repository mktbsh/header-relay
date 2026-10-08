import type { Profile } from "./types";

export type ToggleAllProfilesAction = "paused" | "restored" | "noop";

export type ToggleAllProfilesResult = {
  action: ToggleAllProfilesAction;
  profiles: Profile[];
  pausedProfileIds: string[] | null;
};

export const toggleAllProfiles = (
  profiles: readonly Profile[],
  pausedProfileIds: readonly string[] | null,
  now: number,
): ToggleAllProfilesResult => {
  const enabledIds = profiles.filter((profile) => profile.enabled).map((profile) => profile.id);
  if (enabledIds.length > 0) {
    const enabled = new Set(enabledIds);
    return {
      action: "paused",
      profiles: profiles.map((profile) =>
        enabled.has(profile.id) ? { ...profile, enabled: false, updatedAt: now } : profile,
      ),
      pausedProfileIds: enabledIds,
    };
  }

  const existingIds = new Set(profiles.map((profile) => profile.id));
  const restoreIds = (pausedProfileIds ?? []).filter((id) => existingIds.has(id));
  if (restoreIds.length === 0) {
    return { action: "noop", profiles: [...profiles], pausedProfileIds: null };
  }

  const restore = new Set(restoreIds);
  return {
    action: "restored",
    profiles: profiles.map((profile) =>
      restore.has(profile.id) ? { ...profile, enabled: true, updatedAt: now } : profile,
    ),
    pausedProfileIds: null,
  };
};
