import { expect, test } from "./fixtures";

const routes = [
  { name: "overview", path: "/profiles/profile-local-dev", tab: "overview" },
  { name: "origins", path: "/profiles/profile-local-dev/origins", tab: "origins" },
  { name: "headers", path: "/profiles/profile-local-dev/headers", tab: "headers" },
  { name: "excluded-paths", path: "/profiles/profile-local-dev/excluded-paths", tab: "exclude" },
  { name: "cookies", path: "/profiles/profile-local-dev/cookies", tab: "cookies" },
  { name: "url-probe", path: "/profiles/profile-local-dev/url-probe", tab: "probe" },
  { name: "settings-general", path: "/settings", tab: "general" },
  { name: "settings-audit-logs", path: "/settings/audit-logs", tab: "logs" },
  { name: "settings-json-editor", path: "/settings/json-editor", tab: "json" },
] as const;

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

test("capture manage UI for human review", async ({ context, extensionId }, testInfo) => {
  const page = await context.newPage();

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);

    for (const route of routes) {
      await test.step(`${viewport.name}: ${route.name}`, async () => {
        await page.goto(`chrome-extension://${extensionId}/manage.html#${route.path}`);
        await expect(page.locator(".hr-theme")).toBeVisible();
        const isSettings = route.path.startsWith("/settings");
        await expect(
          page.getByTestId(isSettings ? "settings-link" : "profile-profile-local-dev"),
        ).toHaveClass(/hr-nav-item-active/);
        await expect(
          page.getByTestId(`${isSettings ? "settings" : "profile"}-tab-${route.tab}`),
        ).toHaveClass(/hr-tab-active/);

        await testInfo.attach(`${viewport.name}-${route.name}`, {
          body: await page.screenshot({
            animations: "disabled",
            caret: "hide",
            fullPage: true,
          }),
          contentType: "image/png",
        });
      });
    }
  }
});
