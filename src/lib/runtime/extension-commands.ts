import { compileConfig, selectEnabledProfiles } from "../compiler/compile-config";
import { toggleAllProfiles, type ToggleAllProfilesAction } from "../domain/profile-toggle";
import type { AppConfig, Profile, UiDensity } from "../domain/types";
import type { RuntimeSession } from "../lifecycle/runtime-session";
import type { ExtensionCommandHandlers } from "../messaging/background-handlers";
import type { AuditPort, StorageItem } from "../ports";
import type { ConfigStore } from "../storage/config-store";
import type { SessionStore } from "../storage/session-store";

export type ExtensionCommandDependencies = {
  runtime: RuntimeSession;
  config: ConfigStore;
  session: SessionStore;
  audit: AuditPort;
  pausedProfileIds: StorageItem<string[] | null>;
  now?: () => number;
};

const profileFingerprint = (profile: Profile): string =>
  JSON.stringify([
    profile.targetOrigins,
    profile.fixedHeaders,
    profile.captureHeaders,
    profile.excludedPaths,
    // Cookie config also invalidates the tracked cookie values on any change
    // (add/remove/reorder/enable/edit/popup config); the same fingerprint rule keeps
    // saveConfig deciding which sessions to clear (spec FR-08, AC-33).
    profile.fixedCookies,
    profile.trackedCookies,
  ]);

// Captured values are tied to the settings that captured them, so a profile whose
// rules changed starts over. Untouched profiles keep their session: saving one
// profile must not drop another profile's captured token.
const profilesWithChangedRules = (previous: AppConfig, next: AppConfig): string[] => {
  const before = new Map(previous.profiles.map((profile) => [profile.id, profile]));
  const changed = next.profiles
    .filter((profile) => {
      const old = before.get(profile.id);
      return old ? profileFingerprint(old) !== profileFingerprint(profile) : false;
    })
    .map((profile) => profile.id);
  const removed = previous.profiles
    .filter((profile) => !next.profiles.some((item) => item.id === profile.id))
    .map((profile) => profile.id);
  return [...changed, ...removed];
};

export const createExtensionCommands = ({
  runtime,
  config,
  session,
  audit,
  pausedProfileIds,
  now = () => Date.now(),
}: ExtensionCommandDependencies): ExtensionCommandHandlers => ({
  async toggleAllProfiles(): Promise<ToggleAllProfilesAction> {
    const current = await config.get();
    const stored = await pausedProfileIds.getValue();
    const previousPaused = Array.isArray(stored)
      ? stored.filter((profileId): profileId is string => typeof profileId === "string")
      : null;
    const next = toggleAllProfiles(current.profiles, previousPaused, now());

    if (next.action === "noop") {
      if (previousPaused !== null) await pausedProfileIds.setValue(null);
      return next.action;
    }

    await pausedProfileIds.setValue(next.pausedProfileIds);
    try {
      await config.set({ ...current, profiles: next.profiles });
    } catch (reason) {
      await pausedProfileIds.setValue(previousPaused);
      throw reason;
    }

    if (next.action === "paused") {
      for (const profileId of next.pausedProfileIds ?? []) await session.clear(profileId);
    }
    await runtime.syncRules();
    return next.action;
  },

  async getStatus() {
    const current = await config.get();
    const sessions = await session.getAll();
    const compiled = compileConfig(selectEnabledProfiles(current.profiles), sessions);
    const syncStatus = runtime.getLastSyncStatus();

    return {
      uiDensity: current.uiDensity,
      profiles: current.profiles,
      sessions,
      runtime: {
        enabledProfileIds: compiled.matchedProfiles.map((profile) => profile.profileId),
        dnrRuleCount: new Set(Object.values(sessions).flatMap((item) => item.dnrRuleIds)).size,
        errors: compiled.errors,
        warnings: compiled.warnings,
        syncStatus: syncStatus.status,
        ...(syncStatus.error ? { syncError: syncStatus.error } : {}),
        ...(syncStatus.unremovedRuleIds && syncStatus.unremovedRuleIds.length > 0
          ? { unremovedRuleIds: syncStatus.unremovedRuleIds }
          : {}),
      },
    };
  },

  getConfig: () => config.get(),

  async saveConfig(nextConfig: AppConfig) {
    const previous = await config.get();
    await config.set(nextConfig);
    for (const profileId of profilesWithChangedRules(previous, nextConfig)) {
      await session.clear(profileId);
    }
    await runtime.syncRules();
  },

  // Removing a profile drops its rules and the captured values it collected. The last
  // profile stays: the config schema requires at least one, and a profile-less page has
  // nothing to edit.
  async deleteProfile(profileId: string) {
    const current = await config.get();
    const target = current.profiles.find((profile) => profile.id === profileId);
    if (!target) throw new Error("This profile no longer exists.");
    if (current.profiles.length <= 1) throw new Error("The last profile cannot be deleted.");

    const profiles = current.profiles.filter((profile) => profile.id !== profileId);
    await config.set({ ...current, profiles });
    await session.clear(profileId);
    // Not audited: deletion is a user operation, and the audit log records
    // diagnostics only (issue #56) — the profile name would otherwise persist
    // in IndexedDB after the user chose to remove it.
    await runtime.syncRules();
  },

  // Display density is presentation only: it changes no rule and clears no session, so it
  // never triggers a DNR sync.
  async setUiDensity(density: UiDensity) {
    const current = await config.get();
    if ((current.uiDensity ?? "comfortable") === density) return;
    await config.set({ ...current, uiDensity: density });
  },

  async toggleProfile(profileId: string, enabled: boolean) {
    const current = await config.get();
    const profiles = current.profiles.map((profile) =>
      profile.id === profileId ? { ...profile, enabled, updatedAt: Date.now() } : profile,
    );
    await config.set({ ...current, profiles });
    await pausedProfileIds.setValue(null);
    // Disabling stops the relay, so the captured values it collected go with it.
    if (!enabled) await session.clear(profileId);
    // Not audited: the toggle is a user operation whose result is the current config
    // state, and the audit log records diagnostics only (issue #56).
    await runtime.syncRules();
  },

  // Re-reads the stored config and patches one value by id, so a popup that has been
  // open across an unrelated save cannot write back the config snapshot it rendered.
  // Unlike saveConfig this keeps the session: a fixed header's value says nothing about
  // what the profile captures, so flipping it must not drop a captured token.
  async updateFixedHeaderValue(profileId: string, headerId: string, value: string) {
    const current = await config.get();
    const profile = current.profiles.find((item) => item.id === profileId);
    const header = profile?.fixedHeaders.find((item) => item.id === headerId);
    if (!profile || !header) throw new Error("This header no longer exists.");
    if (!profile.enabled || !header.enabled || !header.popup?.visible) {
      throw new Error("This header is no longer editable from the popup.");
    }

    // config.set validates through parseAppConfig, so an invalid patch throws here and
    // nothing is written.
    await config.set({
      ...current,
      profiles: current.profiles.map((item) =>
        item.id === profileId
          ? {
              ...item,
              fixedHeaders: item.fixedHeaders.map((entry) =>
                entry.id === headerId ? { ...entry, value } : entry,
              ),
              updatedAt: Date.now(),
            }
          : item,
      ),
    });
    // Not audited: a popup value edit is a user operation (visible as the current
    // config), and header values must never reach the persisted audit log anyway
    // (issues #56, #58).
    // Failures surface as SessionState.lastError, which the popup renders; the config
    // change is already persisted either way.
    await runtime.syncRules();
  },

  async toggleFixedHeader(profileId: string, headerId: string, enabled: boolean) {
    const current = await config.get();
    const profile = current.profiles.find((item) => item.id === profileId);
    const header = profile?.fixedHeaders.find((item) => item.id === headerId);
    if (!profile || !header) throw new Error("This header no longer exists.");
    if (!profile.enabled || !header.popup?.visible) {
      throw new Error("This header is no longer toggleable from the popup.");
    }

    await config.set({
      ...current,
      profiles: current.profiles.map((item) =>
        item.id === profileId
          ? {
              ...item,
              fixedHeaders: item.fixedHeaders.map((entry) =>
                entry.id === headerId ? { ...entry, enabled } : entry,
              ),
              updatedAt: Date.now(),
            }
          : item,
      ),
    });
    // Enabling or disabling a fixed header changes only the request rules. Captured
    // response values remain valid for the profile and must not be cleared.
    await runtime.syncRules();
  },

  // Popup-driven fixed cookie value update. Only cookies with popup.visible on an
  // enabled profile can be edited from the popup (spec FR-16, AC-15). Editing a
  // fixed cookie invalidates every tracked cookie of the same profile because the
  // effective Cookie header depends on both sides.
  async updateFixedCookieValue(profileId: string, cookieId: string, value: string) {
    const current = await config.get();
    const profile = current.profiles.find((item) => item.id === profileId);
    const cookie = profile?.fixedCookies.find((item) => item.id === cookieId);
    if (!profile || !cookie) throw new Error("This cookie no longer exists.");
    if (!profile.enabled || !cookie.enabled || !cookie.popup?.visible) {
      throw new Error("This cookie is no longer editable from the popup.");
    }
    await config.set({
      ...current,
      profiles: current.profiles.map((item) =>
        item.id === profileId
          ? {
              ...item,
              fixedCookies: item.fixedCookies.map((entry) =>
                entry.id === cookieId ? { ...entry, value } : entry,
              ),
              updatedAt: Date.now(),
            }
          : item,
      ),
    });
    // Fixed cookie change invalidates tracked values on the same profile (FR-08).
    await session.clear(profileId);
    await runtime.syncRules();
  },

  // Individual tracked cookie value clear. Leaves the tracked cookie NAME configured
  // (still enabled to receive future Set-Cookie), just wipes the current value.
  clearTrackedCookie: (profileId: string, cookieName: string) =>
    runtime.clearTrackedCookies(profileId, cookieName),

  // All tracked cookie values for one profile. Fixed cookies and tracked cookie
  // NAMES stay; only the captured values are wiped (spec AC-36).
  clearTrackedCookies: (profileId: string) => runtime.clearTrackedCookies(profileId),

  clearSession: (profileId?: string) => runtime.clearSession(profileId),
  getAuditLogs: (limit = 200, minLevel = "debug") => audit.recent({ limit, minLevel }),
  clearAuditLogs: () => audit.clear(),
});
