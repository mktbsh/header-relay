import { test, expect } from "./fixtures";
import { openPopupPage } from "./pages/popup";

test("popup loads without crash", async ({ context, extensionId }) => {
  const page = await context.newPage();
  const popup = await openPopupPage(page, extensionId);
  await expect(popup.title()).toHaveText("Header Relay");
});

test("popup keeps its content below the height threshold in a wide frame", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 800, height: 619 });
  const popup = await openPopupPage(page, extensionId);

  await expect(popup.root()).toHaveCSS("max-height", "599px");
  await expect(popup.root()).toHaveCSS("overflow-y", "auto");
});

test("popup scrolls content that exceeds the Chromium height threshold", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const popup = await openPopupPage(page, extensionId, "http://localhost:3000/dashboard");
  const metrics = await popup.root().evaluate((root) => {
    const marker = document.createElement("div");
    marker.style.height = "700px";
    root.append(marker);
    const result = {
      clientHeight: root.clientHeight,
      scrollHeight: root.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight,
    };
    marker.remove();
    return result;
  });

  expect(metrics.clientHeight).toBeLessThanOrEqual(599);
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(metrics.bodyScrollHeight).toBeLessThanOrEqual(599);
});

// The popup reads the active tab's URL through host permissions, with no "tabs"
// permission. If that ever stops being allowed, this section is where it shows up.
test("popup resolves the current tab without a permission error", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const popup = await openPopupPage(page, extensionId, "http://localhost:3000/dashboard");

  await expect(popup.root().getByRole("alert")).toHaveCount(0);
  await expect(popup.thisPageSection()).toBeVisible();
});

test("popup Settings opens the Settings route", async ({ context, extensionId }) => {
  const page = await context.newPage();
  const popup = await openPopupPage(page, extensionId);
  const managePagePromise = context.waitForEvent("page");
  await popup.settingsButton().click();
  const managePage = await managePagePromise;
  await managePage.waitForLoadState();
  await expect(managePage).toHaveURL(
    new RegExp(`chrome-extension://${extensionId}/manage\\.html#/settings$`),
  );
});

test("popup Profile names open that Profile overview", async ({ context, extensionId }) => {
  const page = await context.newPage();
  const popup = await openPopupPage(page, extensionId, "http://localhost:3000/dashboard");
  const managePagePromise = context.waitForEvent("page");
  await popup.profileLinks().first().click();
  const managePage = await managePagePromise;
  await managePage.waitForLoadState();
  await expect(managePage).toHaveURL(
    new RegExp(`chrome-extension://${extensionId}/manage\\.html#/profiles/profile-local-dev$`),
  );
});

test("popup keeps the Profile toggle separate from its Manage link", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const popup = await openPopupPage(page, extensionId, "http://localhost:3000/dashboard");

  await expect(popup.profileRows()).toHaveCount(1);
  await expect(popup.profileLinks().first()).toHaveAttribute("target", "_blank");
  await expect(popup.profileToggle()).toBeVisible();
});

test("popup adds an unmatched site to a Profile as an unsaved Target Origin", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const popup = await openPopupPage(page, extensionId, "https://app.example.test/dashboard?x=1");
  const addLink = popup.root().getByRole("link", { name: /: Local Development$/ });
  await expect(addLink).toHaveAttribute("target", "_blank");

  const managePagePromise = context.waitForEvent("page");
  await addLink.click();
  const managePage = await managePagePromise;
  await managePage.waitForLoadState();
  await expect(managePage).toHaveURL(
    new RegExp(`manage\\.html#/profiles/profile-local-dev/origins$`),
  );
  const content = managePage.getByTestId("manage-content");
  await expect(content.locator("input.hr-input").last()).toHaveValue("https://app.example.test");
  await expect(content.getByRole("button", { name: /^(Save|保存|저장)/ }).first()).toBeEnabled();
});

test("popup explains unsupported pages without offering to add them", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const popup = await openPopupPage(page, extensionId, "chrome://extensions");

  await expect(popup.root()).toContainText(/http and https|http と https|http 및 https/);
  await expect(popup.root().getByRole("link")).toHaveCount(0);
});
