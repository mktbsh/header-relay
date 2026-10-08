import { describe, expect, it } from "vitest";

import { AUDIT_MAX_AGE_MS, auditEntriesToPrune, sanitizeAuditUrl } from "./audit-retention";

describe("sanitizeAuditUrl", () => {
  it("keeps origin and pathname but drops query and fragment", () => {
    expect(sanitizeAuditUrl("http://localhost:3000/api/me?token=secret#frag")).toBe(
      "http://localhost:3000/api/me",
    );
  });

  it("passes through undefined and non-URL strings unchanged", () => {
    expect(sanitizeAuditUrl(undefined)).toBeUndefined();
    expect(sanitizeAuditUrl("not a url")).toBe("not a url");
  });
});

describe("auditEntriesToPrune", () => {
  const entry = (id: string, ts: number) => ({ id, ts });

  it("prunes entries beyond the max count, keeping the newest", () => {
    const now = 1_000_000;
    const entries = [entry("a", 1), entry("b", 2), entry("c", 3)];
    expect(auditEntriesToPrune(entries, now, 2, AUDIT_MAX_AGE_MS)).toEqual(["a"]);
  });

  it("prunes entries older than the age window", () => {
    const now = 10 * AUDIT_MAX_AGE_MS;
    const entries = [entry("old", now - AUDIT_MAX_AGE_MS - 1), entry("fresh", now - 1)];
    expect(auditEntriesToPrune(entries, now, 1000)).toEqual(["old"]);
  });

  it("returns nothing when within both limits", () => {
    const now = 10 * AUDIT_MAX_AGE_MS;
    const entries = [entry("a", now - 1), entry("b", now)];
    expect(auditEntriesToPrune(entries, now, 1000)).toEqual([]);
  });
});
