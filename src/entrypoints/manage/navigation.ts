import { t } from "../../lib/i18n";

export const profileTabs = [
  { id: "overview", segment: "", label: t("sectionOverview") },
  { id: "origins", segment: "origins", label: t("sectionOrigins") },
  { id: "headers", segment: "headers", label: t("sectionHeaders") },
  { id: "exclude", segment: "excluded-paths", label: t("sectionExclude") },
  { id: "cookies", segment: "cookies", label: t("sectionCookies") },
  { id: "probe", segment: "url-probe", label: t("sectionProbe") },
] as const;

export type ProfileTab = (typeof profileTabs)[number]["id"];

export const settingsTabs = [
  { id: "general", segment: "", label: t("settingsGeneralTab") },
  { id: "logs", segment: "audit-logs", label: t("sectionLogs") },
  { id: "json", segment: "json-editor", label: t("advancedJsonEditorTab") },
] as const;

export type SettingsTab = (typeof settingsTabs)[number]["id"];

const profileTabBySegment = new Map<string, (typeof profileTabs)[number]>(
  profileTabs.map((tab) => [tab.segment, tab]),
);
const profileSegmentByTab = new Map(profileTabs.map((tab) => [tab.id, tab.segment]));
const settingsSegmentByTab = new Map(settingsTabs.map((tab) => [tab.id, tab.segment]));

export const profilePath = (profileId: string, tab: ProfileTab = "overview"): string => {
  const segment = profileSegmentByTab.get(tab) ?? "";
  const base = `/profiles/${encodeURIComponent(profileId)}`;
  return segment ? `${base}/${segment}` : base;
};

// Opens the origins tab with `origin` pre-filled as an unsaved row (see the origins route).
export const addOriginPath = (profileId: string, origin: string): string =>
  `${profilePath(profileId, "origins")}?add=${encodeURIComponent(origin)}`;

export const settingsPath = (tab: SettingsTab = "general"): string => {
  const segment = settingsSegmentByTab.get(tab) ?? "";
  return segment ? `/settings/${segment}` : "/settings";
};

export const viewedProfileLocation = (
  pathname: string,
): { profileId: string; tab: ProfileTab } | undefined => {
  const match = /^\/profiles\/([^/]+)(?:\/([^/]+))?$/.exec(pathname);
  if (!match) return undefined;
  const tab = profileTabBySegment.get(match[2] ?? "");
  if (!tab) return undefined;
  try {
    return { profileId: decodeURIComponent(match[1]!), tab: tab.id };
  } catch {
    return undefined;
  }
};

export const profileSwitchPath = (profileId: string, currentPathname: string): string =>
  profilePath(profileId, viewedProfileLocation(currentPathname)?.tab ?? "overview");
