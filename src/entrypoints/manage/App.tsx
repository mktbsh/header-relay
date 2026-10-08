import { Outlet, useLocation } from "@tanstack/solid-router";
import {
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  Show,
  useContext,
  type Accessor,
} from "solid-js";

import { browserPermissions } from "../../lib/adapters/browser-ports";
import {
  manageAnalyticsRouteFromHash,
  type PermissionRequestOutcome,
} from "../../lib/analytics/events";
import { parseAppConfig } from "../../lib/domain/config-schema";
import { parseConfigImport, serializeConfigForExport } from "../../lib/domain/config-transfer";
import { createProfile } from "../../lib/domain/default-profile";
import {
  copyProfile,
  insertProfileAfter,
  moveProfile,
  type ProfileMoveDirection,
} from "../../lib/domain/profile-operations";
import type {
  AppConfig,
  CapturedHeaderValue,
  Profile,
  SessionState,
  UiDensity,
} from "../../lib/domain/types";
import { createHeaderPlan, selectCapturedRows } from "../../lib/header-emulation/core";
import { t } from "../../lib/i18n";
import { extensionClient } from "../../lib/messaging/client";
import type { RuntimeStatus } from "../../lib/messaging/messages";
import {
  isOriginGranted,
  missingOriginPatterns,
  originToMatchPattern,
  orphanedPatterns,
} from "../../lib/permissions/host-permission";
import {
  addProfileDraft,
  applyProfileSection,
  createManageDraft,
  findProfile,
  isProfileSectionDirty,
  isProfileSectionValid,
  parseJsonDraft,
  PROFILE_SECTION_KEYS,
  removeProfileDraft,
  updateProfileDraft,
  type ManageDraft,
  type ProfileSectionKey,
} from "./editor-state";
import { profilePath, viewedProfileLocation } from "./navigation";
import { CreateProfileDialog } from "./sections/CreateProfileDialog";
import { ProfileSidebar } from "./sections/ProfileSidebar";
import { useAuditLog } from "./use-audit-log";
import { useUrlProbe } from "./use-url-probe";
import { shouldRefreshRuntimeForVisibility, validateProfileNameInput } from "./view-model";

const RUNTIME_REFRESH_INTERVAL_MS = 1500;
const NOTICE_DISMISS_MS = 4000;

export type OriginAccess = "granted" | "required" | "unsupported";

export type ManageRouteContext = {
  active: Accessor<Profile>;
  profiles: Accessor<Profile[]>;
  session: Accessor<SessionState | null>;
  runtime: Accessor<RuntimeStatus | undefined>;
  auditLog: ReturnType<typeof useAuditLog>;
  urlProbe: ReturnType<typeof useUrlProbe>;
  capturedRows: Accessor<CapturedHeaderValue[]>;
  attachHeaderNames: Accessor<string[]>;
  jsonText: Accessor<string>;
  profileNameDraft: Accessor<string>;
  profileNameError: Accessor<string>;
  canDeleteProfile: Accessor<boolean>;
  compact: Accessor<boolean>;
  densitySaving: Accessor<boolean>;
  setDensity: (density: UiDensity) => void;
  replaceProfile: (updater: (profile: Profile) => void) => void;
  updateProfileName: (value: string) => void;
  duplicateActiveProfile: () => void;
  deleteActiveProfile: () => void;
  originAccess: (origin: string) => OriginAccess;
  grantOrigin: (origin: string) => void;
  clearTrackedCookie: (cookieName: string) => void;
  clearAllTrackedCookies: () => void;
  clearSession: () => Promise<void>;
  clearLogs: () => Promise<void>;
  updateJsonText: (value: string) => void;
  applyJson: () => void;
  exportConfig: (includeSecrets: boolean) => void;
  importConfig: (file: File) => void;
  sectionDirty: (key: ProfileSectionKey) => boolean;
  profileSectionDirty: (profileId: string, key: ProfileSectionKey) => boolean;
  profileDirty: (profileId: string) => boolean;
  sectionSaving: (key: ProfileSectionKey) => boolean;
  sectionSaveBlocked: (key: ProfileSectionKey) => boolean;
  saveSection: (key: ProfileSectionKey) => void;
};

const ManageContext = createContext<ManageRouteContext>();

export function useManageRouteContext() {
  const context = useContext(ManageContext);
  if (!context) throw new Error("Manage route must be rendered inside the manage layout");
  return context;
}

const isAuditLogRoute = () => window.location.hash.replace(/^#/, "") === "/settings/audit-logs";

const trackManagePageView = () =>
  extensionClient.trackAnalyticsEvent({
    name: "page_view",
    params: {
      surface: "manage",
      route: manageAnalyticsRouteFromHash(window.location.hash),
    },
  });

export default function App() {
  const location = useLocation();
  const [config, setConfig] = createSignal<AppConfig>();
  const [savedConfig, setSavedConfig] = createSignal<AppConfig>();
  const [sessions, setSessions] = createSignal<Record<string, SessionState>>({});
  const [runtime, setRuntime] = createSignal<RuntimeStatus>();
  const [savingSection, setSavingSection] = createSignal<ProfileSectionKey | "">("");
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [jsonText, setJsonText] = createSignal("");
  const auditLog = useAuditLog();
  const urlProbe = useUrlProbe(config, sessions);
  const [profileNameDraft, setProfileNameDraft] = createSignal("");
  const [profileNameError, setProfileNameError] = createSignal("");
  const [densitySaving, setDensitySaving] = createSignal(false);
  const [createProfileOpen, setCreateProfileOpen] = createSignal(false);
  const [grantedPatterns, setGrantedPatterns] = createSignal<string[]>([]);
  let pendingProfileToggle: Promise<void> | undefined;

  const applyDraft = (draft: ManageDraft) => {
    setConfig(draft.config);
    setJsonText(draft.jsonText);
  };

  const currentDraft = (): ManageDraft | undefined => {
    const current = config();
    if (!current) return undefined;
    return { config: current, jsonText: jsonText(), dirty: false };
  };

  const profile = () =>
    findProfile(config(), viewedProfileLocation(location().pathname)?.profileId);
  const canDeleteProfile = () => (savedConfig()?.profiles.length ?? 0) > 1;
  const savedProfile = (profileId: string) =>
    savedConfig()?.profiles.find((item) => item.id === profileId);
  // The selected profile's own session; every enabled profile keeps its own.
  const session = (): SessionState | null => {
    const selected = profile();
    return selected ? (sessions()[selected.id] ?? null) : null;
  };

  const profileSectionDirty = (profileId: string, key: ProfileSectionKey) =>
    isProfileSectionDirty(findProfile(config(), profileId), savedProfile(profileId), key);
  const sectionDirty = (key: ProfileSectionKey) => {
    const active = profile();
    return active ? profileSectionDirty(active.id, key) : false;
  };
  const profileDirty = (profileId: string) =>
    PROFILE_SECTION_KEYS.some((key) => profileSectionDirty(profileId, key));
  const sectionSaving = (key: ProfileSectionKey) => savingSection() === key;
  const sectionSaveBlocked = (key: ProfileSectionKey) => {
    if (savingSection()) return true;
    if (key === "basics") return Boolean(profileNameError()) || !profileNameDraft().trim();
    const saved = savedConfig();
    const active = profile();
    return !saved || !active || !isProfileSectionValid(saved, active, key);
  };
  const anyDirty = () => (config()?.profiles ?? []).some((item) => profileDirty(item.id));
  const capturedRows = () => selectCapturedRows(session());
  const activeAttachHeaderNames = () => {
    const active = profile();
    if (!active?.enabled) return [];
    return createHeaderPlan(active, session()).attachHeaders.map((header) => header.name);
  };
  const refreshGranted = async () => {
    setGrantedPatterns(await browserPermissions.grantedOriginPatterns());
  };

  const refreshStatus = async () => {
    const status = await extensionClient.getStatus();
    if (!densitySaving()) {
      setConfig((current) => (current ? { ...current, uiDensity: status.uiDensity } : current));
      setSavedConfig((current) =>
        current ? { ...current, uiDensity: status.uiDensity } : current,
      );
    }
    setSessions(status.sessions);
    setRuntime(status.runtime);
    await refreshGranted();
  };

  const originAccess = (origin: string): OriginAccess => {
    if (originToMatchPattern(origin) === undefined) return "unsupported";
    return isOriginGranted(grantedPatterns(), origin) ? "granted" : "required";
  };

  // Called from the per-row Allow button, so the user gesture Chrome requires for
  // permissions.request() is present.
  const grantOrigin = async (origin: string) => {
    const pattern = originToMatchPattern(origin);
    if (!pattern) return;
    let outcome: PermissionRequestOutcome = "error";
    try {
      outcome = (await browserPermissions.requestOrigins([pattern])) ? "granted" : "denied";
    } catch (reason) {
      reportError(reason);
    }
    await extensionClient.trackAnalyticsEvent({
      name: "host_permission_requested",
      params: { surface: "manage", requested_origin_count: 1, outcome },
    });
    await refreshGranted();
  };

  // Batch-request whatever these profiles' enabled origins still lack: one dialog per
  // save/toggle instead of one per origin. Denial is not an error — the origin stays
  // saved and its row shows "Access required" (fail closed at rule sync).
  const requestAccessFor = async (profiles: Profile[]) => {
    const missing = missingOriginPatterns(profiles, grantedPatterns());
    if (missing.length === 0) return;
    let outcome: PermissionRequestOutcome = "error";
    try {
      outcome = (await browserPermissions.requestOrigins(missing)) ? "granted" : "denied";
    } catch (reason) {
      reportError(reason);
    }
    await extensionClient.trackAnalyticsEvent({
      name: "host_permission_requested",
      params: {
        surface: "manage",
        requested_origin_count: missing.length,
        outcome,
      },
    });
    await refreshGranted();
  };

  // Host grants outlive the origins that justified them, so offer (never force) a
  // revoke when no profile references a pattern anymore. Only patterns we hold
  // verbatim are offered: a legacy <all_urls> grant cannot be shrunk piecewise.
  const confirmRevokeOrphans = async (previous: AppConfig, next: AppConfig) => {
    const held = new Set(grantedPatterns());
    const orphaned = orphanedPatterns(previous, next).filter((pattern) => held.has(pattern));
    if (orphaned.length === 0) return;
    if (!window.confirm(t("revokeOrphanedConfirm", orphaned.join("\n")))) return;
    try {
      await browserPermissions.removeOrigins(orphaned);
    } catch (reason) {
      reportError(reason);
    }
    await refreshGranted();
  };

  const reportError = (reason: unknown) => {
    setError(reason instanceof Error ? reason.message : String(reason));
  };

  const refreshStatusSafely = async () => {
    try {
      await refreshStatus();
    } catch (reason) {
      reportError(reason);
    }
  };

  const refreshAuditLogsSafely = async () => {
    try {
      await auditLog.refresh();
    } catch (reason) {
      reportError(reason);
    }
  };

  const load = async () => {
    const [nextConfig, status] = await Promise.all([
      extensionClient.getConfig(),
      extensionClient.getStatus(),
    ]);
    setSavedConfig(nextConfig);
    applyDraft(createManageDraft(structuredClone(nextConfig)));
    setSessions(status.sessions);
    setRuntime(status.runtime);
    const nextViewedProfile =
      findProfile(nextConfig, viewedProfileLocation(location().pathname)?.profileId) ??
      nextConfig.profiles[0];
    setProfileNameDraft(nextViewedProfile?.name ?? "");
    setProfileNameError("");
    urlProbe.reset();
    if (isAuditLogRoute()) await auditLog.refresh();
  };

  const replaceProfile = (updater: (profile: Profile) => void) => {
    const draft = currentDraft();
    const active = profile();
    if (!draft || !active) return;
    applyDraft(updateProfileDraft(draft, active.id, Date.now(), updater));
    urlProbe.reset();
    setNotice("");
    setError("");
  };

  const updateProfileName = (value: string) => {
    setProfileNameDraft(value);
    const result = validateProfileNameInput(value, config()?.profiles ?? [], profile()?.id);
    if (!result.ok) {
      setProfileNameError(result.error);
      setNotice("");
      return;
    }
    setProfileNameError("");
    replaceProfile((item) => {
      item.name = result.value;
    });
  };

  const selectProfile = async (profileId: string) => {
    if (!findProfile(config(), profileId) || profile()?.id === profileId) return;
    setNotice("");
    setError("");
    try {
      await extensionClient.trackAnalyticsEvent({
        name: "profile_selected",
        params: { surface: "manage" },
      });
    } catch (reason) {
      reportError(reason);
    }
  };

  // enabled is runtime state, not a draft field: the toggle persists on the spot and
  // never waits for a section save.
  const toggleProfile = async (profileId: string, enabled: boolean) => {
    const withEnabled = (target: AppConfig): AppConfig => ({
      ...target,
      profiles: target.profiles.map((item) =>
        item.id === profileId ? { ...item, enabled } : item,
      ),
    });
    const draft = currentDraft();
    if (draft) applyDraft(createManageDraft(withEnabled(draft.config), true));
    setSavedConfig((current) => (current ? withEnabled(current) : current));
    setNotice("");
    setError("");
    try {
      // Enabling is the moment the profile's origins start mattering, and the toggle
      // click carries the user gesture the permission dialog needs.
      if (enabled) {
        const target = savedConfig()?.profiles.find((item) => item.id === profileId);
        if (target) await requestAccessFor([target]);
      }
      await extensionClient.toggleProfile(profileId, enabled);
      await extensionClient.trackAnalyticsEvent({
        name: "profile_toggled",
        params: { surface: "manage", enabled },
      });
      await refreshStatus();
    } catch (reason) {
      reportError(reason);
    }
  };

  const setProfileEnabled = (profileId: string, enabled: boolean) => {
    const request = toggleProfile(profileId, enabled);
    pendingProfileToggle = request;
    void request.finally(() => {
      if (pendingProfileToggle === request) pendingProfileToggle = undefined;
    });
  };

  const saveSection = async (key: ProfileSectionKey) => {
    const saved = savedConfig();
    const active = profile();
    if (!saved || !active || sectionSaveBlocked(key) || !sectionDirty(key)) return;
    setSavingSection(key);
    setError("");
    try {
      // Saving origins is the user gesture the permission dialog rides on. The save
      // itself never depends on the outcome: a denied origin stays configured and is
      // simply skipped by the rule sync until access is granted.
      if (key === "origins") await requestAccessFor([active]);
      const parsed = parseAppConfig(applyProfileSection(saved, active, key, Date.now()));
      await extensionClient.saveConfig(parsed);
      setSavedConfig(parsed);
      setNotice(t("manageSavedNotice"));
      await extensionClient.trackAnalyticsEvent({
        name: "profile_section_saved",
        params: { surface: "manage", section: key },
      });
      if (key === "origins") await confirmRevokeOrphans(saved, parsed);
    } catch (reason) {
      reportError(reason);
    } finally {
      setSavingSection("");
    }
  };

  // Adding a profile persists immediately on top of the saved baseline (not the whole draft),
  // keeping other sections' unsaved edits independent.
  const addProfile = async (name: string, enabled: boolean) => {
    const saved = savedConfig();
    const draft = currentDraft();
    if (!saved || !draft) return;
    const created = { ...createProfile(name), enabled };
    applyDraft(addProfileDraft(draft, created));
    // A new profile relays nothing until it has a Target Origin, so start there.
    window.location.hash = profilePath(created.id, "origins");
    setProfileNameDraft(created.name);
    setProfileNameError("");
    setNotice("");
    setError("");
    try {
      const parsed = parseAppConfig({
        ...saved,
        profiles: [...saved.profiles, created],
      });
      await extensionClient.saveConfig(parsed);
      setSavedConfig(parsed);
      await extensionClient.trackAnalyticsEvent({
        name: "profile_created",
        params: { surface: "manage" },
      });
    } catch (reason) {
      reportError(reason);
    }
  };

  const duplicateActiveProfile = async () => {
    const saved = savedConfig();
    const draft = currentDraft();
    const active = profile();
    const source = active && saved?.profiles.find((item) => item.id === active.id);
    if (!saved || !draft || !source) return;

    const copy = copyProfile(source, saved.profiles, Date.now());
    const nextSavedProfiles = insertProfileAfter(saved.profiles, source.id, copy);
    const nextDraftProfiles = insertProfileAfter(draft.config.profiles, source.id, copy);
    applyDraft(createManageDraft({ ...draft.config, profiles: nextDraftProfiles }, true));
    window.location.hash = profilePath(copy.id);
    setProfileNameDraft(copy.name);
    setProfileNameError("");
    setNotice("");
    setError("");

    try {
      const parsed = parseAppConfig({
        ...saved,
        profiles: nextSavedProfiles,
      });
      await extensionClient.saveConfig(parsed);
      setSavedConfig(parsed);
      setNotice(t("profileDuplicated"));
      await extensionClient.trackAnalyticsEvent({
        name: "profile_created",
        params: { surface: "manage" },
      });
    } catch (reason) {
      applyDraft(draft);
      reportError(reason);
    }
  };

  const moveProfileOrder = async (profileId: string, direction: ProfileMoveDirection) => {
    const saved = savedConfig();
    const draft = currentDraft();
    if (!saved || !draft) return;

    const nextSavedProfiles = moveProfile(saved.profiles, profileId, direction);
    if (nextSavedProfiles.every((item, index) => item.id === saved.profiles[index]?.id)) return;

    const nextDraftProfiles = moveProfile(draft.config.profiles, profileId, direction);
    applyDraft(createManageDraft({ ...draft.config, profiles: nextDraftProfiles }, true));
    setNotice("");
    setError("");

    try {
      const parsed = parseAppConfig({
        ...saved,
        profiles: nextSavedProfiles,
      });
      await extensionClient.saveConfig(parsed);
      setSavedConfig(parsed);
    } catch (reason) {
      applyDraft(draft);
      reportError(reason);
    }
  };

  // Deleting persists immediately on top of the saved baseline (like addProfile), then
  // repoints the selection so the page keeps a profile to edit. saveConfig drops the
  // removed profile's captured session for us.
  const deleteProfile = async (profileId: string) => {
    const saved = savedConfig();
    const draft = currentDraft();
    if (!saved || !draft || saved.profiles.length <= 1) return;
    const target = saved.profiles.find((item) => item.id === profileId);
    if (!target || !window.confirm(t("profileDeleteConfirm", target.name))) return;

    const remaining = saved.profiles.filter((item) => item.id !== profileId);
    const nextViewedId =
      (profile()?.id === profileId ? remaining[0]?.id : profile()?.id) ?? remaining[0]?.id;
    applyDraft(removeProfileDraft(draft, profileId));
    if (nextViewedId) window.location.hash = profilePath(nextViewedId);
    setNotice("");
    setError("");
    try {
      const parsed = parseAppConfig({
        ...saved,
        profiles: remaining,
      });
      await extensionClient.deleteProfile(profileId);
      setSavedConfig(parsed);
      await extensionClient.trackAnalyticsEvent({
        name: "profile_deleted",
        params: { surface: "manage" },
      });
      await refreshStatus();
      await confirmRevokeOrphans(saved, parsed);
    } catch (reason) {
      reportError(reason);
    }
  };

  const deleteActiveProfile = () => {
    const active = profile();
    if (active) void deleteProfile(active.id);
  };

  const isCompact = () => (config()?.uiDensity ?? "comfortable") === "compact";

  const setDensity = async (density: UiDensity) => {
    const previousConfig = config();
    const previousSaved = savedConfig();
    if (!previousConfig || !previousSaved || densitySaving()) return;

    setDensitySaving(true);
    setError("");
    setConfig({ ...previousConfig, uiDensity: density });
    setSavedConfig({ ...previousSaved, uiDensity: density });
    try {
      await extensionClient.setUiDensity(density);
      await extensionClient.trackAnalyticsEvent({
        name: "ui_density_changed",
        params: { surface: "manage", density },
      });
    } catch (reason) {
      setConfig(previousConfig);
      setSavedConfig(previousSaved);
      reportError(reason);
    } finally {
      setDensitySaving(false);
    }
  };

  // Tracked cookie value clears bypass the section-save queue entirely: they mutate
  // only the runtime session, not the persisted config, and land through the same
  // extension command a popup would use.
  const clearTrackedCookie = async (cookieName: string) => {
    const active = profile();
    if (!active) return;
    try {
      await extensionClient.clearTrackedCookie(active.id, cookieName);
      await extensionClient.trackAnalyticsEvent({
        name: "cookie_operation",
        params: {
          surface: "manage",
          action: "tracked_cleared_by_name",
          outcome: "success",
          target_count: 1,
        },
      });
      await refreshStatus();
    } catch (reason) {
      reportError(reason);
    }
  };

  const clearAllTrackedCookies = async () => {
    const active = profile();
    if (!active || !window.confirm(t("clearAllTrackedCookiesConfirm"))) return;
    try {
      await extensionClient.clearTrackedCookies(active.id);
      await extensionClient.trackAnalyticsEvent({
        name: "cookie_operation",
        params: {
          surface: "manage",
          action: "tracked_cleared_all",
          outcome: "success",
          target_count: Object.keys(session()?.trackedCookies ?? {}).length,
        },
      });
      await refreshStatus();
    } catch (reason) {
      reportError(reason);
    }
  };

  const clearSession = async () => {
    setError("");
    try {
      await extensionClient.clearSession(profile()?.id);
      await refreshStatus();
      setNotice(t("manageCapturedCleared"));
      await extensionClient.trackAnalyticsEvent({
        name: "session_cleared",
        params: { surface: "manage", scope: "profile" },
      });
    } catch (reason) {
      reportError(reason);
    }
  };

  const clearLogs = async () => {
    setError("");
    try {
      await auditLog.clear();
      setNotice(t("manageLogsCleared"));
      await extensionClient.trackAnalyticsEvent({
        name: "audit_logs_cleared",
        params: { surface: "manage" },
      });
    } catch (reason) {
      reportError(reason);
    }
  };

  // Advanced JSON edits the whole config, so applying it saves and re-applies everything at once.
  const applyJson = async () => {
    setError("");
    setNotice("");
    try {
      const draft = parseJsonDraft(jsonText());
      if (!window.confirm(t("configReplaceConfirm"))) return;
      const previous = savedConfig();
      await requestAccessFor(draft.config.profiles);
      await extensionClient.saveConfig(draft.config);
      await load();
      setNotice(t("manageSavedNotice"));
      await extensionClient.trackAnalyticsEvent({
        name: "advanced_config_applied",
        params: { surface: "manage" },
      });
      if (previous) await confirmRevokeOrphans(previous, draft.config);
    } catch (reason) {
      reportError(reason);
    }
  };

  const exportConfig = (includeSecrets: boolean) => {
    const source = savedConfig();
    if (!source) return;
    const blob = new Blob([serializeConfigForExport(source, includeSecrets)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `header-relay-config-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setError("");
    setNotice(t("configExported"));
  };

  const importConfig = async (file: File) => {
    setError("");
    setNotice("");
    try {
      const imported = parseConfigImport(await file.text());
      if (!window.confirm(t("configReplaceConfirm"))) return;
      const previous = savedConfig();
      await requestAccessFor(imported.profiles);
      await extensionClient.saveConfig(imported);
      await load();
      setNotice(t("configImported"));
      await extensionClient.trackAnalyticsEvent({
        name: "advanced_config_applied",
        params: { surface: "manage" },
      });
      if (previous) await confirmRevokeOrphans(previous, imported);
    } catch (reason) {
      reportError(reason);
    }
  };

  const reload = async () => {
    if (anyDirty() && !window.confirm(t("manageReloadConfirm"))) return;
    setNotice("");
    setError("");
    await pendingProfileToggle;
    await load();
  };

  // Success notices confirm the last action only, so they fade instead of lingering into
  // unrelated screens. Errors stay until dismissed or replaced.
  createEffect(() => {
    if (!notice()) return;
    const timer = window.setTimeout(() => setNotice(""), NOTICE_DISMISS_MS);
    onCleanup(() => window.clearTimeout(timer));
  });

  let lastProfileId: string | undefined;
  createEffect(() => {
    const active = profile();
    if (!active || active.id === lastProfileId) return;
    lastProfileId = active.id;
    setProfileNameDraft(active.name);
    setProfileNameError("");
    urlProbe.reset();
  });

  onMount(() => {
    void trackManagePageView();
    load().catch(reportError);

    const refreshWhenVisible = () => {
      if (!shouldRefreshRuntimeForVisibility(document.visibilityState)) return;
      if (isAuditLogRoute()) void refreshAuditLogsSafely();
      else void refreshStatusSafely();
    };
    const handleRouteChange = () => {
      setNotice("");
      void trackManagePageView();
      if (isAuditLogRoute()) void refreshAuditLogsSafely();
      else auditLog.resetMinLevel();
    };
    const protectUnsavedChanges = (event: BeforeUnloadEvent) => {
      if (!anyDirty()) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const interval = window.setInterval(refreshWhenVisible, RUNTIME_REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("hashchange", handleRouteChange);
    window.addEventListener("beforeunload", protectUnsavedChanges);

    onCleanup(() => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("hashchange", handleRouteChange);
      window.removeEventListener("beforeunload", protectUnsavedChanges);
    });
  });

  return (
    <div
      class={`hr-theme min-h-screen lg:grid lg:h-dvh lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-[64px_minmax(0,1fr)] lg:overflow-hidden ${
        isCompact() ? "hr-compact" : ""
      }`}
    >
      <header class="contents">
        <div
          class="hr-chrome flex min-w-0 items-center border-b px-5 py-2.5 lg:border-r"
          style={{ "border-color": "var(--ios-separator)" }}
        >
          <h1 class="hr-title truncate">Header Relay</h1>
        </div>

        <div
          class="hr-chrome flex min-w-0 flex-wrap items-center justify-end gap-2 border-b px-4 py-2.5"
          style={{ "border-color": "var(--ios-separator)" }}
        >
          <div
            class="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2"
            aria-live="polite"
          >
            <Show when={notice()}>
              <span class="hr-badge-green max-w-full truncate" role="status">
                {notice()}
              </span>
            </Show>
            <Show when={error()}>
              <div class="hr-alert flex max-w-full items-start gap-2 py-1.5" role="alert">
                <span class="min-w-0 break-words whitespace-pre-wrap">{error()}</span>
                <button
                  class="shrink-0 leading-none font-semibold"
                  aria-label={t("dismissMessage")}
                  onClick={() => setError("")}
                >
                  ×
                </button>
              </div>
            </Show>
          </div>
          <button class="hr-btn" onClick={() => void reload().catch(reportError)}>
            {t("manageReload")}
          </button>
        </div>
      </header>

      <Show
        when={config()}
        fallback={<div class="hr-secondary p-8 lg:col-span-2">{t("loading")}</div>}
      >
        {(loaded) => {
          const active = () => profile() ?? loaded().profiles[0]!;
          return (
            <ManageContext.Provider
              value={{
                active,
                profiles: () => config()?.profiles ?? [],
                session,
                runtime,
                auditLog,
                urlProbe,
                capturedRows,
                attachHeaderNames: activeAttachHeaderNames,
                jsonText,
                profileNameDraft,
                profileNameError,
                canDeleteProfile,
                compact: isCompact,
                densitySaving,
                setDensity: (density) => void setDensity(density),
                replaceProfile,
                updateProfileName,
                duplicateActiveProfile: () => void duplicateActiveProfile(),
                deleteActiveProfile,
                originAccess,
                grantOrigin: (origin) => void grantOrigin(origin),
                clearTrackedCookie: (name) => void clearTrackedCookie(name),
                clearAllTrackedCookies: () => void clearAllTrackedCookies(),
                clearSession,
                clearLogs,
                updateJsonText: setJsonText,
                applyJson: () => void applyJson(),
                exportConfig,
                importConfig: (file) => void importConfig(file),
                sectionDirty,
                profileSectionDirty,
                profileDirty,
                sectionSaving,
                sectionSaveBlocked,
                saveSection: (key) => void saveSection(key),
              }}
            >
              <ProfileSidebar
                profiles={() => config()?.profiles ?? []}
                selectedId={() => profile()?.id ?? ""}
                currentPathname={() => location().pathname}
                profileDirty={profileDirty}
                onSelectProfile={(profileId) => void selectProfile(profileId)}
                onToggleProfile={setProfileEnabled}
                onMoveProfile={(profileId, direction) =>
                  void moveProfileOrder(profileId, direction)
                }
                onAddProfile={() => setCreateProfileOpen(true)}
              />

              <main
                data-testid="manage-content"
                class="min-h-0 min-w-0 p-5 lg:overflow-auto lg:p-6"
              >
                <Outlet />
              </main>

              <Show when={createProfileOpen()}>
                <CreateProfileDialog
                  profiles={() => config()?.profiles ?? []}
                  onCreate={(name, enabled) => {
                    setCreateProfileOpen(false);
                    void addProfile(name, enabled);
                  }}
                  onClose={() => setCreateProfileOpen(false)}
                />
              </Show>
            </ManageContext.Provider>
          );
        }}
      </Show>
    </div>
  );
}
