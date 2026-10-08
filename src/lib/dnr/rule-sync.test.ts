import { describe, expect, it } from "vitest";

import { compileConfig } from "../compiler/compile-config";
import type { Profile } from "../domain/types";
import {
  createMemoryAudit,
  createMemoryDnr,
  createMemoryPermissions,
} from "../testing/memory-ports";
import { createRuleSync } from "./rule-sync";

const profile: Profile = {
  id: "profile-test",
  name: "Test",
  enabled: true,
  targetOrigins: [{ id: "origin-local", origin: "http://localhost:3000", enabled: true }],
  fixedHeaders: [{ id: "fixed-platform", name: "x-app-platform", value: "ios", enabled: true }],
  captureHeaders: [],
  excludedPaths: [],
  fixedCookies: [],
  trackedCookies: [],
  migrationIssues: [],
  createdAt: 1,
  updatedAt: 1,
};

const conflicting: Profile = {
  ...profile,
  id: "profile-conflict",
  name: "Conflict",
  fixedHeaders: [{ id: "fixed-platform", name: "x-app-platform", value: "web", enabled: true }],
};

const createSync = (grantedOrigins?: string[]) => {
  const dnr = createMemoryDnr();
  const audit = createMemoryAudit();
  const permissions = createMemoryPermissions(grantedOrigins);
  return { dnr, audit, permissions, ...createRuleSync({ dnr, audit, permissions }) };
};

describe("syncDnrRules", () => {
  it("returns stale-ok and audits a warning when the DNR update fails on a pure add", async () => {
    // No previous owned rules → surplus is empty → we don't retry remove-only.
    const { dnr, audit, syncDnrRules } = createSync();
    dnr.updateSessionRules = async () => {
      throw new Error("rule quota exceeded");
    };

    const result = await syncDnrRules(compileConfig([profile]));

    expect(result.status).toBe("stale-ok");
    expect(result.error).toContain("rule quota exceeded");
    expect(audit.all()).toContainEqual(expect.objectContaining({ level: "warn", event: "error" }));
  });

  it("retries with remove-only when a failed sync would have removed surplus rules", async () => {
    // First sync succeeds → next sync plans a DIFFERENT profile → surplus = the old
    // rule → we retry with remove-only. The retry succeeds so we end at stale-ok.
    const { dnr, audit, syncDnrRules } = createSync();
    await syncDnrRules(compileConfig([profile]));

    let attempts = 0;
    const observed: {
      removeRuleIds?: number[];
      addRules?: Browser.declarativeNetRequest.Rule[];
    }[] = [];
    dnr.updateSessionRules = async (update) => {
      attempts += 1;
      observed.push(update);
      // Fail the atomic replace; succeed the remove-only retry.
      if (attempts === 1) throw new Error("rule quota exceeded");
    };

    const nextProfile: Profile = {
      ...profile,
      id: "profile-next",
      fixedHeaders: [{ id: "fixed-env", name: "x-env", value: "local", enabled: true }],
    };
    const result = await syncDnrRules(compileConfig([nextProfile]));

    expect(attempts).toBe(2);
    // Retry carries only removeRuleIds (no addRules).
    expect(observed[1]?.addRules).toBeUndefined();
    expect((observed[1]?.removeRuleIds ?? []).length).toBeGreaterThan(0);
    expect(result.status).toBe("stale-ok");
    expect(audit.all()).toContainEqual(
      expect.objectContaining({
        level: "warn",
        message: expect.stringContaining("remove-only retry"),
      }),
    );
  });

  it("returns stale-failed when both the atomic update and the remove-only retry fail", async () => {
    const { dnr, audit, syncDnrRules } = createSync();
    await syncDnrRules(compileConfig([profile]));
    dnr.updateSessionRules = async () => {
      throw new Error("browser panicked");
    };
    const nextProfile: Profile = {
      ...profile,
      id: "profile-next",
      fixedHeaders: [{ id: "fixed-env", name: "x-env", value: "local", enabled: true }],
    };

    const result = await syncDnrRules(compileConfig([nextProfile]));

    expect(result.status).toBe("stale-failed");
    expect(result.unremovedRuleIds).toBeDefined();
    expect(audit.all()).toContainEqual(
      expect.objectContaining({
        level: "error",
        message: expect.stringContaining("Stale headers may still be sent"),
      }),
    );
  });

  it("syncs every enabled profile into one session ruleset", async () => {
    const { dnr, audit, syncDnrRules } = createSync();
    const other: Profile = {
      ...profile,
      id: "profile-other",
      fixedHeaders: [{ id: "fixed-env", name: "x-env", value: "local", enabled: true }],
    };

    const result = await syncDnrRules(compileConfig([profile, other]));

    expect(dnr.updateCount()).toBe(1);
    expect(dnr.rules()).toHaveLength(2);
    expect(result.ruleIds).toHaveLength(2);
    expect(Object.keys(result.ruleIdsByProfile)).toEqual(["profile-test", "profile-other"]);
    expect(audit.all()).toContainEqual(expect.objectContaining({ event: "dnr_rules_synced" }));
  });

  it("replaces the owned range instead of appending to it", async () => {
    const { dnr, syncDnrRules } = createSync();

    await syncDnrRules(compileConfig([profile]));
    await syncDnrRules(compileConfig([profile]));

    expect(dnr.rules()).toHaveLength(1);
  });

  it("creates no rule for an origin without host permission and audits the skip", async () => {
    const { dnr, audit, syncDnrRules } = createSync([]);

    const result = await syncDnrRules(compileConfig([profile]));

    expect(dnr.rules()).toEqual([]);
    expect(result.ruleIds).toEqual([]);
    expect(audit.all()).toContainEqual(
      expect.objectContaining({
        event: "dnr_rules_synced",
        level: "warn",
        data: expect.objectContaining({ skippedOrigins: ["http://localhost:3000"] }),
      }),
    );
  });

  it("keeps granted origins active while skipping ungranted ones", async () => {
    const { dnr, syncDnrRules } = createSync(["http://localhost/*"]);
    const ungranted: Profile = {
      ...profile,
      id: "profile-remote",
      targetOrigins: [{ id: "origin-remote", origin: "https://api.example.test", enabled: true }],
      fixedHeaders: [{ id: "fixed-env", name: "x-env", value: "remote", enabled: true }],
    };

    const result = await syncDnrRules(compileConfig([profile, ungranted]));

    expect(dnr.rules()).toHaveLength(1);
    expect(result.ruleIdsByProfile["profile-test"]).toHaveLength(1);
    expect(result.ruleIdsByProfile["profile-remote"] ?? []).toEqual([]);
  });

  it("drops rules when a granted permission is revoked and the sync reruns", async () => {
    const { dnr, permissions, syncDnrRules } = createSync(["http://localhost/*"]);

    await syncDnrRules(compileConfig([profile]));
    expect(dnr.rules()).toHaveLength(1);

    permissions.revoke("http://localhost/*");
    await syncDnrRules(compileConfig([profile]));
    expect(dnr.rules()).toEqual([]);
  });

  it("applies no rule and empties the ruleset when the compile reports a conflict", async () => {
    const { dnr, audit, syncDnrRules } = createSync();
    await syncDnrRules(compileConfig([profile]));

    const result = await syncDnrRules(compileConfig([profile, conflicting]));

    expect(dnr.rules()).toEqual([]);
    expect(result).toEqual({ ruleIds: [], ruleIdsByProfile: {}, status: "ok" });
    expect(audit.all()).toContainEqual(
      expect.objectContaining({ level: "error", event: "config_compiled" }),
    );
  });
});
