import { defineConfig } from "@playwright/test";

import baseConfig from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  testIgnore: undefined,
  testMatch: "store-assets.spec.ts",
  workers: 1,
  reporter: [["list"]],
  use: {
    ...baseConfig.use,
    viewport: { width: 1280, height: 800 },
  },
});
