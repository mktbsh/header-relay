import { describe, expect, it, vi } from "vitest";

import { createAnalyticsTracker } from "./tracker";

describe("createAnalyticsTracker", () => {
  it("adds the service-worker-owned client id and timestamp to an event", async () => {
    const write = vi.fn();
    const tracker = createAnalyticsTracker({
      clientIds: { getOrCreate: async () => "0190d5d9-a9d2-7fff-bfff-ffffffffffff" },
      write,
      now: () => 1_721_234_567_890,
    });

    await tracker.track({ name: "page_view", params: { surface: "popup" } });

    expect(write).toHaveBeenCalledWith({
      client_id: "0190d5d9-a9d2-7fff-bfff-ffffffffffff",
      timestamp_micros: "1721234567890000",
      events: [{ name: "page_view", params: { surface: "popup" } }],
    });
  });

  it("does not resolve a client id or write when disabled", async () => {
    const getOrCreate = vi.fn(async () => "unused");
    const write = vi.fn();
    const tracker = createAnalyticsTracker({
      enabled: false,
      clientIds: { getOrCreate },
      write,
    });

    await tracker.track({ name: "page_view", params: { surface: "popup" } });

    expect(getOrCreate).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});
