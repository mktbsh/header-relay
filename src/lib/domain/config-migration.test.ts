import { describe, expect, it } from "vitest";

import { migrateAppConfig } from "./config-migration";
import { parseAppConfig } from "./config-schema";
import { CONFIG_SCHEMA_VERSION } from "./default-profile";

const profile = (id: string, enabled: boolean) => ({
  id,
  name: id,
  enabled,
  targetOrigins: [{ id: `${id}-origin`, origin: "http://localhost:3000", enabled: true }],
  fixedHeaders: [],
  captureHeaders: [],
  excludedPaths: [],
  createdAt: 1,
  updatedAt: 1,
});

const v2Config = (activeProfileId: string | undefined, enabled: [boolean, boolean]) => ({
  schemaVersion: 2,
  ...(activeProfileId ? { activeProfileId } : {}),
  profiles: [profile("profile-a", enabled[0]), profile("profile-b", enabled[1])],
});

describe("migrateAppConfig", () => {
  it("removes the viewed-profile selection and repairs duplicate names when migrating v6", () => {
    const migrated = migrateAppConfig({
      schemaVersion: 6,
      selectedProfileId: "profile-b",
      profiles: [
        { ...profile("profile-a", true), name: "Local API" },
        { ...profile("profile-b", false), name: "ｌｏｃａｌ　ａｐｉ" },
      ],
    }) as Record<string, unknown> & { profiles: { id: string; name: string }[] };

    expect(migrated.schemaVersion).toBe(7);
    expect(migrated).not.toHaveProperty("selectedProfileId");
    expect(migrated.profiles.map((item) => [item.id, item.name])).toEqual([
      ["profile-a", "Local API"],
      ["profile-b", "ｌｏｃａｌ　ａｐｉ (2)"],
    ]);
  });

  it("drops the legacy active Profile selection and bumps the schema version", () => {
    const migrated = migrateAppConfig(v2Config("profile-b", [false, true])) as Record<
      string,
      unknown
    >;

    expect(migrated.schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
    expect(migrated).not.toHaveProperty("activeProfileId");
    expect(migrated).not.toHaveProperty("selectedProfileId");
  });

  it("keeps each profile's enabled value so the previous runtime behaviour is preserved", () => {
    const migrated = migrateAppConfig(v2Config("profile-a", [true, false])) as {
      profiles: { id: string; enabled: boolean }[];
    };

    expect(migrated.profiles.map((item) => [item.id, item.enabled])).toEqual([
      ["profile-a", true],
      ["profile-b", false],
    ]);
  });

  it("produces a config the current schema accepts", () => {
    const parsed = parseAppConfig(migrateAppConfig(v2Config("profile-a", [true, false])));

    expect(parsed.schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
    expect(parsed).not.toHaveProperty("selectedProfileId");
  });

  it("drops both missing and dangling legacy selections", () => {
    const dangling = migrateAppConfig(v2Config("profile-gone", [true, false])) as Record<
      string,
      unknown
    >;
    const missing = migrateAppConfig(v2Config(undefined, [true, false])) as Record<string, unknown>;

    expect(dangling).not.toHaveProperty("selectedProfileId");
    expect(missing).not.toHaveProperty("selectedProfileId");
  });

  it("leaves a current config untouched", () => {
    const current = {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      profiles: [profile("profile-a", true), profile("profile-b", true)],
    };

    expect(migrateAppConfig(current)).toEqual(current);
  });

  it("leaves v3 fixed headers unpublished so an upgrade exposes nothing in the popup", () => {
    const v3 = {
      schemaVersion: 3,
      selectedProfileId: "profile-a",
      profiles: [
        {
          ...profile("profile-a", true),
          fixedHeaders: [{ id: "fixed-track", name: "x-release-track", value: "s", enabled: true }],
        },
      ],
    };

    const parsed = parseAppConfig(migrateAppConfig(v3));

    expect(parsed.schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
    expect(parsed.profiles[0]?.fixedHeaders[0]?.popup).toBeUndefined();
  });

  it("passes unknown shapes through for the schema to reject", () => {
    expect(migrateAppConfig({ schemaVersion: 1, profiles: [] })).toEqual({
      schemaVersion: 1,
      profiles: [],
    });
    expect(migrateAppConfig(undefined)).toBeUndefined();
  });

  describe("v4 → v5 cookie migration", () => {
    const v4Profile = (fixedHeaders: unknown[], captureHeaders: unknown[] = []) => ({
      ...profile("profile-a", true),
      fixedHeaders,
      captureHeaders,
    });
    const wrap = (p: ReturnType<typeof v4Profile>) => ({
      schemaVersion: 4,
      selectedProfileId: "profile-a",
      profiles: [p],
    });

    it("converts a plain multi-pair Fixed Header Cookie into fixedCookies (order preserved)", () => {
      const migrated = migrateAppConfig(
        wrap(
          v4Profile([
            {
              id: "f1",
              name: "Cookie",
              value: "a=1; token=x=y",
              enabled: true,
            },
          ]),
        ),
      ) as { profiles: [{ fixedHeaders: unknown[]; fixedCookies: unknown[] }] };
      expect(migrated.profiles[0]!.fixedHeaders).toEqual([]);
      expect(migrated.profiles[0]!.fixedCookies).toEqual([
        { id: "f1-c1", name: "a", value: "1", enabled: true },
        { id: "f1-c2", name: "token", value: "x=y", enabled: true },
      ]);
    });

    it("keeps a single-pair popup-published Cookie header including its popup config", () => {
      const migrated = migrateAppConfig(
        wrap(
          v4Profile([
            {
              id: "f1",
              name: "Cookie",
              value: "session=abc",
              enabled: true,
              popup: {
                visible: true,
                input: "select",
                options: [
                  { label: "abc", value: "abc" },
                  { label: "xyz", value: "xyz" },
                ],
              },
            },
          ]),
        ),
      ) as { profiles: [{ fixedCookies: { popup: unknown }[] }] };
      expect(migrated.profiles[0]!.fixedCookies[0]!.popup).toEqual({
        visible: true,
        input: "select",
        options: [
          { label: "abc", value: "abc" },
          { label: "xyz", value: "xyz" },
        ],
      });
    });

    it("normalizes popup select options in name=value form to bare values", () => {
      const migrated = migrateAppConfig(
        wrap(
          v4Profile([
            {
              id: "f1",
              name: "Cookie",
              value: "SID=abc",
              enabled: true,
              popup: {
                visible: true,
                input: "select",
                options: [
                  { label: "abc", value: "SID=abc" },
                  { label: "xyz", value: "SID=xyz" },
                ],
              },
            },
          ]),
        ),
      ) as {
        profiles: [{ fixedCookies: { value: string; popup: { options: { value: string }[] } }[] }];
      };
      expect(migrated.profiles[0]!.fixedCookies[0]!.value).toBe("abc");
      expect(migrated.profiles[0]!.fixedCookies[0]!.popup.options).toEqual([
        { label: "abc", value: "abc" },
        { label: "xyz", value: "xyz" },
      ]);
    });

    it("moves a name=value popup option with a mismatched name to a migration issue", () => {
      const migrated = migrateAppConfig(
        wrap(
          v4Profile([
            {
              id: "f1",
              name: "Cookie",
              value: "SID=abc",
              enabled: true,
              popup: {
                visible: true,
                input: "select",
                options: [{ label: "other", value: "OTHER=abc" }],
              },
            },
          ]),
        ),
      ) as { profiles: [{ fixedCookies: unknown[]; migrationIssues: { reason: string }[] }] };
      expect(migrated.profiles[0]!.fixedCookies).toEqual([]);
      expect(migrated.profiles[0]!.migrationIssues[0]!.reason).toBe(
        "popup-select-options-mismatch",
      );
    });

    it("moves a multi-pair popup Cookie header to a migration issue instead of converting", () => {
      const migrated = migrateAppConfig(
        wrap(
          v4Profile([
            {
              id: "f1",
              name: "Cookie",
              value: "a=1; b=2",
              enabled: true,
              popup: { visible: true, input: "text" },
            },
          ]),
        ),
      ) as { profiles: [{ fixedCookies: unknown[]; migrationIssues: { reason: string }[] }] };
      expect(migrated.profiles[0]!.fixedCookies).toEqual([]);
      expect(migrated.profiles[0]!.migrationIssues[0]!.reason).toBe(
        "popup-select-options-mismatch",
      );
    });

    it("moves a bad-syntax Cookie header to a migration issue", () => {
      const migrated = migrateAppConfig(
        wrap(v4Profile([{ id: "f1", name: "Cookie", value: "not a valid pair", enabled: true }])),
      ) as { profiles: [{ migrationIssues: { reason: string }[] }] };
      expect(migrated.profiles[0]!.migrationIssues[0]!.reason).toBe("cookie-parse-failed");
    });

    it("moves all involved headers to issues when their converted cookie names collide across headers", () => {
      const migrated = migrateAppConfig(
        wrap(
          v4Profile([
            { id: "f1", name: "Cookie", value: "SID=one", enabled: true },
            { id: "f2", name: "Cookie", value: "SID=two", enabled: true },
          ]),
        ),
      ) as { profiles: [{ fixedCookies: unknown[]; migrationIssues: { reason: string }[] }] };
      expect(migrated.profiles[0]!.fixedCookies).toEqual([]);
      expect(migrated.profiles[0]!.migrationIssues.map((issue) => issue.reason)).toEqual([
        "duplicate-cookie-name",
        "duplicate-cookie-name",
      ]);
    });

    it("moves Captured Header Cookie to a migration issue with source=capture-header-cookie", () => {
      const migrated = migrateAppConfig(
        wrap(v4Profile([], [{ id: "c1", name: "cookie", enabled: true }])),
      ) as { profiles: [{ captureHeaders: unknown[]; migrationIssues: { source: string }[] }] };
      expect(migrated.profiles[0]!.captureHeaders).toEqual([]);
      expect(migrated.profiles[0]!.migrationIssues[0]!.source).toBe("capture-header-cookie");
    });

    it("leaves non-Cookie fixed and capture headers untouched", () => {
      const migrated = migrateAppConfig(
        wrap(
          v4Profile(
            [{ id: "f1", name: "x-api-key", value: "k", enabled: true }],
            [{ id: "c1", name: "authorization", enabled: true }],
          ),
        ),
      ) as {
        profiles: [
          {
            fixedHeaders: { id: string }[];
            captureHeaders: { id: string }[];
            fixedCookies: unknown[];
            migrationIssues: unknown[];
          },
        ];
      };
      expect(migrated.profiles[0]!.fixedHeaders[0]?.id).toBe("f1");
      expect(migrated.profiles[0]!.captureHeaders[0]?.id).toBe("c1");
      expect(migrated.profiles[0]!.fixedCookies).toEqual([]);
      expect(migrated.profiles[0]!.migrationIssues).toEqual([]);
    });

    it("running migrateAppConfig twice does not re-run the migration (idempotent)", () => {
      const once = migrateAppConfig(
        wrap(v4Profile([{ id: "f1", name: "Cookie", value: "a=1", enabled: true }])),
      );
      const twice = migrateAppConfig(once);
      expect(twice).toEqual(once);
    });
  });
});
