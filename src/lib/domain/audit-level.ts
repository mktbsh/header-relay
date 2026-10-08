export const AUDIT_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type AuditLogLevel = (typeof AUDIT_LOG_LEVELS)[number];

export const parseAuditLogLevel = (value: unknown): AuditLogLevel =>
  AUDIT_LOG_LEVELS.find((level) => level === value) ?? "debug";

export const isAtOrAboveLevel = (level: AuditLogLevel, minLevel: AuditLogLevel): boolean =>
  AUDIT_LOG_LEVELS.indexOf(level) >= AUDIT_LOG_LEVELS.indexOf(minLevel);
