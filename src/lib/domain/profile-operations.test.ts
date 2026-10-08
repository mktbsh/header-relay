import { describe, expect, it } from "vitest";

import { copyProfile, moveProfile } from "./profile-operations";
import type { Profile } from "./types";

const profile = (id: string, name = id): Profile => ({
  id,
  name,
  enabled: true,
  targetOrigins: [{ id: `${id}-origin`, origin: "http://localhost:3000", enabled: true }],
  fixedHeaders: [
    {
      id: `${id}-fixed`,
      name: "x-token",
      value: "secret",
      enabled: true,
      popup: {
        visible: true,
        input: "select",
        options: [{ label: "Secret", value: "secret" }],
      },
    },
  ],
  captureHeaders: [{ id: `${id}-capture`, name: "x-captured", enabled: true }],
  excludedPaths: [{ id: `${id}-excluded`, pathPrefix: "/private", enabled: true }],
  fixedCookies: [
    {
      id: `${id}-cookie`,
      name: "sid",
      value: "cookie-secret",
      enabled: true,
    },
  ],
  trackedCookies: [{ id: `${id}-tracked`, name: "csrf", enabled: true }],
  migrationIssues: [
    {
      id: `${id}-issue`,
      source: "fixed-header-cookie",
      originalName: "Cookie",
      originalValue: "sid=cookie-secret",
      originalEnabled: true,
      reason: "cookie-parse-failed",
    },
  ],
  createdAt: 1,
  updatedAt: 2,
});

describe("Profile operations", () => {
  it("copies persisted settings with fresh ids and disabled state", () => {
    const source = profile("source", "API");
    const copy = copyProfile(source, [source], 99);

    expect(copy.name).toBe("Copy of API");
    expect(copy.enabled).toBe(false);
    expect(copy.createdAt).toBe(99);
    expect(copy.updatedAt).toBe(99);
    expect(copy.id).not.toBe(source.id);
    expect(copy.targetOrigins[0]?.id).not.toBe(source.targetOrigins[0]?.id);
    expect(copy.fixedHeaders[0]?.id).not.toBe(source.fixedHeaders[0]?.id);
    expect(copy.captureHeaders[0]?.id).not.toBe(source.captureHeaders[0]?.id);
    expect(copy.excludedPaths[0]?.id).not.toBe(source.excludedPaths[0]?.id);
    expect(copy.fixedCookies[0]?.id).not.toBe(source.fixedCookies[0]?.id);
    expect(copy.trackedCookies[0]?.id).not.toBe(source.trackedCookies[0]?.id);
    expect(copy.migrationIssues[0]?.id).not.toBe(source.migrationIssues[0]?.id);
    expect(copy.fixedHeaders[0]?.value).toBe("secret");
    expect(source).toEqual(profile("source", "API"));
  });

  it("adds the smallest numeric suffix when the copy name already exists", () => {
    const source = profile("source", "API");
    const existing = [source, profile("copy", "Copy of API"), profile("copy-2", "Copy of API 2")];

    expect(copyProfile(source, existing, 99).name).toBe("Copy of API 3");
  });

  it("moves a Profile without changing the other Profile objects", () => {
    const profiles = [profile("a"), profile("b"), profile("c")];

    expect(moveProfile(profiles, "b", "up").map((item) => item.id)).toEqual(["b", "a", "c"]);
    expect(moveProfile(profiles, "b", "down").map((item) => item.id)).toEqual(["a", "c", "b"]);
    expect(moveProfile(profiles, "a", "up").map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(moveProfile(profiles, "c", "down").map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(profiles.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });
});
