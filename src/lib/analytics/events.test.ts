import { describe, expect, it } from "vitest";

import { manageAnalyticsRouteFromHash } from "./events";

describe("manageAnalyticsRouteFromHash", () => {
  it("maps known hashes to stable logical route names", () => {
    expect(manageAnalyticsRouteFromHash("#/profiles/profile-secret")).toBe("overview");
    expect(manageAnalyticsRouteFromHash("#/profiles/profile-secret/origins")).toBe("origins");
    expect(manageAnalyticsRouteFromHash("#/profiles/profile-secret/headers")).toBe("headers");
    expect(manageAnalyticsRouteFromHash("#/profiles/profile-secret/excluded-paths")).toBe(
      "exclude",
    );
    expect(manageAnalyticsRouteFromHash("#/profiles/profile-secret/cookies")).toBe("cookies");
    expect(manageAnalyticsRouteFromHash("#/profiles/profile-secret/url-probe")).toBe("probe");
    expect(manageAnalyticsRouteFromHash("#/settings/audit-logs")).toBe("advanced_audit_logs");
    expect(manageAnalyticsRouteFromHash("#/settings/json-editor")).toBe("advanced_json_editor");
    expect(manageAnalyticsRouteFromHash("#/settings")).toBe("settings");
    expect(manageAnalyticsRouteFromHash("#/")).toBe("overview");
  });

  it("does not pass Profile IDs or arbitrary hash contents into analytics", () => {
    expect(manageAnalyticsRouteFromHash("#/profiles/private-customer-id/headers")).toBe("headers");
    expect(manageAnalyticsRouteFromHash("#/unknown?token=secret")).toBe("overview");
  });
});
