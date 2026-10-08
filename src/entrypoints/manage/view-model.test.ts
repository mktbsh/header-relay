import { describe, expect, it } from "vitest";

import { compileConfig, probeUrl } from "../../lib/compiler/compile-config";
import type { AuditLog, Profile } from "../../lib/domain/types";
import {
  createAuditLogView,
  createProbeProfileView,
  createProbeSummaryView,
  reconcileAuditLogsById,
  reconcileExpandedAuditLogIds,
  shouldRefreshRuntimeForVisibility,
  testExcludedPathUrl,
  updateExpandedAuditLogIds,
  validateProbeUrlInput,
  validateProfileNameInput,
} from "./view-model";

const probeProfile = (id: string, headerName: string): Profile => ({
  id,
  name: id,
  enabled: true,
  targetOrigins: [{ id: `${id}-origin`, origin: "https://example.test", enabled: true }],
  fixedHeaders: [{ id: `${id}-fixed`, name: headerName, value: "v", enabled: true }],
  captureHeaders: [],
  excludedPaths: [],
  fixedCookies: [],
  trackedCookies: [],
  migrationIssues: [],
  createdAt: 1,
  updatedAt: 1,
});

describe("manage view model", () => {
  it("trims and accepts a non-empty profile name", () => {
    expect(validateProfileNameInput("  Dev API  ")).toEqual({
      ok: true,
      value: "Dev API",
    });
  });

  it("rejects a blank profile name before saving it to config", () => {
    expect(validateProfileNameInput("   ")).toEqual({
      ok: false,
      error: "Profile name is required.",
    });
  });

  it("rejects normalized duplicate names while allowing the current Profile name", () => {
    const profiles = [
      { id: "a", name: "Local API" },
      { id: "b", name: "Production" },
    ];

    expect(validateProfileNameInput("ＬＯＣＡＬ　ＡＰＩ", profiles)).toEqual({
      ok: false,
      error: "A profile with this name already exists.",
    });
    expect(validateProfileNameInput(" local api ", profiles, "a")).toEqual({
      ok: true,
      value: "local api",
    });
  });

  it("builds a compact audit summary plus expandable details", () => {
    const log: AuditLog = {
      id: "log-1",
      ts: Date.UTC(2026, 5, 29, 0, 0, 0),
      level: "info",
      event: "headers_captured",
      profileId: "profile-local",
      tabId: 42,
      requestId: "request-abc",
      url: "https://example.test/api/really/long/path?with=query&and=values",
      method: "GET",
      statusCode: 200,
      headerNames: ["x-auth-token", "x-refresh-token"],
      message: "Captured response header(s).",
      data: { nested: { ok: true } },
    };

    const view = createAuditLogView(log);

    expect(view.summaryMeta).toEqual(["GET", "200"]);
    expect(view.fullUrl).toBe(log.url);
    expect(view.identityRows).toEqual([
      ["Profile", "profile-local"],
      ["Tab", "42"],
      ["Request", "request-abc"],
    ]);
    expect(view.headerNames).toBe("x-auth-token, x-refresh-token");
    expect(view.dataJson).toBe(JSON.stringify(log.data, null, 2));
  });

  it("summarizes a probe across every matched profile", () => {
    const compiled = compileConfig([
      probeProfile("profile-a", "x-app-platform"),
      probeProfile("profile-b", "x-env"),
    ]);
    const result = probeUrl(compiled, "https://example.test/api/me");

    expect(createProbeSummaryView(result)).toEqual([
      {
        label: "Tested URL",
        value: "https://example.test/api/me",
        description: "The normalized URL evaluated from this draft.",
      },
      {
        label: "Allowed",
        value: "yes",
        description: "Yes means at least one enabled profile attaches a header to this URL.",
      },
      {
        label: "Matched profiles",
        value: "2",
        description: "Enabled profiles whose target origin matches this URL.",
      },
      {
        label: "Effective headers",
        value: "x-app-platform, x-env",
        description:
          "Header names actually attached to the request after excluded paths and conflicts.",
      },
      {
        label: "Cookie header",
        value: "none (Chrome's original passes through)",
        description:
          "The final Cookie header value sent to the target URL, or `none` when Chrome's original Cookie passes through unchanged.",
      },
    ]);
  });

  it("renders an excluded match without its headers", () => {
    const excluded: Profile = {
      ...probeProfile("profile-a", "x-app-platform"),
      excludedPaths: [{ id: "exclude-api", pathPrefix: "/api/**", enabled: true }],
    };
    const result = probeUrl(compileConfig([excluded]), "https://example.test/api/me");

    expect(createProbeProfileView(result.matches[0]!)).toEqual({
      origin: "https://example.test",
      excluded: true,
      statusLabel: "Excluded: /api/**",
      headerNames: "-",
    });
  });

  it("skips runtime polling while the page is hidden", () => {
    expect(shouldRefreshRuntimeForVisibility("visible")).toBe(true);
    expect(shouldRefreshRuntimeForVisibility("hidden")).toBe(false);
  });

  it("normalizes and validates probe URLs", () => {
    expect(validateProbeUrlInput("  https://example.test/api  ")).toEqual({
      ok: true,
      value: "https://example.test/api",
    });
    expect(validateProbeUrlInput("not a url")).toEqual({
      ok: false,
      error: "Enter a valid absolute URL.",
    });
  });

  it("tests excluded paths against an unsaved profile", () => {
    const result = testExcludedPathUrl(
      {
        id: "profile-test",
        name: "Test",
        enabled: true,
        targetOrigins: [{ id: "origin", origin: "https://example.test", enabled: true }],
        fixedHeaders: [],
        captureHeaders: [],
        excludedPaths: [{ id: "exclude", pathPrefix: "/assets/**", enabled: true }],
        fixedCookies: [],
        trackedCookies: [],
        migrationIssues: [],
        createdAt: 1,
        updatedAt: 1,
      },
      "https://example.test/assets/app.js?cache=1#logo",
    );
    expect(result).toMatchObject({
      ok: true,
      excluded: true,
      matchedPath: "/assets/**",
    });
  });

  it("keeps audit expansion by stable id and drops missing ids", () => {
    const expanded = updateExpandedAuditLogIds(new Set<string>(), "log-1", true);
    expect([...expanded]).toEqual(["log-1"]);
    expect([...reconcileExpandedAuditLogIds(expanded, [{ id: "log-2" } as AuditLog])]).toEqual([]);
  });

  it("reuses audit log objects by id so polling does not recreate expanded DOM rows", () => {
    const existing = { id: "log-1", event: "error" } as AuditLog;
    const incoming = { ...existing };
    const reconciled = reconcileAuditLogsById([existing], [incoming]);
    expect(reconciled[0]).toBe(existing);
  });
});
