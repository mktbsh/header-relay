import { describe, expect, it } from "vitest";

import { createMemoryAudit, createMemoryStorage } from "../testing/memory-ports";
import { createConfigStore } from "./config-store";

const createStore = () => {
  const storage = createMemoryStorage();
  const audit = createMemoryAudit();
  return { storage, audit, store: createConfigStore({ storage, audit }) };
};

describe("configStore", () => {
  it("rejects structurally invalid configs before persisting them", async () => {
    const { store } = createStore();

    await expect(
      store.set({
        schemaVersion: 3,
        profiles: [
          {
            id: "profile-invalid",
            name: "Invalid",
            enabled: true,
            targetOrigins: "not-an-array",
          },
        ],
      } as never),
    ).rejects.toThrow("Invalid app config");
  });

  it("resets to defaults and records an audit when stored config cannot be parsed", async () => {
    const { storage, audit, store } = createStore();
    await storage.defineItem<unknown>("local:app-config", { fallback: undefined }).setValue({
      schemaVersion: 3,
      profiles: [],
    });

    const config = await store.get();

    expect(config.profiles.length).toBeGreaterThan(0);
    expect(audit.all()).toContainEqual(expect.objectContaining({ level: "error" }));
  });

  it("returns only enabled profiles to the runtime", async () => {
    const { store } = createStore();
    const base = await store.get();
    const [first] = base.profiles;

    await store.set({
      ...base,
      profiles: [
        { ...first!, enabled: false },
        { ...first!, id: "profile-on", name: "On", enabled: true },
      ],
    });

    expect((await store.getEnabledProfiles()).map((item) => item.id)).toEqual(["profile-on"]);
  });
});
