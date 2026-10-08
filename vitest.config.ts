import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "e2e/**",
      "www/**",
      "**/node_modules/**",
      ".claude/**",
      ".worktrees/**",
      ".worktree/**",
    ],
  },
});
