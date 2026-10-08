import { describe, expect, it, vi } from "vitest";

import { createMemoryStorage } from "../testing/memory-ports";
import { createAnalyticsClientIdStore } from "./client-id";
import { generateUuidV7 } from "./uuid-v7";

const id = generateUuidV7(1_721_234_567_890, (bytes) => {
  bytes.fill(0x2a);
});

describe("createAnalyticsClientIdStore", () => {
  it("creates one UUID v7 for concurrent callers and persists it", async () => {
    const storage = createMemoryStorage();
    const item = storage.defineItem<string>("local:analytics-client-id", { fallback: "" });
    const generateId = vi.fn(() => id);
    const clientIds = createAnalyticsClientIdStore(item, generateId);

    await expect(Promise.all([clientIds.getOrCreate(), clientIds.getOrCreate()])).resolves.toEqual([
      id,
      id,
    ]);
    expect(generateId).toHaveBeenCalledTimes(1);
    await expect(item.getValue()).resolves.toBe(id);
  });

  it("reuses the persisted id after the service worker is recreated", async () => {
    const storage = createMemoryStorage();
    const item = storage.defineItem<string>("local:analytics-client-id", { fallback: "" });
    await item.setValue(id);
    const generateId = vi.fn(() => generateUuidV7());

    await expect(createAnalyticsClientIdStore(item, generateId).getOrCreate()).resolves.toBe(id);
    expect(generateId).not.toHaveBeenCalled();
  });
});
