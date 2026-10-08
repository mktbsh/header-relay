import type { AppConfig, ExcludedPath } from "./types";

export type ExcludedPathValidationError =
  | "required"
  | "must-start-with-slash"
  | "url-not-allowed"
  | "single-line";

export type ExcludedPathValidation =
  | { ok: true; value: string }
  | { ok: false; value: string; error: ExcludedPathValidationError };

const ABSOLUTE_URL = /^[a-z][a-z\d+.-]*:\/\//i;

export const normalizeExcludedPathPrefix = (value: string): string => value.trim();

export const validateExcludedPathPrefix = (value: string): ExcludedPathValidation => {
  const normalized = normalizeExcludedPathPrefix(value);
  if (!normalized) return { ok: false, value: normalized, error: "required" };
  if (value.includes("\n") || value.includes("\r")) {
    return { ok: false, value: normalized, error: "single-line" };
  }
  if (ABSOLUTE_URL.test(normalized)) {
    return { ok: false, value: normalized, error: "url-not-allowed" };
  }
  if (!normalized.startsWith("/")) {
    return { ok: false, value: normalized, error: "must-start-with-slash" };
  }
  return { ok: true, value: normalized };
};

export const isValidExcludedPathPrefix = (value: string): boolean =>
  validateExcludedPathPrefix(value).ok;

export const isExcludedPathRuleValid = (rule: Pick<ExcludedPath, "pathPrefix" | "enabled">) => {
  const normalized = normalizeExcludedPathPrefix(rule.pathPrefix);
  if (!rule.enabled && !normalized) return true;
  return validateExcludedPathPrefix(rule.pathPrefix).ok;
};

export const hasInvalidExcludedPaths = (config: AppConfig | undefined): boolean =>
  Boolean(
    config?.profiles.some((profile) =>
      profile.excludedPaths.some((path) => !isExcludedPathRuleValid(path)),
    ),
  );

export type StoredConfigNormalization = { config: AppConfig; changed: boolean };

export const normalizeStoredExcludedPaths = (config: AppConfig): StoredConfigNormalization => {
  let changed = false;
  const profiles = config.profiles.map((profile) => ({
    ...profile,
    excludedPaths: profile.excludedPaths.map((path) => {
      const validation = validateExcludedPathPrefix(path.pathPrefix);
      if (validation.ok) {
        if (validation.value === path.pathPrefix) return path;
        changed = true;
        return { ...path, pathPrefix: validation.value };
      }

      if (!path.enabled && validation.error === "required" && path.pathPrefix === "") return path;
      changed = true;
      return { ...path, pathPrefix: "", enabled: false };
    }),
  }));

  return { config: changed ? { ...config, profiles } : config, changed };
};
