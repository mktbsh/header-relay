import { describe, expect, it } from "vitest";

import type { FixedHeader, Profile } from "../../lib/domain/types";
import {
  createPopupSelectOptions,
  createSessionStatusView,
  formatRelativeTime,
  resolveSessionPhase,
  selectPopupActiveProfiles,
  selectPopupHeaderGroups,
  selectPopupProfiles,
} from "./view-model";

const trackHeader = (overrides: Partial<FixedHeader> = {}): FixedHeader => ({
  id: "fixed-track",
  name: "x-release-track",
  value: "stable",
  enabled: true,
  popup: {
    visible: true,
    input: "select",
    options: [
      { label: "Stable", value: "stable" },
      { label: "Canary", value: "canary" },
    ],
  },
  ...overrides,
});

const profile = (overrides: Partial<Profile> & Pick<Profile, "id" | "name">): Profile => ({
  enabled: true,
  targetOrigins: [
    { id: `${overrides.id}-origin`, origin: "https://staging.example.com", enabled: true },
  ],
  fixedHeaders: [trackHeader()],
  captureHeaders: [],
  excludedPaths: [],
  fixedCookies: [],
  trackedCookies: [],
  migrationIssues: [],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const STAGING_URL = "https://staging.example.com/dashboard";

describe("popup view model", () => {
  it("resolves the session phase from profile state when no session exists", () => {
    expect(resolveSessionPhase(true, undefined)).toBe("unauthenticated");
    expect(resolveSessionPhase(false, undefined)).toBe("disabled");
    expect(resolveSessionPhase(false, "authenticated")).toBe("authenticated");
  });

  it("maps session phases to status views", () => {
    expect(createSessionStatusView("authenticated")).toMatchObject({
      label: "Captured",
      badgeClass: "hr-badge hr-badge-green",
    });
    expect(createSessionStatusView("unauthenticated")).toMatchObject({
      label: "Waiting",
      badgeClass: "hr-badge hr-badge-orange",
    });
    expect(createSessionStatusView("disabled")).toMatchObject({
      label: "Disabled",
      badgeClass: "hr-badge",
    });
  });

  it("formats capture timestamps relative to now", () => {
    const now = Date.parse("2026-07-11T12:00:00Z");
    expect(formatRelativeTime(now - 10_000, now)).toBe("just now");
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5m ago");
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe("2d ago");
    expect(formatRelativeTime(now + 60_000, now)).toBe("just now");
  });
});

describe("selectPopupHeaderGroups", () => {
  const groupsFor = (profiles: Profile[], url: string | undefined = STAGING_URL) =>
    selectPopupHeaderGroups(profiles, {}, url);

  it("exposes the published headers of every profile that matches the tab, grouped by profile", () => {
    const groups = groupsFor([
      profile({
        id: "profile-common",
        name: "Common Headers",
        fixedHeaders: [trackHeader({ id: "fixed-tenant", name: "x-tenant-id", value: "tenant-a" })],
      }),
      profile({ id: "profile-canary", name: "Canary Routing" }),
    ]);

    expect(
      groups.map((group) => [group.profileName, group.headers.map((row) => row.header.name)]),
    ).toEqual([
      ["Common Headers", ["x-tenant-id"]],
      ["Canary Routing", ["x-release-track"]],
    ]);
  });

  it("hides headers that are not published or belong to a disabled profile", () => {
    expect(
      groupsFor([
        profile({ id: "profile-a", name: "A", fixedHeaders: [trackHeader({ popup: undefined })] }),
      ]),
    ).toEqual([]);
    expect(
      groupsFor([
        profile({
          id: "profile-b",
          name: "B",
          fixedHeaders: [trackHeader({ popup: { visible: false, input: "text" } })],
        }),
      ]),
    ).toEqual([]);
    expect(groupsFor([profile({ id: "profile-d", name: "D", enabled: false })])).toEqual([]);
  });

  it("keeps a published disabled header visible so the popup can re-enable it", () => {
    const groups = groupsFor([
      profile({ id: "profile-a", name: "A", fixedHeaders: [trackHeader({ enabled: false })] }),
    ]);

    expect(groups[0]?.headers[0]?.header.enabled).toBe(false);
  });

  it("hides everything when the tab URL does not match or is unavailable", () => {
    const profiles = [profile({ id: "profile-a", name: "A" })];

    expect(groupsFor(profiles, "https://other.example.com/")).toEqual([]);
    // No URL at all: a tab the extension cannot read (chrome:// pages, no permission).
    expect(selectPopupHeaderGroups(profiles, {}, undefined)).toEqual([]);
  });

  it("hides headers the profile removes on the tab's excluded path", () => {
    const excluded = profile({
      id: "profile-a",
      name: "A",
      excludedPaths: [{ id: "exclude-dash", pathPrefix: "/dashboard", enabled: true }],
    });

    expect(groupsFor([excluded])).toEqual([]);
    expect(groupsFor([excluded], "https://staging.example.com/other")).toHaveLength(1);
  });

  it("marks a header claimed by two enabled profiles with the compiler's conflict message", () => {
    const groups = groupsFor([
      profile({ id: "profile-a", name: "A" }),
      profile({ id: "profile-b", name: "B" }),
    ]);

    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(group.headers[0]?.conflictMessage).toContain("more than one enabled profile");
    }
  });
});

describe("selectPopupProfiles", () => {
  it("includes disabled profiles that target the current URL", () => {
    const matchingDisabled = profile({ id: "disabled", name: "Disabled", enabled: false });
    const otherOrigin = profile({
      id: "other",
      name: "Other",
      targetOrigins: [{ id: "other-origin", origin: "https://other.example.com", enabled: true }],
    });

    expect(selectPopupProfiles([matchingDisabled, otherOrigin], STAGING_URL)).toEqual([
      matchingDisabled,
    ]);
    expect(selectPopupActiveProfiles([matchingDisabled], STAGING_URL)).toEqual([]);
  });

  it("does not include profiles excluded on the current path", () => {
    const excluded = profile({
      id: "excluded",
      name: "Excluded",
      excludedPaths: [{ id: "dashboard", pathPrefix: "/dashboard", enabled: true }],
    });

    expect(selectPopupProfiles([excluded], STAGING_URL)).toEqual([]);
  });
});

describe("createPopupSelectOptions", () => {
  it("keeps the configured options when the current value is one of them", () => {
    expect(createPopupSelectOptions(trackHeader())).toEqual([
      { label: "Stable", value: "stable" },
      { label: "Canary", value: "canary" },
    ]);
  });

  it("surfaces a value that no longer matches any option instead of dropping it", () => {
    expect(createPopupSelectOptions(trackHeader({ value: "canary-10" }))[0]).toEqual({
      label: "Custom: canary-10",
      value: "canary-10",
    });
  });
});
