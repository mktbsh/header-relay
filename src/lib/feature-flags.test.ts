import { describe, expect, it } from "vitest";

import { featureFlags, resolveFeatureFlags } from "./feature-flags";

describe("feature flags", () => {
  it("enables analytics tracking in development", () => {
    expect(resolveFeatureFlags({ PROD: false })).toEqual({ analyticsTracking: true });
    expect(featureFlags.analyticsTracking).toBe(true);
  });

  it("disables analytics tracking in production", () => {
    expect(resolveFeatureFlags({ PROD: true })).toEqual({ analyticsTracking: false });
  });
});
