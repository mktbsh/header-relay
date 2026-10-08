import type { Page } from "@playwright/test";

import type { AuditLog } from "../src/lib/domain/types";
import { expect, test } from "./fixtures";
import { openManagePage } from "./pages/manage";
import { openPopupPage } from "./pages/popup";

type AuditLogSeed = Pick<AuditLog, "id" | "ts" | "level" | "event">;

const replaceAuditLogs = async (page: Page, logs: AuditLogSeed[]) => {
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await indexedDB.databases()).some((database) => database.name === "header-relay"),
      ),
    )
    .toBe(true);
  await page.evaluate((logs) => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("header-relay", 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("audit_logs", "readwrite");
        const store = transaction.objectStore("audit_logs");
        store.clear();
        for (const log of logs) store.put(log);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      };
    });
  }, logs);
};

test("manage page loads without crash", async ({ context, extensionId }) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);
  await expect(manage.title()).toHaveText("Header Relay");
  await expect(manage.header().getByRole("switch")).toHaveCount(0);
  await expect(page).toHaveURL(/manage\.html#\/profiles\/profile-local-dev$/);
});

test("sidebar navigation items are visible", async ({ context, extensionId }) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);
  await expect(manage.sidebar()).toBeVisible();
  await expect(manage.navItems()).toHaveCount(1);
  await expect(manage.mainContent().locator(".hr-tab")).toHaveCount(6);
  await expect(manage.settingsLink()).toHaveAccessibleName(/Settings|設定|설정/);
  const homepage = manage.sidebar().getByRole("link", { name: /Homepage|ホームページ|홈페이지/ });
  await expect(homepage).toHaveAttribute("target", "_blank");
  const buyMeACoffee = manage.sidebar().getByRole("link", { name: "Buy Me a Coffee" });
  await expect(buyMeACoffee).toHaveAttribute("href", "https://buymeacoffee.com/hsb_horse");
  await expect(buyMeACoffee).toHaveAttribute("target", "_blank");
  const review = page.getByTestId("sidebar-review-link");
  await expect(review).toHaveAttribute(
    "href",
    "https://chromewebstore.google.com/detail/olmfkdclaloaacojbgaabokehlbphilf/reviews",
  );
  await expect(review).toHaveAttribute("target", "_blank");
  // The installation id is read from storage, so the href arrives a tick after paint.
  await expect(page.getByTestId("sidebar-feedback-link")).toHaveAttribute(
    "href",
    /^https:\/\/tally\.so\/r\/VLBgdj\?version=[\d.]+&c=[0-9a-f-]{36}&ref=int-bottom-nav$/,
  );
});

test("the review prompt stays hidden after later is chosen", async ({ context, extensionId }) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);
  await expect(manage.reviewPrompt()).toBeVisible();
  await page.getByTestId("review-prompt-later").click();
  await expect(manage.reviewPrompt()).toHaveCount(0);

  await page.reload();
  await page.waitForSelector(".hr-theme");
  await expect(manage.reviewPrompt()).toHaveCount(0);
});

test("settings lives with the extension-wide sidebar links and owns compact preference", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);
  const settingsNav = manage.settingsLink();

  await settingsNav.click();
  await expect(settingsNav).toHaveClass(/hr-nav-item-active/);
  await expect(page.getByTestId("profile-list").locator(".hr-nav-item-active")).toHaveCount(0);
  await expect(page).toHaveURL(/manage\.html#\/settings$/);
  await expect(manage.mainContent().getByRole("heading", { level: 2 })).toHaveText(
    /Settings|設定|설정/,
  );

  const compactToggle = manage
    .mainContent()
    .getByRole("switch", { name: /Compact|コンパクト|컴팩트/ });
  await expect(compactToggle).toHaveAttribute("aria-checked", "false");
  await expect(
    manage.mainContent().getByRole("link", {
      name: /Privacy Policy|プライバシーポリシー|개인정보 처리방침/,
    }),
  ).toBeVisible();

  const comfortableSize = await compactToggle.boundingBox();
  await compactToggle.click();
  await expect(compactToggle).toHaveAttribute("aria-checked", "true");
  await expect(manage.root()).toHaveClass(/hr-compact/);
  const compactSize = await compactToggle.boundingBox();
  expect(compactSize?.width).toBeLessThan(comfortableSize?.width ?? 0);
  expect(compactSize?.height).toBeLessThan(comfortableSize?.height ?? 0);

  const popupPage = await context.newPage();
  const popup = await openPopupPage(popupPage, extensionId, "http://localhost:3000/dashboard");
  await expect(popup.root()).toHaveClass(/hr-compact/);
  await expect(popup.root().getByText(/^(Compact|コンパクト|컴팩트)$/)).toHaveCount(0);
  await expect(
    popup.root().getByRole("link", {
      name: /Privacy Policy|プライバシーポリシー|개인정보 처리방침/,
    }),
  ).toHaveCount(0);
  const popupToggleSize = await popup.profileToggle().boundingBox();
  expect(popupToggleSize?.width).toBe(compactSize?.width);
  expect(popupToggleSize?.height).toBe(compactSize?.height);
});

test("clicking a Profile tab changes section", async ({ context, extensionId }) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);

  await expect(page.getByTestId("profile-tab-overview")).toHaveClass(/hr-tab-active/);

  const originsTab = manage.navItem("origins");
  await originsTab.click();
  await expect(originsTab).toHaveClass(/hr-tab-active/);
  await expect(page).toHaveURL(/manage\.html#\/profiles\/profile-local-dev\/origins$/);
});

test("pasting an HTTP URL into Target Origin keeps only its origin", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);
  await manage.navItem("origins").click();

  const input = manage
    .mainContent()
    .getByPlaceholder("https://api.example.test", { exact: true })
    .first();
  const paste = async (text: string) => {
    await input.evaluate((element, pastedText) => {
      const target = element as HTMLInputElement;
      const clipboardData = new DataTransfer();
      clipboardData.setData("text", pastedText);
      const useDefault = target.dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }),
      );
      if (!useDefault) return;

      target.setRangeText(pastedText, target.selectionStart ?? 0, target.selectionEnd ?? 0, "end");
      target.dispatchEvent(
        new InputEvent("input", { bubbles: true, data: pastedText, inputType: "insertFromPaste" }),
      );
    }, text);
  };

  await input.fill("");
  await paste("https://example.com/xxxxx/cccc?key=value#result");
  await expect(input).toHaveValue("https://example.com");

  await input.fill("");
  await paste("http://localhost:4567/health");
  await expect(input).toHaveValue("http://localhost:4567");

  await input.fill("");
  await paste("ftp://example.com/files");
  await expect(input).toHaveValue("ftp://example.com/files");

  await input.fill("");
  await paste("not a URL");
  await expect(input).toHaveValue("not a URL");
});

test("section route can be opened directly", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(
    `chrome-extension://${extensionId}/manage.html#/profiles/profile-local-dev/url-probe`,
  );
  await page.waitForSelector(".hr-theme");

  await expect(page.getByTestId("profile-profile-local-dev")).toHaveClass(/hr-nav-item-active/);
  await expect(page.getByTestId("profile-tab-probe")).toHaveClass(/hr-tab-active/);
  await expect(
    page.getByTestId("manage-content").getByRole("heading", {
      level: 2,
      name: "Local Development",
    }),
  ).toBeVisible();
  await expect(page.getByTestId("manage-content").getByRole("textbox")).toHaveValue("");
});

test("invalid Profile routes fall back deterministically", async ({ context, extensionId }) => {
  const page = await context.newPage();

  await page.goto(
    `chrome-extension://${extensionId}/manage.html#/profiles/missing-profile/cookies`,
  );
  await page.waitForSelector(".hr-theme");
  await expect(page).toHaveURL(/manage\.html#\/profiles\/profile-local-dev\/cookies$/);
  await expect(page.getByTestId("profile-tab-cookies")).toHaveClass(/hr-tab-active/);

  await page.goto(
    `chrome-extension://${extensionId}/manage.html#/profiles/profile-local-dev/not-a-tab`,
  );
  await expect(page).toHaveURL(/manage\.html#\/profiles\/profile-local-dev$/);
  await expect(page.getByTestId("profile-tab-overview")).toHaveClass(/hr-tab-active/);

  await page.goto(`chrome-extension://${extensionId}/manage.html#/origins`);
  await expect(page).toHaveURL(/manage\.html#\/profiles\/profile-local-dev$/);
});

test("unsaved Profile drafts survive tab navigation and show dirty indicators", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);

  await manage.profileNameInput().fill("Unsaved Profile");
  await expect(page.getByTestId("profile-profile-local-dev")).toContainText("Unsaved Profile");
  await expect(
    page
      .getByTestId("profile-profile-local-dev")
      .getByLabel(/^(Unsaved changes|未保存の変更|저장되지 않은 변경사항)$/),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("profile-tab-overview")
      .getByLabel(/^(Unsaved changes|未保存の変更|저장되지 않은 변경사항)$/),
  ).toBeVisible();

  await manage.navItem("origins").click();
  await expect(page.getByRole("heading", { level: 2, name: "Unsaved Profile" })).toBeVisible();
  await manage.navItem("overview").click();
  await expect(manage.profileNameInput()).toHaveValue("Unsaved Profile");
});

test("Profile switching preserves its tab and Settings opens Profile Overview", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);

  await manage.newProfileButton().click();
  await manage
    .createProfileDialog()
    .getByRole("textbox", { name: /Profile name|プロファイル名|프로필 이름/ })
    .fill("Second Profile");
  await manage
    .createProfileDialog()
    .getByRole("button", { name: /^(Create|作成|만들기)$/ })
    .click();
  const secondProfileLink = manage.profileRows().nth(1).getByRole("link");
  const secondProfileHref = await secondProfileLink.getAttribute("href");
  const secondProfileId = /\/profiles\/([^/]+)/.exec(secondProfileHref ?? "")?.[1];
  expect(secondProfileId).toMatch(/^profile-[0-9a-f]{8}$/);
  await expect(page).toHaveURL(new RegExp(`manage\\.html#/profiles/${secondProfileId}/origins$`));

  await page.getByTestId("profile-profile-local-dev").getByRole("link").click();
  await expect(page).toHaveURL(/manage\.html#\/profiles\/profile-local-dev\/origins$/);

  const originInputs = manage
    .mainContent()
    .getByPlaceholder("https://api.example.test", { exact: true });
  const originCount = await originInputs.count();
  await manage
    .mainContent()
    .getByRole("button", { name: /Add origin|オリジンを追加|오리진 추가/ })
    .click();
  await expect(originInputs).toHaveCount(originCount + 1);

  await secondProfileLink.click();
  await expect(page).toHaveURL(new RegExp(`manage\\.html#/profiles/${secondProfileId}/origins$`));
  await page.getByTestId("profile-profile-local-dev").getByRole("link").click();
  await expect(originInputs).toHaveCount(originCount + 1);

  await manage.settingsLink().click();
  await secondProfileLink.click();
  await expect(page).toHaveURL(new RegExp(`manage\\.html#/profiles/${secondProfileId}$`));
});

test("the sidebar owns profile selection and creation while state actions live in overview", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);
  await expect(manage.profileList()).toBeVisible();
  await expect(manage.profileRows()).toHaveCount(1);
  await expect(manage.sidebar().getByRole("switch")).toHaveCount(1);
  await expect(manage.profileNameInput()).toBeVisible();
  await expect(manage.newProfileButton()).toBeVisible();
  await expect(manage.deleteProfileButton()).toHaveCount(0);

  await manage.newProfileButton().click();
  const dialog = manage.createProfileDialog();
  const nameInput = dialog.getByRole("textbox", {
    name: /Profile name|プロファイル名|프로필 이름/,
  });
  const enabled = dialog.getByRole("checkbox");
  const create = dialog.getByRole("button", { name: /^(Create|作成|만들기)$/ });
  await expect(nameInput).toBeFocused();
  await expect(enabled).not.toBeChecked();
  await expect(create).toBeDisabled();

  await nameInput.fill("Staging API");
  await enabled.check();
  await nameInput.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(manage.profileRows()).toHaveCount(2);
  await expect(page).toHaveURL(/manage\.html#\/profiles\/profile-[0-9a-f]{8}\/origins$/);
  await expect(manage.profileToggle()).toHaveAttribute("aria-checked", "true");
  await manage.navItem("overview").click();
  await expect(manage.deleteProfileButton()).toBeVisible();

  page.once("dialog", (dialog) => void dialog.accept());
  await manage.deleteProfileButton().click();
  await expect(manage.profileRows()).toHaveCount(1);
  await expect(manage.deleteProfileButton()).toHaveCount(0);
});

test("profiles can be duplicated and reordered", async ({ context, extensionId }) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);

  await manage
    .mainContent()
    .getByRole("button", { name: /Duplicate profile|プロファイルを複製|프로필 복제/ })
    .click();
  await expect(manage.profileRows()).toHaveCount(2);
  await expect(manage.profileNameInput()).toHaveValue(
    /Copy of Local Development|Local Developmentのコピー/,
  );
  await expect(manage.profileToggle()).toHaveAttribute("aria-checked", "false");

  const copyRow = manage.profileRows().nth(1);
  await copyRow.getByRole("button", { name: /Move .* up|上へ移動|위로 이동/ }).click();
  await expect(manage.profileRows().first()).toContainText(
    /Copy of Local Development|Local Developmentのコピー/,
  );
});

test("Profile names reject normalized duplicates in create and rename flows", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);

  await manage.newProfileButton().click();
  const firstDialog = manage.createProfileDialog();
  await firstDialog
    .getByRole("textbox", { name: /Profile name|プロファイル名|프로필 이름/ })
    .fill("ＬＯＣＡＬ　ＤＥＶＥＬＯＰＭＥＮＴ");
  await expect(firstDialog.getByRole("alert")).toContainText(
    /already exists|すでに存在|이미 있습니다/,
  );
  await expect(firstDialog.getByRole("button", { name: /^(Create|作成|만들기)$/ })).toBeDisabled();
  await firstDialog.getByRole("button", { name: /Cancel|キャンセル|취소/ }).click();

  await manage.newProfileButton().click();
  await manage
    .createProfileDialog()
    .getByRole("textbox", { name: /Profile name|プロファイル名|프로필 이름/ })
    .fill("Discarded by Escape");
  await page.keyboard.press("Escape");
  await expect(manage.createProfileDialog()).toHaveCount(0);

  await manage.newProfileButton().click();
  await page.mouse.click(1, 1);
  await expect(manage.createProfileDialog()).toHaveCount(0);

  await manage.newProfileButton().click();
  const secondDialog = manage.createProfileDialog();
  const nameInput = secondDialog.getByRole("textbox", {
    name: /Profile name|プロファイル名|프로필 이름/,
  });
  await expect(nameInput).toHaveValue("");
  await nameInput.fill("Second Profile");
  await nameInput.press("Enter");
  await expect(manage.profileRows()).toHaveCount(2);

  await page.getByTestId("profile-profile-local-dev").getByRole("link").click();
  await manage.navItem("overview").click();
  await manage.profileNameInput().fill(" second profile ");
  await expect(manage.mainContent().getByRole("alert")).toContainText(
    /already exists|すでに存在|이미 있습니다/,
  );
  await expect(manage.saveButton()).toBeDisabled();
});

test("profile status and runtime status tiles render on overview", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);
  await expect(manage.statusTiles()).toHaveCount(8);
});

test("overview lists compile warnings by profile name", async ({ context, extensionId }) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);
  await expect(page.getByTestId("compile-warnings")).toHaveCount(0);

  await manage.newProfileButton().click();
  const dialog = manage.createProfileDialog();
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("textbox", { name: /Profile name|プロファイル名|프로필 이름/ })
    .fill("Staging API");
  await dialog.getByRole("button", { name: /^(Create|作成|만들기)$/ }).click();
  await manage.navItem("overview").click();

  const warnings = page.getByTestId("compile-warnings");
  await expect(warnings).toContainText("Staging API");
  await expect(warnings).not.toContainText(/profile-[0-9a-f]{8}|ADR/);
});

test("fixed and captured headers share one page", async ({ context, extensionId }) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);

  await manage.navItem("headers").click();
  await expect(page).toHaveURL(/manage\.html#\/profiles\/profile-local-dev\/headers$/);
  await expect(
    manage.mainContent().getByRole("button", {
      name: /Add fixed header|固定ヘッダーを追加|고정 헤더 추가/,
    }),
  ).toBeVisible();
  await expect(
    manage.mainContent().getByRole("button", {
      name: /Add captured header|取得ヘッダーを追加|캡처 헤더 추가/,
    }),
  ).toBeVisible();
  await expect(manage.mainContent().getByTestId("header-section-fixed")).toBeVisible();
  await expect(manage.mainContent().getByTestId("header-section-capture")).toBeVisible();
});

test("Settings switches among General, Audit Logs, and JSON Editor", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);

  await manage.settingsLink().click();
  await expect(page).toHaveURL(/manage\.html#\/settings$/);
  await expect(page.getByTestId("settings-tab-general")).toHaveClass(/hr-tab-active/);

  const logsTab = page.getByTestId("settings-tab-logs");
  await logsTab.click();
  await expect(page).toHaveURL(/manage\.html#\/settings\/audit-logs$/);
  await expect(logsTab).toHaveClass(/hr-tab-active/);

  const jsonTab = page.getByTestId("settings-tab-json");
  await jsonTab.click();
  await expect(page).toHaveURL(/manage\.html#\/settings\/json-editor$/);
  await expect(jsonTab).toHaveClass(/hr-tab-active/);
  await expect(manage.mainContent().locator("textarea")).toBeVisible();
});

test("Settings tabs can be opened directly", async ({ context, extensionId }) => {
  const page = await context.newPage();

  await page.goto(`chrome-extension://${extensionId}/manage.html#/settings/audit-logs`);
  await page.waitForSelector(".hr-theme");
  await expect(page.getByTestId("settings-link")).toHaveClass(/hr-nav-item-active/);
  await expect(page.getByTestId("settings-tab-logs")).toHaveClass(/hr-tab-active/);

  await page.goto(`chrome-extension://${extensionId}/manage.html#/settings/json-editor`);
  await expect(page.getByTestId("settings-tab-json")).toHaveClass(/hr-tab-active/);
  await expect(page.getByTestId("manage-content").locator("textarea")).toBeVisible();
});

test("JSON Editor can export and replace the full configuration from a file", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);

  await manage.settingsLink().click();
  await page.getByTestId("settings-tab-json").click();
  const content = manage.mainContent();
  const exportPromise = page.waitForEvent("download");
  await content.getByRole("button", { name: /Export configuration|設定をエクスポート/ }).click();
  const download = await exportPromise;
  expect(download.suggestedFilename()).toMatch(/header-relay-config-\d{4}-\d{2}-\d{2}\.json/);

  const textarea = content.locator("textarea");
  const config = JSON.parse(await textarea.inputValue()) as { profiles: Array<{ name: string }> };
  config.profiles[0]!.name = "Imported Profile";
  page.once("dialog", (dialog) => void dialog.accept());
  await content.locator('input[type="file"]').setInputFiles({
    name: "header-relay-config.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(config)),
  });

  await expect(manage.profileRows().first()).toContainText("Imported Profile");
  await manage.profileRows().first().getByRole("link").click();
  await expect(manage.profileNameInput()).toHaveValue("Imported Profile");
});

test("JSON Editor asks before replacing the configuration", async ({ context, extensionId }) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);

  await manage.settingsLink().click();
  await page.getByTestId("settings-tab-json").click();
  const textarea = manage.mainContent().locator("textarea");
  const config = JSON.parse(await textarea.inputValue()) as { profiles: Array<{ name: string }> };
  config.profiles[0]!.name = "Replaced Profile";
  await textarea.fill(JSON.stringify(config, null, 2));

  const dialogPromise = page.waitForEvent("dialog");
  const clickPromise = manage
    .mainContent()
    .getByRole("button", { name: /Apply JSON|JSONを適用|JSON 적용/ })
    .click();
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe("confirm");
  await dialog.dismiss();
  await clickPromise;

  await expect(manage.profileRows().first()).not.toContainText("Replaced Profile");
});

test("save notices clear on navigation and errors stay until closed", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);

  await manage.profileNameInput().fill("Renamed Profile");
  await manage.saveButton().click();
  const notice = manage.header().getByRole("status");
  await expect(notice).toHaveText(/Saved and applied|保存して適用しました/);
  await manage.navItem("headers").click();
  await expect(notice).toHaveCount(0);

  await manage.settingsLink().click();
  await page.getByTestId("settings-tab-json").click();
  await manage.mainContent().locator("textarea").fill("{");
  await manage
    .mainContent()
    .getByRole("button", { name: /Apply JSON|JSONを適用|JSON 적용/ })
    .click();
  const alert = manage.header().getByRole("alert");
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: /^(Close|閉じる|닫기)$/ }).click();
  await expect(alert).toHaveCount(0);
});

test("migration issues appear only inside Cookie settings when they exist", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);

  await manage.navItem("cookies").click();
  await expect(manage.mainContent().getByTestId("migration-issues")).toHaveCount(0);

  await manage.settingsLink().click();
  await page.getByTestId("settings-tab-json").click();
  const textarea = manage.mainContent().locator("textarea");
  const config = JSON.parse(await textarea.inputValue()) as {
    profiles: Array<{ migrationIssues: unknown[] }>;
  };
  config.profiles[0]!.migrationIssues = [
    {
      id: "migration-e2e",
      source: "fixed-header-cookie",
      originalName: "Cookie",
      originalValue: "SID=legacy",
      originalEnabled: true,
      reason: "cookie-parse-failed",
    },
  ];
  await textarea.fill(JSON.stringify(config, null, 2));
  page.once("dialog", (dialog) => void dialog.accept());
  await manage
    .mainContent()
    .getByRole("button", { name: /Apply JSON|JSONを適用|JSON 적용/ })
    .click();

  await page.getByTestId("profile-profile-local-dev").getByRole("link").click();
  await manage.navItem("cookies").click();
  const migrationIssues = manage.mainContent().getByTestId("migration-issues");
  await expect(migrationIssues).toBeVisible();
  await expect(migrationIssues).toContainText("SID=legacy");
  await migrationIssues.getByRole("button", { name: /^(Delete|削除|삭제)$/ }).click();
  await expect(migrationIssues).toHaveCount(0);
  await expect(manage.saveButton()).toBeEnabled();
});

test("the sidebar toggle enables a profile without a section save", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);

  await expect(manage.profileToggle()).toHaveAttribute("aria-checked", "false");
  await expect(manage.mainContent().getByRole("switch")).toHaveCount(0);
  await manage.profileToggle().click();
  await expect(manage.profileToggle()).toHaveAttribute("aria-checked", "true");
  await expect(page).toHaveURL(/manage\.html#\/profiles\/profile-local-dev$/);
  await expect(manage.saveButton()).toBeDisabled();

  page.once("dialog", (dialog) => void dialog.accept());
  await manage.reloadButton().click();
  await expect(manage.profileToggle()).toHaveAttribute("aria-checked", "true");
});

test("reload asks before discarding an unsaved profile draft", async ({ context, extensionId }) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);
  await manage.profileNameInput().fill("Unsaved Profile");

  const dialogPromise = page.waitForEvent("dialog");
  const clickPromise = manage.reloadButton().click();
  const dialog = await dialogPromise;
  expect(dialog.type()).toBe("confirm");
  await dialog.dismiss();
  await clickPromise;

  await expect(manage.profileNameInput()).toHaveValue("Unsaved Profile");
});

test("URL probe evaluates every enabled profile in the current draft", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);

  await manage.profileToggle().click();
  await expect(manage.profileToggle()).toHaveAttribute("aria-checked", "true");

  await manage.navItem("probe").click();
  const input = manage.mainContent().getByRole("textbox");
  await input.fill("  http://localhost:3000/api/me  ");
  await input.press("Enter");

  await expect(input).toHaveValue("http://localhost:3000/api/me");
  await expect(manage.mainContent().locator("[data-testid=profile-selector]")).toHaveCount(0);
  await expect(manage.mainContent().locator(".grid .hr-card").nth(2)).toContainText("1");
});

test("empty excluded-path rows are disabled until a valid glob is entered", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);

  await manage.navItem("exclude").click();
  await manage
    .mainContent()
    .getByRole("button", { name: /Add path|パスを追加|경로 추가/ })
    .click();
  const pathInput = manage.mainContent().getByPlaceholder("/assets/**", { exact: true });
  const pathSwitch = manage.mainContent().locator(".hr-card .hr-switch").first();
  await expect(pathInput).toHaveValue("");
  await expect(pathSwitch).toBeDisabled();

  await pathInput.fill("/assets/**");
  await expect(pathSwitch).toBeEnabled();
  await pathSwitch.click();
  await expect(pathSwitch).toHaveAttribute("aria-checked", "true");
  await expect(pathSwitch).toHaveAccessibleName(/: \/assets\/\*\*$/);

  const tester = manage
    .mainContent()
    .getByPlaceholder("http://localhost:3000/assets/app.js", { exact: true });
  await tester.fill("http://localhost:3000/assets/app.js");
  await tester.press("Enter");
  await expect(
    manage.mainContent().getByText(/Matched pattern|一致したパターン|일치한 패턴/),
  ).toBeVisible();
});

test("sensitive and dedicated headers warn while invalid headers block saving", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);

  await manage.navItem("headers").click();
  await manage
    .mainContent()
    .getByRole("button", { name: /Add fixed header|固定ヘッダーを追加|고정 헤더 추가/ })
    .click();
  const name = manage.mainContent().getByPlaceholder("x-session-token", { exact: true });

  await name.fill("Cookie");
  await expect(
    manage.mainContent().getByText(/overriding Cookie|Cookie の上書き|Cookie를 덮어쓰면/),
  ).toBeVisible();
  await expect(manage.headerSaveButton("fixed")).toBeDisabled();

  await name.fill("Host");
  await expect(
    manage.mainContent().getByText(/cannot be relayed safely|安全に中継できません|안전하게 중계/),
  ).toBeVisible();
  await expect(manage.headerSaveButton("fixed")).toBeDisabled();

  await name.fill("Authorization");
  await expect(
    manage.mainContent().getByText(/may contain credentials|認証情報が含まれる|자격 증명이 포함/),
  ).toBeVisible();
  await expect(manage.headerSaveButton("fixed")).toBeEnabled();
});

test("expanded audit logs stay open across automatic refreshes", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);

  await manage.profileToggle().click();
  await manage.settingsLink().click();
  await page.getByTestId("settings-tab-logs").click();

  const details = manage.mainContent().locator("details").first();
  await expect(details).toBeVisible();
  await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
  await page.waitForTimeout(3500);
  await expect(details).toHaveAttribute("open", "");
});

test("audit logs filter by minimum level and reset after leaving the tab", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);

  await manage.settingsLink().click();
  await page.getByTestId("settings-tab-logs").click();
  const now = Date.now();
  await replaceAuditLogs(page, [
    { id: "filter-debug", ts: now - 4, level: "debug", event: "origin_matched" },
    { id: "filter-info", ts: now - 3, level: "info", event: "config_compiled" },
    { id: "filter-warn", ts: now - 2, level: "warn", event: "cookie_parse_failed" },
    { id: "filter-error", ts: now - 1, level: "error", event: "error" },
  ]);
  await manage
    .mainContent()
    .getByRole("button", { name: /Refresh|更新|새로고침/ })
    .click();

  const level = manage
    .mainContent()
    .getByRole("combobox", { name: /Minimum level|最小レベル|최소 심각도/ });
  const logs = manage.mainContent().locator("details");

  await level.selectOption("info");
  await expect(logs).toHaveCount(3);
  await expect(logs.nth(0)).toHaveAttribute("data-level", "error");
  await expect(logs.nth(2)).toHaveAttribute("data-level", "info");
  await expect(logs.nth(2)).toContainText(/Configuration compiled|設定をコンパイル|설정 컴파일됨/);
  await expect(logs.nth(2)).not.toContainText("config_compiled");

  await level.selectOption("warn");
  await expect(logs).toHaveCount(2);

  await level.selectOption("error");
  await expect(logs).toHaveCount(1);

  await level.selectOption("debug");
  await expect(logs).toHaveCount(4);
  await expect(logs.nth(0)).toHaveAttribute("data-level", "error");
  await expect(logs.nth(1)).toHaveAttribute("data-level", "warn");
  await expect(logs.nth(2)).toHaveAttribute("data-level", "info");
  await expect(logs.nth(3)).toHaveAttribute("data-level", "debug");

  await level.selectOption("error");
  await page.getByTestId("settings-tab-json").click();
  await page.getByTestId("settings-tab-logs").click();
  await expect(level).toHaveValue("debug");
  await expect(logs).toHaveCount(4);

  await level.selectOption("error");
  await page.reload();
  await page.waitForSelector(".hr-theme");
  await expect(level).toHaveValue("debug");
  await expect(logs).toHaveCount(4);

  await level.selectOption("error");
  await replaceAuditLogs(page, [
    {
      id: "filter-info-only",
      ts: Date.now(),
      level: "info",
      event: "config_compiled",
    },
  ]);
  await manage
    .mainContent()
    .getByRole("button", { name: /Refresh|更新|새로고침/ })
    .click();
  await expect(
    manage
      .mainContent()
      .getByText(/No logs at this level|この深刻度のログはありません|이 심각도의 로그가 없습니다/),
  ).toBeVisible();

  await manage
    .mainContent()
    .getByRole("button", { name: /Clear logs|ログをクリア|로그 지우기/ })
    .click();
  await expect(
    page.getByText(/Audit logs cleared|監査ログをクリアしました|감사 로그를 지웠습니다/),
  ).toBeVisible();
  await level.selectOption("debug");
  await expect(logs).toHaveCount(0);
  await expect(
    manage.mainContent().getByText(/No audit logs|監査ログはありません|감사 로그가 없습니다/),
  ).toBeVisible();
});

test("sections save independently and persist their own changes", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);

  // Fixed headers: add one, name it, and save just this section.
  await manage.navItem("headers").click();
  await manage
    .mainContent()
    .getByRole("button", { name: /Add fixed header|固定ヘッダーを追加|고정 헤더 추가/ })
    .click();
  const fixedName = manage.mainContent().getByPlaceholder("x-session-token", { exact: true });
  await fixedName.fill("x-test");
  await expect(manage.headerSaveButton("fixed")).toBeEnabled();
  await manage.headerSaveButton("fixed").click();
  await expect(manage.headerSaveButton("fixed")).toBeDisabled();

  // Target origins: make a change but leave it unsaved.
  await manage.navItem("origins").click();
  const originInputs = manage
    .mainContent()
    .getByPlaceholder("https://api.example.test", { exact: true });
  const originCount = await originInputs.count();
  await manage
    .mainContent()
    .getByRole("button", { name: /Add origin|オリジンを追加|오리진 추가/ })
    .click();
  await expect(originInputs).toHaveCount(originCount + 1);
  await expect(manage.saveButton()).toBeEnabled();

  // The saved fixed section stays clean and keeps its value regardless of the origins edit.
  await manage.navItem("headers").click();
  await expect(fixedName).toHaveValue("x-test");
  await expect(manage.headerSaveButton("fixed")).toBeDisabled();

  // Reloading discards the unsaved origin but keeps the persisted fixed header.
  page.once("dialog", (dialog) => void dialog.accept());
  await manage.reloadButton().click();
  await manage.navItem("headers").click();
  await expect(
    manage.mainContent().getByPlaceholder("x-session-token", { exact: true }),
  ).toHaveValue("x-test");
  await manage.navItem("origins").click();
  await expect(
    manage.mainContent().getByPlaceholder("https://api.example.test", { exact: true }),
  ).toHaveCount(originCount);
});

test("a fixed header can be published to the popup as a select and the options persist", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const manage = await openManagePage(page, extensionId);
  await manage.navItem("headers").click();
  await manage
    .mainContent()
    .getByRole("button", { name: /Add fixed header|固定ヘッダーを追加|고정 헤더 추가/ })
    .click();
  await manage.mainContent().getByPlaceholder("x-session-token", { exact: true }).fill("x-track");
  await manage
    .mainContent()
    .getByRole("textbox", { name: /^(Header value|ヘッダー値|헤더 값)/ })
    .fill("stable");

  const inputType = manage
    .mainContent()
    .getByLabel(/Input type|入力形式|입력 형식/, { exact: true });
  // Options only exist once the header is published and set to select.
  await expect(inputType).toBeHidden();
  await manage
    .mainContent()
    .getByRole("switch", { name: /Show in Popup|ポップアップに表示|팝업에 표시/ })
    .click();
  await inputType.selectOption("select");

  // Switching to select seeds a row with the current value, so the config stays saveable.
  const values = manage.mainContent().getByLabel(/^(Value|値|값)$/);
  await expect(values).toHaveValue("stable");
  await manage
    .mainContent()
    .getByLabel(/^(Label|ラベル|라벨)$/)
    .fill("Stable");
  await manage
    .mainContent()
    .getByRole("button", { name: /Add Option|選択肢を追加|선택지 추가/ })
    .click();
  await manage
    .mainContent()
    .getByLabel(/^(Label|ラベル|라벨)$/)
    .nth(1)
    .fill("Canary");
  await values.nth(1).fill("canary");
  await manage.headerSaveButton("fixed").click();
  await expect(manage.headerSaveButton("fixed")).toBeDisabled();

  page.once("dialog", (dialog) => void dialog.accept());
  await manage.reloadButton().click();
  await manage.navItem("headers").click();

  const savedLabels = manage.mainContent().getByLabel(/^(Label|ラベル|라벨)$/);
  const savedValues = manage.mainContent().getByLabel(/^(Value|値|값)$/);
  await expect(savedLabels).toHaveCount(2);
  await expect(savedLabels.nth(0)).toHaveValue("Stable");
  await expect(savedLabels.nth(1)).toHaveValue("Canary");
  await expect(savedValues.nth(0)).toHaveValue("stable");
  await expect(savedValues.nth(1)).toHaveValue("canary");
});

test("desktop shell stays inside the viewport and aligns header with sidebar", async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  const manage = await openManagePage(page, extensionId);

  const metrics = await page.evaluate(() => {
    const brand = document.querySelector("header > div:first-child")!.getBoundingClientRect();
    const sidebar = document.querySelector("aside")!.getBoundingClientRect();
    const content = document.querySelector("[data-testid=manage-content]")!.getBoundingClientRect();
    return {
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      brandRight: brand.right,
      sidebarRight: sidebar.right,
      brandBottom: brand.bottom,
      contentTop: content.top,
    };
  });

  expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewportHeight);
  expect(metrics.brandRight).toBe(metrics.sidebarRight);
  expect(metrics.brandBottom).toBe(metrics.contentTop);

  await manage.settingsLink().click();
  await page.getByTestId("settings-tab-json").click();
  const textarea = manage.mainContent().locator("textarea");
  await expect(textarea).toBeVisible();
  expect(await textarea.evaluate((element) => getComputedStyle(element).resize)).toBe("none");
  const [contentBox, textareaBox] = await Promise.all([
    manage.mainContent().boundingBox(),
    textarea.boundingBox(),
  ]);
  expect(textareaBox?.height).toBeGreaterThan((contentBox?.height ?? 0) * 0.5);
});

test("mobile shell does not introduce horizontal scrolling", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  const manage = await openManagePage(page, extensionId);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(manage.profileList()).toHaveCSS("overflow-x", "auto");
  await expect(manage.mainContent().locator("nav").first()).toHaveCSS("white-space", "nowrap");
  await expect(manage.reviewPrompt()).toBeVisible();
  await expect(manage.settingsLink()).toBeVisible();
  await expect(page.getByTestId("bottom-nav")).toBeVisible();

  await page.goto(
    `chrome-extension://${extensionId}/manage.html#/profiles/profile-local-dev/url-probe`,
  );
  const [contentBox, activeTabBox] = await Promise.all([
    manage.mainContent().boundingBox(),
    page.getByTestId("profile-tab-probe").boundingBox(),
  ]);
  expect(activeTabBox?.x).toBeGreaterThanOrEqual(contentBox?.x ?? 0);
  expect((activeTabBox?.x ?? 0) + (activeTabBox?.width ?? 0)).toBeLessThanOrEqual(
    (contentBox?.x ?? 0) + (contentBox?.width ?? 0),
  );
});
