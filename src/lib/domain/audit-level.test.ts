import { describe, expect, it } from "vitest";

import { AUDIT_LOG_LEVELS, isAtOrAboveLevel, parseAuditLogLevel } from "./audit-level";

describe("audit log levels", () => {
  it("defines one severity order for filtering", () => {
    expect(AUDIT_LOG_LEVELS).toEqual(["debug", "info", "warn", "error"]);
    expect(AUDIT_LOG_LEVELS.filter((level) => isAtOrAboveLevel(level, "warn"))).toEqual([
      "warn",
      "error",
    ]);
  });

  it("treats an unknown minimum from another extension context as all levels", () => {
    expect(parseAuditLogLevel("unknown")).toBe("debug");
  });
});
