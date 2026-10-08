import type { AppConfig, Profile } from "../domain/types";

// Chrome match patterns cannot carry a port: the narrowest grant for
// `http://localhost:3000` is `http://localhost/*` (every port on that host).
// This module owns that translation and its consequences (reference counting
// across profiles, coverage checks against granted patterns), so nothing else
// has to know that origins and match patterns are not the same thing.

const SUPPORTED_PROTOCOLS = new Set(["http:", "https:"]);

// Origin string (user config) -> the match pattern to request for it, or
// undefined when the input is unparsable or its scheme cannot be granted.
export const originToMatchPattern = (origin: string): string | undefined => {
  try {
    const url = new URL(origin);
    if (!SUPPORTED_PROTOCOLS.has(url.protocol)) return undefined;
    // url.hostname keeps IPv6 brackets ([::1]) and lowercases names, which is
    // exactly the form Chrome expects in a pattern.
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return undefined;
  }
};

// Does a granted pattern (from permissions.getAll().origins) cover this config
// origin? Handles the patterns Chrome can actually hold after our migration:
// <all_urls>, scheme wildcards, host wildcards and *.domain suffixes. The path
// part is irrelevant for host access and is ignored.
export const patternCoversOrigin = (pattern: string, origin: string): boolean => {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (!SUPPORTED_PROTOCOLS.has(url.protocol)) return false;
  if (pattern === "<all_urls>") return true;

  const match = /^(\*|https?):\/\/(\[[^\]]+\]|[^/:]+)(?::\d+)?(?:\/.*)?$/.exec(pattern);
  if (!match) return false;
  const [, scheme, host] = match as unknown as [string, string, string];

  if (scheme !== "*" && `${scheme}:` !== url.protocol) return false;
  if (host === "*") return true;
  const hostname = url.hostname.toLowerCase();
  const patternHost = host.toLowerCase();
  if (patternHost.startsWith("*.")) {
    const suffix = patternHost.slice(2);
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  }
  return hostname === patternHost;
};

export const isOriginGranted = (grantedPatterns: string[], origin: string): boolean =>
  grantedPatterns.some((pattern) => patternCoversOrigin(pattern, origin));

// Patterns the runtime needs right now: enabled origins of enabled profiles.
export const enabledOriginPatterns = (profiles: Profile[]): string[] => {
  const patterns = new Set<string>();
  for (const profile of profiles) {
    if (!profile.enabled) continue;
    for (const target of profile.targetOrigins) {
      if (!target.enabled) continue;
      const pattern = originToMatchPattern(target.origin);
      if (pattern) patterns.add(pattern);
    }
  }
  return [...patterns];
};

// Patterns referenced anywhere in the config, enabled or not: a disabled origin
// still expresses the user's intent to keep it, so its grant must survive.
const referencedPatterns = (config: AppConfig): Set<string> => {
  const patterns = new Set<string>();
  for (const profile of config.profiles) {
    for (const target of profile.targetOrigins) {
      const pattern = originToMatchPattern(target.origin);
      if (pattern) patterns.add(pattern);
    }
  }
  return patterns;
};

// Patterns the previous config referenced that the next one no longer does —
// the candidates for a confirmed permissions.remove(). Because several origins
// can share one pattern (same host, different ports), this is computed on the
// pattern set, not per removed origin row.
export const orphanedPatterns = (previous: AppConfig, next: AppConfig): string[] => {
  const kept = referencedPatterns(next);
  return [...referencedPatterns(previous)].filter((pattern) => !kept.has(pattern));
};

// Patterns to request for these profiles' enabled origins, ignoring whether the
// profile itself is enabled: granting happens at save/toggle time (a user gesture),
// and a profile enabled later must not silently lack access.
export const missingOriginPatterns = (profiles: Profile[], grantedPatterns: string[]): string[] => {
  const missing = new Set<string>();
  for (const profile of profiles) {
    for (const target of profile.targetOrigins) {
      if (!target.enabled) continue;
      const pattern = originToMatchPattern(target.origin);
      if (pattern && !isOriginGranted(grantedPatterns, target.origin)) missing.add(pattern);
    }
  }
  return [...missing];
};

// Enabled origins (of enabled profiles) that no granted pattern covers — what
// the popup warns about and what a save must request.
export const originsMissingAccess = (profiles: Profile[], grantedPatterns: string[]): string[] => {
  const missing = new Set<string>();
  for (const profile of profiles) {
    if (!profile.enabled) continue;
    for (const target of profile.targetOrigins) {
      if (!target.enabled) continue;
      if (originToMatchPattern(target.origin) === undefined) continue;
      if (!isOriginGranted(grantedPatterns, target.origin)) missing.add(target.origin);
    }
  }
  return [...missing];
};
