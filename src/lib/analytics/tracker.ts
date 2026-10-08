import type { AnalyticsClientIdStore } from "./client-id";
import type { AnalyticsEvent } from "./events";

// The envelope follows the top-level GA4 Measurement Protocol body shape. A future
// HTTP writer can enrich GA-specific event/session params without changing UI callers.
export type AnalyticsEnvelope = {
  client_id: string;
  timestamp_micros: string;
  events: [AnalyticsEvent];
};

export type AnalyticsTracker = {
  track: (event: AnalyticsEvent) => Promise<void>;
};

export const createAnalyticsTracker = (dependencies: {
  enabled?: boolean;
  clientIds: AnalyticsClientIdStore;
  write: (envelope: AnalyticsEnvelope) => void | Promise<void>;
  now?: () => number;
}): AnalyticsTracker => ({
  async track(event) {
    if (dependencies.enabled === false) return;
    const now = dependencies.now?.() ?? Date.now();
    await dependencies.write({
      client_id: await dependencies.clientIds.getOrCreate(),
      timestamp_micros: String(now * 1000),
      events: [event],
    });
  },
});
