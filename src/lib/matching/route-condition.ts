import { validateExcludedPathPrefix } from "../domain/excluded-path";
import type { ExcludedPath, Profile, TargetOrigin } from "../domain/types";

export type TargetRouteEvaluation = {
  targetOrigin?: TargetOrigin;
  matchedExcludedPath?: ExcludedPath;
  excluded: boolean;
  allowed: boolean;
};

const REGEX_SPECIAL_CHARS = /[|\\{}()[\]^$+*?.]/g;

export const normalizeOrigin = (origin: string): string => new URL(origin).origin;

// Target Origins only cover web pages, so other schemes (chrome:, file:, ...) yield nothing.
export const httpOriginOf = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : undefined;
  } catch {
    return undefined;
  }
};

export const getUrlParts = (url: string): { origin: string; path: string } | undefined => {
  try {
    const parsed = new URL(url);
    return { origin: parsed.origin, path: parsed.pathname };
  } catch {
    return undefined;
  }
};

const escapeRegex = (value: string): string => value.replace(REGEX_SPECIAL_CHARS, "\\$&");

// Translate a path glob into a RE2/JS-compatible regex source (no anchors).
// `**` matches across path segments (including `/`), `*` matches within a single
// segment, `?` matches a single non-slash character. Everything else is literal.
// Patterns match the whole path, so `/assets` matches only `/assets` and
// `/assets/**` is needed to also match everything beneath it.
export const globToRegexSource = (glob: string): string => {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]!;
    if (char === "*") {
      if (glob[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegex(char);
    }
  }
  return source;
};

const globRegexCache = new Map<string, RegExp | null>();

export const matchesExcludedGlob = (glob: string, path: string): boolean => {
  let regex = globRegexCache.get(glob);
  if (regex === undefined) {
    try {
      regex = new RegExp(`^${globToRegexSource(glob)}$`);
    } catch {
      regex = null;
    }
    globRegexCache.set(glob, regex);
  }
  return regex?.test(path) ?? false;
};

const evaluateConfiguredTargetRoute = (profile: Profile, url: string): TargetRouteEvaluation => {
  const parts = getUrlParts(url);
  if (!parts) {
    return { allowed: false, excluded: false };
  }

  const targetOrigin = profile.targetOrigins.find(
    (origin) => origin.enabled && normalizeOrigin(origin.origin) === parts.origin,
  );
  // Excluded paths are scoped to target origins; a path match outside any target
  // origin must not mark the URL as excluded.
  const matchedExcludedPath = targetOrigin
    ? profile.excludedPaths.find((path) => {
        if (!path.enabled) return false;
        const validation = validateExcludedPathPrefix(path.pathPrefix);
        return validation.ok && matchesExcludedGlob(validation.value, parts.path);
      })
    : undefined;
  const excluded = Boolean(matchedExcludedPath);

  return {
    targetOrigin,
    matchedExcludedPath,
    excluded,
    allowed: Boolean(targetOrigin) && !excluded,
  };
};

// This is the route match independent of runtime enablement. Popup uses it to
// keep a disabled matching Profile visible so it can be enabled from the tab.
export const matchesTargetRoute = (profile: Profile, url: string): boolean =>
  evaluateConfiguredTargetRoute(profile, url).allowed;

export const evaluateTargetRoute = (profile: Profile, url: string): TargetRouteEvaluation => {
  if (!profile.enabled) {
    return { allowed: false, excluded: false };
  }
  return evaluateConfiguredTargetRoute(profile, url);
};

export const createDnrOriginRegex = (origin: string): string =>
  `^${escapeRegex(normalizeOrigin(origin))}(?:/|$)`;

// The path glob must match the whole pathname, so anchor the end at the path
// boundary (end of URL or the start of a query/fragment) to stay consistent with
// evaluateTargetRoute, which matches against the pathname only.
export const createDnrExcludedPathRegex = (origin: string, pathGlob: string): string =>
  `^${escapeRegex(normalizeOrigin(origin))}${globToRegexSource(pathGlob)}(?:$|[?#])`;
