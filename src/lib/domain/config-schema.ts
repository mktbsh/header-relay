import { z } from "zod";

import {
  cookieNameErrorMessage,
  cookieValueErrorMessage,
  validateCookieName,
  validateCookieValue,
} from "./cookie-policy";
import { CONFIG_SCHEMA_VERSION } from "./default-profile";
import { normalizeExcludedPathPrefix, validateExcludedPathPrefix } from "./excluded-path";
import { classifyHeaderName, normalizeHeaderName } from "./header-policy";
import { normalizeProfileName, profileNameKey } from "./profile-name";
import type { AppConfig } from "./types";
// RFC 7230 token characters, lowercase only (names are normalized to lowercase).
const HEADER_TOKEN = /^[!#$%&'*+.^_`|~0-9a-z-]+$/;

const validateHeaderName = (value: string): string | undefined => {
  const normalized = normalizeHeaderName(value);
  if (!normalized) return "header name is required when the header is enabled";
  if (!HEADER_TOKEN.test(normalized)) return "header name must be a valid HTTP token";
  // Cookie is not blocked in header-policy (it is "sensitive"), but the specialized
  // Cookie feature owns it now — refuse it from the generic header lists on both
  // FixedHeader and CaptureHeader (spec FR-02, AC-25).
  if (normalized === "cookie") {
    return `header name "cookie" is managed by the dedicated Cookie feature; add it under Cookies instead`;
  }
  if (classifyHeaderName(normalized).level === "blocked") {
    return `header name "${normalized}" is not allowed because its semantics are managed by the browser or HTTP transport`;
  }
  return undefined;
};

const isOriginOnly = (value: string): boolean => {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
};

const targetOriginSchema = z.object({
  id: z.string().min(1),
  origin: z.string().url().refine(isOriginOnly, {
    message: "target origin must be an origin without path, query, or trailing slash",
  }),
  enabled: z.boolean(),
});

const validateOptionalHeaderName = (value: string, enabled: boolean, ctx: z.RefinementCtx) => {
  if (!enabled && !value.trim()) return;
  const error = validateHeaderName(value);
  if (error) ctx.addIssue({ code: "custom", message: error, path: ["name"] });
};

const fixedHeaderValueOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string(),
});

// Only "select" constrains the value, so only "select" needs options to be present and
// unambiguous. A stale current value outside the options is not an error here: the popup
// shows it as-is so the user can pick their way back to a valid one.
const fixedHeaderPopupSchema = z
  .object({
    visible: z.boolean(),
    input: z.enum(["text", "select"]),
    options: z.array(fixedHeaderValueOptionSchema).optional(),
  })
  .superRefine((popup, ctx) => {
    if (popup.input !== "select") return;
    const options = popup.options ?? [];
    if (options.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "select input requires at least one option",
        path: ["options"],
      });
    }
    const values = options.map((option) => option.value);
    if (new Set(values).size !== values.length) {
      ctx.addIssue({ code: "custom", message: "duplicate option value", path: ["options"] });
    }
  });

const fixedHeaderSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    // Values are stored verbatim: surrounding whitespace can be meaningful in a header
    // value, and normalizing it here would silently change what the browser sends.
    value: z.string(),
    enabled: z.boolean(),
    popup: fixedHeaderPopupSchema.optional(),
  })
  .superRefine((header, ctx) => validateOptionalHeaderName(header.name, header.enabled, ctx))
  .transform((header) => ({ ...header, name: normalizeHeaderName(header.name) }));

const captureHeaderSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    enabled: z.boolean(),
  })
  .superRefine((header, ctx) => validateOptionalHeaderName(header.name, header.enabled, ctx))
  .transform((header) => ({ ...header, name: normalizeHeaderName(header.name) }));

const excludedPathSchema = z
  .object({
    id: z.string().min(1),
    pathPrefix: z.string(),
    enabled: z.boolean(),
  })
  .superRefine((path, ctx) => {
    const normalized = normalizeExcludedPathPrefix(path.pathPrefix);
    if (!path.enabled && !normalized) return;
    const validation = validateExcludedPathPrefix(path.pathPrefix);
    if (!validation.ok) {
      const message =
        validation.error === "required"
          ? "excluded path is required when the rule is enabled"
          : validation.error === "must-start-with-slash"
            ? "excluded path must start with /"
            : validation.error === "url-not-allowed"
              ? "excluded path must be a path prefix, not a full URL"
              : "excluded path must be a single line";
      ctx.addIssue({ code: "custom", message, path: ["pathPrefix"] });
    }
  })
  .transform((path) => ({ ...path, pathPrefix: normalizeExcludedPathPrefix(path.pathPrefix) }));

const hasUniqueNames = (headers: { name: string }[]): boolean => {
  const names = headers.map((header) => header.name).filter(Boolean);
  return new Set(names).size === names.length;
};

const validateOptionalCookieName = (value: string, enabled: boolean, ctx: z.RefinementCtx) => {
  if (!enabled && !value.trim()) return;
  const check = validateCookieName(value);
  if (!check.ok) {
    ctx.addIssue({ code: "custom", message: cookieNameErrorMessage(check.error), path: ["name"] });
  }
};

const validateFixedCookieValue = (value: string, enabled: boolean, ctx: z.RefinementCtx) => {
  if (!enabled && !value) return;
  const check = validateCookieValue(value);
  if (!check.ok) {
    ctx.addIssue({
      code: "custom",
      message: cookieValueErrorMessage(check.error),
      path: ["value"],
    });
  }
};

const fixedCookieSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    value: z.string(),
    enabled: z.boolean(),
    popup: fixedHeaderPopupSchema.optional(),
  })
  .superRefine((cookie, ctx) => {
    validateOptionalCookieName(cookie.name, cookie.enabled, ctx);
    validateFixedCookieValue(cookie.value, cookie.enabled, ctx);
  });

const trackedCookieSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    enabled: z.boolean(),
  })
  .superRefine((cookie, ctx) => validateOptionalCookieName(cookie.name, cookie.enabled, ctx));

const migrationIssueSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["fixed-header-cookie", "capture-header-cookie"]),
  originalName: z.string(),
  originalValue: z.string().optional(),
  originalPopup: fixedHeaderPopupSchema.optional(),
  originalEnabled: z.boolean(),
  reason: z.enum([
    "cookie-parse-failed",
    "duplicate-cookie-name",
    "popup-select-options-mismatch",
    "capture-cookie-not-convertible",
  ]),
});

const profileSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().transform(normalizeProfileName).pipe(z.string().min(1)),
    enabled: z.boolean(),
    targetOrigins: z.array(targetOriginSchema),
    fixedHeaders: z.array(fixedHeaderSchema),
    captureHeaders: z.array(captureHeaderSchema),
    excludedPaths: z.array(excludedPathSchema),
    // Cookie arrays default so v4→v5 migration only has to add them when converting
    // Fixed Header Cookie; existing schema-valid clients keep working.
    fixedCookies: z.array(fixedCookieSchema).default([]),
    trackedCookies: z.array(trackedCookieSchema).default([]),
    migrationIssues: z.array(migrationIssueSchema).default([]),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  // Names are normalized by headerNameSchema, so duplicates are compared post-normalization.
  // fixed/capture name collisions across the two lists are allowed; core.ts resolves them
  // by preferring the fixed header (see README "Header Flow").
  .refine((profile) => hasUniqueNames(profile.fixedHeaders), {
    message: "duplicate fixed header name within profile",
    path: ["fixedHeaders"],
  })
  .refine((profile) => hasUniqueNames(profile.captureHeaders), {
    message: "duplicate captured header name within profile",
    path: ["captureHeaders"],
  })
  // Cookie names are case-sensitive, so duplicates are compared verbatim.
  // Fixed vs Tracked collision within the same profile is allowed (FR-10: fixed wins).
  .refine((profile) => hasUniqueNames(profile.fixedCookies), {
    message: "duplicate fixed cookie name within profile",
    path: ["fixedCookies"],
  })
  .refine((profile) => hasUniqueNames(profile.trackedCookies), {
    message: "duplicate tracked cookie name within profile",
    path: ["trackedCookies"],
  });

export const appConfigSchema = z
  .object({
    schemaVersion: z.literal(CONFIG_SCHEMA_VERSION),
    uiDensity: z.enum(["comfortable", "compact"]).optional(),
    profiles: z.array(profileSchema).min(1),
  })
  .superRefine((config, ctx) => {
    const names = new Set<string>();
    for (const [index, profile] of config.profiles.entries()) {
      const key = profileNameKey(profile.name);
      if (names.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: "duplicate profile name",
          path: ["profiles", index, "name"],
        });
      }
      names.add(key);
    }
  });

export const parseAppConfig = (input: unknown): AppConfig => {
  const result = appConfigSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid app config: ${result.error.issues
        .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return result.data as AppConfig;
};
