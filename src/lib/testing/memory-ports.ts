import { isAtOrAboveLevel } from "../domain/audit-level";
import type { AuditLog } from "../domain/types";
import type {
  AuditLogInput,
  AuditPort,
  DnrPort,
  HostPermissionChange,
  PermissionsPort,
  StorageItem,
  StoragePort,
} from "../ports";
import { auditEntriesToPrune, sanitizeAuditUrl } from "../storage/audit-retention";

// In-memory stand-ins for the browser ports, for tests and for driving the extension
// headlessly. Test-only: no entrypoint imports this, so it never reaches the bundle.

export const createMemoryStorage = (): StoragePort => {
  const values = new Map<string, unknown>();
  const watchers = new Map<string, ((value: unknown) => void)[]>();

  return {
    defineItem<T>(key: string, options: { fallback: T }): StorageItem<T> {
      return {
        async getValue() {
          return (values.has(key) ? values.get(key) : options.fallback) as T;
        },
        async setValue(value: T) {
          values.set(key, value);
          for (const callback of watchers.get(key) ?? []) callback(value);
        },
        watch(callback) {
          watchers.set(key, [...(watchers.get(key) ?? []), callback as (value: unknown) => void]);
        },
      };
    },
  };
};

export type MemoryDnr = DnrPort & {
  // The ruleset currently applied to the "browser" — this is what tests assert on.
  rules: () => Browser.declarativeNetRequest.Rule[];
  updateCount: () => number;
};

export const createMemoryDnr = (): MemoryDnr => {
  let rules: Browser.declarativeNetRequest.Rule[] = [];
  let updateCount = 0;

  return {
    async getSessionRules() {
      return [...rules];
    },
    async updateSessionRules(update) {
      updateCount += 1;
      const removed = new Set(update.removeRuleIds ?? []);
      rules = [...rules.filter((rule) => !removed.has(rule.id)), ...(update.addRules ?? [])];
    },
    rules: () => [...rules],
    updateCount: () => updateCount,
  };
};

export type MemoryPermissions = PermissionsPort & {
  granted: () => string[];
  grant: (...patterns: string[]) => void;
  revoke: (...patterns: string[]) => void;
  /** What the next requestOrigins() call resolves to (the user's dialog answer). */
  setRequestAnswer: (grant: boolean) => void;
};

// Default grant is <all_urls>: that is the state every pre-migration install is in,
// so existing tests keep describing the granted world unless they revoke explicitly.
export const createMemoryPermissions = (initial: string[] = ["<all_urls>"]): MemoryPermissions => {
  const granted = new Set(initial);
  const listeners: ((change: HostPermissionChange) => void)[] = [];
  let requestAnswer = true;

  const notify = (change: HostPermissionChange) => {
    if (change.origins.length === 0) return;
    for (const listener of listeners) listener(change);
  };

  return {
    async requestOrigins(patterns) {
      if (!requestAnswer) return false;
      const added = patterns.filter((pattern) => !granted.has(pattern));
      for (const pattern of added) granted.add(pattern);
      notify({ type: "added", origins: added });
      return true;
    },
    async removeOrigins(patterns) {
      const removed = patterns.filter((pattern) => granted.delete(pattern));
      notify({ type: "removed", origins: removed });
      return true;
    },
    async grantedOriginPatterns() {
      return [...granted];
    },
    onChanged(callback) {
      listeners.push(callback);
    },
    granted: () => [...granted],
    grant: (...patterns) => {
      const added = patterns.filter((pattern) => !granted.has(pattern));
      for (const pattern of added) granted.add(pattern);
      notify({ type: "added", origins: added });
    },
    revoke: (...patterns) => {
      const removed = patterns.filter((pattern) => granted.delete(pattern));
      notify({ type: "removed", origins: removed });
    },
    setRequestAnswer: (grant) => {
      requestAnswer = grant;
    },
  };
};

export type MemoryAudit = AuditPort & {
  // The persisted view: like production, entries here never carry a URL.
  all: () => AuditLog[];
};

// Shares retention and URL sanitization with the IndexedDB adapter so the fake cannot
// drift into a different policy than production: URLs live in a separate ephemeral
// map (production: `session:` storage) and are only merged back in recent().
export const createMemoryAudit = (now: () => number = Date.now): MemoryAudit => {
  let logs: AuditLog[] = [];
  const urls = new Map<string, string>();
  let sequence = 0;

  return {
    async add(log: AuditLogInput) {
      sequence += 1;
      const { url, ...rest } = log;
      const id = log.id ?? `log-${sequence}`;
      logs.push({ ...rest, id, ts: log.ts ?? now() });
      const sanitized = sanitizeAuditUrl(url);
      if (sanitized !== undefined) urls.set(id, sanitized);
      const pruned = new Set(
        auditEntriesToPrune(
          [...logs].sort((a, b) => a.ts - b.ts),
          now(),
        ),
      );
      logs = logs.filter((entry) => !pruned.has(entry.id));
      for (const id of pruned) urls.delete(id);
    },
    async recent({ limit = 200, minLevel = "debug" } = {}) {
      return [...logs]
        .sort((a, b) => b.ts - a.ts)
        .filter((entry) => isAtOrAboveLevel(entry.level, minLevel))
        .slice(0, limit)
        .map((entry) => {
          const url = urls.get(entry.id);
          return url === undefined ? entry : { ...entry, url };
        });
    },
    async clear() {
      logs = [];
      urls.clear();
    },
    all: () => [...logs],
  };
};
