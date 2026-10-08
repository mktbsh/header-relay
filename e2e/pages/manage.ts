import type { Page } from "@playwright/test";

export async function openManagePage(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/manage.html`);
  await page.waitForSelector(".hr-theme");
  return createManagePage(page);
}

function createManagePage(page: Page) {
  return {
    root: () => page.locator(".hr-theme"),
    header: () => page.locator("header"),
    title: () => page.locator(".hr-title").first(),
    sidebar: () => page.locator("aside"),
    mainContent: () => page.getByTestId("manage-content"),

    navItems: () => page.getByTestId("profile-list").locator(".hr-nav-item"),
    navItem: (id: string) => page.getByTestId(`profile-tab-${id}`),
    settingsLink: () => page.getByTestId("settings-link"),

    profileList: () => page.getByTestId("profile-list"),
    profileRows: () => page.getByTestId("profile-list").locator(".hr-profile-item"),
    profileToggle: () => page.locator(".hr-nav-item-active").getByRole("switch"),
    newProfileButton: () =>
      page
        .locator("aside")
        .getByRole("button", { name: /Create profile|プロファイルを作成|프로필 만들기/ }),
    createProfileDialog: () => page.getByRole("dialog"),
    deleteProfileButton: () =>
      page
        .getByTestId("profile-settings")
        .getByRole("button", { name: /Delete profile|プロファイルを削除|프로필 삭제/ }),
    profileNameInput: () => page.getByTestId("manage-content").locator("input.hr-input").first(),

    saveButton: () =>
      page.getByTestId("manage-content").getByRole("button", { name: /^(Save|保存|저장)/ }),
    headerSaveButton: (kind: "fixed" | "capture") =>
      page.getByTestId(`header-section-${kind}`).getByRole("button", { name: /^(Save|保存|저장)/ }),
    reloadButton: () =>
      page.locator("header").getByRole("button", { name: /Reload|再読み込み|새로고침/ }),

    reviewPrompt: () => page.getByTestId("review-prompt"),

    statusTiles: () => page.locator(".hr-card .tabular-nums"),
  };
}

export type ManagePage = ReturnType<typeof createManagePage>;
