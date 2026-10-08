// Installs the full IndexedDB global surface (IDBRequest etc.) that idb expects;
// each test still gets a fresh factory in beforeEach.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryStorage } from "../testing/memory-ports";
import { AUDIT_DB_NAME, AUDIT_DB_VERSION, AUDIT_STORE_NAME, createAuditDb } from "./audit-db";

const createDb = () => {
  const storage = createMemoryStorage();
  const urls = storage.defineItem<Record<string, string>>("session:audit-log-urls", {
    fallback: {},
  });
  return { audit: createAuditDb({ urls }), urls };
};

// Reads what is actually on "disk", bypassing the adapter's recent() merge.
const persistedRecords = async (): Promise<unknown[]> => {
  const db = await openDB(AUDIT_DB_NAME, AUDIT_DB_VERSION);
  const records = await db.getAll(AUDIT_STORE_NAME);
  db.close();
  return records;
};

describe("audit-db", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it("never persists a URL: IndexedDB records carry no url/origin/pathname", async () => {
    const { audit } = createDb();

    await audit.add({
      level: "debug",
      event: "origin_matched",
      profileId: "profile-a",
      url: "http://localhost:3000/api/me?token=secret#frag",
      method: "GET",
      statusCode: 200,
      message: "Matched target origin: http://localhost:3000",
    });

    const records = await persistedRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).not.toHaveProperty("url");
    // The origin may legitimately appear in message (it is user config, not history),
    // but the visited path must never reach disk in any field.
    expect(JSON.stringify(records)).not.toContain("/api/me");
    expect(JSON.stringify(records)).not.toContain("secret");
  });

  it("merges the session-scoped URL back into recent(), query and fragment stripped", async () => {
    const { audit } = createDb();

    await audit.add({
      level: "debug",
      event: "origin_matched",
      url: "http://localhost:3000/api/me?token=secret#frag",
    });
    await audit.add({ level: "debug", event: "dnr_rules_synced" });

    const logs = await audit.recent();
    expect(logs).toHaveLength(2);
    const matched = logs.find((log) => log.event === "origin_matched");
    expect(matched?.url).toBe("http://localhost:3000/api/me");
    expect(logs.find((log) => log.event === "dnr_rules_synced")?.url).toBeUndefined();
  });

  it("filters by minimum level before applying the recent limit", async () => {
    const { audit } = createDb();
    const now = Date.now();

    await audit.add({ level: "error", event: "error", ts: now - 202 });
    for (let offset = 201; offset >= 0; offset -= 1) {
      await audit.add({ level: "info", event: "config_compiled", ts: now - offset });
    }

    const recent = await audit.recent({ limit: 200 });
    expect(recent).toHaveLength(200);
    expect(recent.some((log) => log.level === "error")).toBe(false);
    expect(await audit.recent({ limit: 200, minLevel: "info" })).toHaveLength(200);
    expect(await audit.recent({ limit: 200, minLevel: "error" })).toMatchObject([
      { level: "error", event: "error" },
    ]);
  });

  it("returns matching levels newest-first up to the requested limit", async () => {
    const { audit } = createDb();
    const now = Date.now();

    await audit.add({ level: "debug", event: "origin_matched", ts: now - 4 });
    await audit.add({ level: "warn", event: "cookie_parse_failed", ts: now - 3 });
    await audit.add({ level: "error", event: "error", ts: now - 2 });
    await audit.add({ level: "warn", event: "cookie_parse_failed", ts: now - 1 });

    expect((await audit.recent({ minLevel: "warn" })).map((log) => log.level)).toEqual([
      "warn",
      "error",
      "warn",
    ]);
    expect((await audit.recent({ limit: 2, minLevel: "warn" })).map((log) => log.level)).toEqual([
      "warn",
      "error",
    ]);
    expect((await audit.recent({ minLevel: "error" })).map((log) => log.level)).toEqual(["error"]);
  });

  it("clear() also drops the ephemeral URL cache", async () => {
    const { audit, urls } = createDb();

    await audit.add({ level: "debug", event: "origin_matched", url: "http://localhost:3000/a" });
    await audit.clear();

    expect(await audit.recent()).toEqual([]);
    expect(await urls.getValue()).toEqual({});
  });

  it("drops v1 entries (which contained URLs) on upgrade by recreating the store", async () => {
    const v1 = await openDB(AUDIT_DB_NAME, 1, {
      upgrade(db) {
        const store = db.createObjectStore(AUDIT_STORE_NAME, { keyPath: "id" });
        store.createIndex("by_ts", "ts");
      },
    });
    await v1.add(AUDIT_STORE_NAME, {
      id: "legacy-1",
      ts: Date.now(),
      level: "debug",
      event: "origin_matched",
      url: "http://legacy.example.com/private/path",
    });
    v1.close();

    const { audit } = createDb();
    expect(await audit.recent()).toEqual([]);
    expect(JSON.stringify(await persistedRecords())).not.toContain("legacy.example.com");
  });
});
