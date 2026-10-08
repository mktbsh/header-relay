import {
  analyticsClientIdItem,
  browserDnr,
  browserPermissions,
  browserStorage,
} from "../adapters/browser-ports";
import { createAnalyticsClientIdStore } from "../analytics/client-id";
import { createAnalyticsTracker } from "../analytics/tracker";
import { featureFlags } from "../feature-flags";
import { createHeaderRelay } from "../header-relay";
import { createAuditDb } from "../storage/audit-db";
import type { NetworkEventDetails, NetworkEventName } from "./runtime-session";

// The production composition root: the one place that binds the extension to real
// browser APIs. Kept apart from createHeaderRelay so importing the relay in a test
// never drags `#imports` or `browser` along.
export const headerRelay = createHeaderRelay({
  storage: browserStorage,
  dnr: browserDnr,
  permissions: browserPermissions,
  // The `session:` area is memory-backed and cleared when the browser closes, so
  // request URLs shown next to audit entries never reach disk.
  audit: createAuditDb({
    urls: browserStorage.defineItem<Record<string, string>>("session:audit-log-urls", {
      fallback: {},
    }),
  }),
});

export const extensionCommands = headerRelay.commands;
export const analyticsClientIds = createAnalyticsClientIdStore(analyticsClientIdItem);
export const initializeAnalyticsClientId = (): Promise<string> => analyticsClientIds.getOrCreate();
export const analyticsTracker = createAnalyticsTracker({
  enabled: featureFlags.analyticsTracking,
  clientIds: analyticsClientIds,
  write: (envelope) => console.log("[analytics]", envelope),
});
export const syncRules = (): Promise<number[]> => headerRelay.runtime.syncRules();
export const processNetworkEvent = (details: NetworkEventDetails): Promise<void> =>
  headerRelay.runtime.processNetworkEvent(details);

export type { NetworkEventDetails, NetworkEventName };
