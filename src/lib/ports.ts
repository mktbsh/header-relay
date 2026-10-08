import type { AuditLogLevel } from "./domain/audit-level";
import type { AuditLog } from "./domain/types";

// The seams where this extension touches the browser at runtime. Everything else
// (compiler, header-emulation core, matching, runtime-session) is already free of
// browser globals and needs no port.
//
// Types are borrowed from the Browser namespace on purpose: they are erased at
// compile time, so they cost nothing at runtime, and redeclaring a parallel Rule type
// would only buy a second thing to keep in sync.

export type StorageItem<T> = {
  getValue: () => Promise<T>;
  setValue: (value: T) => Promise<void>;
  watch?: (callback: (value: T) => void) => void;
};

// Mirrors wxt's storage.defineItem, so the browser adapter is a passthrough.
export type StoragePort = {
  defineItem: <T>(key: string, options: { fallback: T }) => StorageItem<T>;
};

export type SessionRuleUpdate = {
  removeRuleIds?: number[];
  addRules?: Browser.declarativeNetRequest.Rule[];
};

export type DnrPort = {
  getSessionRules: () => Promise<Browser.declarativeNetRequest.Rule[]>;
  updateSessionRules: (update: SessionRuleUpdate) => Promise<void>;
};

// Host-permission seam. UI contexts call request() directly (permissions.request
// must run inside the user gesture of an extension page); the background only ever
// reads grants and reacts to changes.
export type PermissionsPort = {
  requestOrigins: (patterns: string[]) => Promise<boolean>;
  removeOrigins: (patterns: string[]) => Promise<boolean>;
  grantedOriginPatterns: () => Promise<string[]>;
  onChanged?: (callback: (change: HostPermissionChange) => void) => void;
};

export type HostPermissionChange = {
  type: "added" | "removed";
  origins: string[];
};

export type AuditLogInput = Omit<AuditLog, "id" | "ts"> & { id?: string; ts?: number };

export type AuditPort = {
  add: (log: AuditLogInput) => Promise<void>;
  recent: (options?: { limit?: number; minLevel?: AuditLogLevel }) => Promise<AuditLog[]>;
  clear: () => Promise<void>;
};
