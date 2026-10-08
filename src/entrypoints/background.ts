import { browserPermissions } from "../lib/adapters/browser-ports";
import { CAPTURE_RESOURCE_TYPES } from "../lib/dnr/header-rule-builder";
import {
  analyticsTracker,
  extensionCommands,
  headerRelay,
  initializeAnalyticsClientId,
  processNetworkEvent,
  syncRules,
} from "../lib/lifecycle/engine";
import { registerBackgroundMessageHandlers } from "../lib/messaging/background-handlers";
import { handleHostPermissionChange } from "../lib/permissions/permission-change";

const ALL_URLS = ["<all_urls>"];

export default defineBackground(() => {
  // Provision a stable installation id in every build. The tracking flag controls
  // event emission only, so a future production rollout can reuse the same client id.
  void initializeAnalyticsClientId();
  registerBackgroundMessageHandlers(extensionCommands, analyticsTracker);

  browser.runtime.onInstalled.addListener(() => {
    void browser.action.setBadgeText({ text: "" });
    void syncRules();
  });

  browser.runtime.onStartup.addListener(() => {
    void browser.action.setBadgeText({ text: "" });
    void syncRules();
  });

  browser.commands.onCommand.addListener((command) => {
    if (command !== "toggle-all-profiles") return;
    void extensionCommands
      .toggleAllProfiles()
      .then((action) => {
        if (action === "noop") return;
        return browser.action.setBadgeText({ text: action === "paused" ? "OFF" : "" });
      })
      .catch(() => console.error("Failed to toggle all profiles."));
  });

  // Host permissions are optional and can change at any time (grant from the manage
  // page, revoke from Chrome's settings). Re-sync so DNR rules exist exactly for the
  // currently granted origins — rule-sync itself filters ungranted origins out.
  browserPermissions.onChanged?.((change) => {
    void handleHostPermissionChange(change, {
      getConfig: () => headerRelay.config.get(),
      grantedOriginPatterns: () => browserPermissions.grantedOriginPatterns(),
      clearSessions: (profileIds) => headerRelay.runtime.clearSessions(profileIds),
      syncRules,
    }).catch(() => console.error("Failed to reconcile host permission change."));
  });

  // Only headersReceived is needed: header capture happens here, and DNR attaches
  // headers without a runtime listener. Other webRequest events would be no-ops that
  // only add service-worker wake-ups under the <all_urls> permission.
  // types is narrower than the DNR attach scope on purpose: only the types that
  // realistically carry Set-Cookie, so image/font/etc. never wake the worker.
  browser.webRequest.onHeadersReceived.addListener(
    (details) => {
      return void processNetworkEvent({
        event: "headersReceived",
        requestId: details.requestId,
        url: details.url,
        method: details.method,
        type: details.type,
        tabId: details.tabId,
        statusCode: details.statusCode,
        responseHeaders: details.responseHeaders,
      });
    },
    {
      urls: ALL_URLS,
      types: CAPTURE_RESOURCE_TYPES as unknown as Browser.webRequest.ResourceType[],
    },
    ["responseHeaders", "extraHeaders"],
  );
});
