import { storage } from "#imports";

import type { DnrPort, PermissionsPort, SessionRuleUpdate, StoragePort } from "../ports";

// The only place that reads browser globals for storage and DNR. Both are thin
// passthroughs; keeping them this dumb is what makes the memory adapters a fair
// substitute.

export const browserStorage: StoragePort = {
  defineItem: (key, options) =>
    storage.defineItem(key as Parameters<typeof storage.defineItem>[0], options),
};

// The installation id. Written once by the background at startup; UI surfaces only read it.
export const analyticsClientIdItem = browserStorage.defineItem<string>(
  "local:analytics-client-id",
  { fallback: "" },
);

export const browserDnr: DnrPort = {
  getSessionRules: () => browser.declarativeNetRequest.getSessionRules(),
  updateSessionRules: (update: SessionRuleUpdate) =>
    browser.declarativeNetRequest.updateSessionRules(update),
};

export const browserPermissions: PermissionsPort = {
  requestOrigins: (origins) => browser.permissions.request({ origins }),
  removeOrigins: (origins) => browser.permissions.remove({ origins }),
  grantedOriginPatterns: async () => (await browser.permissions.getAll()).origins ?? [],
  onChanged: (callback) => {
    browser.permissions.onAdded.addListener((permissions) =>
      callback({ type: "added", origins: permissions.origins ?? [] }),
    );
    browser.permissions.onRemoved.addListener((permissions) =>
      callback({ type: "removed", origins: permissions.origins ?? [] }),
    );
  },
};
