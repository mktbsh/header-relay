import { createRuleSync } from "./dnr/rule-sync";
import { createRuntimeSession, type RuntimeSession } from "./lifecycle/runtime-session";
import type { ExtensionCommandHandlers } from "./messaging/background-handlers";
import type { AuditPort, DnrPort, PermissionsPort, StoragePort } from "./ports";
import { createExtensionCommands } from "./runtime/extension-commands";
import { createConfigStore, type ConfigStore } from "./storage/config-store";
import { createSessionStore, type SessionStore } from "./storage/session-store";

export type HeaderRelayPorts = {
  storage: StoragePort;
  dnr: DnrPort;
  audit: AuditPort;
  permissions: PermissionsPort;
  now?: () => number;
};

export type HeaderRelay = {
  runtime: RuntimeSession;
  commands: ExtensionCommandHandlers;
  config: ConfigStore;
  session: SessionStore;
};

// The whole extension, minus the browser. Pass browser adapters for production
// (see lifecycle/engine.ts) or in-memory ones to drive it headlessly (see
// testing/test-runtime.ts). This module imports no browser global, which is what
// keeps the in-memory path free of module mocks.
export const createHeaderRelay = ({
  storage,
  dnr,
  audit,
  permissions,
  now = () => Date.now(),
}: HeaderRelayPorts): HeaderRelay => {
  const config = createConfigStore({ storage, audit });
  const session = createSessionStore({ storage });
  const pausedProfileIds = storage.defineItem<string[] | null>("session:paused-profile-ids", {
    fallback: null,
  });
  const { syncDnrRules } = createRuleSync({ dnr, audit, permissions });

  const runtime = createRuntimeSession({
    getEnabledProfiles: () => config.getEnabledProfiles(),
    getSessions: () => session.getAll(),
    setSessions: (sessions) => session.setMany(sessions),
    clearSessions: (profileId) => session.clear(profileId),
    clearTrackedCookiesFor: (profileId, cookieName) =>
      session.clearTrackedCookies(profileId, cookieName),
    syncDnrRules,
    addAudit: (log) => audit.add(log),
    now,
  });

  const commands = createExtensionCommands({
    runtime,
    config,
    session,
    audit,
    pausedProfileIds,
    now,
  });

  return { runtime, commands, config, session };
};
