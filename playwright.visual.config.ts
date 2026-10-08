import { defineConfig } from "@playwright/test";

import baseConfig from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  testIgnore: undefined,
  testMatch: "visual-review.spec.ts",
  workers: 1,
  reporter: [["html", { open: "never" }]],
});
