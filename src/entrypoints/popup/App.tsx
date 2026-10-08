import { createMemo, createSignal, For, onMount, Show } from "solid-js";

import { Toggle } from "../../components/Toggle";
import { browserPermissions } from "../../lib/adapters/browser-ports";
import { describeCompileIssue, profileNameLookup } from "../../lib/compiler/compile-issue-text";
import type { Profile } from "../../lib/domain/types";
import { selectCapturedRows } from "../../lib/header-emulation/core";
import { t } from "../../lib/i18n";
import { httpOriginOf } from "../../lib/matching/route-condition";
import { extensionClient } from "../../lib/messaging/client";
import type { StatusResponse } from "../../lib/messaging/messages";
import { originsMissingAccess } from "../../lib/permissions/host-permission";
import { addOriginPath } from "../manage/navigation";
import {
  createPopupSelectOptions,
  createSessionStatusView,
  formatRelativeTime,
  type PopupCookieGroup,
  type PopupFixedCookieRow,
  type PopupHeaderRow,
  type PopupTrackedCookieRow,
  resolveSessionPhase,
  selectPopupActiveProfiles,
  selectPopupCookieGroups,
  selectPopupHeaderGroups,
  selectPopupProfiles,
} from "./view-model";

export default function App() {
  const [status, setStatus] = createSignal<StatusResponse>();
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const [busy, setBusy] = createSignal(false);
  const [now, setNow] = createSignal(Date.now());

  const [tabUrl, setTabUrl] = createSignal<string>();
  const [missingAccessOrigins, setMissingAccessOrigins] = createSignal<string[]>([]);

  const load = async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    setTabUrl(tab?.url);
    const nextStatus = await extensionClient.getStatus();
    setStatus(nextStatus);
    // Surface enabled origins the user has not granted host access to; the fix
    // (permissions.request) needs a gesture on the manage page, so this is a pointer.
    const granted = await browserPermissions.grantedOriginPatterns();
    setMissingAccessOrigins(
      originsMissingAccess(selectPopupActiveProfiles(nextStatus.profiles, tab?.url), granted),
    );
    setNow(Date.now());
  };

  const run = async (action?: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action?.();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const clearSession = () =>
    run(async () => {
      await extensionClient.clearSession();
      await extensionClient.trackAnalyticsEvent({
        name: "session_cleared",
        params: { surface: "popup", scope: "all" },
      });
    });

  const isCompact = () => (status()?.uiDensity ?? "comfortable") === "compact";

  const toggleProfile = (profileId: string, enabled: boolean) =>
    run(async () => {
      await extensionClient.toggleProfile(profileId, enabled);
      await extensionClient.trackAnalyticsEvent({
        name: "profile_toggled",
        params: { surface: "popup", enabled },
      });
    });

  const updateHeaderValue = (profileId: string, headerId: string, value: string) =>
    run(async () => {
      await extensionClient.updateFixedHeaderValue(profileId, headerId, value);
      await extensionClient.trackAnalyticsEvent({
        name: "fixed_header_value_updated",
        params: { surface: "popup" },
      });
    });

  const toggleFixedHeader = (profileId: string, headerId: string, enabled: boolean) =>
    run(async () => {
      await extensionClient.toggleFixedHeader(profileId, headerId, enabled);
    });

  const updateCookieValue = (profileId: string, cookieId: string, value: string) =>
    run(async () => {
      await extensionClient.updateFixedCookieValue(profileId, cookieId, value);
      await extensionClient.trackAnalyticsEvent({
        name: "cookie_operation",
        params: {
          surface: "popup",
          action: "fixed_updated",
          outcome: "success",
          target_count: 1,
        },
      });
    });

  const clearTrackedCookieOne = (profileId: string, cookieName: string) =>
    run(async () => {
      await extensionClient.clearTrackedCookie(profileId, cookieName);
      await extensionClient.trackAnalyticsEvent({
        name: "cookie_operation",
        params: {
          surface: "popup",
          action: "tracked_cleared_by_name",
          outcome: "success",
          target_count: 1,
        },
      });
    });

  const clearAllTrackedCookiesFor = (profileId: string, targetCount: number) =>
    run(async () => {
      await extensionClient.clearTrackedCookies(profileId);
      await extensionClient.trackAnalyticsEvent({
        name: "cookie_operation",
        params: {
          surface: "popup",
          action: "tracked_cleared_all",
          outcome: "success",
          target_count: targetCount,
        },
      });
    });

  onMount(() => {
    void extensionClient.trackAnalyticsEvent({
      name: "page_view",
      params: { surface: "popup" },
    });
    void run().finally(() => setLoading(false));
  });

  const profiles = () => status()?.profiles ?? [];
  const matchingProfiles = createMemo(() => selectPopupProfiles(profiles(), tabUrl()));
  const activeMatchingProfiles = createMemo(() => selectPopupActiveProfiles(profiles(), tabUrl()));
  const runtime = () => status()?.runtime;
  const sessionOf = (profileId: string) => status()?.sessions[profileId] ?? null;

  const profileStatus = (profileId: string, enabled: boolean) =>
    createSessionStatusView(resolveSessionPhase(enabled, sessionOf(profileId)?.phase));

  // The popup summarizes only the enabled Profiles that apply to the current tab.
  const fixedHeaders = () =>
    activeMatchingProfiles().flatMap((profile) =>
      profile.fixedHeaders
        .filter((header) => header.enabled)
        .map((header) => ({ ...header, profileName: profile.name })),
    );

  const capturedHeaders = () =>
    activeMatchingProfiles().flatMap((profile) =>
      selectCapturedRows(sessionOf(profile.id)).map((header) => ({
        ...header,
        profileName: profile.name,
      })),
    );

  const sessionErrors = () =>
    activeMatchingProfiles().flatMap((profile) => {
      const lastError = sessionOf(profile.id)?.lastError;
      return lastError ? [{ profileName: profile.name, lastError }] : [];
    });

  // Only headers the current tab actually receives, grouped by the Profile that owns
  // them; these rows can edit values and toggle published fixed headers.
  const editableGroups = () =>
    selectPopupHeaderGroups(profiles(), status()?.sessions ?? {}, tabUrl());

  const cookieGroups = () =>
    selectPopupCookieGroups(profiles(), status()?.sessions ?? {}, tabUrl());

  const headerDotClass = () => {
    if (activeMatchingProfiles().length === 0) return "hr-dot-gray";
    return capturedHeaders().length > 0 ? "hr-dot-green" : "hr-dot-orange";
  };

  const manageUrl = (path: string) => browser.runtime.getURL(`/manage.html#${path}`);
  const openPage = (path: string) => browser.tabs.create({ url: manageUrl(path) });

  return (
    <main class={`hr-theme popup-root w-120 ${isCompact() ? "hr-compact" : ""}`}>
      <header class="hr-chrome sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-2">
        <div class="flex min-w-0 items-center gap-2.5">
          <span class={`h-2 w-2 shrink-0 rounded-full ${headerDotClass()}`} aria-hidden="true" />
          <div class="min-w-0">
            <h1 class="hr-title truncate">Header Relay</h1>
            <p class="hr-footnote truncate">
              {t("popupEnabledProfiles")}: {activeMatchingProfiles().length} /{" "}
              {matchingProfiles().length}
            </p>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <button
            class="hr-btn"
            aria-label={t("popupRefreshStatus")}
            title={t("popupRefreshStatus")}
            disabled={busy()}
            onClick={() => void run()}
          >
            ↻
          </button>
          <button class="hr-btn" onClick={() => void openPage("/settings")}>
            {t("popupSettings")}
          </button>
        </div>
      </header>

      <div class="px-4 pt-3 pb-2">
        <Show when={error()}>
          <div class="hr-alert mb-4 break-all" role="alert">
            {error()}
          </div>
        </Show>

        <Show when={!loading()} fallback={<LoadingSkeleton />}>
          <Show
            when={profiles().length > 0}
            fallback={<EmptyState onOpenSettings={() => void openPage("/settings")} />}
          >
            <Show
              when={matchingProfiles().length > 0}
              fallback={
                <NoMatchingProfiles
                  origin={httpOriginOf(tabUrl())}
                  profiles={profiles()}
                  addOriginUrl={(profileId, origin) => manageUrl(addOriginPath(profileId, origin))}
                />
              }
            >
              <div class="space-y-4">
                <Show when={missingAccessOrigins().length > 0}>
                  <div class="hr-alert break-all" role="alert">
                    {t("popupAccessRequired")} {missingAccessOrigins().join(", ")}
                  </div>
                </Show>
                <For each={runtime()?.errors ?? []}>
                  {(compileError) => (
                    <div class="hr-alert break-all" role="alert">
                      {describeCompileIssue(compileError, profileNameLookup(profiles()))}
                    </div>
                  )}
                </For>
                <Show when={runtime()?.syncStatus === "stale-failed"}>
                  <div class="hr-alert break-all" role="alert">
                    {t("runtimeStaleFailedRules")}
                  </div>
                </Show>
                <Show when={runtime()?.syncStatus === "stale-ok"}>
                  <div class="hr-alert break-all" role="status">
                    {t("runtimeStaleRules")}
                  </div>
                </Show>

                <section>
                  <h2 class="hr-section-label flex items-baseline justify-between gap-2">
                    <span>{t("popupProfiles")}</span>
                    <span>{matchingProfiles().length}</span>
                  </h2>
                  <div class="hr-card hr-list">
                    <For each={matchingProfiles()}>
                      {(profile) => (
                        <div class="hr-row min-w-0 gap-2">
                          <a
                            class="hr-link hr-row-title min-w-0 flex-1 truncate font-medium"
                            href={manageUrl(`/profiles/${encodeURIComponent(profile.id)}`)}
                            target="_blank"
                            rel="noreferrer"
                            data-testid={`popup-profile-${profile.id}`}
                            onClick={() =>
                              void extensionClient.trackAnalyticsEvent({
                                name: "profile_selected",
                                params: { surface: "popup" },
                              })
                            }
                          >
                            {profile.name}
                          </a>
                          <span class={profileStatus(profile.id, profile.enabled).badgeClass}>
                            {profileStatus(profile.id, profile.enabled).label}
                          </span>
                          <Toggle
                            checked={profile.enabled}
                            disabled={busy()}
                            label={`${t("popupToggleProfile")}: ${profile.name}`}
                            onChange={(checked) => void toggleProfile(profile.id, checked)}
                          />
                        </div>
                      )}
                    </For>
                  </div>
                  <For each={sessionErrors()}>
                    {(item) => (
                      <p class="hr-alert mt-2 break-all">
                        {t("dnrSyncError")} ({item.profileName}): {item.lastError}
                      </p>
                    )}
                  </For>
                </section>

                <section>
                  <h2 class="hr-section-label flex items-baseline justify-between gap-2">
                    <span>{t("popupThisPage")}</span>
                    <span class="hr-mono hr-secondary min-w-0 truncate text-[11px] font-normal normal-case">
                      {tabUrl() ?? "-"}
                    </span>
                  </h2>
                  <Show
                    when={editableGroups().length > 0}
                    fallback={
                      <div class="hr-card">
                        <div class="hr-row justify-center">
                          <span class="hr-footnote">{t("popupNoEditableHeaders")}</span>
                        </div>
                      </div>
                    }
                  >
                    <div class="space-y-2">
                      <For each={editableGroups()}>
                        {(group) => (
                          <div class="hr-card">
                            <div class="hr-row">
                              <span class="hr-row-title font-medium">{group.profileName}</span>
                            </div>
                            <div class="space-y-2 px-3 pb-3">
                              <For each={group.headers}>
                                {(row) => (
                                  <EditableHeader
                                    row={row}
                                    disabled={busy()}
                                    onChange={(value) =>
                                      void updateHeaderValue(row.profileId, row.header.id, value)
                                    }
                                    onToggle={(enabled) =>
                                      void toggleFixedHeader(row.profileId, row.header.id, enabled)
                                    }
                                  />
                                )}
                              </For>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </section>

                <section>
                  <h2 class="hr-section-label flex items-baseline justify-between gap-2">
                    <span>{t("popupCookiesTitle")}</span>
                    <span>{cookieGroups().length}</span>
                  </h2>
                  <Show
                    when={cookieGroups().length > 0}
                    fallback={
                      <div class="hr-card">
                        <div class="hr-row justify-center">
                          <span class="hr-footnote">{t("popupNoCookies")}</span>
                        </div>
                      </div>
                    }
                  >
                    <div class="space-y-2">
                      <For each={cookieGroups()}>
                        {(group) => (
                          <CookieGroupCard
                            group={group}
                            disabled={busy()}
                            onUpdateFixed={(cookieId, value) =>
                              void updateCookieValue(group.profileId, cookieId, value)
                            }
                            onClearOne={(name) => void clearTrackedCookieOne(group.profileId, name)}
                            onClearAll={() =>
                              void clearAllTrackedCookiesFor(
                                group.profileId,
                                group.trackedCookies.length,
                              )
                            }
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                </section>

                <section>
                  <h2 class="hr-section-label flex items-baseline justify-between gap-2">
                    <span>{t("popupFixedHeaders")}</span>
                    <span>{fixedHeaders().length}</span>
                  </h2>
                  <div class="hr-card hr-list">
                    <Show
                      when={fixedHeaders().length > 0}
                      fallback={
                        <div class="hr-row justify-center">
                          <span class="hr-footnote">
                            {activeMatchingProfiles().length > 0
                              ? t("popupNoFixedHeaders")
                              : t("popupAllProfilesDisabled")}
                          </span>
                        </div>
                      }
                    >
                      <For each={fixedHeaders()}>
                        {(header) => (
                          <div class="hr-row min-w-0">
                            <span class="hr-mono max-w-[45%] shrink-0 truncate text-[13px] font-semibold">
                              {header.name}
                            </span>
                            <span
                              class="hr-mono hr-secondary min-w-0 truncate text-xs"
                              title={header.value}
                            >
                              {header.value}
                            </span>
                          </div>
                        )}
                      </For>
                    </Show>
                  </div>
                </section>

                <section>
                  <h2 class="hr-section-label flex items-baseline justify-between gap-2">
                    <span>{t("popupCapturedHeaders")}</span>
                    <span>{capturedHeaders().length}</span>
                  </h2>
                  <div class="hr-card hr-list">
                    <Show
                      when={capturedHeaders().length > 0}
                      fallback={
                        <div class="hr-row justify-center">
                          <span class="hr-footnote">
                            {activeMatchingProfiles().length > 0
                              ? t("popupNoCapturedValues")
                              : t("popupEnableProfileHint")}
                          </span>
                        </div>
                      }
                    >
                      <For each={capturedHeaders()}>
                        {(header) => (
                          <div class="hr-row min-w-0 flex-col items-stretch gap-0.5">
                            <div class="flex min-w-0 items-baseline justify-between gap-2">
                              <span class="hr-mono min-w-0 truncate text-[13px] font-semibold">
                                {header.name}
                              </span>
                              <span class="hr-footnote shrink-0">
                                {t("popupCapturedBy", header.profileName)} ·{" "}
                                {formatRelativeTime(header.capturedAt, now())}
                              </span>
                            </div>
                            <span
                              class="hr-mono hr-secondary min-w-0 truncate text-xs"
                              title={header.value}
                            >
                              {header.value}
                            </span>
                          </div>
                        )}
                      </For>
                      <button
                        class="hr-row-action hr-row-action-destructive"
                        disabled={busy()}
                        onClick={() => void clearSession()}
                      >
                        {t("popupClearCapturedValues")}
                      </button>
                    </Show>
                  </div>
                </section>
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </main>
  );
}

function EditableHeader(props: {
  row: PopupHeaderRow;
  disabled: boolean;
  onChange: (value: string) => void;
  onToggle: (enabled: boolean) => void;
}) {
  // A conflicting header has no deterministic value in the compiled ruleset, so there is
  // nothing meaningful to set here until the user resolves it in Settings.
  const locked = () =>
    props.disabled || !props.row.header.enabled || Boolean(props.row.conflictMessage);

  return (
    <div>
      <div class="flex items-center justify-between gap-2">
        <label class="hr-footnote hr-mono min-w-0 truncate" for={props.row.header.id}>
          {props.row.header.name}
        </label>
        <Toggle
          checked={props.row.header.enabled}
          disabled={props.disabled}
          label={t("popupToggleHeader") + ": " + props.row.header.name}
          onChange={props.onToggle}
        />
      </div>
      <Show
        when={props.row.header.popup?.input === "select"}
        fallback={
          <input
            id={props.row.header.id}
            class="hr-input mt-1 w-full"
            value={props.row.header.value}
            disabled={locked()}
            onChange={(e) => props.onChange(e.currentTarget.value)}
          />
        }
      >
        <select
          id={props.row.header.id}
          class="hr-select mt-1"
          value={props.row.header.value}
          disabled={locked()}
          onChange={(e) => props.onChange(e.currentTarget.value)}
        >
          <For each={createPopupSelectOptions(props.row.header)}>
            {(option) => <option value={option.value}>{option.label}</option>}
          </For>
        </select>
      </Show>
      <Show when={props.row.conflictMessage}>
        {(message) => (
          <p class="hr-alert mt-1 break-all" role="alert">
            {message()}
          </p>
        )}
      </Show>
    </div>
  );
}

function CookieGroupCard(props: {
  group: PopupCookieGroup;
  disabled: boolean;
  onUpdateFixed: (cookieId: string, value: string) => void;
  onClearOne: (cookieName: string) => void;
  onClearAll: () => void;
}) {
  return (
    <div class="hr-card">
      <div class="hr-row">
        <span class="hr-row-title font-medium">{props.group.profileName}</span>
        <Show when={props.group.hasAnyTrackedValue}>
          <button class="hr-btn ml-auto" disabled={props.disabled} onClick={props.onClearAll}>
            {t("popupCookieClearAll")}
          </button>
        </Show>
      </div>
      <div class="space-y-2 px-3 pb-3">
        <For each={props.group.fixedCookies}>
          {(row) => (
            <PopupFixedCookieView
              row={row}
              disabled={props.disabled}
              onChange={(value) => props.onUpdateFixed(row.cookie.id, value)}
            />
          )}
        </For>
        <For each={props.group.trackedCookies}>
          {(row) => (
            <PopupTrackedCookieView
              row={row}
              disabled={props.disabled}
              onClear={() => props.onClearOne(row.cookie.name)}
            />
          )}
        </For>
      </div>
    </div>
  );
}

function PopupFixedCookieView(props: {
  row: PopupFixedCookieRow;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const locked = () => props.disabled || !props.row.editable;
  return (
    <div>
      <label class="hr-footnote hr-mono block truncate" for={props.row.cookie.id}>
        {props.row.cookie.name}
        <span class="hr-secondary ml-2 text-[10px]">{t("popupCookieFixedLabel")}</span>
      </label>
      <input
        id={props.row.cookie.id}
        class="hr-input mt-1 w-full"
        value={props.row.cookie.value}
        disabled={locked()}
        onChange={(e) => props.onChange(e.currentTarget.value)}
      />
    </div>
  );
}

function PopupTrackedCookieView(props: {
  row: PopupTrackedCookieRow;
  disabled: boolean;
  onClear: () => void;
}) {
  return (
    <div class="flex items-center gap-2">
      <div class="min-w-0 flex-1">
        <div class="hr-footnote hr-mono truncate">
          {props.row.cookie.name}
          <span class="hr-secondary ml-2 text-[10px]">{t("popupCookieTrackedLabel")}</span>
        </div>
        <code class="hr-mono block truncate text-xs">{props.row.value}</code>
      </div>
      <button class="hr-btn shrink-0" disabled={props.disabled} onClick={props.onClear}>
        {t("popupCookieClearOne")}
      </button>
    </div>
  );
}

function EmptyState(props: { onOpenSettings: () => void }) {
  return (
    <div class="hr-card px-6 py-6 text-center">
      <div class="text-[15px] font-semibold">{t("popupNoProfiles")}</div>
      <p class="hr-footnote mt-1">{t("popupCreateProfileHint")}</p>
      <button class="hr-btn hr-btn-filled mt-4" onClick={() => props.onOpenSettings()}>
        {t("popupOpenSettings")}
      </button>
    </div>
  );
}

function NoMatchingProfiles(props: {
  origin: string | undefined;
  profiles: Profile[];
  addOriginUrl: (profileId: string, origin: string) => string;
}) {
  return (
    <div class="space-y-3">
      <div class="hr-card px-6 py-6 text-center">
        <div class="text-[15px] font-semibold">{t("popupNoMatchTitle")}</div>
        <p class="hr-footnote mt-1">
          {props.origin ? t("popupNoMatchHint") : t("popupUnsupportedPage")}
        </p>
        <Show when={props.origin}>
          {(origin) => <p class="hr-mono hr-secondary mt-2 truncate text-xs">{origin()}</p>}
        </Show>
      </div>
      <Show when={props.origin}>
        {(origin) => (
          <div class="hr-card hr-list">
            <For each={props.profiles}>
              {(profile) => (
                <div class="hr-row min-w-0 gap-2">
                  <span class="hr-row-title min-w-0 flex-1 truncate font-medium">
                    {profile.name}
                  </span>
                  <a
                    class="hr-btn shrink-0"
                    href={props.addOriginUrl(profile.id, origin())}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${t("popupAddOrigin")}: ${profile.name}`}
                  >
                    {t("popupAddOrigin")}
                  </a>
                </div>
              )}
            </For>
          </div>
        )}
      </Show>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div class="animate-pulse space-y-4" aria-hidden="true">
      <div class="hr-card h-[72px]" />
      <div class="hr-card h-18" />
      <div class="hr-card h-18" />
    </div>
  );
}
