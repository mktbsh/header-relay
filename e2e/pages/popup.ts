import type { Page } from "@playwright/test";

export async function openPopupPage(page: Page, extensionId: string, activeTabUrl?: string) {
  if (activeTabUrl) {
    await page.addInitScript((url) => {
      Object.defineProperty(chrome.tabs, "query", {
        configurable: true,
        value: (_queryInfo: unknown, callback?: (tabs: Array<{ url: string }>) => void) => {
          const tabs = [{ url }];
          if (callback) {
            callback(tabs);
            return;
          }
          return Promise.resolve(tabs);
        },
      });
    }, activeTabUrl);
  }
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.waitForSelector(".popup-root");
  return createPopupPage(page);
}

function createPopupPage(page: Page) {
  return {
    root: () => page.locator(".popup-root"),
    title: () => page.getByRole("heading", { level: 1 }),
    settingsButton: () => page.getByRole("button", { name: /Settings|設定|설정/ }),
    profileLinks: () => page.getByTestId(/^popup-profile-/),
    profileToggle: () =>
      page
        .getByTestId(/^popup-profile-/)
        .first()
        .locator("..")
        .getByRole("switch"),
    subtitle: () => page.locator("header .hr-footnote").first(),
    profileRows: () => page.getByTestId(/^popup-profile-/),
    thisPageSection: () =>
      page.locator("section", { hasText: /This Page|このページ|현재 페이지/ }).first(),
  };
}

export type PopupPage = ReturnType<typeof createPopupPage>;
