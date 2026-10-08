export const AUDIT_MAX_ENTRIES = 1000;
export const AUDIT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Audit logs persist in IndexedDB, so URLs are stored as origin + pathname only.
// Query strings and fragments are dropped to avoid retaining tokens or other
// secrets that commonly appear in dev URLs.
export const sanitizeAuditUrl = (url: string | undefined): string | undefined => {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
};

// Decide which audit entries to delete to satisfy retention. `entries` must be
// sorted oldest-first by ts. An entry is pruned when it is older than the age
// window or falls outside the newest `maxEntries`.
export const auditEntriesToPrune = (
  entries: { id: string; ts: number }[],
  now: number,
  maxEntries = AUDIT_MAX_ENTRIES,
  maxAgeMs = AUDIT_MAX_AGE_MS,
): string[] => {
  const cutoff = now - maxAgeMs;
  const overflow = Math.max(0, entries.length - maxEntries);
  const ids = new Set<string>();

  entries.forEach((entry, index) => {
    if (entry.ts < cutoff || index < overflow) ids.add(entry.id);
  });

  return [...ids];
};
