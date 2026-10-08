import { compileConfig, probeUrl, selectEnabledProfiles } from "../../lib/compiler/compile-config";
import type {
  AuthPhase,
  FixedCookie,
  FixedHeader,
  FixedHeaderValueOption,
  Profile,
  SessionState,
  TrackedCookie,
} from "../../lib/domain/types";
import { normalizeHeaderName } from "../../lib/header-emulation/core";
import { t } from "../../lib/i18n";
import { matchesTargetRoute } from "../../lib/matching/route-condition";

export type SessionStatusView = {
  phase: AuthPhase;
  label: string;
  badgeClass: string;
  dotClass: string;
};

export const resolveSessionPhase = (
  profileEnabled: boolean,
  sessionPhase: AuthPhase | undefined,
): AuthPhase => sessionPhase ?? (profileEnabled ? "unauthenticated" : "disabled");

export const createSessionStatusView = (phase: AuthPhase): SessionStatusView => {
  if (phase === "authenticated") {
    return {
      phase,
      label: t("statusCaptured"),
      badgeClass: "hr-badge hr-badge-green",
      dotClass: "hr-dot-green",
    };
  }
  if (phase === "unauthenticated") {
    return {
      phase,
      label: t("statusWaiting"),
      badgeClass: "hr-badge hr-badge-orange",
      dotClass: "hr-dot-orange",
    };
  }
  return { phase, label: t("disabled"), badgeClass: "hr-badge", dotClass: "hr-dot-gray" };
};

export type PopupHeaderRow = {
  profileId: string;
  header: FixedHeader;
  conflictMessage?: string;
};

export type PopupHeaderGroup = {
  profileId: string;
  profileName: string;
  headers: PopupHeaderRow[];
};

export const selectPopupProfiles = (profiles: Profile[], url: string | undefined): Profile[] => {
  if (!url) return [];
  return profiles.filter((profile) => matchesTargetRoute(profile, url));
};

export const selectPopupActiveProfiles = (
  profiles: Profile[],
  url: string | undefined,
): Profile[] => selectEnabledProfiles(selectPopupProfiles(profiles, url));

// What the popup may edit or toggle for the current tab. Matching, exclusion and
// conflicts all come from the compiler's probe, so the popup shows exactly what the
// DNR ruleset does rather than a second opinion about it.
export const selectPopupHeaderGroups = (
  profiles: Profile[],
  sessions: Record<string, SessionState>,
  url: string | undefined,
): PopupHeaderGroup[] => {
  if (!url) return [];
  const probe = probeUrl(compileConfig(selectEnabledProfiles(profiles), sessions), url);
  const groups = new Map<string, PopupHeaderGroup>();

  for (const match of probe.matches) {
    if (match.excluded || groups.has(match.profileId)) continue;
    const profile = profiles.find((item) => item.id === match.profileId);
    if (!profile) continue;

    const headers = profile.fixedHeaders
      .filter((header) => header.popup?.visible)
      .map((header): PopupHeaderRow => {
        const conflict = probe.errors.find(
          (error) =>
            error.code === "header-conflict" &&
            error.origin === match.origin &&
            error.headerName === normalizeHeaderName(header.name) &&
            error.profileIds.includes(profile.id),
        );
        return { profileId: profile.id, header, conflictMessage: conflict?.message };
      });

    if (headers.length > 0) {
      groups.set(profile.id, { profileId: profile.id, profileName: profile.name, headers });
    }
  }

  return [...groups.values()];
};

// A value outside the configured options is a settings mismatch, not a dead end: it is
// shown as an extra option so the header stays readable and can be moved back onto a
// valid value.
export const createPopupSelectOptions = (header: FixedHeader): FixedHeaderValueOption[] => {
  const options = header.popup?.options ?? [];
  if (options.some((option) => option.value === header.value)) return options;
  return [{ label: t("popupCustomValue", header.value), value: header.value }, ...options];
};

// Cookie rows for the popup. Fixed cookies always show; tracked cookies only show
// if a value has been captured. Editable is opt-in per fixed cookie (popup.visible).
// Excluded matches contribute nothing (the Cookie header wouldn't be sent), matching
// the general-header behaviour above.
export type PopupFixedCookieRow = {
  profileId: string;
  cookie: FixedCookie;
  editable: boolean;
};

export type PopupTrackedCookieRow = {
  profileId: string;
  cookie: TrackedCookie;
  value: string;
  updatedAt: number;
};

export type PopupCookieGroup = {
  profileId: string;
  profileName: string;
  fixedCookies: PopupFixedCookieRow[];
  trackedCookies: PopupTrackedCookieRow[];
  hasAnyTrackedValue: boolean;
};

export const selectPopupCookieGroups = (
  profiles: Profile[],
  sessions: Record<string, SessionState>,
  url: string | undefined,
): PopupCookieGroup[] => {
  if (!url) return [];
  const probe = probeUrl(compileConfig(selectEnabledProfiles(profiles), sessions), url);
  const groups = new Map<string, PopupCookieGroup>();

  for (const match of probe.cookieMatches) {
    if (match.excluded || groups.has(match.profileId)) continue;
    const profile = profiles.find((item) => item.id === match.profileId);
    if (!profile) continue;
    const session = sessions[profile.id];
    const trackedValues = session?.trackedCookies ?? {};

    const fixedRows = profile.fixedCookies
      .filter((cookie) => cookie.enabled)
      .map(
        (cookie): PopupFixedCookieRow => ({
          profileId: profile.id,
          cookie,
          editable: profile.enabled && Boolean(cookie.popup?.visible),
        }),
      );

    const trackedRows = profile.trackedCookies
      .filter((cookie) => cookie.enabled)
      .flatMap((cookie): PopupTrackedCookieRow[] => {
        const captured = trackedValues[cookie.name];
        if (!captured) return [];
        return [
          {
            profileId: profile.id,
            cookie,
            value: captured.value,
            updatedAt: captured.capturedAt,
          },
        ];
      });

    if (fixedRows.length === 0 && trackedRows.length === 0) continue;
    groups.set(profile.id, {
      profileId: profile.id,
      profileName: profile.name,
      fixedCookies: fixedRows,
      trackedCookies: trackedRows,
      hasAnyTrackedValue: Object.keys(trackedValues).length > 0,
    });
  }

  return [...groups.values()];
};

export const formatRelativeTime = (timestamp: number, now: number): string => {
  const elapsedMs = Math.max(0, now - timestamp);
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return t("timeJustNow");
  if (minutes < 60) return t("timeMinutesAgo", String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("timeHoursAgo", String(hours));
  return t("timeDaysAgo", String(Math.floor(hours / 24)));
};
