import { describe, expect, it, vi } from "vitest";

import type { AppConfig, Profile } from "../domain/types";
import { handleHostPermissionChange } from "./permission-change";

const profile = (id: string, origins: string[]): Profile => ({
  id,
  name: id,
  enabled: true,
  targetOrigins: origins.map((origin, index) => ({ id: `${id}-${index}`, origin, enabled: true })),
  fixedHeaders: [],
  captureHeaders: [],
  excludedPaths: [],
  fixedCookies: [],
  trackedCookies: [],
  migrationIssues: [],
  createdAt: 1,
  updatedAt: 1,
});

const config: AppConfig = {
  schemaVersion: 5,
  profiles: [
    profile("local", ["http://localhost:3000", "https://kept.example.test"]),
    profile("remote", ["https://api.example.test"]),
  ],
};

const dependencies = (granted: string[]) => ({
  getConfig: vi.fn(async () => config),
  grantedOriginPatterns: vi.fn(async () => granted),
  clearSessions: vi.fn(async () => undefined),
  syncRules: vi.fn(async () => []),
});

describe("host permission changes", () => {
  it("re-syncs without clearing captured values when access is added", async () => {
    const deps = dependencies(["http://localhost/*"]);

    await expect(
      handleHostPermissionChange({ type: "added", origins: ["http://localhost/*"] }, deps),
    ).resolves.toEqual([]);

    expect(deps.clearSessions).not.toHaveBeenCalled();
    expect(deps.syncRules).toHaveBeenCalledOnce();
  });

  it("clears the whole affected profile session when one of its origins loses access", async () => {
    const deps = dependencies(["https://kept.example.test/*", "https://api.example.test/*"]);

    await expect(
      handleHostPermissionChange({ type: "removed", origins: ["http://localhost/*"] }, deps),
    ).resolves.toEqual(["local"]);

    expect(deps.clearSessions).toHaveBeenCalledWith(["local"]);
    expect(deps.syncRules).not.toHaveBeenCalled();
  });

  it("keeps values when another current grant still covers the removed origin", async () => {
    const deps = dependencies(["http://*/*", "https://*/*"]);

    await handleHostPermissionChange({ type: "removed", origins: ["<all_urls>"] }, deps);

    expect(deps.clearSessions).not.toHaveBeenCalled();
    expect(deps.syncRules).toHaveBeenCalledOnce();
  });
});
