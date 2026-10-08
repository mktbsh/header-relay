import { compileConfig, type CompiledConfig } from "../compiler/compile-config";
import { applySetCookies } from "../cookie-emulation/core";
import type { DnrSyncResult, DnrSyncStatus } from "../dnr/rule-sync";
import type { AuditLog, Profile, SessionState } from "../domain/types";
import { captureResponseHeaders } from "../header-emulation/core";
import { evaluateTargetRoute } from "../matching/route-condition";

// Header capture only runs on headersReceived; no other webRequest events are processed.
export type NetworkEventName = "headersReceived";

export type NetworkEventDetails = {
  event: NetworkEventName;
  requestId?: string;
  url: string;
  method?: string;
  type?: string;
  tabId?: number;
  statusCode?: number;
  responseHeaders?: Browser.webRequest.HttpHeader[];
};

export type RuntimeSessionDependencies = {
  getEnabledProfiles: () => Promise<Profile[]>;
  getSessions: () => Promise<Record<string, SessionState>>;
  setSessions: (sessions: Record<string, SessionState>) => Promise<void>;
  clearSessions: (profileId?: string) => Promise<void>;
  clearTrackedCookiesFor: (profileId: string, cookieName?: string) => Promise<void>;
  syncDnrRules: (compiled: CompiledConfig) => Promise<DnrSyncResult>;
  addAudit: (log: Omit<AuditLog, "id" | "ts"> & { id?: string; ts?: number }) => Promise<void>;
  now: () => number;
};

export type RuntimeSession = {
  syncRules: () => Promise<number[]>;
  processNetworkEvent: (details: NetworkEventDetails) => Promise<void>;
  clearSession: (profileId?: string) => Promise<void>;
  clearSessions: (profileIds: string[]) => Promise<void>;
  // Clears one tracked cookie (or all for the profile if name omitted) without
  // dropping captured header values. Re-syncs DNR after mutation.
  clearTrackedCookies: (profileId: string, cookieName?: string) => Promise<void>;
  // Latest DNR sync outcome — surfaced by getStatus for Runtime Status / URL Probe.
  getLastSyncStatus: () => { status: DnrSyncStatus; error?: string; unremovedRuleIds?: number[] };
};

const createSession = (profileId: string, now: number): SessionState => ({
  profileId,
  phase: "unauthenticated",
  capturedHeaders: {},
  trackedCookies: {},
  dnrRuleIds: [],
  updatedAt: now,
});

// Rebuild every session's runtime fields from one compile+sync so what is displayed
// matches the single ruleset that was applied. Sessions of profiles that are no
// longer enabled keep their captured values but lose their rule IDs.
const applySyncResult = (
  sessions: Record<string, SessionState>,
  enabledProfiles: Profile[],
  compiled: CompiledConfig,
  result: DnrSyncResult,
  lastError: string | undefined,
  now: number,
): Record<string, SessionState> => {
  const next: Record<string, SessionState> = { ...sessions };

  for (const profile of enabledProfiles) {
    next[profile.id] ??= createSession(profile.id, now);
  }

  for (const [profileId, session] of Object.entries(next)) {
    const conflict = compiled.errors.find((error) => error.profileIds.includes(profileId));
    next[profileId] = {
      ...session,
      dnrRuleIds: result.ruleIdsByProfile[profileId] ?? [],
      lastError: lastError ?? conflict?.message,
      updatedAt: now,
    };
  }

  return next;
};

export type LastSyncStatus = {
  status: DnrSyncStatus;
  error?: string;
  unremovedRuleIds?: number[];
};

export const createRuntimeSession = (deps: RuntimeSessionDependencies): RuntimeSession => {
  let sessionMutationQueue: Promise<void> = Promise.resolve();
  let lastSyncStatus: LastSyncStatus = { status: "ok" };

  const enqueueSessionMutation = (task: () => Promise<void>): Promise<void> => {
    const next = sessionMutationQueue.catch(() => undefined).then(task);
    sessionMutationQueue = next.catch(() => undefined);
    return next;
  };

  // Compile all enabled profiles and push the result as one ruleset. DNR failures are
  // surfaced as SessionState.lastError instead of thrown, so a failed sync stays
  // visible in the UI rather than silently aborting the listener.
  const compileAndSync = async (
    sessions: Record<string, SessionState>,
  ): Promise<Record<string, SessionState>> => {
    const enabledProfiles = await deps.getEnabledProfiles();
    const compiled = compileConfig(enabledProfiles, sessions);
    const now = deps.now();

    try {
      const result = await deps.syncDnrRules(compiled);
      lastSyncStatus = {
        status: result.status,
        error: result.error,
        unremovedRuleIds: result.unremovedRuleIds,
      };
      const propagatedError =
        result.status === "ok"
          ? undefined
          : `${result.error ?? "DNR sync failed"}${result.status === "stale-failed" ? " (stale rules may still fire)" : ""}`;
      return applySyncResult(sessions, enabledProfiles, compiled, result, propagatedError, now);
    } catch (error) {
      // Only reachable if syncDnrRules itself throws (dnr port hard failure); the
      // typed-result path above swallows update errors and returns stale-* instead.
      const message = error instanceof Error ? error.message : String(error);
      lastSyncStatus = { status: "stale-failed", error: message };
      const kept: DnrSyncResult = {
        ruleIds: [],
        status: "stale-failed",
        error: message,
        ruleIdsByProfile: Object.fromEntries(
          Object.entries(sessions).map(([id, session]) => [id, session.dnrRuleIds]),
        ),
      };
      return applySyncResult(sessions, enabledProfiles, compiled, kept, message, now);
    }
  };

  const syncRules = async (): Promise<number[]> => {
    const sessions = await deps.getSessions();
    const next = await compileAndSync(sessions);
    await deps.setSessions(next);
    return [...new Set(Object.values(next).flatMap((session) => session.dnrRuleIds))];
  };

  const collectSetCookieValues = (
    responseHeaders: Browser.webRequest.HttpHeader[] | undefined,
  ): string[] =>
    (responseHeaders ?? []).flatMap((header) =>
      header.name.toLowerCase() === "set-cookie" && header.value ? [header.value] : [],
    );

  const captureForProfile = async (
    profile: Profile,
    sessions: Record<string, SessionState>,
    details: NetworkEventDetails,
  ): Promise<Record<string, SessionState>> => {
    const now = deps.now();
    const startSession = sessions[profile.id] ?? createSession(profile.id, now);
    const { session: afterHeaders, capturedNames } = captureResponseHeaders({
      profile,
      session: startSession,
      responseHeaders: details.responseHeaders,
      now,
    });

    // Set-Cookie parsing runs on every response regardless of which profile captured
    // headers, so it participates in the same serialized session-mutation queue as
    // header capture. Untracked names, malformed pairs and expiries are all filtered
    // inside applySetCookies; values NEVER reach the audit log (only names + counts).
    const setCookieValues = collectSetCookieValues(details.responseHeaders);
    const cookieResult = applySetCookies({
      session: afterHeaders,
      trackedCookies: profile.trackedCookies,
      setCookies: setCookieValues,
      now,
    });

    if (capturedNames.length > 0) {
      await deps.addAudit({
        level: "info",
        profileId: profile.id,
        tabId: details.tabId,
        requestId: details.requestId,
        url: details.url,
        method: details.method,
        statusCode: details.statusCode,
        event: "headers_captured",
        headerNames: capturedNames,
        message: "Captured response header(s).",
      });
    }

    const cookieHeaderNames = [
      ...cookieResult.updatedNames.map((name) => `+${name}`),
      ...cookieResult.deletedNames.map((name) => `-${name}`),
    ];
    if (cookieHeaderNames.length > 0) {
      await deps.addAudit({
        level: "info",
        profileId: profile.id,
        tabId: details.tabId,
        requestId: details.requestId,
        url: details.url,
        method: details.method,
        statusCode: details.statusCode,
        event: "cookies_updated",
        // Cookie names go through headerNames so the audit UI reuses the same column.
        // "+name"/"-name" distinguishes update vs delete; the value is never included.
        headerNames: cookieHeaderNames,
        message: `Cookies updated: ${cookieResult.updatedNames.length}, deleted: ${cookieResult.deletedNames.length}.`,
      });
    }

    if (cookieResult.invalidNames.length > 0 || cookieResult.invalidUnnamed > 0) {
      await deps.addAudit({
        level: "warn",
        profileId: profile.id,
        tabId: details.tabId,
        requestId: details.requestId,
        url: details.url,
        method: details.method,
        statusCode: details.statusCode,
        event: "cookie_parse_failed",
        headerNames: cookieResult.invalidNames,
        message: `Set-Cookie parse failure: ${cookieResult.invalidNames.length} named, ${cookieResult.invalidUnnamed} unnamed.`,
      });
    }

    if (
      capturedNames.length === 0 &&
      cookieResult.session === afterHeaders &&
      afterHeaders === startSession
    ) {
      // Nothing changed for this profile.
      return { ...sessions, [profile.id]: startSession };
    }

    return { ...sessions, [profile.id]: cookieResult.session };
  };

  type ProfileMatch = { profile: Profile; origin: string };

  const matchingProfiles = (profiles: Profile[], url: string): ProfileMatch[] =>
    profiles.flatMap((profile) => {
      const { targetOrigin, excluded } = evaluateTargetRoute(profile, url);
      if (!targetOrigin || excluded) return [];
      return [{ profile, origin: targetOrigin.origin }];
    });

  // Every enabled profile that matches the URL captures independently; the ruleset is
  // recompiled only when at least one session actually changed.
  const processNetworkEventNow = async (details: NetworkEventDetails): Promise<void> => {
    const enabledProfiles = await deps.getEnabledProfiles();
    const matched = matchingProfiles(enabledProfiles, details.url);
    if (matched.length === 0) return;

    let sessions = await deps.getSessions();
    let changed = false;

    for (const { profile, origin } of matched) {
      await deps.addAudit({
        level: "debug",
        profileId: profile.id,
        tabId: details.tabId,
        requestId: details.requestId,
        url: details.url,
        method: details.method,
        statusCode: details.statusCode,
        event: "origin_matched",
        message: `Matched target origin: ${origin}`,
      });
      const before = sessions[profile.id];
      sessions = await captureForProfile(profile, sessions, details);
      if (sessions[profile.id] !== before) changed = true;
    }

    if (changed) {
      await deps.setSessions(await compileAndSync(sessions));
    }
  };

  const clearSessionNow = async (profileIds?: string[]): Promise<void> => {
    if (profileIds) {
      for (const profileId of profileIds) await deps.clearSessions(profileId);
    } else {
      await deps.clearSessions();
    }
    const sessions = await deps.getSessions();
    const next = await compileAndSync(sessions);
    await deps.setSessions(next);

    // Only the failure is audit-worthy: a successful manual clear is a user operation,
    // and the audit log records diagnostics only (issue #56).
    const lastError = Object.values(next).find((session) => session.lastError)?.lastError;
    if (lastError) {
      await deps.addAudit({
        level: "warn",
        profileId: profileIds?.length === 1 ? profileIds[0] : undefined,
        event: "session_cleared",
        message: `Session cleared; DNR rule sync reported: ${lastError}`,
      });
    }
  };

  // Pre-filter with the cached enabled profiles before enqueuing so unrelated
  // <all_urls> traffic never occupies the serial session-mutation queue.
  const processNetworkEvent = async (details: NetworkEventDetails): Promise<void> => {
    const enabledProfiles = await deps.getEnabledProfiles();
    if (matchingProfiles(enabledProfiles, details.url).length === 0) return;
    return enqueueSessionMutation(() => processNetworkEventNow(details));
  };

  const syncRulesQueued = async (): Promise<number[]> => {
    let ruleIds: number[] = [];
    await enqueueSessionMutation(async () => {
      ruleIds = await syncRules();
    });
    return ruleIds;
  };

  const clearTrackedCookiesNow = async (profileId: string, cookieName?: string): Promise<void> => {
    await deps.clearTrackedCookiesFor(profileId, cookieName);
    const sessions = await deps.getSessions();
    const next = await compileAndSync(sessions);
    await deps.setSessions(next);
  };

  return {
    syncRules: syncRulesQueued,
    processNetworkEvent,
    clearSession: (profileId) =>
      enqueueSessionMutation(() => clearSessionNow(profileId ? [profileId] : undefined)),
    clearSessions: (profileIds) => enqueueSessionMutation(() => clearSessionNow(profileIds)),
    clearTrackedCookies: (profileId, cookieName) =>
      enqueueSessionMutation(() => clearTrackedCookiesNow(profileId, cookieName)),
    getLastSyncStatus: () => ({ ...lastSyncStatus }),
  };
};
