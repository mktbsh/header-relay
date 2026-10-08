import { openDB, type IDBPDatabase } from "idb";

import { isAtOrAboveLevel } from "../domain/audit-level";
import type { AuditLog } from "../domain/types";
import type { AuditLogInput, AuditPort, StorageItem } from "../ports";
import { auditEntriesToPrune, sanitizeAuditUrl } from "./audit-retention";

export const AUDIT_DB_NAME = "header-relay";
// v2 recreates the store: v1 persisted request URLs, and dropping the whole store is
// the only way to guarantee no URL survives the upgrade (see issue #55).
export const AUDIT_DB_VERSION = 2;
export const AUDIT_STORE_NAME = "audit_logs";

// What actually reaches IndexedDB: never a URL. Request URLs stay in the
// session-scoped cache below so they vanish when the browser closes.
type PersistedAuditLog = Omit<AuditLog, "url">;

const getDb = () =>
  openDB(AUDIT_DB_NAME, AUDIT_DB_VERSION, {
    upgrade(db) {
      if (db.objectStoreNames.contains(AUDIT_STORE_NAME)) {
        db.deleteObjectStore(AUDIT_STORE_NAME);
      }
      const store = db.createObjectStore(AUDIT_STORE_NAME, { keyPath: "id" });
      store.createIndex("by_ts", "ts");
      store.createIndex("by_level", "level");
      store.createIndex("by_event", "event");
      store.createIndex("by_profileId", "profileId");
      store.createIndex("by_requestId", "requestId");
    },
  });

// Enforce retention after each write. Full scan per add is fine for the low
// write volume of a local dev tool.
// ponytail: O(n) per add; switch to incremental pruning if volume ever grows.
const pruneRetention = async (db: IDBPDatabase): Promise<string[]> => {
  const entries = await db.getAllFromIndex(AUDIT_STORE_NAME, "by_ts"); // oldest-first
  const toPrune = auditEntriesToPrune(entries, Date.now());
  if (toPrune.length === 0) return [];

  const tx = db.transaction(AUDIT_STORE_NAME, "readwrite");
  await Promise.all([...toPrune.map((id) => tx.store.delete(id)), tx.done]);
  return toPrune;
};

export type AuditDbDependencies = {
  // log id -> sanitized URL, session-scoped (`session:` storage area): kept only for
  // display while the browser runs, never written to disk.
  urls: StorageItem<Record<string, string>>;
};

// The IndexedDB adapter for AuditPort. Retention and URL sanitization live in
// audit-retention.ts so the in-memory adapter shares the same policy.
export const createAuditDb = ({ urls }: AuditDbDependencies): AuditPort => ({
  async add(log: AuditLogInput): Promise<void> {
    const db = await getDb();
    const { url, ...rest } = log;
    const persisted: PersistedAuditLog = {
      ...rest,
      id: log.id ?? crypto.randomUUID(),
      ts: log.ts ?? Date.now(),
    };
    await db.add(AUDIT_STORE_NAME, persisted);
    const pruned = await pruneRetention(db);

    const sanitized = sanitizeAuditUrl(url);
    if (sanitized !== undefined || pruned.length > 0) {
      const cache = { ...(await urls.getValue()) };
      for (const id of pruned) delete cache[id];
      if (sanitized !== undefined) cache[persisted.id] = sanitized;
      await urls.setValue(cache);
    }
  },

  async recent({ limit = 200, minLevel = "debug" } = {}): Promise<AuditLog[]> {
    const db = await getDb();
    const cache = await urls.getValue();
    const tx = db.transaction(AUDIT_STORE_NAME, "readonly");
    const index = tx.store.index("by_ts");
    const result: AuditLog[] = [];
    let cursor = await index.openCursor(null, "prev");

    while (cursor && result.length < limit) {
      const persisted = cursor.value as PersistedAuditLog;
      if (isAtOrAboveLevel(persisted.level, minLevel)) {
        const url = cache[persisted.id];
        result.push(url === undefined ? persisted : { ...persisted, url });
      }
      cursor = await cursor.continue();
    }

    return result;
  },

  async clear(): Promise<void> {
    const db = await getDb();
    await db.clear(AUDIT_STORE_NAME);
    await urls.setValue({});
  },
});
