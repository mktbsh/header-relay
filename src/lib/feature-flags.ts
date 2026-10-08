export type FeatureFlags = Readonly<{
  analyticsTracking: boolean;
}>;

export const resolveFeatureFlags = (environment: { PROD: boolean }): FeatureFlags => ({
  // Tracking is a development diagnostic until the GA4 privacy and release gates are met.
  analyticsTracking: environment.PROD === false,
});

// Vite replaces import.meta.env.PROD at build time. Callers share this immutable result
// instead of interpreting build modes independently.
export const featureFlags = resolveFeatureFlags({ PROD: import.meta.env.PROD });
